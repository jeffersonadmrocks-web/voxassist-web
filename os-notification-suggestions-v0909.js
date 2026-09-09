/* VoxAssist Web V0.9.09 — Notificações automáticas pro cliente
   (Fase 1). Matriz Mestra, Área 07 -- decisão do usuário (2026-09-09):
   "gatilho automático + mensagem sugerida + confirmação humana antes
   do envio. Começar por eventos inequívocos: Pronto para entrega/
   retirada." Não altera a arquitetura de sessão/QR/reconexão do
   WhatsApp.

   Reaproveita 100%:
   - window.vxAdvanceOsStatus (motor único de status, os-status-
     engine-v0903.js) -- só OBSERVA o resultado, nunca decide status.
   - message_templates com trigger_event (migration 20260909050000/
     60000) -- catálogo de Mensagens Padrão já existente.
   - window.vxResolveOsChatTarget/window.vxOpenChatWithDraft
     (os-actions-menu-v0812.js/chat-beta-v0828.js) -- mesmo mecanismo
     já usado pelo botão "Chat" da OS. Abre a conversa com o texto
     pronto pro operador revisar -- NUNCA envia sozinho, é sempre a
     pessoa quem aperta enviar no Chat de verdade.

   Substituição de variável: só {cliente} (nome do cliente da OS) --
   sem parser genérico, mesmo escopo já definido quando o catálogo
   de Mensagens Padrão foi criado. */
(function(){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function findTemplate(triggerEvent){
    const cid=state?.profile?.active_company_id;if(!cid)return null;
    const rows=await api(`message_templates?company_id=eq.${cid}&trigger_event=eq.${triggerEvent}&active=eq.true&select=*&limit=1`).catch(()=>[]);
    return rows?.[0]||null;
  }

  function fillVars(body,o){
    const name=o?.clients?.name||'';
    return String(body||'').replaceAll('{cliente}',name);
  }

  function suggestModal(templateBody,onConfirm){
    document.querySelector('#vxNotifySuggestModal')?.remove();
    const bg=document.createElement('div');bg.id='vxNotifySuggestModal';bg.className='vx-modal-bg';
    bg.innerHTML=`<div class="vx-modal">
      <h3>💬 Equipamento pronto -- avisar o cliente?</h3>
      <p>Mensagem sugerida:</p>
      <div class="vx-notify-preview">${E(templateBody)}</div>
      <p class="vx-notify-note">Vai abrir o Chat com o texto pronto -- você revisa e envia de lá, nada é enviado automaticamente.</p>
      <div class="vx-modal-actions"><button type="button" data-close>Agora não</button><button type="button" class="primary" data-confirm>Abrir chat com esta mensagem</button></div>
    </div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();
    bg.querySelector('[data-close]').onclick=close;
    bg.addEventListener('click',e=>{if(e.target===bg)close()});
    bg.querySelector('[data-confirm]').onclick=async()=>{
      close();
      await onConfirm();
    };
  }

  const baseAdvance=window.vxAdvanceOsStatus;
  if(typeof baseAdvance==='function'){
    window.vxAdvanceOsStatus=async function(serviceOrderId){
      const result=await baseAdvance.apply(this,arguments);
      try{
        const becamePronto=(result?.transitions||[]).some(t=>String(t.new_status)==='PRONTO PARA ENTREGA');
        if(becamePronto){
          const template=await findTemplate('OS_PRONTO_PARA_ENTREGA');
          if(template){
            const o=state?.activeOs;
            const body=fillVars(template.body,o);
            suggestModal(body,async()=>{
              try{
                if(typeof window.vxResolveOsChatTarget!=='function'||typeof window.vxOpenChatWithDraft!=='function'){
                  toast?.('Chat VoxAssist ainda não carregou. Abra a aba Conversas e tente de novo.','err');
                  return;
                }
                const {conversationId}=await window.vxResolveOsChatTarget(o);
                await window.vxOpenChatWithDraft(conversationId,body);
              }catch(err){toast?.(err?.message||'Não foi possível abrir o chat com o cliente.','err');}
            });
          }
        }
      }catch(e){console.error('[os-notification-suggestions] falha ao avaliar sugestão:',e);}
      return result;
    };
  }

  const style=document.createElement('style');
  style.textContent=`.vx-notify-preview{background:#f8fafc;border:1px solid #dbe5ee;border-radius:8px;padding:10px 12px;font-size:12.5px;white-space:pre-wrap;margin:8px 0}.vx-notify-note{font-size:10.5px;color:#8a96a3}`;
  document.head.appendChild(style);
})();
