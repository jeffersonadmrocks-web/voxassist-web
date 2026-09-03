/* VoxAssist Web V0.8.12 — menu compacto de ações da OS */
(function(){
  // Achado do usuário em 2026-09-03: "Enviar pelo WhatsApp" era um
  // stub (só um modal dizendo que não existia ainda). O envio real de
  // fato já funciona no Chat VoxAssist -- aqui só abre a MESMA conversa
  // com o cliente da OS (reaproveita findOrCreateConversation/
  // vxOpenChatWithDraft já expostos por chat-beta-v0828.js, o mesmo
  // mecanismo já usado pelo NPS Electrolux), pronta pro operador
  // escrever e anexar arquivo -- nunca envia nada sozinho.
  // Achado do usuário em 2026-09-03: a mesma resolução (conexão
  // CONECTADO + conversa vinculada à OS) passou a ser precisa em mais
  // de um lugar (este botão de Chat, e o envio de OS/orçamento em PDF
  // direto pelo Chat, os-send-document-chat-v0813.js) -- extraída aqui
  // e exposta pra nunca duplicar a regra em paralelo.
  async function resolveOsChatTarget(o){
    const rawPhone=o?.clients?.phone_primary;
    if(!rawPhone)throw new Error('Cliente desta O.S. não tem telefone cadastrado.');
    if(typeof window.vxFindOrCreateConversation!=='function'){
      throw new Error('Chat VoxAssist ainda não carregou. Abra a aba Conversas e tente de novo.');
    }
    const phone=window.vxNormalizePhoneFull?.(rawPhone)||rawPhone;
    const connRows=await api('chat_connections?status=eq.CONECTADO&select=id&limit=1').catch(()=>[]);
    const connectionId=connRows?.[0]?.id;
    if(!connectionId)throw new Error('Nenhuma conexão de WhatsApp conectada no momento.');
    const conversationId=await window.vxFindOrCreateConversation(connectionId,phone,o?.clients?.name||null,o?.id||null);
    if(!conversationId)throw new Error('Não foi possível abrir a conversa com o cliente.');
    return {connectionId,conversationId};
  }
  window.vxResolveOsChatTarget=resolveOsChatTarget;
  // Achado do usuário em 2026-09-03: "Enviar O.S./Orçamento por
  // WhatsApp" (dentro do menu ▼ da OS) foi removido -- o mesmo envio
  // já existe, mais completo (também oferece OS Whirlpool e mostra
  // prévia antes de confirmar), direto no Contexto VoxAssist do Chat
  // (os-send-document-chat-v0813.js, botão "Enviar arquivo do
  // VoxAssist"). Manter os dois seria duplicar caminho de envio.

  async function openOsChat(){
    const o=state?.activeOs;
    if(typeof window.vxOpenChatWithDraft!=='function'){
      window.toast?.('Chat VoxAssist ainda não carregou. Abra a aba Conversas e tente de novo.','err');
      return;
    }
    try{
      const {conversationId}=await resolveOsChatTarget(o);
      await window.vxOpenChatWithDraft(conversationId,'');
    }catch(e){
      window.toast?.(e?.message||'Falha ao abrir o chat com o cliente.','err');
    }
  }
  function openOsStructureModal(title,detail){
    document.querySelector('#vxOsStructureModal')?.remove();
    const bg=document.createElement('div');
    bg.id='vxOsStructureModal';
    bg.className='vx-modal-bg';
    const panel=typeof window.vxStructurePanel==='function'?window.vxStructurePanel(title,detail):`<p>${detail}</p>`;
    bg.innerHTML=`<div class="vx-modal">${panel}<div class="vx-modal-actions"><button type="button" data-close>Fechar</button></div></div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.querySelector('[data-close]').onclick=close;
    bg.addEventListener('click',e=>{if(e.target===bg)close()});
  }
  async function ensure(){
    const bar=document.querySelector('.vx-os-head-actions');
    if(!bar || bar.querySelector('#vxOsActionsMenu')) return;
    const buttons=[...bar.querySelectorAll('button')];
    const parts=buttons.find(b=>/SOLICITAR PEÇA/i.test(b.textContent));
    const parecer=buttons.find(b=>/GERAR PARECER/i.test(b.textContent));
    const pdf=buttons.find(b=>/GERAR PDF/i.test(b.textContent));
    const imprimir=buttons.find(b=>/IMPRIMIR/i.test(b.textContent));
    [parts,parecer,pdf,imprimir].filter(Boolean).forEach(b=>b.style.display='none');
    const canCancel=typeof window.vxCanCancelOs==='function'?await window.vxCanCancelOs():false;
    const wrap=document.createElement('div');wrap.id='vxOsActionsMenu';wrap.style.cssText='position:relative;display:inline-block;';
    wrap.innerHTML=`<button type="button" class="vx-action" id="vxOsActionsBtn" aria-label="Abrir ações da OS" title="Ações" style="min-width:42px;padding:0 12px;font-size:16px;">▼</button><div id="vxOsActionsDrop" style="display:none;position:absolute;right:0;top:calc(100% + 6px);z-index:10000;min-width:255px;background:#fff;border:1px solid #cbd7e3;box-shadow:0 8px 22px rgba(12,35,64,.14);padding:6px;"><div style="padding:7px 10px 4px;font-size:11px;color:#60738b;font-weight:700;">OPERAÇÃO</div><button type="button" data-act="parts" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Solicitar Peça</button>${canCancel?'<button type="button" data-act="cancel" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;color:#a32121;cursor:pointer;">Cancelar O.S.</button>':''}<div style="border-top:1px solid #e3eaf1;margin:5px 0;"></div><div style="padding:7px 10px 4px;font-size:11px;color:#60738b;font-weight:700;">DOCUMENTOS</div><button type="button" data-act="parecer" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Gerar Parecer Técnico</button><button type="button" data-act="pdf" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Gerar PDF da O.S.</button><button type="button" data-act="print" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Imprimir O.S.</button><div style="border-top:1px solid #e3eaf1;margin:5px 0;"></div><div style="padding:7px 10px 4px;font-size:11px;color:#60738b;font-weight:700;">FISCAL</div><button type="button" data-act="nf" style="width:100%;text-align:left;padding:10px;border:0;background:#fff;cursor:pointer;">Gerar NF</button></div>`;
    bar.appendChild(wrap);const btn=wrap.querySelector('#vxOsActionsBtn'),drop=wrap.querySelector('#vxOsActionsDrop');btn.onclick=e=>{e.stopPropagation();drop.style.display=drop.style.display==='none'?'block':'none';};
    wrap.addEventListener('click',e=>{const a=e.target.closest('[data-act]');if(!a)return;drop.style.display='none';if(a.dataset.act==='parts')return parts?.click();if(a.dataset.act==='cancel')return window.vxCancelOs?.();if(a.dataset.act==='parecer')return parecer?.click();if(a.dataset.act==='pdf'||a.dataset.act==='print'){if(typeof window.vxPrintOsDocument==='function')return window.vxPrintOsDocument('auto');return pdf?.click();}if(a.dataset.act==='nf')return openOsStructureModal('Gerar Nota Fiscal','Emissão de NF integrada a um sistema fiscal ainda não existe.');});
    document.addEventListener('click',e=>{if(!wrap.contains(e.target))drop.style.display='none';},{once:true});
    // Achado do usuário em 2026-09-03: promovido de dentro do menu ▼
    // (onde estava como "Chat com o cliente") pra um botão próprio,
    // sempre visível, logo no início da fileira -- ação usada demais
    // pra ficar escondida atrás de um clique a mais.
    if(!bar.querySelector('#vxOsChatBtn')){
      const chatBtn=document.createElement('button');
      chatBtn.type='button';chatBtn.id='vxOsChatBtn';chatBtn.className='vx-action vx-os-chat-btn';
      chatBtn.innerHTML='💬 <span>Chat</span>';
      chatBtn.title='Abrir conversa com o cliente desta O.S.';
      chatBtn.onclick=openOsChat;
      bar.prepend(chatBtn);
    }
  }
  const base=window.renderOsDetail;if(typeof base==='function')window.renderOsDetail=async function(){const r=await base.apply(this,arguments);await ensure();return r;};setTimeout(ensure,0);
  if(!document.querySelector('script[data-vx-whirlpool-extension]')){const s=document.createElement('script');s.dataset.vxWhirlpoolExtension='1';s.src='os-whirlpool-extension-v0813.js?v=0813-20260820-WPEXT2';document.head.appendChild(s);}
  if(!document.querySelector('script[data-vx-whirlpool-faithful]')){const s=document.createElement('script');s.dataset.vxWhirlpoolFaithful='1';s.src='whirlpool-faithful-mode-v0813.js?v=0813-20260820-WPFAITHFUL2';document.head.appendChild(s);}
  if(!document.querySelector('script[data-vx-whirlpool-layout]')){const s=document.createElement('script');s.dataset.vxWhirlpoolLayout='1';s.src='whirlpool-layout-hotfix-v0813.js?v=0813-20260820-WPLAYOUT1';document.head.appendChild(s);}
})();