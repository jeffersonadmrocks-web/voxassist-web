/* VoxAssist V0.8.13 — OS Whirlpool editável diretamente no modelo do fabricante */
(function(){
  const STANDARD_EDIT = new Set(['defeitoConstatado','reclamacaoAtendimento','laudoTecnico','observacao']);
  const ROLE = ()=>String((typeof state!=='undefined'&&state?.profile?.role)||'').toUpperCase();
  const canAdvanced = ()=>ROLE()==='GESTOR';
  const $=(s,r=document)=>r.querySelector(s);
  const field=(name,form)=>form.querySelector(`[name="${name}"]`)?.closest('label');
  function cell(cls=''){const td=document.createElement('td');if(cls)td.className=cls;return td}
  function put(td,form,names){names.forEach(n=>{const el=field(n,form);if(el)td.appendChild(el)});}
  function row(table,cells){const tr=document.createElement('tr');cells.forEach(c=>tr.appendChild(c));table.appendChild(tr);return tr}
  function table(cls=''){const t=document.createElement('table');t.className='vx-wp-doc-table '+cls;return t}
  function setMode(form,mode){
    form.dataset.wpMode=mode;
    form.querySelectorAll('input,textarea,select').forEach(el=>{
      const n=el.name||'';
      let editable=false;
      if(mode==='basic') editable=STANDARD_EDIT.has(n);
      if(mode==='advanced') editable=true;
      el.disabled=!editable;
      el.classList.toggle('vx-wp-editable',editable);
    });
    const save=$('#vxWpSave'); if(save) save.disabled=(mode==='view');
    document.querySelectorAll('[data-wp-mode]').forEach(b=>b.classList.toggle('active',b.dataset.wpMode===mode));
    const status=$('#vxWpModeStatus');
    if(status) status.textContent=mode==='view'?'Visualização protegida':mode==='basic'?'Edição operacional':'Edição avançada';
  }
  function installStyle(){if($('#vxWpDirectStyle'))return;const s=document.createElement('style');s.id='vxWpDirectStyle';s.textContent=`
  #vx-whirlpool .vx-screen-box{max-width:none!important;background:#eef3f7!important;padding:10px!important}
  #vx-whirlpool .vx-wp-head{display:flex!important;align-items:center!important;gap:8px!important;padding:8px 10px!important;background:#fff!important;border:1px solid #9aa9b8!important;margin-bottom:8px!important}
  #vx-whirlpool .vx-wp-head>div:first-child{flex:1} #vx-whirlpool .vx-wp-head h3{margin:0!important;font-size:15px!important}
  .vx-wp-modebar{display:flex;gap:7px;align-items:center;margin-left:auto}.vx-wp-modebar button{border:1px solid #b9c5d1;background:#fff;padding:7px 11px;font-weight:700;cursor:pointer}.vx-wp-modebar button.active{background:#0c2340;color:#fff}.vx-wp-modebar button:disabled{opacity:.45;cursor:not-allowed}.vx-wp-mode-status{font-size:11px;color:#526579;margin-right:6px}
  #vxWpForm.vx-wp-direct{display:block!important;background:#fff!important;border:1px solid #75889a!important;padding:8px!important;max-width:1180px;margin:0 auto!important}
  .vx-wp-doc-title{text-align:center;font-weight:800;font-size:14px;padding:5px;border:1px solid #111;border-bottom:0;background:#fff}
  .vx-wp-doc-table{width:100%;border-collapse:collapse;margin:0}.vx-wp-doc-table td,.vx-wp-doc-table th{border:1px solid #111;padding:3px;vertical-align:top;background:#fff}.vx-wp-doc-table th{text-align:center;font-size:10px}.vx-wp-doc-table label{display:block!important;margin:0!important}.vx-wp-doc-table label>span{display:block!important;font-size:9px!important;font-weight:700!important;color:#111!important;text-transform:uppercase;margin:0 0 2px!important}
  .vx-wp-doc-table input,.vx-wp-doc-table textarea,.vx-wp-doc-table select{width:100%!important;border:0!important;background:transparent!important;padding:2px 3px!important;min-height:24px!important;font:inherit!important;color:#111!important;outline:none!important}.vx-wp-doc-table textarea{min-height:48px!important;resize:vertical}.vx-wp-doc-table input:disabled,.vx-wp-doc-table textarea:disabled,.vx-wp-doc-table select:disabled{opacity:1!important;color:#111!important;-webkit-text-fill-color:#111!important}.vx-wp-doc-table .vx-wp-editable{background:#fffbe8!important;box-shadow:inset 0 0 0 1px #e2b949!important}
  .vx-wp-section-label{width:120px;text-align:center;font-size:9px;font-weight:800;vertical-align:middle!important}.vx-wp-labelbox{font-size:9px;font-weight:700;text-align:center;vertical-align:middle!important}.vx-wp-placeholder{min-height:42px;display:flex;align-items:center;justify-content:center;font:10px monospace}.vx-wp-actions{display:flex!important;gap:8px!important;justify-content:flex-end!important;margin-top:10px!important}.vx-wp-note{display:none!important}
  #vxWpSave:disabled{opacity:.45;cursor:not-allowed}
  @media(max-width:900px){#vxWpForm.vx-wp-direct{overflow-x:auto}.vx-wp-doc-table{min-width:760px}.vx-wp-modebar{flex-wrap:wrap}}
  `;document.head.appendChild(s)}
  function decorate(){
    const form=$('#vxWpForm'); if(!form||form.dataset.wpDirect==='1')return;
    form.dataset.wpDirect='1'; form.classList.add('vx-wp-direct');
    installStyle();
    const head=$('#vx-whirlpool .vx-wp-head');
    if(head&&!$('#vxWpModeBar')){
      const bar=document.createElement('div');bar.id='vxWpModeBar';bar.className='vx-wp-modebar';
      bar.innerHTML=`<span id="vxWpModeStatus" class="vx-wp-mode-status">Visualização protegida</span><button type="button" data-wp-mode="view">VISUALIZAR</button><button type="button" data-wp-mode="basic">EDITAR</button><button type="button" data-wp-mode="advanced" ${canAdvanced()?'':'disabled title="Somente Gestor"'}>EDIÇÃO AVANÇADA</button>`;
      const print=$('#vxWpPrint'); head.insertBefore(bar,print||null);
      bar.addEventListener('click',e=>{const b=e.target.closest('[data-wp-mode]');if(!b||b.disabled)return;setMode(form,b.dataset.wpMode)});
    }
    const frag=document.createDocumentFragment();
    const title=document.createElement('div');title.className='vx-wp-doc-title';title.textContent='ORDEM DE SERVIÇO — WHIRLPOOL / BRASTEMP / CONSUL';frag.appendChild(title);

    let t=table();
    let a=cell(),b=cell(),c=cell(),d=cell();put(a,form,['numeroOS']);put(b,form,['tecnico']);c.innerHTML='<div class="vx-wp-placeholder">COLE AQUI A ETIQUETA DO PRODUTO</div>';put(d,form,['dataAgenda','periodo','tipoAgenda']);row(t,[a,b,c,d]);frag.appendChild(t);

    t=table();a=cell();b=cell();put(a,form,['consumidor']);put(b,form,['cnpjCpf']);row(t,[a,b]);a=cell();b=cell();put(a,form,['endereco']);put(b,form,['cep']);row(t,[a,b]);a=cell();b=cell();put(a,form,['complemento','bairro']);put(b,form,['cidade','uf']);row(t,[a,b]);a=cell();put(a,form,['foneResidencia']);row(t,[a]);frag.appendChild(t);

    t=table();a=cell();b=cell();put(a,form,['produto']);put(b,form,['marca']);row(t,[a,b]);a=cell();b=cell();put(a,form,['linha','serie']);put(b,form,['tipoOS','nrNotaFiscal','dataCompra']);row(t,[a,b]);frag.appendChild(t);

    t=table();a=cell('vx-wp-section-label');a.textContent='DEFEITO RECLAMADO';b=cell();put(b,form,['defeitoReclamado']);c=cell('vx-wp-section-label');c.textContent='DEFEITO CONSTATADO';d=cell();put(d,form,['defeitoConstatado']);row(t,[a,b,c,d]);
    a=cell('vx-wp-section-label');a.textContent='RECLAMAÇÃO / ATENDIMENTO';b=cell();b.colSpan=3;put(b,form,['reclamacaoAtendimento']);row(t,[a,b]);
    a=cell('vx-wp-section-label');a.textContent='LAUDO TÉCNICO';b=cell();b.colSpan=3;put(b,form,['laudoTecnico']);row(t,[a,b]);frag.appendChild(t);

    t=table();a=cell('vx-wp-section-label');a.textContent='OBSERVAÇÃO';b=cell();b.colSpan=3;put(b,form,['observacao']);row(t,[a,b]);frag.appendChild(t);

    const existingActions=form.querySelector('.vx-wp-actions');
    const note=form.querySelector('.vx-wp-note');
    form.innerHTML='';form.appendChild(frag);if(note)form.appendChild(note);if(existingActions)form.appendChild(existingActions);
    if(existingActions){existingActions.classList.add('vx-wp-actions');const save=$('#vxWpSave');if(save)save.textContent='SALVAR ALTERAÇÕES';}
    setMode(form,'view');
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-section="whirlpool"]'))setTimeout(decorate,120)},true);
  const mo=new MutationObserver(()=>{if($('#vxWpForm'))setTimeout(decorate,20)});mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(decorate,500);
})();
