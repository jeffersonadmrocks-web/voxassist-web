const SYSTEM3_BUCKET='system3-legacy';

function system3Button(){
  if(document.querySelector('[data-system3-legacy]')) return;
  const side=document.querySelector('.sidebar');
  if(!side) return;
  const b=document.createElement('button');
  b.className='nav'; b.dataset.system3Legacy='1'; b.textContent='Legado System3';
  b.onclick=()=>renderSystem3Legacy();
  side.appendChild(b);
}

async function storageUploadSystem3(file,path){
  const r=await fetch(`${CFG.url}/storage/v1/object/${SYSTEM3_BUCKET}/${encodeURIComponent(path).replace(/%2F/g,'/')}`,{
    method:'POST',
    headers:{apikey:CFG.key,Authorization:'Bearer '+state.session.access_token,'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},
    body:file
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}
async function storageDownloadSystem3(path,name){
  const r=await fetch(`${CFG.url}/storage/v1/object/${SYSTEM3_BUCKET}/${encodeURIComponent(path).replace(/%2F/g,'/')}`,{headers:{apikey:CFG.key,Authorization:'Bearer '+state.session.access_token}});
  if(!r.ok) throw new Error(await r.text());
  const blob=await r.blob(),u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download=name||path.split('/').pop();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function csvSplit(line,sep){
  const out=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===sep&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;
}
function pickLegacy(obj,names){for(const n of names){const k=Object.keys(obj).find(x=>x.toUpperCase()===n);if(k&&obj[k])return String(obj[k]).trim()}return null}
async function indexCsvSystem3(file,fileId){
  const text=await file.text(); const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(lines.length<2)return 0;
  const sep=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';
  const headers=csvSplit(lines[0],sep).map(x=>x.trim()); let count=0;
  for(let i=1;i<lines.length;i+=100){
    const batch=[];
    for(const line of lines.slice(i,i+100)){
      const vals=csvSplit(line,sep),o={};headers.forEach((h,j)=>o[h]=vals[j]??'');
      const client=pickLegacy(o,['CLIENTE','NOME','NOMECLIENTE','NOMCLI']),doc=pickLegacy(o,['CPF','CNPJ','DOCUMENTO']),phone=pickLegacy(o,['TELEFONE','FONE','CELULAR']),osn=pickLegacy(o,['OS','ORDEM','ORDEMSERVICO','NUMOS']),ptype=pickLegacy(o,['PRODUTO','TIPO','EQUIPAMENTO']),brand=pickLegacy(o,['MARCA']),model=pickLegacy(o,['MODELO']),serial=pickLegacy(o,['SERIE','NUMSERIE']),status=pickLegacy(o,['STATUS','SITUACAO']);
      batch.push({source_file_id:fileId,source_table:file.name,source_key:String(i+count),record_type:osn?'OS':client?'CLIENTE':'REGISTRO',client_name:client,document:doc,phone,os_number:osn,product_type:ptype,brand,model,serial_number:serial,status,searchable_text:[client,doc,phone,osn,ptype,brand,model,serial,status,JSON.stringify(o)].filter(Boolean).join(' '),raw_data:o});count++;
    }
    await api('system3_legacy_records',{method:'POST',body:JSON.stringify(batch)});
  }
  return count;
}
async function uploadSystem3Files(){
  if(state.profile?.role!=='GESTOR') return toast('Somente GESTOR pode importar arquivos do legado.','err');
  const input=document.querySelector('#system3Files'),files=[...(input?.files||[])];if(!files.length)return toast('Selecione um ou mais arquivos.','err');
  const progress=document.querySelector('#system3Progress'); progress.textContent='Importando...';
  let ok=0;
  for(const file of files){
    try{
      const path=`${new Date().toISOString().slice(0,10)}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      await storageUploadSystem3(file,path);
      const rows=await api('system3_legacy_files',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({file_name:file.name,storage_path:path,file_type:file.name.split('.').pop()?.toUpperCase()||'',file_size:file.size,imported_by:state.session.user.id,status:'ARQUIVADO'})});
      const rec=rows?.[0]; let indexed=0;
      if(rec && /\.csv$/i.test(file.name)){indexed=await indexCsvSystem3(file,rec.id);await api(`system3_legacy_files?id=eq.${rec.id}`,{method:'PATCH',body:JSON.stringify({status:indexed?'INDEXADO':'ARQUIVADO',notes:indexed?`${indexed} registros indexados automaticamente`:'CSV sem registros'})});}
      ok++;
    }catch(e){toast(`Falha em ${file.name}: ${e.message}`,'err')}
  }
  progress.textContent=`${ok} de ${files.length} arquivo(s) armazenado(s).`;
  await renderSystem3Legacy();
}
async function searchSystem3(){
  const q=(document.querySelector('#system3Search')?.value||'').trim();
  let path='system3_legacy_records?select=*&order=created_at.desc&limit=200';
  if(q){const s=encodeURIComponent('*'+q+'*');path=`system3_legacy_records?or=(client_name.ilike.${s},document.ilike.${s},phone.ilike.${s},os_number.ilike.${s},product_type.ilike.${s},brand.ilike.${s},model.ilike.${s},serial_number.ilike.${s},status.ilike.${s},searchable_text.ilike.${s})&select=*&order=created_at.desc&limit=200`;}
  const rows=await api(path).catch(()=>[]); const el=document.querySelector('#system3Results');if(!el)return;
  el.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>OS</th><th>Cliente</th><th>Telefone</th><th>Equipamento</th><th>Situação</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.record_type||'—')}</td><td><b>${esc(r.os_number||'—')}</b></td><td>${esc(r.client_name||'—')}</td><td>${esc(r.phone||'—')}</td><td>${esc([r.product_type,r.brand,r.model].filter(Boolean).join(' • ')||'—')}</td><td>${esc(r.status||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Nenhum registro indexado encontrado.</p>';
}
async function renderSystem3Legacy(){
  system3Button();
  document.querySelector('#title').textContent='Legado System3';
  document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));document.querySelector('[data-system3-legacy]')?.classList.add('active');
  const [files,count]=await Promise.all([api('system3_legacy_files?select=*&order=imported_at.desc&limit=200').catch(()=>[]),api('system3_legacy_records?select=id&limit=1000').catch(()=>[])]);
  const app=document.querySelector('#app');
  app.innerHTML=`<div class="section-title"><h2>Arquivo de Legado System3</h2><span class="status">CONSULTA SOMENTE</span></div>
  <div class="grid metrics"><div class="card metric"><span>Arquivos preservados</span><b>${files.length}</b></div><div class="card metric"><span>Registros indexados</span><b>${count.length}${count.length===1000?'+':''}</b></div></div>
  <div class="card block"><h3>Importar arquivo original</h3><p>Os arquivos ficam preservados em Storage privado. CSV é indexado automaticamente; DBF/FPT e outros formatos ficam arquivados integralmente para parser dedicado.</p>${state.profile?.role==='GESTOR'?`<input id="system3Files" type="file" multiple><div class="actions"><button id="system3Upload" class="primary">Importar arquivos</button></div><small id="system3Progress"></small>`:'<p><b>Somente Gestor pode importar.</b></p>'}</div>
  <div class="card block"><h3>Consultar histórico</h3><div class="toolbar"><input id="system3Search" placeholder="Pesquisar por OS, cliente, CPF/CNPJ, telefone, série, marca ou modelo"><button id="system3Go" class="secondary">Pesquisar</button></div><div id="system3Results"><p>Digite um termo para consultar o legado indexado.</p></div></div>
  <div class="card block"><h3>Arquivos originais preservados</h3><div class="table-wrap"><table><thead><tr><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>Status</th><th>Importado em</th><th></th></tr></thead><tbody>${files.map(f=>`<tr><td><b>${esc(f.file_name)}</b></td><td>${esc(f.file_type||'—')}</td><td>${(Number(f.file_size||0)/1024/1024).toFixed(2)} MB</td><td>${esc(f.status)}</td><td>${dt(f.imported_at)}</td><td><button class="secondary mini" data-system3-download="${esc(f.storage_path)}" data-name="${esc(f.file_name)}">Baixar original</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhum arquivo importado ainda.</td></tr>'}</tbody></table></div></div>`;
  document.querySelector('#system3Upload')?.addEventListener('click',uploadSystem3Files);document.querySelector('#system3Go')?.addEventListener('click',searchSystem3);document.querySelector('#system3Search')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchSystem3()});
  document.querySelectorAll('[data-system3-download]').forEach(b=>b.addEventListener('click',()=>storageDownloadSystem3(b.dataset.system3Download,b.dataset.name).catch(e=>toast(e.message,'err'))));
}

const system3Observer=new MutationObserver(()=>system3Button());system3Observer.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(system3Button,500);
