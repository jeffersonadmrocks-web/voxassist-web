import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_DIR, PORTAL_URL, PROFILE_DIR, assertWhirlpoolUrl } from "./config.mjs";
import { extractPdfText, parseWhirlpoolPdf } from "./pdf-parser.mjs";

const LIMIT = Math.min(Math.max(Number(process.env.WHIRLPOOL_BATCH_LIMIT || 3), 1), 3);
const workerApiUrl = process.env.WHIRLPOOL_WORKER_API_URL || "https://dgasmtvpgifceyqufcfg.supabase.co/functions/v1/whirlpool-worker-api";
if (new URL(workerApiUrl).hostname !== "dgasmtvpgifceyqufcfg.supabase.co") throw new Error("Gateway Supabase não autorizado.");
assertWhirlpoolUrl(PORTAL_URL);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let oidcToken;
async function githubOidcToken(){
  if(oidcToken)return oidcToken;
  const base=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(!base||!requestToken)throw new Error("Identidade temporária do executor não disponível.");
  const url=new URL(base);url.searchParams.set("audience","voxassist-whirlpool");
  const r=await fetch(url,{headers:{authorization:"Bearer "+requestToken}});
  const data=await r.json();if(!r.ok||!data.value)throw new Error("Não foi possível obter identidade temporária.");
  oidcToken=data.value;return oidcToken;
}
async function workerRequest(action,payload={}){
  const token=await githubOidcToken();
  const r=await fetch(workerApiUrl,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({action,...payload})});
  const t=await r.text();if(!r.ok)throw new Error("Gateway Whirlpool falhou (HTTP "+r.status+"): "+t.slice(0,160));
  return JSON.parse(t);
}
async function pendingOrders(){return workerRequest("pending",{limit:LIMIT});}
const norm=(v="")=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
async function clickText(page, texts) {
  for(const frame of page.frames()){
    try{
      const hit=await frame.evaluate((targets)=>{
        const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
        const wanted=targets.map(norm);
        const nodes=[...document.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"],[role="menuitem"],span,td')];
        const choices=nodes.map(node=>{
          const label=node.innerText||node.textContent||node.value||node.title||node.getAttribute("aria-label")||"";
          if(!wanted.includes(norm(label)))return null;
          const action=node.closest('a,button,[role="button"],[role="menuitem"]')||node;
          const rect=action.getBoundingClientRect();
          if(!rect.width||!rect.height)return null;
          let parent=action;
          while(parent){
            const style=getComputedStyle(parent);
            if(style.display==="none"||style.visibility==="hidden"||style.opacity==="0")return null;
            parent=parent.parentElement;
          }
          return {action,priority:/^(A|BUTTON)$/.test(action.tagName)?0:1,area:rect.width*rect.height};
        }).filter(Boolean).sort((x,y)=>x.priority-y.priority||x.area-y.area);
        if(!choices.length)return false;
        choices[0].action.click();return true;
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
async function findSearchLimit(page){
  for(const frame of page.frames()){
    try{
      const found=await frame.evaluate(()=>{
        const input=[...document.querySelectorAll("input")].find(x=>/btqsrvord_max_hits$/i.test(x.id||x.name||""));
        return input?{id:input.id||"",name:input.name||""}:null;
      });
      if(found)return {frame,found};
    }catch{}
  }
  return null;
}
async function safeNavigationSnapshot(page){
  const frames=[];
  for(const [index,frame] of page.frames().entries()){
    try{
      const url=new URL(frame.url());
      const controls=await frame.evaluate(()=>{
        const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
        return [...document.querySelectorAll('a,button,[role="button"],[role="menuitem"]')]
          .map(node=>({id:String(node.id||"").slice(0,90),label:norm(node.getAttribute("aria-label")||node.title||node.innerText||node.textContent||"").slice(0,60)}))
          .filter(x=>/^(ordem de servico|pesquisas|procurar)$/.test(x.label))
          .slice(0,12);
      });
      frames.push({index,host:url.hostname,path:url.pathname.slice(0,140),controls});
    }catch{}
  }
  return JSON.stringify(frames).slice(0,1400);
}
async function openSearch(page){
  const deadline=Date.now()+45000;
  let lastOrderClick=0,lastSearchClick=0;
  while(Date.now()<deadline){
    const located=await findSearchLimit(page);
    if(located){
      await located.frame.evaluate(()=>{
        const max=[...document.querySelectorAll("input")].find(x=>/btqsrvord_max_hits$/i.test(x.id||x.name||""));
        max.value="1000";max.dispatchEvent(new Event("input",{bubbles:true}));max.dispatchEvent(new Event("change",{bubbles:true}));
      });
      if(!(await waitForTextClick(page,["Procurar"],20000)))throw new Error("Botão Procurar não localizado.");
      await delay(2500);return;
    }
    const now=Date.now();
    if(now-lastOrderClick>4000){
      if(await clickText(page,["Ordem de Serviço"]))lastOrderClick=now;
    }
    if(now-lastSearchClick>3000){
      if(await clickText(page,["Pesquisas"]))lastSearchClick=now;
    }
    await delay(750);
  }
  const snapshot=await safeNavigationSnapshot(page);
  throw Object.assign(new Error("Tela de pesquisa de OS não carregou. Diagnóstico sanitizado: "+snapshot),{code:"NAVIGATION_FAILURE"});
}

async function crmTargetFromStartPage(page){
  try{
    const raw=await page.evaluate(()=>document.documentElement?.innerHTML||"");
    const decoded=raw.replace(/&amp;/gi,"&");
    const matches=[...decoded.matchAll(/["']([^"'<>]*(?:crm_ui_frame|BSPWDApplication)[^"'<>]*)["']/ig)];
    for(const match of matches){
      const candidate=match[1].replace(/\\\//g,"/");
      try{
        const url=new URL(candidate,page.url());
        if(url.protocol==="https:"&&url.hostname==="larcrm7.whirlpool.com")return url.href;
      }catch{}
    }
  }catch{}
  return null;
}
async function selectCrmPage(context,initialPage){
  const deadline=Date.now()+45000;
  let followedStartTarget=false;
  while(Date.now()<deadline){
    const pages=context.pages().filter(p=>!p.isClosed());
    for(const candidate of [...pages].reverse()){
      const urls=[candidate.url(),...candidate.frames().map(frame=>frame.url())];
      if(urls.some(url=>/\/bc\/bsp\/sap\/crm_ui_frame\/|BSPWDApplication\.do/i.test(url)))return candidate;
      if(await findSearchLimit(candidate))return candidate;
    }
    if(!followedStartTarget&&Date.now()>deadline-40000){
      const target=await crmTargetFromStartPage(initialPage);
      followedStartTarget=true;
      if(target){
        await initialPage.goto(target,{waitUntil:"domcontentloaded",timeout:120000});
        continue;
      }
    }
    await delay(500);
  }
  const alternatives=context.pages().filter(p=>!p.isClosed()&&p!==initialPage);
  if(alternatives.length)return alternatives.at(-1);
  throw Object.assign(new Error("Janela operacional do CRM não foi aberta."),{code:"NAVIGATION_FAILURE"});
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
 return workerRequest("upload_import",{external_order_id:id,payload,pdf_base64:pdf.toString("base64")});
}
async function closePdfPages(context,main){for(const p of context.pages())if(p!==main&&/crm_pdf_print|\.pdf/i.test(p.url()))await p.close().catch(()=>{});}
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
const conn={id:null};
const claim=await workerRequest("claim",{worker_id:workerId,lease_seconds:900});
if(!claim?.claimed){console.log("EXECUÇÃO NÃO INICIADA: "+String(claim?.reason||"SEM_LEASE"));process.exit(0);}
let browser,context,reported=false;
const results=[];
try{
 browser=await chromium.launch({channel:"chromium",headless:true,args:["--disable-dev-shm-usage","--no-sandbox","--disable-popup-blocking"]});
 let storageState;
 try{if(claim.session_state)storageState=JSON.parse(claim.session_state);}catch{}
 context=await browser.newContext({storageState,acceptDownloads:true,viewport:{width:1600,height:1000}});
 let page=await context.newPage();
 await loginIfNeeded(page,claim);
 page=await selectCrmPage(context,page);
 await page.bringToFront().catch(()=>{});
 const jobs=await pendingOrders();
 if(!jobs.length)console.log("Nenhuma OS ativa pendente.");
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
   results.push({externalOrderId:job.external_order_id,status:"FALHA",reason:String(e.message||e).slice(0,1600)});
   await closePdfPages(context,page);
   await clickText(page,["Encerrar"]).catch(()=>{});
   await delay(1000);
   if(e?.code==="NAVIGATION_FAILURE")break;
  }
 }
 const sessionState=JSON.stringify(await context.storageState());
 await workerRequest("report",{connection_id:conn.id,lock_token:claim.lock_token,outcome:"AUTH_OK",session_state:sessionState,error_code:null});
 reported=true;
}catch(e){
 const code=String(e?.code||"");
 const outcome=code==="CREDENCIAIS_INVALIDAS"?"CREDENCIAIS_INVALIDAS":code==="SESSION_EXPIRED"?"SESSION_EXPIRED":"PORTAL_INDISPONIVEL";
 if(!reported)await workerRequest("report",{connection_id:conn.id,lock_token:claim.lock_token,outcome,session_state:null,error_code:code||"WORKER_FAILURE"}).catch(()=>{});
 console.error("WORKER WHIRLPOOL: "+outcome);
 process.exitCode=outcome==="CREDENCIAIS_INVALIDAS"?2:1;
}finally{
 claim.username="";claim.password="";claim.session_state="";
 await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
}
console.log("LOTE AUTOMÁTICO FINALIZADO");
console.log(JSON.stringify({limit:LIMIT,processed:results.length,results}));
