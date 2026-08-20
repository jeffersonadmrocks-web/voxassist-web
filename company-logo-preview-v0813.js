/* VoxAssist V0.8.13 — pré-visualização imediata da logo e cabeçalho documental */
(function(){
  function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function bind(root=document){
    const form=root.querySelector?.('#vxCompanyFullForm');
    if(!form||form.dataset.vxLogoPreview==='1')return;
    form.dataset.vxLogoPreview='1';
    const file=form.querySelector('input[type="file"][name="logo"]');
    const preview=form.querySelector('.vx-logo-preview');
    if(!file||!preview)return;

    let docPreview=form.querySelector('.vx-document-preview');
    if(!docPreview){
      docPreview=document.createElement('div');
      docPreview.className='vx-document-preview';
      preview.closest('.vx-logo-row')?.insertAdjacentElement('afterend',docPreview);
    }

    function renderDocument(src){
      const trade=(form.querySelector('[name="trade"]')?.value||form.querySelector('[name="legal"]')?.value||'SUA EMPRESA').trim();
      const header=(form.querySelector('[name="header_note"]')?.value||'').trim();
      const footer=(form.querySelector('[name="footer"]')?.value||'').trim();
      docPreview.innerHTML=`<div class="vx-doc-preview-label">PRÉVIA DO CABEÇALHO</div><div class="vx-doc-paper"><div class="vx-doc-head"><div class="vx-doc-logo">${src?`<img src="${src}" alt="Prévia da logo">`:'<span>LOGO</span>'}</div><div><strong>${esc(trade.toUpperCase())}</strong>${header?`<small>${esc(header)}</small>`:''}</div></div><div class="vx-doc-lines"><i></i><i></i><i></i></div>${footer?`<div class="vx-doc-footer">${esc(footer)}</div>`:''}</div>`;
    }

    const current=preview.querySelector('img')?.src||'';
    renderDocument(current);

    file.addEventListener('change',()=>{
      const f=file.files?.[0];
      if(!f)return;
      if(!/^image\/(png|jpeg|webp)$/i.test(f.type)){if(window.toast)toast('Selecione uma imagem PNG, JPG ou WEBP.','err');file.value='';return;}
      if(f.size>3*1024*1024){if(window.toast)toast('A logo deve ter no máximo 3 MB.','err');file.value='';return;}
      const r=new FileReader();
      r.onload=()=>{
        const src=String(r.result||'');
        preview.innerHTML=`<img src="${src}" alt="Prévia da logo selecionada"><small class="vx-logo-selected">Prévia antes de salvar</small>`;
        renderDocument(src);
      };
      r.readAsDataURL(f);
    });
    ['legal','trade','header_note','footer'].forEach(n=>form.querySelector(`[name="${n}"]`)?.addEventListener('input',()=>renderDocument(preview.querySelector('img')?.src||'')));
  }

  const css=document.createElement('style');
  css.textContent=`
    .vx-logo-preview{position:relative;overflow:hidden}.vx-logo-preview img{display:block;max-width:150px;max-height:85px;object-fit:contain}.vx-logo-selected{position:absolute;left:0;right:0;bottom:4px;text-align:center;font-size:8px;color:#52677b;background:rgba(248,250,252,.92)}
    .vx-document-preview{margin:12px 0 4px}.vx-doc-preview-label{font-size:9px;font-weight:800;color:#60758a;margin-bottom:5px}.vx-doc-paper{background:#fff;border:1px solid #d9e2ea;border-radius:8px;padding:12px;box-shadow:0 1px 2px rgba(15,35,55,.05)}.vx-doc-head{display:grid;grid-template-columns:120px 1fr;gap:14px;align-items:center;border-bottom:2px solid #17324e;padding-bottom:9px}.vx-doc-logo{height:58px;display:grid;place-items:center;border:1px dashed #c9d4de;border-radius:5px;background:#fafcfd}.vx-doc-logo img{max-width:110px;max-height:50px;object-fit:contain}.vx-doc-logo span{font-size:9px;color:#9aa8b5}.vx-doc-head strong{display:block;font-size:14px;color:#17324e}.vx-doc-head small{display:block;margin-top:4px;font-size:9px;color:#65798c}.vx-doc-lines{padding:11px 0 5px}.vx-doc-lines i{display:block;height:5px;background:#edf2f6;border-radius:4px;margin:5px 0}.vx-doc-lines i:nth-child(1){width:86%}.vx-doc-lines i:nth-child(2){width:72%}.vx-doc-lines i:nth-child(3){width:93%}.vx-doc-footer{border-top:1px solid #e3e9ee;margin-top:8px;padding-top:7px;font-size:8px;color:#6e8091;text-align:center}@media(max-width:700px){.vx-doc-head{grid-template-columns:90px 1fr}.vx-doc-logo{height:50px}}
  `;
  document.head.appendChild(css);
  const mo=new MutationObserver(ms=>{for(const m of ms){for(const n of m.addedNodes){if(n.nodeType===1)bind(n.matches?.('#vxCompanyFullForm')?n:n)}}});
  mo.observe(document.documentElement,{childList:true,subtree:true});
  bind();
})();
