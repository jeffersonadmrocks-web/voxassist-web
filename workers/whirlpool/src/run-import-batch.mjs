import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_DIR, PORTAL_URL, PROFILE_DIR, assertWhirlpoolUrl } from "./config.mjs";
import { extractPdfText, parseWhirlpoolPdf } from "./pdf-parser.mjs";

const LIMIT = Math.min(Math.max(Number(process.env.WHIRLPOOL_BATCH_LIMIT || 3), 1), 3);
const supabaseUrl = process.env.VOXASSIST_SUPABASE_URL || "https://dgasmtvpgifceyqufcfg.supabase.co";
const serviceKey = process.env.VOXASSIST_SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("Chave temporária não configurada.");
if (new URL(supabaseUrl).hostname !== "dgasmtvpgifceyqufcfg.supabase.co") throw new Error("Projeto Supabase não autorizado.");
assertWhirlpoolUrl(PORTAL_URL);
const auth = { apikey: serviceKey };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function rest(table, query) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  Object.entries(query).forEach(([k,v]) => url.searchParams.set(k,v));
  const r = await fetch(url,{headers:auth}); const t=await r.text();
  if(!r.ok) throw new Error(`Consulta ${table} falhou (HTTP ${r.status}): ${t.slice(0,250)}`);
  return JSON.parse(t);
}
async function pendingOrders() {
  const queue=await rest("whirlpool_import_queue",{state:"eq.PENDENTE",queue_reason:"eq.ATIVA_NOVA",select:"id,external_order_id,created_at",order:"created_at.asc",limit:String(LIMIT)});
  const out=[];
  for(const item of queue){
    const ext=await rest("whirlpool_external_orders",{id:`eq.${item.external_order_id}`,select:"external_order_id,service_status",limit:"1"});
    if(ext[0]?.external_order_id) out.push({queueId:item.id,...ext[0]});
  }
  return out;
}
const norm=(v="")=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
async function clickText(page, texts) {
  for(const frame of page.frames()){
    try{
      const hit=await frame.evaluate((targets)=>{
        const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
        const wanted=targets.map(norm);
        const el=[...document.querySelectorAll("a,button,input[type=button],input[type=submit]")].find(x=>{
          const s=getComputedStyle(x); if(s.display==="none"||s.visibility==="hidden")return false;
          const label=x.innerText||x.textContent||x.value||x.title||x.getAttribute("aria-label")||"";
          return wanted.includes(norm(label));
        });
        if(!el)return false; el.click(); return true;
      },texts);
      if(hit)return true;
    }catch{}
  }
  return false;
}
async function waitForTextClick(page,texts,timeout=30000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await clickText(page,texts))return true;await delay(500);}
  return false;
}
async function openSearch(page){
  if(await clickText(page,["Ordem de Serviço"]))await delay(800);
  if(!(await waitForTextClick(page,["Pesquisas"],15000))) throw new Error("Menu Pesquisas não localizado.");
  await delay(1500);
  let configured=false;
  for(const frame of page.frames()){
    try{
      const ok=await frame.evaluate(()=>{
        const max=[...document.querySelectorAll("input")].find(x=>/btqsrvord_max_hits$/i.test(x.id||x.name||""));
        if(!max)return false;
        max.value="1000";max.dispatchEvent(new Event("input",{bubbles:true}));max.dispatchEvent(new Event("change",{bubbles:true}));
        return true;
      });
      if(ok){configured=true;break;}
    }catch{}
  }
  if(!configured) throw new Error("Campo Nº máximo resultados não localizado.");
  if(!(await waitForTextClick(page,["Procurar"],15000)))throw new Error("Botão Procurar não localizado.");
  await delay(2500);
}
async function inspectAndOpen(frame,id){
 return frame.evaluate((target)=>{
  const clean=v=>String(v||"").replace(/\s+/g," ").trim();
  for(const table of document.querySelectorAll('table[id$="_ResultTable_TableHeader"]')){
   const h=table.tHead?.rows?.[0];if(!h)continue;
   const idx=[...h.cells].findIndex(c=>/-OBJECT_ID-TH$/i.test(c.id));if(idx<0)continue;
   for(const body of table.tBodies)for(const row of body.rows){
    const cell=row.cells[idx];if(clean(cell?.innerText||cell?.textContent)!==target)continue;
    const action=cell.querySelector("a,button");if(!action)return "NO_ACTION";action.click();return "OPENED";
   }
  }return "NOT_FOUND";
 },id);
}
async function openOrder(page,id){
 for(let n=1;n<=100;n++){
  for(const frame of page.frames()){try{const r=await inspectAndOpen(frame,id);if(r==="OPENED"){await delay(2000);return;}if(r==="NO_ACTION")throw new Error("OS sem link.");}catch(e){if(e.message==="OS sem link.")throw e;}}
  if(!(await clickText(page,["Avançar"])))break;
  await delay(1200);
 }
 throw new Error(`OS ${id} não localizada.`);
}
async function capturePdf(context,page,id){
 const pdfDir=path.join(ARTIFACT_DIR,"pdfs");await mkdir(pdfDir,{recursive:true});
 let resolvePdf,rejectPdf;const done=new Promise((res,rej)=>{resolvePdf=res;rejectPdf=rej});
 const timer=setTimeout(()=>rejectPdf(new Error("PDF não apareceu em 45 segundos.")),45000);
 const handler=async response=>{
  try{
   const u=new URL(response.url()),ct=(response.headers()["content-type"]||"").toLowerCase();
   if(u.hostname==="larcrm7.whirlpool.com"&&u.pathname.toLowerCase().endsWith("/crm/crm_pdf_print")&&ct.includes("application/pdf")){
    const bytes=Buffer.from(await response.body());
    if(bytes.length<4096||bytes.subarray(0,5).toString()!=="%PDF-"||!bytes.subarray(-2048).toString().includes("%%EOF"))throw new Error("PDF incompleto.");
    clearTimeout(timer);context.off("response",handler);resolvePdf(bytes);
   }
  }catch{}
 };
 context.on("response",handler);
 if(!(await waitForTextClick(page,["Visualização"],20000))){clearTimeout(timer);context.off("response",handler);throw new Error("Botão Visualização não localizado.");}
 await delay(800);
 await clickText(page,["PDF","Imprimir","Visualizar PDF"]);
 const bytes=await done;
 await writeFile(path.join(pdfDir,`${id}.pdf`),bytes);
 return bytes;
}
async function uploadAndImport(id,payload,pdf){
 const hash=createHash("sha256").update(pdf).digest("hex").slice(0,16);
 const storagePath=`whirlpool/${id}/${hash}.pdf`;
 const objectUrl=new URL(`/storage/v1/object/voxassist-files/${storagePath.split("/").map(encodeURIComponent).join("/")}`,supabaseUrl);
 const up=await fetch(objectUrl,{method:"POST",headers:{...auth,"content-type":"application/pdf","x-upsert":"false"},body:pdf});
 let uploaded=up.ok;if(!up.ok&&!([400,409].includes(up.status)))throw new Error(`Upload do PDF falhou (HTTP ${up.status}).`);
 try{
  const r=await fetch(new URL("/rest/v1/rpc/whirlpool_import_pdf",supabaseUrl),{method:"POST",headers:{...auth,"content-type":"application/json"},body:JSON.stringify({p_filial:"SERRA",p_payload:payload,p_storage_path:storagePath})});
  const t=await r.text();if(!r.ok)throw new Error(`Importação falhou (HTTP ${r.status}): ${t.slice(0,300)}`);return JSON.parse(t);
 }catch(e){if(uploaded)await fetch(objectUrl,{method:"DELETE",headers:auth}).catch(()=>{});throw e;}
}
async function closePdfPages(context,main){for(const p of context.pages())if(p!==main&&/crm_pdf_print|\.pdf/i.test(p.url()))await p.close().catch(()=>{});}
async function rpc(name,body){
 const r=await fetch(new URL("/rest/v1/rpc/"+name,supabaseUrl),{method:"POST",headers:{...auth,"content-type":"application/json"},body:JSON.stringify(body)});
 const t=await r.text();if(!r.ok)throw new Error("Controle do worker falhou (HTTP "+r.status+").");return JSON.parse(t);
}
async function connection(){
 const rows=await rest("whirlpool_connections",{active:"eq.true",select:"id",order:"created_at.asc",limit:"1"});
 if(!rows[0]?.id)throw new Error("Conexão Whirlpool ativa não encontrada.");return rows[0];
}
async function loginIfNeeded(page,claim){
 await page.goto(PORTAL_URL,{waitUntil:"domcontentloaded",timeout:120000});
 const password=page.locator('input[type="password"]:visible').first();
 if(!(await password.count()))return false;
 if(!claim.needs_login)throw Object.assign(new Error("Sessão Whirlpool expirada."),{code:"SESSION_EXPIRED"});
 const username=page.locator('input[type="text"]:visible,input[type="email"]:visible').first();
 if(!(await username.count()))throw Object.assign(new Error("Tela de login Whirlpool incompleta."),{code:"PORTAL_INDISPONIVEL"});
 await username.fill(String(claim.username||""));
 await password.fill(String(claim.password||""));
 claim.username="";claim.password="";
 const submit=page.locator('button[type="submit"]:visible,input[type="submit"]:visible').first();
 if(await submit.count())await submit.click();else await password.press("Enter");
 await page.waitForTimeout(2500);
 const body=norm(await page.locator("body").innerText().catch(()=>""));
 if(/senha invalida|usuario ou senha|credenciais invalidas|password incorrect|authentication failed|logon failed/.test(body)){
   throw Object.assign(new Error("Credenciais Whirlpool rejeitadas."),{code:"CREDENCIAIS_INVALIDAS"});
 }
 if(await page.locator('input[type="password"]:visible').count()){
   throw Object.assign(new Error("Login Whirlpool não concluído sem rejeição explícita."),{code:"PORTAL_INDISPONIVEL"});
 }
 return true;
}
const workerId=crypto.randomUUID();
const conn=await connection();
const claim=await rpc("whirlpool_worker_claim",{p_connection_id:conn.id,p_worker_id:workerId,p_lease_seconds:900});
if(!claim?.claimed){console.log("EXECUÇÃO NÃO INICIADA: "+String(claim?.reason||"SEM_LEASE"));process.exit(0);}
let browser,context,reported=false;
const results=[];
try{
 browser=await chromium.launch({channel:"chromium",headless:true,args:["--disable-dev-shm-usage","--no-sandbox"]});
 let storageState;
 try{if(claim.session_state)storageState=JSON.parse(claim.session_state);}catch{}
 context=await browser.newContext({storageState,acceptDownloads:true,viewport:{width:1600,height:1000}});
 let page=await context.newPage();
 await loginIfNeeded(page,claim);
 const jobs=await pendingOrders();
 if(!jobs.length)console.log("Nenhuma OS ativa pendente.");
 for(const job of jobs){
 for(const job of jobs){
  try{
   await openSearch(page);await openOrder(page,job.external_order_id);
   const pdf=await capturePdf(context,page,job.external_order_id);
   const payload=parseWhirlpoolPdf(await extractPdfText(pdf));
   if(payload.externalOrderId!==job.external_order_id)throw new Error("PDF pertence a outra OS.");
   const imported=await uploadAndImport(job.external_order_id,payload,pdf);
   await closePdfPages(context,page);
   if(!(await waitForTextClick(page,["Encerrar"],20000)))throw new Error("Importada, mas botão Encerrar não localizado.");
   await delay(1500);
   results.push({externalOrderId:job.external_order_id,status:"IMPORTADA",appointmentStatus:imported.appointmentStatus||null});
  }catch(e){
   results.push({externalOrderId:job.external_order_id,status:"FALHA",reason:String(e.message||e).slice(0,180)});
   await closePdfPages(context,page);
   await clickText(page,["Encerrar"]).catch(()=>{});
   await delay(1000);
  }
 }
 const sessionState=JSON.stringify(await context.storageState());
 await rpc("whirlpool_worker_report",{p_connection_id:conn.id,p_lock_token:claim.lock_token,p_outcome:"AUTH_OK",p_session_state:sessionState,p_error_code:null});
 reported=true;
}catch(e){
 const code=String(e?.code||"");
 const outcome=code==="CREDENCIAIS_INVALIDAS"?"CREDENCIAIS_INVALIDAS":code==="SESSION_EXPIRED"?"SESSION_EXPIRED":"PORTAL_INDISPONIVEL";
 if(!reported)await rpc("whirlpool_worker_report",{p_connection_id:conn.id,p_lock_token:claim.lock_token,p_outcome:outcome,p_session_state:null,p_error_code:code||"WORKER_FAILURE"}).catch(()=>{});
 console.error("WORKER WHIRLPOOL: "+outcome);
 process.exitCode=outcome==="CREDENCIAIS_INVALIDAS"?2:1;
}finally{
 claim.username="";claim.password="";claim.session_state="";
 await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
}
console.log("LOTE AUTOMÁTICO FINALIZADO");
console.log(JSON.stringify({limit:LIMIT,processed:results.length,results}));
