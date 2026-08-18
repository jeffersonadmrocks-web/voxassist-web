/* VoxAssist Web — editor amplo de Observações Internas / F11 */
(function(){
  function ensureStyle(){
    if(document.getElementById('vxNotesModalStyle')) return;
    const s=document.createElement('style');
    s.id='vxNotesModalStyle';
    s.textContent=`
      .vx-notes-overlay{position:fixed;inset:0;background:rgba(12,35,64,.42);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px}
      .vx-notes-modal{width:min(980px,94vw);background:#fff;border:1px solid #7e8c9a;box-shadow:0 18px 60px rgba(0,0,0,.28);font-family:Arial,sans-serif}
      .vx-notes-head{display:flex;align-items:center;justify-content:space-between;background:#0c2340;color:#fff;padding:12px 16px}
      .vx-notes-head strong{font-size:15px}.vx-notes-head small{display:block;font-size:10px;opacity:.8;margin-top:3px}
      .vx-notes-close{border:0;background:transparent;color:#fff;font-size:24px;cursor:pointer;padding:0 4px}
      .vx-notes-body{padding:16px}.vx-notes-body textarea{width:100%;min-height:360px;max-height:65vh;resize:vertical;border:1px solid #2b3b4b;padding:12px;font:14px/1.5 Arial,sans-serif;text-transform:uppercase;box-sizing:border-box;background:#fff}
      .vx-notes-hint{font-size:11px;color:#66778a;margin:8px 0 0}.vx-notes-actions{display:flex;justify-content:flex-end;gap:8px;padding:0 16px 16px}
      .vx-notes-actions button{height:38px;padding:0 18px;border:0;font-weight:700;font-size:11px;cursor:pointer}.vx-notes-cancel{background:#edf3f7;color:#10253d}.vx-notes-save{background:#078f46;color:#fff}
    `;
    document.head.appendChild(s);
  }

  function closeModal(){document.querySelector('.vx-notes-overlay')?.remove();}

  window.vxEditInternalNotes=function(){
    const o=window.state?.activeOs;
    if(!o?.id){ if(window.toast) toast('Abra uma OS para acessar as Observações Internas.','err'); return; }
    ensureStyle();
    closeModal();
    const overlay=document.createElement('div');
    overlay.className='vx-notes-overlay';
    overlay.innerHTML=`<div class="vx-notes-modal" role="dialog" aria-modal="true" aria-label="Observações Internas">
      <div class="vx-notes-head"><div><strong>F11 – OBSERVAÇÕES INTERNAS</strong><small>Conteúdo interno da OS • não imprimir em documentos do cliente</small></div><button class="vx-notes-close" title="Fechar">×</button></div>
      <div class="vx-notes-body"><textarea id="vxNotesLarge" spellcheck="true" placeholder="Digite aqui as observações internas da ordem de serviço..."></textarea><div class="vx-notes-hint">Área ampliada para facilitar leitura, revisão e edição de textos longos.</div></div>
      <div class="vx-notes-actions"><button class="vx-notes-cancel">CANCELAR</button><button class="vx-notes-save">SALVAR OBSERVAÇÕES</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const ta=overlay.querySelector('#vxNotesLarge');
    ta.value=o.internal_notes||'';
    setTimeout(()=>{ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length)},0);
    const cancel=()=>closeModal();
    overlay.querySelector('.vx-notes-close').onclick=cancel;
    overlay.querySelector('.vx-notes-cancel').onclick=cancel;
    overlay.onclick=e=>{if(e.target===overlay)cancel()};
    overlay.querySelector('.vx-notes-save').onclick=async()=>{
      const text=String(ta.value||'').toUpperCase();
      try{
        await api(`service_orders?id=eq.${o.id}`,{method:'PATCH',body:JSON.stringify({internal_notes:text,updated_at:new Date().toISOString()})});
        o.internal_notes=text;
        if(window.state?.activeOs) state.activeOs.internal_notes=text;
        closeModal();
        toast('Observações internas salvas.');
      }catch(e){toast('Erro ao salvar observações: '+e.message,'err')}
    };
    ta.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();overlay.querySelector('.vx-notes-save').click()}if(e.key==='Escape'){e.preventDefault();cancel()}});
  };

  document.addEventListener('keydown',e=>{
    if(e.key==='F11' && window.state?.activeOs){e.preventDefault();window.vxEditInternalNotes();}
  },true);
})();
