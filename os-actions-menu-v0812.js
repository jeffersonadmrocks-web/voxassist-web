/* VoxAssist Web V0.8.12 — menu único AÇÕES na OS, sem alterar estrutura da tela */
(function(){
  function ensure(){
    const bar=document.querySelector('.vx-os-head-actions');
    if(!bar || bar.querySelector('#vxOsActionsMenu')) return;
    const buttons=[...bar.querySelectorAll('button')];
    const parecer=buttons.find(b=>/GERAR PARECER/i.test(b.textContent));
    const pdf=buttons.find(b=>/GERAR PDF/i.test(b.textContent));
    const imprimir=buttons.find(b=>/IMPRIMIR/i.test(b.textContent));
    if(!parecer && !pdf && !imprimir) return;
    [parecer,pdf,imprimir].filter(Boolean).forEach(b=>b.style.display='none');
    const wrap=document.createElement('div');
    wrap.id='vxOsActionsMenu';
    wrap.style.cssText='position:relative;display:inline-block;';
    wrap.innerHTML=`<button type="button" class="vx-action" id="vxOsActionsBtn">AÇÕES ▼</button>
      <div id="vxOsActionsDrop" style="display:none;position:absolute;right:0;top:calc(100% + 6px);z-index:10000;min-width:250px;background:#fff;border:1px solid #cbd7e3;box-shadow:0 8px 22px rgba(12,35,64,.14);padding:6px;">
        <div style="padding:7px 10px 4px;font-size:11px;color:#60738b;font-weight:700;">DOCUMENTOS</div>
        <button type="button" data-act="parecer" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Gerar Parecer Técnico</button>
        <button type="button" data-act="pdf" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Gerar PDF da O.S.</button>
        <button type="button" data-act="print" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Imprimir</button>
        <div style="border-top:1px solid #e3eaf1;margin:5px 0;"></div>
        <div style="padding:7px 10px 4px;font-size:11px;color:#60738b;font-weight:700;">COMUNICAÇÃO</div>
        <button type="button" data-act="whatsapp" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Enviar pelo WhatsApp</button>
        <div style="border-top:1px solid #e3eaf1;margin:5px 0;"></div>
        <div style="padding:7px 10px 4px;font-size:11px;color:#60738b;font-weight:700;">FISCAL</div>
        <button type="button" data-act="nf" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Gerar NF</button>
      </div>`;
    bar.appendChild(wrap);
    const btn=wrap.querySelector('#vxOsActionsBtn'), drop=wrap.querySelector('#vxOsActionsDrop');
    btn.onclick=e=>{e.stopPropagation();drop.style.display=drop.style.display==='none'?'block':'none';};
    wrap.addEventListener('click',e=>{
      const a=e.target.closest('[data-act]'); if(!a)return;
      drop.style.display='none';
      if(a.dataset.act==='parecer') return parecer?.click();
      if(a.dataset.act==='pdf') return pdf?.click();
      if(a.dataset.act==='print') return imprimir?.click();
      if(a.dataset.act==='whatsapp') return (window.toast?toast('WhatsApp: selecione o documento/mensagem a enviar. Função preparada para integração.'):alert('WhatsApp preparado para integração.'));
      if(a.dataset.act==='nf') return (window.toast?toast('Emissão de NF preparada para a integração fiscal futura.'):alert('Emissão de NF preparada para integração fiscal.'));
    });
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))drop.style.display='none';});
  }
  new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(ensure,0);
})();
