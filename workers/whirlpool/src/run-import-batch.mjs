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
// Envia o catálogo já classificado (nunca dados pessoais/PDF) pro gateway,
// que chama whirlpool_ingest_catalog com o service_role -- o worker nunca
// tem acesso direto à service role key, só ao token OIDC de sempre.
async function ingestCatalog(filial,items,fullScan,limitReached){
  return workerRequest("ingest_catalog",{filial,items,full_scan:fullScan,limit_reached:limitReached});
}
// Decide full scan (todas as páginas, limite alto) vs incremental (limite
// menor, mais rápido) -- nunca reprocessa a varredura completa a cada
// ~15min. Primeira execução (sem last_full_scan_at) força full scan.
const FULL_SCAN_INTERVAL_MS=Math.max(Number(process.env.WHIRLPOOL_FULL_SCAN_INTERVAL_HOURS)||6,1)*3600000;
function decideScanMode(claim){
  const searchLimitFull=Number(claim.search_limit_full)||1000;
  const searchLimitIncremental=Number(claim.search_limit_incremental)||100;
  const lastFullScanAt=claim.last_full_scan_at?new Date(claim.last_full_scan_at).getTime():0;
  const fullScanDue=!lastFullScanAt||(Date.now()-lastFullScanAt)>FULL_SCAN_INTERVAL_MS;
  return {fullScan:fullScanDue,limit:fullScanDue?searchLimitFull:searchLimitIncremental};
}
const norm=(v="")=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
// O CRM SAP mantém mais de uma árvore de frames carregada ao mesmo tempo
// (idiomas/janelas antigas ficam para trás em vez de serem descartadas).
// getBoundingClientRect() dentro de um frame reflete só o layout LOCAL
// daquele documento -- um elemento pode ter largura/altura válidas mesmo
// dentro de um <iframe> que está oculto (display:none/visibility:hidden)
// no documento pai. Sem checar a cadeia de ancestrais, clickText/
// clickSidebarText podiam clicar de verdade dentro de uma árvore CRM
// invisível: a Promise resolvia true, mas a tela que o usuário via nunca
// mudava. isFrameChainVisible sobe de frame em frame até a main frame
// confirmando que cada <iframe> da cadeia está de fato visível.
async function isFrameChainVisible(frame){
  let current=frame;
  for(;;){
    const parent=current.parentFrame();
    if(!parent)return true;
    let handle;
    try{handle=await current.frameElement();}catch{return false;}
    if(!handle)return false;
    let visible=false;
    try{visible=await handle.isVisible();}catch{visible=false;}
    await handle.dispose().catch(()=>{});
    if(!visible)return false;
    current=parent;
  }
}
async function visibleFrames(page){
  const frames=page.frames();
  const flags=await Promise.all(frames.map(f=>isFrameChainVisible(f).catch(()=>false)));
  return frames.filter((_,i)=>flags[i]);
}
// Acha o frame cujo próprio <iframe> (no documento pai) tem
// id="CRMApplicationFrame" -- o operacional real do CRM Whirlpool,
// confirmado por inspeção manual via DevTools (display:block,
// visibility:visible, ~1387x911, src em larcrm7.whirlpool.com). Existe
// também um segundo iframe auxiliar (adrum-xd-store-server-iframe, do
// AppDynamics) que nunca deve ser usado pra navegação -- restringir pelo
// id evita cair nele ou em qualquer outra árvore CRM visível/duplicada.
async function findCrmApplicationFrame(page){
  for(const frame of page.frames()){
    let handle;
    try{handle=await frame.frameElement();}catch{continue;}
    if(!handle)continue;
    let id="";
    try{id=await handle.evaluate(el=>el.id||"");}catch{}
    await handle.dispose().catch(()=>{});
    if(id!=="CRMApplicationFrame")continue;
    let host="";
    try{host=new URL(frame.url()).hostname;}catch{}
    if(host!=="larcrm7.whirlpool.com")continue;
    return frame;
  }
  return null;
}
// true quando `frame` é o próprio crmFrame ou um descendente dele
// (subindo por parentFrame()) -- usado como filtro pra nunca clicar fora
// da árvore operacional confirmada, mesmo que outro texto igual exista
// visível em outro lugar da página (ex.: "Ordens de serviço" também
// aparece numa caixa lateral fora do CRM real).
function isWithinCrmFrame(frame,crmFrame){
  let current=frame;
  while(current){
    if(current===crmFrame)return true;
    current=current.parentFrame();
  }
  return false;
}
async function clickText(page, texts, frameFilter) {
  const frames=frameFilter?(await visibleFrames(page)).filter(frameFilter):await visibleFrames(page);
  for(const frame of frames){
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
async function waitForTextClick(page,texts,timeout=30000,frameFilter){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await clickText(page,texts,frameFilter))return true;await delay(500);}
  return false;
}
// Marca (data-vx-preexisting) qualquer elemento que já bate com `texts` e
// já está visível/acionável NESTE momento -- chamado uma vez, antes de
// abrir o menu "Pesquisas", pra registrar decoys que existem o tempo
// todo (ex.: uma caixa lateral "Ordens de serviço" fora do submenu real).
// O item de submenu genuíno só fica visível DEPOIS de abrir "Pesquisas",
// então nunca carrega essa marca -- clickSidebarText despreza qualquer
// candidato marcado, não importa a posição/prioridade.
async function markExistingSidebarMatches(page,texts,frameFilter){
  const frames=frameFilter?(await visibleFrames(page)).filter(frameFilter):await visibleFrames(page);
  for(const frame of frames){
    try{
      await frame.evaluate(targets=>{
        const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
        const wanted=targets.map(norm);
        for(const node of document.querySelectorAll('a,button,[role="button"],[role="menuitem"],span,td,div')){
          const label=node.innerText||node.textContent||node.title||node.getAttribute("aria-label")||"";
          if(!wanted.includes(norm(label)))continue;
          const action=node.closest('a,button,[role="button"],[role="menuitem"]')||node;
          const rect=action.getBoundingClientRect();
          if(rect.width&&rect.height)action.setAttribute("data-vx-preexisting","1");
        }
      },texts);
    }catch{}
  }
}
// Acha o candidato certo em JS (mesma lógica de sempre), mas NUNCA clica
// via element.click() dentro do evaluate -- esse clique é um evento
// SINTÉTICO (isTrusted=false). O achado do LOGON_BUTTON já mostrou que o
// SAP pode exigir o pipeline real de clique do navegador pra disparar a
// navegação de verdade: o clique sintético "funciona" (nenhum erro, o
// elemento existe e é clicável) mas o SAP simplesmente ignora, e a tela
// nunca muda -- exatamente o sintoma confirmado visualmente em produção
// (permanece em "Pesquisa: atividades" mesmo com o clique "bem-sucedido"
// no log). Por isso: marca o elemento escolhido com um atributo
// temporário único, devolve diagnóstico sanitizado (tag/id/texto/bbox/
// ancestrais) de qual elemento foi escolhido, e quem realmente clica é o
// Playwright (frame.locator(...).click()), que dispara um clique
// real/confiável.
//
// `containerId`: restringe a busca a descendentes de um elemento (ex.: o
// <ul> de menu onde "Pesquisas" foi encontrado) -- achado real em
// produção (2026-09-16): sem essa restrição, "Ordens de serviço" foi
// clicado no widget "Objetos recentes" (C9_W36_V37_RecentObjects__title,
// dentro de uma <table>, nada a ver com o submenu de "Pesquisas") em vez
// do item real do submenu flutuante. RecentObjects também é bloqueado
// explicitamente, mesmo sem containerId, por ser um achado concreto (não
// suposição) de onde o clique errado foi parar.
async function clickSidebarText(page,texts,frameFilter,containerId,options){
  const frames=frameFilter?(await visibleFrames(page)).filter(frameFilter):await visibleFrames(page);
  const marker="vx"+Math.random().toString(36).slice(2,10);
  const idSuffixes=options?.idSuffixes||[];
  for(const frame of frames){
    let picked;
    try{
      picked=await frame.evaluate(({targets,marker,containerId,idSuffixes,arrowSiblingSelector})=>{
        const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
        const wanted=targets.map(norm);
        const container=containerId?document.getElementById(containerId):null;
        const choices=[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],span,td,div')]
          .map(node=>{
            const label=node.innerText||node.textContent||node.title||node.getAttribute("aria-label")||"";
            const action=node.closest('a,button,[role="button"],[role="menuitem"]')||node;
            // Achado real (submenuDiagnostics do run #32/#33): o item real
            // de "Ordens de serviço" tem um id SAP estável e conhecido
            // (sufixo "_SRV-ORD-SR", igual à própria chave de ação do
            // onclick htmlbSubmitLib do elemento) -- quando informado,
            // aceita o candidato por esse id mesmo que o texto normalizado
            // não bata exatamente, sem abrir mão de nenhuma das checagens
            // de visibilidade/contêiner abaixo.
            const idMatch=idSuffixes.some(suf=>(action.id||"").endsWith(suf));
            if(!wanted.includes(norm(label))&&!idMatch)return null;
            if(action.getAttribute("data-vx-preexisting")==="1")return null;
            // Achado real (2026-09-16): o widget "Objetos recentes" do SAP
            // (RecentObjects) tem uma linha de tabela cujo título também
            // bate com o texto do submenu -- nunca é um item de menu.
            if((action.id||"").includes("RecentObjects")||action.closest('[id*="RecentObjects"]'))return null;
            // Quando o container do menu já é conhecido (ex.: onde
            // "Pesquisas" foi achado), só aceita candidatos que realmente
            // pertencem a essa árvore -- nunca um widget não relacionado
            // que por acaso tem o mesmo texto em outro lugar da página.
            if(container&&!container.contains(action))return null;
            // Um container que engloba a página inteira (ex.: rootAreaDiv)
            // não deve ser tratado como item de menu clicável mesmo se seu
            // texto agregado bater por acidente -- um item real de sidebar
            // não tem dezenas de elementos dentro dele.
            if(action.querySelectorAll("*").length>40)return null;
            const rect=action.getBoundingClientRect();
            if(!rect.width||!rect.height||rect.left>280)return null;
            let parent=action;
            while(parent){
              const style=getComputedStyle(parent);
              if(style.display==="none"||style.visibility==="hidden"||style.opacity==="0")return null;
              parent=parent.parentElement;
            }
            // Prioriza controle genuinamente interativo (link/botão/role
            // semântico) sobre um span/div/td decorativo que só carrega o
            // mesmo texto -- evita escolher uma legenda/caixa lateral em
            // vez do item de menu real quando os dois batem por texto
            // (mesmo padrão já usado em clickText).
            const interactive=/^(A|BUTTON)$/.test(action.tagName)||["menuitem","button"].includes(action.getAttribute("role")||"");
            return {action,priority:interactive?0:1,left:rect.left,top:rect.top,width:rect.width,height:rect.height,area:rect.width*rect.height};
          }).filter(Boolean).sort((a,b)=>a.priority-b.priority||a.left-b.left||a.top-b.top||a.area-b.area);
        if(!choices.length)return null;
        const chosen=choices[0];
        // Achado real do usuário (print da tela real): "Pesquisas" é na
        // prática DOIS alvos clicáveis lado a lado -- o texto em si (ação
        // padrão, vai direto pra "Atividades", mesmo id de ação
        // 'SLS-ACT-SR') e uma setinha separada (<div class="th-menu2-arrow">,
        // irmã do link dentro do mesmo <li>) que é quem de fato abre o
        // submenu com "Ordens de serviço". Quando arrowSiblingSelector é
        // informado, o clique real precisa ir nessa seta -- nunca no
        // próprio texto/link -- mesmo container/<li> do candidato achado
        // por texto.
        let clickTarget=chosen.action;
        if(arrowSiblingSelector){
          const arrow=chosen.action.closest("li")?.querySelector(arrowSiblingSelector);
          if(arrow)clickTarget=arrow;
        }
        clickTarget.setAttribute("data-vx-click-target",marker);
        const ancestors=[];
        let anc=chosen.action.parentElement;
        for(let i=0;i<4&&anc;i++){
          ancestors.push({tag:(anc.tagName||"").toLowerCase(),id:String(anc.id||"").slice(0,60)});
          anc=anc.parentElement;
        }
        const label=(chosen.action.innerText||chosen.action.textContent||"").replace(/\s+/g," ").trim().slice(0,60);
        return {tag:(chosen.action.tagName||"").toLowerCase(),id:String(chosen.action.id||"").slice(0,60),text:label,left:Math.round(chosen.left),top:Math.round(chosen.top),width:Math.round(chosen.width),height:Math.round(chosen.height),ancestors,clickedArrow:clickTarget!==chosen.action,arrowMissing:!!arrowSiblingSelector&&clickTarget===chosen.action};
      },{targets:texts,marker,containerId:containerId||null,idSuffixes,arrowSiblingSelector:options?.arrowSiblingSelector||null});
    }catch{picked=null;}
    if(!picked)continue;
    const locator=frame.locator(`[data-vx-click-target="${marker}"]`);
    try{
      // Aproxima a interação humana: hover real antes do clique -- alguns
      // itens de árvore/menu do SAP só reagem (expandem submenu) a um
      // mouseover de verdade antes do clique em si, não a um clique
      // isolado sem o ponteiro ter "passado por cima" primeiro.
      if(options?.hoverFirst||options?.hoverOnly){
        await locator.hover({timeout:5000}).catch(()=>{});
        await delay(400);
      }
      // Achado real (submenuDiagnostics completo do run #32/#33, sem
      // corte): o próprio link "Pesquisas" (C7_W31_V32_ZSEARCH) tem
      // onclick com o MESMO id de ação ('SLS-ACT-SR') do seu primeiro
      // filho "Atividades" (C7_W31_V32_SLS-ACT-SR) -- clicar nele NUNCA
      // abre o menu, só repete a ação de "Atividades" (comprovado pelo
      // print real do usuário: os dois hit-targets são distintos, e o
      // texto sempre vai pra Atividades). Quando arrowSiblingSelector foi
      // pedido e a seta não foi encontrada, jamais cair para clicar no
      // próprio texto -- isso reproduziria exatamente a navegação errada.
      // Melhor deixar só o hover e falhar depois com diagnóstico claro.
      if(options?.hoverOnly||picked?.arrowMissing){
        await frame.evaluate(m=>{document.querySelector(`[data-vx-click-target="${m}"]`)?.removeAttribute("data-vx-click-target");},marker).catch(()=>{});
        return {clicked:true,hoveredOnly:true,target:picked,frame};
      }
      await locator.click({timeout:5000});
      await frame.evaluate(m=>{document.querySelector(`[data-vx-click-target="${m}"]`)?.removeAttribute("data-vx-click-target");},marker).catch(()=>{});
      return {clicked:true,target:picked,frame};
    }catch(e){
      await frame.evaluate(m=>{document.querySelector(`[data-vx-click-target="${m}"]`)?.removeAttribute("data-vx-click-target");},marker).catch(()=>{});
      return {clicked:false,target:picked,frame,error:String(e?.message||e).slice(0,200)};
    }
  }
  return {clicked:false,target:null,frame:null};
}
// Lista rasa (tag+id) de todo elemento com bounding box não-vazia dentro
// do frame -- usada só como "antes" pra comparar com um "depois" e achar
// o que realmente surgiu no DOM depois de uma interação (hover/clique).
async function snapshotVisibleElements(frame){
  try{
    return await frame.evaluate(()=>[...document.querySelectorAll("*")].map(node=>{
      const rect=node.getBoundingClientRect();
      if(!rect.width||!rect.height)return null;
      return {tag:node.tagName.toLowerCase(),id:String(node.id||"").slice(0,60)};
    }).filter(Boolean));
  }catch{return [];}
}
// Diagnóstico só usado quando "Ordens de serviço" não é achado depois de
// abrir "Pesquisas" -- nunca adivinha um novo container às cegas de novo:
// registra os atributos reais do próprio link "Pesquisas" (href/onclick/
// class/lsdata/lsevents -- nenhum é dado sensível, são só handlers de
// navegação do SAP), o HTML do <li> pai (truncado), tudo que ficou
// visível DEPOIS da interação que não estava visível ANTES, e toda
// ocorrência exata (visível ou não) do texto "Ordens de serviço" na
// página, com tag/id/class/bbox/ancestrais -- pra próxima correção ser
// baseada em evidência, não em suposição.
async function captureSubmenuDiagnostics(frame,pesquisasId,beforeSnapshot){
  try{
    return await frame.evaluate(({pesquisasId,beforeSnapshot})=>{
      const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
      const el=pesquisasId?document.getElementById(pesquisasId):null;
      const pesquisasElement=el?{
        href:el.getAttribute("href")||null,
        onclick:el.getAttribute("onclick")||(typeof el.onclick==="function"?"[handler JS vinculado]":null),
        class:el.getAttribute("class")||null,
        role:el.getAttribute("role")||null,
        lsdata:el.getAttribute("lsdata")||null,
        lsevents:el.getAttribute("lsevents")||null,
        ariaExpanded:el.getAttribute("aria-expanded")||null
      }:null;
      const parentLi=el?.closest("li")||null;
      const parentLiHtml=parentLi?parentLi.outerHTML.slice(0,1500):null;
      const afterSnapshot=[...document.querySelectorAll("*")].map(node=>{
        const rect=node.getBoundingClientRect();
        if(!rect.width||!rect.height)return null;
        return {tag:node.tagName.toLowerCase(),id:String(node.id||"").slice(0,60)};
      }).filter(Boolean);
      const beforeSet=new Set((beforeSnapshot||[]).map(x=>x.tag+"#"+x.id));
      const seen=new Set();
      const newlyVisible=[];
      for(const x of afterSnapshot){
        const key=x.tag+"#"+x.id;
        if(seen.has(key))continue;
        seen.add(key);
        if(!beforeSet.has(key))newlyVisible.push(x);
      }
      const wanted=["ordens de servico","service orders"];
      const ordensServicoOccurrences=[...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],span,td,div,li')]
        .map(node=>{
          const label=norm(node.innerText||node.textContent||node.title||node.getAttribute("aria-label")||"");
          if(!wanted.includes(label))return null;
          const rect=node.getBoundingClientRect();
          const ancestors=[];
          let anc=node.parentElement;
          for(let i=0;i<4&&anc;i++){
            ancestors.push({tag:(anc.tagName||"").toLowerCase(),id:String(anc.id||"").slice(0,60)});
            anc=anc.parentElement;
          }
          return {tag:node.tagName.toLowerCase(),id:String(node.id||"").slice(0,60),class:String(node.getAttribute("class")||"").slice(0,80),visible:!!(rect.width&&rect.height),left:Math.round(rect.left),top:Math.round(rect.top),width:Math.round(rect.width),height:Math.round(rect.height),ancestors};
        }).filter(Boolean).slice(0,15);
      return {pesquisasElement,parentLiHtml,newlyVisible:newlyVisible.slice(0,40),ordensServicoOccurrences};
    },{pesquisasId,beforeSnapshot});
  }catch{return null;}
}
async function findSearchLimit(page,frameFilter){
  const frames=frameFilter?(await visibleFrames(page)).filter(frameFilter):await visibleFrames(page);
  for(const frame of frames){
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
  const allFrames=page.frames();
  const visibleSet=new Set(await visibleFrames(page));
  for(const [index,frame] of allFrames.entries()){
    try{
      const url=new URL(frame.url());
      const controls=await frame.evaluate(()=>{
        const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase();
        return [...document.querySelectorAll('a,button,[role="button"],[role="menuitem"],span,td,div')]
          .map(node=>{
            const rect=node.getBoundingClientRect();
            return {tag:node.tagName.toLowerCase(),id:String(node.id||"").slice(0,90),label:norm(node.getAttribute("aria-label")||node.title||node.innerText||node.textContent||"").slice(0,60),left:Math.round(rect.left),top:Math.round(rect.top),width:Math.round(rect.width),height:Math.round(rect.height)};
          })
          .filter(x=>x.width>0&&x.height>0&&x.left<300&&/(service order|ordem de servico|service orders|ordens de servico|search|pesquisa|pesquisas)/.test(x.label))
          .slice(0,24);
      });
      if(controls.length)frames.push({index,visible:visibleSet.has(frame),host:url.hostname,path:url.pathname.slice(0,140),controls});
    }catch{}
  }
  return JSON.stringify(frames).slice(0,3000);
}
// Achado real (print do usuário, 2026-09-16): o botão "Procurar" está
// visivelmente presente e visível na tela "Pesquisa: ordens de serviço"
// (confirmado por captura de tela real), mas clickText()/waitForTextClick()
// -- que fazem match EXATO de texto e clicam via element.click() dentro do
// evaluate (clique SINTÉTICO, isTrusted=false) -- não o encontraram em 20s.
// Dois endurecimentos, ambos só ampliam o que já funcionava (nunca
// restringem): (1) match por "contém", não só igualdade exata, cobre um
// rótulo com texto extra (ex.: ícone/atalho concatenado ao texto visível);
// (2) clique real via frame.locator(...).click() em vez de element.click()
// -- o mesmo padrão já necessário para LOGON_BUTTON e para a seta de
// "Pesquisas", já que o SAP pode ignorar silenciosamente um clique
// sintético em ações de submit reais. Também restringe a busca ao frame
// exato (`located.frame`) onde o campo de limite foi achado, em vez de
// re-varrer todos os frames que batem com inCrmFrame.
async function clickTrustedInFrame(frame,texts,timeout=20000){
  const marker="vx"+Math.random().toString(36).slice(2,10);
  const end=Date.now()+timeout;
  while(Date.now()<end){
    let found=false;
    try{
      found=await frame.evaluate(({targets,marker})=>{
        const norm=v=>String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim().toLowerCase();
        const wanted=targets.map(norm);
        const nodes=[...document.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"],[role="menuitem"],span,td')];
        const choices=nodes.map(node=>{
          const label=norm(node.innerText||node.textContent||node.value||node.title||node.getAttribute("aria-label")||"");
          if(!wanted.some(w=>label.includes(w)))return null;
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
        choices[0].action.setAttribute("data-vx-click-target",marker);
        return true;
      },{targets:texts,marker});
    }catch{found=false;}
    if(found){
      const locator=frame.locator(`[data-vx-click-target="${marker}"]`);
      try{
        await locator.click({timeout:3000});
        await frame.evaluate(m=>{document.querySelector(`[data-vx-click-target="${m}"]`)?.removeAttribute("data-vx-click-target");},marker).catch(()=>{});
        return true;
      }catch{
        await frame.evaluate(m=>{document.querySelector(`[data-vx-click-target="${m}"]`)?.removeAttribute("data-vx-click-target");},marker).catch(()=>{});
      }
    }
    await delay(500);
  }
  return false;
}
async function openSearch(page,maxHits=1000){
  const deadline=Date.now()+45000;
  let searchMenuOpenedAt=0;
  let crmFrame=null;
  let decoysMarked=false;
  let menuContainerId=null;
  let pesquisasFrame=null;
  let beforeSubmenuSnapshot=null;
  // Diagnóstico sanitizado (nunca usuário/senha/cookies/tokens) -- cobre
  // exatamente os pontos pedidos: CRMApplicationFrame achado? host? menu
  // Pesquisas acionado? submenu de OS localizado? campo de limite
  // apareceu? em qual etapa parou.
  const diag={crmFrameFound:false,crmFrameHost:null,pesquisasClicked:false,ordensServicoClicked:false,maxHitsSeen:false,stage:"procurando CRMApplicationFrame"};
  while(Date.now()<deadline){
    if(!crmFrame||crmFrame.isDetached()){
      crmFrame=await findCrmApplicationFrame(page);
      if(crmFrame){
        diag.crmFrameFound=true;
        try{diag.crmFrameHost=new URL(crmFrame.url()).hostname;}catch{}
        diag.stage="CRMApplicationFrame localizado -- abrindo menu Pesquisas";
      }
    }
    if(!crmFrame){await delay(500);continue;}
    // Só considera elementos dentro da árvore do CRMApplicationFrame --
    // nunca a caixa lateral "Ordens de serviço" nem qualquer outra árvore
    // CRM visível/duplicada que exista fora dele.
    const inCrmFrame=f=>isWithinCrmFrame(f,crmFrame);
    // Uma única vez, ANTES de tentar abrir "Pesquisas": marca qualquer
    // "Ordens de serviço" que já esteja visível agora (decoy) -- o item
    // real do submenu só aparece depois que "Pesquisas" é clicado, então
    // nunca carrega essa marca e nunca é descartado por engano.
    if(!decoysMarked){
      await markExistingSidebarMatches(page,["Ordens de serviço","Service Orders"],inCrmFrame);
      decoysMarked=true;
    }
    const located=await findSearchLimit(page,inCrmFrame);
    if(located){
      diag.maxHitsSeen=true;
      diag.stage="campo Nº máximo resultados (btqsrvord_max_hits) encontrado -- clicando Procurar";
      await located.frame.evaluate((limit)=>{
        const max=[...document.querySelectorAll("input")].find(x=>/btqsrvord_max_hits$/i.test(x.id||x.name||""));
        max.value=String(limit);max.dispatchEvent(new Event("input",{bubbles:true}));max.dispatchEvent(new Event("change",{bubbles:true}));
      },maxHits);
      if(!(await clickTrustedInFrame(located.frame,["Procurar","Search"],20000))){
        await writeDiagnosticsJson("procurar-nao-encontrado",{diag,controlsNoFrame:await located.frame.evaluate(()=>{
          const norm=v=>String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim().toLowerCase();
          return [...document.querySelectorAll('a,button,input[type="button"],input[type="submit"],[role="button"],[role="menuitem"],span,td')]
            .map(node=>{
              const rect=node.getBoundingClientRect();
              return {tag:node.tagName.toLowerCase(),id:String(node.id||"").slice(0,90),label:norm(node.innerText||node.textContent||node.value||node.title||node.getAttribute("aria-label")||"").slice(0,60),left:Math.round(rect.left),top:Math.round(rect.top),width:Math.round(rect.width),height:Math.round(rect.height)};
            })
            .filter(x=>x.width>0&&x.height>0)
            .slice(0,60);
        }).catch(()=>[])});
        throw new Error("Botão Procurar não localizado na tela de pesquisa de OS.");
      }
      await delay(2500);return;
    }
    const now=Date.now();
    if(!searchMenuOpenedAt||now-searchMenuOpenedAt>8000){
      // Snapshot do que já está visível ANTES de tocar em "Pesquisas" --
      // só na primeira tentativa -- pra depois conseguir comparar e achar
      // exatamente o que o clique fez aparecer de novo no DOM.
      if(!beforeSubmenuSnapshot)beforeSubmenuSnapshot=await snapshotVisibleElements(crmFrame);
      // Achado real (submenuDiagnostics completo do run #32/#33): o
      // próprio link "Pesquisas" tem onclick com o MESMO id de ação do
      // seu primeiro filho "Atividades" -- clicar OU dar hover nele nunca
      // abre o menu, só repete a ação de "Atividades" (por isso a tela
      // nunca saía de "Pesquisa: atividades", e o item do submenu
      // continuava com width/height=0 mesmo com hover confirmado no
      // <li>). Achado real do usuário (print da tela de produção,
      // 2026-09-16): "Pesquisas" é DOIS alvos lado a lado -- o texto
      // (ação padrão) e uma setinha separada (div.th-menu2-arrow, irmã
      // do link) que é quem de fato abre o submenu com "Ordens de
      // serviço". O clique real precisa ir na seta, nunca no texto.
      const rp=await clickSidebarText(page,["Pesquisas","Search"],inCrmFrame,null,{arrowSiblingSelector:".th-menu2-arrow",hoverFirst:true});
      if(rp.clicked){
        searchMenuOpenedAt=now;
        diag.pesquisasClicked=true;
        diag.pesquisasTarget=rp.target;
        pesquisasFrame=rp.frame;
        // O <ul> de menu mais próximo onde "Pesquisas" foi encontrado --
        // achado real: sem restringir a busca seguinte a essa mesma
        // árvore, "Ordens de serviço" foi clicado num widget completamente
        // diferente (Objetos recentes) que só coincide no texto.
        const menuUl=(rp.target?.ancestors||[]).find(a=>a.tag==="ul"&&a.id);
        if(menuUl)menuContainerId=menuUl.id;
        diag.menuContainerId=menuContainerId;
        diag.stage="menu Pesquisas acionado -- abrindo submenu Ordens de serviço";
        await delay(1200);
        continue;
      }
    }
    if(searchMenuOpenedAt){
      // Hover real primeiro também aqui: o item só existe visível
      // enquanto o "Pesquisas" pai permanece em hover (classe "-hov" via
      // mouseenter/mouseleave no <li>) -- mover o ponteiro de verdade até
      // o item antes de clicar evita que o clique caia num alvo que
      // ficou fora da árvore atualmente hovered.
      const ro=await clickSidebarText(page,["Ordens de serviço","Service Orders"],inCrmFrame,menuContainerId,{hoverFirst:true,idSuffixes:["_SRV-ORD-SR"]});
      if(ro.clicked){
        diag.ordensServicoClicked=true;
        diag.ordensServicoTarget=ro.target;
        diag.stage="submenu Ordens de serviço acionado -- aguardando campo Nº máximo resultados";
        await delay(1500);
        continue;
      }
    }
    await delay(750);
  }
  // Clicar (mesmo com clique real/confiável) não é prova de navegação --
  // só o campo btqsrvord_max_hits comprova a tela certa (nunca um texto
  // genérico como "Nº máximo resultados"/"Procurar", que também existe em
  // "Pesquisa: atividades"). Se o submenu foi clicado mas o campo nunca
  // apareceu, classifica explicitamente: o clique ocorreu mas a SAP não
  // navegou -- nunca confundir "tentativa de clique" com "navegação
  // concluída".
  if(diag.ordensServicoClicked&&!diag.maxHitsSeen)diag.classification="SUBMENU_CLICK_DID_NOT_NAVIGATE";
  // "Pesquisas" foi clicado mas o submenu de "Ordens de serviço" nunca foi
  // localizado -- em vez de adivinhar um novo container às cegas de novo,
  // registra evidência real: atributos do próprio link "Pesquisas", o
  // <li> pai, o que ficou visível depois da interação que não estava
  // antes, e toda ocorrência exata (visível ou não) de "Ordens de
  // serviço" na página.
  if(diag.pesquisasClicked&&!diag.ordensServicoClicked){
    diag.classification="SUBMENU_NOT_FOUND_AFTER_PESQUISAS";
    diag.submenuDiagnostics=await captureSubmenuDiagnostics(pesquisasFrame||crmFrame,diag.pesquisasTarget?.id,beforeSubmenuSnapshot);
  }
  const snapshot=await safeNavigationSnapshot(page);
  // O diagnóstico completo (em especial submenuDiagnostics.parentLiHtml e
  // ordensServicoOccurrences) pode passar do limite de tamanho de uma
  // linha de log do GitHub Actions e sair cortado no console -- por isso
  // é sempre gravado por inteiro em arquivo (sobe junto no artifact de
  // diagnósticos), e só um resumo enxuto (sem submenuDiagnostics) vai na
  // mensagem de erro/console.
  await writeDiagnosticsJson("openSearch-diag",{diag,frames:snapshot}).catch(()=>{});
  const diagForLog={...diag};
  if(diagForLog.submenuDiagnostics)diagForLog.submenuDiagnostics="[gravado em arquivo diagnostics -- ver .artifacts/diagnostics/*-diag.json]";
  throw Object.assign(new Error("Tela de pesquisa de OS não carregou. Diagnóstico: "+JSON.stringify(diagForLog)+" Frames: "+snapshot),{code:"NAVIGATION_FAILURE"});
}
// Regras de negócio aprovadas (varredura completa de OS Whirlpool):
// - todo número de 10 dígitos começando com "7015" é uma OS, qualquer que
//   seja o texto exibido em "Tipo de documento" (BR Ordem de Servico/BR OS
//   Split/BR OS KAID já observados na prática);
// - "BR Aut.Especial" é sempre ignorado, mesmo com número parecido;
// - a classificação usa exclusivamente "Status do Serviço"
//   (ZZSTATUS_ITEM_SERV), nunca "Status do usuário";
// - Agendar/Agendado/Em processo AT => IMPORTAR_ATIVA;
// - Cancelado com data de entrada dentro dos últimos 30 dias (calculado
//   nesta mesma execução, nunca uma data fixa) => REVISAR_CANCELADA_30_DIAS;
// - Cancelado mais antigo, Liquidado, ou status desconhecido/sem data
//   válida => HISTORICO_EXTERNO (sem tratativa nova -- fica só registrado
//   no catálogo pra auditoria/consulta manual).
const CATALOG_ACTIVE_STATUSES=new Set(["Agendar","Em processo AT","Agendado"]);
function isCancelledStatus(value){return norm(value)==="cancelado";}
function parseBrazilianDateToIso(value){
  const match=String(value||"").match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if(!match)return null;
  const [,day,month,year]=match;
  const parsed=new Date(Number(year),Number(month)-1,Number(day));
  if(Number.isNaN(parsed.getTime()))return null;
  return `${year}-${month}-${day}`;
}
function classifyCatalogRow(row,cutoffIso){
  const entryDateIso=parseBrazilianDateToIso(row.entryDate);
  const recentCancelled=isCancelledStatus(row.serviceStatus)&&entryDateIso&&entryDateIso>=cutoffIso;
  const active=CATALOG_ACTIVE_STATUSES.has(row.serviceStatus);
  return {
    externalOrderId:row.externalOrderId,
    processType:row.processType||null,
    serviceStatus:row.serviceStatus,
    entryDate:entryDateIso,
    disposition:active?"IMPORTAR_ATIVA":recentCancelled?"REVISAR_CANCELADA_30_DIAS":"HISTORICO_EXTERNO",
    queueReason:active?"ATIVA_NOVA":recentCancelled?"CANCELADA_30_DIAS":null,
  };
}
// Lê a grade de resultados de "Pesquisa: ordens de serviço" -- mesma
// estrutura de tabela SAP (table[id$="_ResultTable_TableHeader"]) e mesmas
// colunas (OBJECT_ID/PROCESS_TYPE_TXT/POSTING_DATE/ZZSTATUS_ITEM_SERV) já
// validadas manualmente em workers/whirlpool/src/inspect-results.mjs --
// portada aqui verbatim (headless, sem depender de humano) pra alimentar o
// catálogo automaticamente a cada execução do cron.
async function readCatalogGridRows(frame){
  return frame.evaluate(()=>{
    const clean=(value="")=>value.replace(/\s+/g," ").trim();
    const directCells=(tr)=>[...tr.children].filter(el=>el.tagName==="TH"||el.tagName==="TD");
    const cellValue=(cell)=>{
      const visible=clean(cell.innerText);
      if(visible)return visible;
      const text=clean(cell.textContent);
      if(text)return text;
      const control=cell.querySelector("input:not([type=hidden]), select, textarea");
      if(control&&clean(control.value))return clean(control.value);
      const titled=cell.querySelector("[title]");
      return titled?clean(titled.getAttribute("title")):"";
    };
    for(const table of document.querySelectorAll('table[id$="_ResultTable_TableHeader"]')){
      const headerRow=table.tHead?.rows?.[0];
      if(!headerRow)continue;
      const headers=directCells(headerRow);
      const fieldName=(cell)=>{const match=cell.id.match(/_col_\d+-([A-Z0-9_]+)-TH$/i);return match?match[1].toUpperCase():"";};
      const osIndex=headers.findIndex(cell=>fieldName(cell)==="OBJECT_ID");
      const typeIndex=headers.findIndex(cell=>fieldName(cell)==="PROCESS_TYPE_TXT");
      const entryDateIndex=headers.findIndex(cell=>fieldName(cell)==="POSTING_DATE");
      const statusIndex=headers.findIndex(cell=>fieldName(cell)==="ZZSTATUS_ITEM_SERV");
      if(osIndex<0||typeIndex<0||entryDateIndex<0||statusIndex<0)continue;
      const rows=[...table.tBodies].flatMap(tbody=>[...tbody.rows].flatMap(tr=>{
        const cells=directCells(tr);
        if(cells.length!==headers.length)return [];
        const externalOrderId=cellValue(cells[osIndex]);
        if(!/^\d{10}$/.test(externalOrderId))return [];
        return [{externalOrderId,processType:cellValue(cells[typeIndex]),entryDate:cellValue(cells[entryDateIndex]),serviceStatus:cellValue(cells[statusIndex])}];
      }));
      if(rows.length)return rows;
    }
    return [];
  });
}
async function findCatalogResultFrame(page,inCrmFrame){
  for(const frame of (await visibleFrames(page)).filter(inCrmFrame)){
    try{const rows=await readCatalogGridRows(frame);if(rows.length)return {frame,rows};}catch{}
  }
  return null;
}
function catalogRowsFingerprint(rows){return rows.map(row=>row.externalOrderId).join("|");}
// Varre TODAS as páginas da pesquisa de OS (nunca só a primeira), lê e
// classifica cada linha. Nunca abre/altera nenhuma OS -- só leitura da
// grade, igual ao modo READ_ONLY de inspect-results.mjs, mas totalmente
// automático (sem clique humano, sem ENTER no terminal). Falha real de
// navegação (openSearch) sobe como NAVIGATION_FAILURE, como sempre; se a
// tela de pesquisa carregar mas a grade de resultados nunca aparecer em
// nenhuma página, isso também é tratado como falha sistêmica (nunca um
// "catálogo vazio" silencioso) -- exatamente o pedido de nunca reportar
// sucesso quando a busca não aconteceu de verdade.
async function scanServiceOrderCatalog(page,crmFrame,maxHits){
  await openSearch(page,maxHits);
  const inCrmFrame=f=>isWithinCrmFrame(f,crmFrame);
  const collected=new Map();
  let ignoredAutEspecial=0;
  let unclassifiedRows=0;
  let scannedPages=0;
  // Achado real de produção (run #46, 2026-09-16): depois de "Procurar"
  // ser clicado com sucesso (openSearch() retornou sem lançar erro), a
  // grade de resultados ainda não tinha renderizado no SAP real -- o
  // delay fixo de 2.5s do openSearch() nunca foi suficiente pra rede/
  // backend real. A transição "Avançar" já espera até 30s por uma
  // mudança de fingerprint; a primeira carga da grade nunca tinha nenhuma
  // tentativa extra além desse delay fixo. Aplica a mesma janela de
  // espera aqui, só pra primeira página.
  let firstResult=await findCatalogResultFrame(page,inCrmFrame);
  for(let attempt=0;!firstResult&&attempt<30;attempt++){
    await delay(1000);
    firstResult=await findCatalogResultFrame(page,inCrmFrame);
  }
  for(let pageNumber=1;pageNumber<=100;pageNumber++){
    const result=pageNumber===1?firstResult:await findCatalogResultFrame(page,inCrmFrame);
    if(!result)break;
    scannedPages++;
    for(const row of result.rows){
      // "BR Aut.Especial" é sempre ignorado, mesmo quando o número também
      // começa com 7015 -- a exclusão por tipo tem prioridade sobre a
      // inclusão por prefixo numérico (regra explícita do usuário).
      if(norm(row.processType).includes("aut especial")||norm(row.processType).includes("aut.especial")){ignoredAutEspecial++;continue;}
      if(row.externalOrderId.startsWith("7015")){collected.set(row.externalOrderId,row);continue;}
      unclassifiedRows++;
    }
    const before=catalogRowsFingerprint(result.rows);
    if(!(await clickText(page,["Avançar"],inCrmFrame)))break;
    let changed=false;
    for(let attempt=0;attempt<60;attempt++){
      await delay(500);
      const next=await findCatalogResultFrame(page,inCrmFrame);
      if(next&&catalogRowsFingerprint(next.rows)!==before){changed=true;break;}
    }
    if(!changed)break;
  }
  if(scannedPages===0){
    await writeDiagnosticsJson("grade-nao-encontrada",{
      frames:await Promise.all((await visibleFrames(page)).filter(inCrmFrame).map(async f=>{
        const tables=await f.evaluate(()=>[...document.querySelectorAll("table")].map(t=>String(t.id||"").slice(0,90)).filter(Boolean).slice(0,20)).catch(()=>[]);
        let host="";try{host=new URL(f.url()).hostname;}catch{}
        return {host,tables};
      }))
    });
    throw Object.assign(new Error("Grade de resultados da pesquisa de OS não carregou em nenhuma página."),{code:"NAVIGATION_FAILURE"});
  }
  const today=new Date();today.setHours(0,0,0,0);
  const cutoff=new Date(today);cutoff.setDate(cutoff.getDate()-30);
  const cutoffIso=cutoff.toISOString().slice(0,10);
  const items=[...collected.values()].map(row=>classifyCatalogRow(row,cutoffIso));
  return {items,scannedPages,ignoredAutEspecial,unclassifiedRows,limitReached:collected.size+ignoredAutEspecial+unclassifiedRows>=maxHits,cutoffIso};
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
  const diagnostic=await safeNavigationSnapshot(initialPage);
  const start=await initialPage.evaluate(()=>({
    readyState:document.readyState,
    title:String(document.title||"").slice(0,80),
    htmlLength:(document.documentElement?.innerHTML||"").length,
    bodyChildren:document.body?.children?.length||0,
    scripts:document.scripts.length,
    forms:document.forms.length,
    hasWindowOpen:/window\.open/i.test(document.documentElement?.innerHTML||""),
    hasCrmTarget:/crm_ui_frame|BSPWDApplication/i.test(document.documentElement?.innerHTML||"")
  })).catch(()=>null);
  throw Object.assign(new Error("Janela operacional do CRM não foi aberta. Diagnóstico sanitizado: "+JSON.stringify({pages:context.pages().length,start,frames:JSON.parse(diagnostic)}).slice(0,1400)),{code:"NAVIGATION_FAILURE"});
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
  for(const frame of await visibleFrames(page)){try{const r=await inspectAndOpen(frame,id);if(r==="OPENED"){await delay(2000);return;}if(r==="NO_ACTION")throw new Error("OS sem link.");}catch(e){if(e.message==="OS sem link.")throw e;}}
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
// Registra a falha de UMA OS na fila (attempts+last_error) sem tirá-la de
// PENDENTE -- antes desta chamada, uma falha só existia no log do GitHub
// Actions e a linha da fila continuava parecendo nunca ter sido tentada.
// Nunca lança: uma falha ao registrar a falha não pode derrubar o lote.
async function reportJobFailure(job,code,message){
 await workerRequest("job_failed",{queue_id:job.queueId,error_code:code,error_message:message}).catch(()=>{});
}
async function closePdfPages(context,main){for(const p of context.pages())if(p!==main&&/crm_pdf_print|\.pdf/i.test(p.url()))await p.close().catch(()=>{});}
// Só roda em falha, nunca no caminho feliz. Screenshot + HTML servem só pra
// diagnóstico visual real (em vez de mais um "chute" às cegas sobre o CRM
// SAP) -- nunca vazam a senha: campo password renderiza mascarado no
// screenshot, e page.content() serializa o atributo HTML original do
// input, não o valor digitado via .fill().
async function captureDiagnostics(tag){
 try{
  if(!page||page.isClosed())return;
  const dir=path.join(ARTIFACT_DIR,"diagnostics");
  await mkdir(dir,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  // Redige credenciais visíveis antes da captura. O diagnóstico só existe
  // no caminho de falha, portanto não há necessidade de restaurar os campos.
  await page.locator('input[type="password"],input[name="sap-user"],#sap-user').evaluateAll(inputs=>{
    for(const input of inputs)input.value="[redacted]";
  }).catch(()=>{});
  await page.screenshot({path:path.join(dir,`${stamp}-${tag}.png`),fullPage:true}).catch(()=>{});
  // Nunca persiste o DOM bruto: campos ocultos do SAP carregam XSRF,
  // tickets e outros valores de sessão. A cópia sanitizada conserva apenas
  // a estrutura necessária ao diagnóstico.
  const html=await page.evaluate(()=>{
    const clone=document.documentElement.cloneNode(true);
    for(const input of clone.querySelectorAll("input")){
      const key=((input.getAttribute("name")||"")+" "+(input.id||"")+" "+(input.type||"")).toLowerCase();
      if(input.type==="hidden"||input.type==="password"||/token|xsrf|csrf|secret|cookie|session|password|sap-user/.test(key)){
        input.setAttribute("value","[redacted]");
      }
    }
    for(const meta of clone.querySelectorAll("meta")){
      const key=((meta.getAttribute("name")||"")+" "+(meta.getAttribute("http-equiv")||"")).toLowerCase();
      if(/token|xsrf|csrf|secret|cookie|session|authorization/.test(key))meta.setAttribute("content","[redacted]");
    }
    return "<!DOCTYPE html>\n"+clone.outerHTML;
  }).catch(()=>null);
  if(html)await writeFile(path.join(dir,`${stamp}-${tag}.html`),html);
 }catch{}
}
// Diagnósticos ricos (ex.: submenuDiagnostics, com o HTML do <li> pai e
// todas as ocorrências de "Ordens de serviço") podem ultrapassar o limite
// de tamanho de uma linha de log do GitHub Actions e/ou o corte de 1600
// caracteres aplicado à mensagem de erro antes do relatório final --
// nenhum dos dois é um problema de ferramenta de leitura de log, é
// truncamento real do próprio worker. Por isso o diagnóstico completo é
// sempre gravado por inteiro aqui (sobe junto no artifact de
// diagnósticos), nunca só embutido no texto do erro. Mesma lista de
// campos sensíveis nunca aparece aqui (são só ids/classes/handlers de
// navegação do SAP, nunca usuário/senha/cookies/tokens).
async function writeDiagnosticsJson(tag,data){
 const dir=path.join(ARTIFACT_DIR,"diagnostics");
 await mkdir(dir,{recursive:true});
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");
 await writeFile(path.join(dir,`${stamp}-${tag}.json`),JSON.stringify(data,null,2));
}
async function loginIfNeeded(page,claim){
 await page.goto(PORTAL_URL,{waitUntil:"domcontentloaded",timeout:120000});
 // O HTML chega antes de o SAP LightSpeed terminar de ligar os handlers.
 // Aguarda o carregamento integral antes de preencher ou enviar o login.
 await page.waitForLoadState("load",{timeout:30000}).catch(()=>{});
 const password=page.locator('input[type="password"]').first();
 const isLogon=/logon|login/i.test(await page.title().catch(()=>""));
 if(!(await password.count())){
   if(isLogon)throw Object.assign(new Error("Tela de login Whirlpool incompleta."),{code:"PORTAL_INDISPONIVEL"});
   return false;
 }
 if(!claim.needs_login)throw Object.assign(new Error("Sessão Whirlpool expirada."),{code:"SESSION_EXPIRED"});
 const form=password.locator("xpath=ancestor::form[1]");
 if(!(await form.count()))throw Object.assign(new Error("Formulário de login Whirlpool não localizado."),{code:"PORTAL_INDISPONIVEL"});
 const username=form.locator('input[name="sap-user"],#sap-user').first();
 if(!(await username.count()))throw Object.assign(new Error("Tela de login Whirlpool incompleta."),{code:"PORTAL_INDISPONIVEL"});
 await username.fill(String(claim.username||""),{force:true});
 await password.fill(String(claim.password||""),{force:true});
 claim.username="";claim.password="";
 // SAP NetWeaver não usa um submit HTML nativo nesta tela. O componente
 // LOGON_BUTTON dispara callSubmitLogin('onLogin'), que preenche
 // sap-system-login-oninputprocessing e executa a proteção exigida pelo SAP.
 const sapLogon=form.locator("#LOGON_BUTTON").first();
 if(await sapLogon.count()){
   // O clique real preserva a inicialização e a fila de eventos do SAP.
   // A chamada semântica é usada apenas quando o componente não se torna
   // visível, mesmo após o carregamento completo.
   const visible=await sapLogon.waitFor({state:"visible",timeout:15000}).then(()=>true).catch(()=>false);
   if(visible)await sapLogon.click();
   else await form.evaluate(node=>{
     const win=node.ownerDocument.defaultView;
     if(typeof win.callSubmitLogin==="function")win.callSubmitLogin("onLogin");
     else{
       const eventField=node.querySelector('input[name="sap-system-login-oninputprocessing"]');
       if(eventField)eventField.value="onLogin";
       node.submit();
     }
   });
 } else{
   const submit=form.locator('button[type="submit"],input[type="submit"]').first();
   if(await submit.count())await submit.click({force:true});
   else await form.evaluate(node=>{
     const eventField=node.querySelector('input[name="sap-system-login-oninputprocessing"]');
     if(eventField)eventField.value="onLogin";
     if(typeof node.requestSubmit==="function")node.requestSubmit();else node.submit();
   });
 }
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
   await page.waitForTimeout(500);
   const body=norm(await page.locator("body").innerText().catch(()=>""));
   if(/senha invalida|usuario ou senha|credenciais invalidas|password incorrect|name or password is incorrect|authentication failed|logon failed/.test(body)){
     throw Object.assign(new Error("Credenciais Whirlpool rejeitadas."),{code:"CREDENCIAIS_INVALIDAS"});
   }
   if(!(await page.locator('input[type="password"]').count()))return true;
 }
 throw Object.assign(new Error("Login Whirlpool não concluído sem rejeição explícita."),{code:"PORTAL_INDISPONIVEL"});
}
const workerId=crypto.randomUUID();
const conn={id:null};
const claim=await workerRequest("claim",{worker_id:workerId,lease_seconds:900});
conn.id=claim?.connection_id||null;
if(!claim?.claimed){console.log("EXECUÇÃO NÃO INICIADA: "+String(claim?.reason||"SEM_LEASE"));process.exit(0);}
let browser,context,page,reported=false;
const results=[];
try{
 browser=await chromium.launch({channel:"chromium",headless:true,args:["--disable-dev-shm-usage","--no-sandbox","--disable-popup-blocking"]});
 let storageState;
 try{if(claim.session_state)storageState=JSON.parse(claim.session_state);}catch{}
 context=await browser.newContext({storageState,acceptDownloads:true,viewport:{width:1600,height:1000}});
 page=await context.newPage();
 await loginIfNeeded(page,claim);
 page=await selectCrmPage(context,page);
 await page.bringToFront().catch(()=>{});
 // Varredura automática do catálogo (substitui o fluxo manual
 // inspect-results.mjs -> prepare-catalog.mjs -> upload-catalog.mjs):
 // reaproveita a MESMA sessão/lease/navegação já autenticada, sem novo
 // worker/cron/fila. Falha real de navegação/leitura da grade sobe como
 // NAVIGATION_FAILURE e é tratada pelo catch externo como falha sistêmica
 // (nunca finge sucesso quando a busca não aconteceu). A OS aberta durante
 // o scan nunca fica presa numa tela de detalhe -- é sempre a própria lista
 // de resultados, então não há "Encerrar" pendente entre o scan e os jobs.
 const scanMode=decideScanMode(claim);
 const crmFrameForScan=await findCrmApplicationFrame(page);
 if(!crmFrameForScan)throw Object.assign(new Error("CRMApplicationFrame não localizado para a varredura do catálogo."),{code:"NAVIGATION_FAILURE"});
 const scan=await scanServiceOrderCatalog(page,crmFrameForScan,scanMode.limit);
 const ingestResult=await ingestCatalog(claim.filial,scan.items,scanMode.fullScan,scan.limitReached);
 console.log("CATALOGO WHIRLPOOL ATUALIZADO: "+JSON.stringify({fullScan:scanMode.fullScan,limit:scanMode.limit,scannedPages:scan.scannedPages,ignoredAutEspecial:scan.ignoredAutEspecial,unclassifiedRows:scan.unclassifiedRows,limitReached:scan.limitReached,...ingestResult}));
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
   const reason=String(e.message||e).slice(0,1600);
   results.push({externalOrderId:job.external_order_id,status:"FALHA",reason});
   await captureDiagnostics(`job-${job.external_order_id}`);
   await reportJobFailure(job,e?.code||"JOB_FAILURE",reason);
   await closePdfPages(context,page);
   await clickText(page,["Encerrar"]).catch(()=>{});
   await delay(1000);
   if(e?.code==="NAVIGATION_FAILURE")break;
  }
 }
 const sessionState=JSON.stringify(await context.storageState());
 await workerRequest("report",{connection_id:conn.id,lock_token:claim.lock_token,outcome:"AUTH_OK",session_state:sessionState,error_code:null});
 reported=true;
 // Autenticação/sessão terem funcionado (AUTH_OK) não significa que
 // alguma OS foi de fato importada. Sem isto, um lote em que TODAS as
 // tentativas falharam (ex.: bloqueio de navegação no CRM) terminava com
 // exit code 0 -- o GitHub Actions aparecia verde mesmo sem importar nada.
 if(results.length>0&&!results.some(r=>r.status==="IMPORTADA")){
   console.error(`WORKER WHIRLPOOL: nenhuma das ${results.length} OS tentada(s) foi importada.`);
   process.exitCode=3;
 }
}catch(e){
 const code=String(e?.code||"");
 const outcome=code==="CREDENCIAIS_INVALIDAS"?"CREDENCIAIS_INVALIDAS":code==="SESSION_EXPIRED"?"SESSION_EXPIRED":"PORTAL_INDISPONIVEL";
 await captureDiagnostics(outcome.toLowerCase());
 if(!reported)await workerRequest("report",{connection_id:conn.id,lock_token:claim.lock_token,outcome,session_state:null,error_code:code||"WORKER_FAILURE"}).catch(err=>console.error("RELATÓRIO WHIRLPOOL FALHOU: "+String(err?.message||err).replace(/Bearer\\s+\\S+/gi,"Bearer [redacted]").slice(0,240)));
 console.error("WORKER WHIRLPOOL: "+outcome+" — "+String(e?.message||e).slice(0,1600));
 process.exitCode=outcome==="CREDENCIAIS_INVALIDAS"?2:1;
}finally{
 claim.username="";claim.password="";claim.session_state="";
 await context?.close().catch(()=>{});await browser?.close().catch(()=>{});
}
console.log("LOTE AUTOMÁTICO FINALIZADO");
console.log(JSON.stringify({limit:LIMIT,processed:results.length,results}));
