/* VoxAssist — Solicitação de peça a partir da OS v1
 * Corrige a ação "Solicitar Peça": não navega mais para Orçamento.
 * Abre um fluxo próprio, vinculado à OS, com peça já cadastrada na OS
 * ou descrição/link livre e destinatários. Usa parts_requests já existente.
 */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const userId=()=>state?.session?.user?.id||state?.profile?.id||null;
  const companyId=()=>state?.profile?.active_company_id||null;
  const ROLE_GROUPS=[['GESTOR','Gestores'],['ATENDENTE','Atendentes'],['TECNICO','Técnicos'],['ESTOQUE','Estoque']];

  function activeOrder(){return state?.activeOs||null}
  async function loadOrderParts(o){
    if(!o?.id)return [];
    return api(`os_parts?service_order_id=eq.${o.id}&select=*&order=created_at.asc`).catch(()=>[]);
  }
  async function loadPeople(){return api('profiles?select=id,full_name,role&active=eq.true&order=full_name').catch(()=>[])}

  function styles(){if(document.querySelector('#vxPartsRequestStyles'))return;const s=document.createElement('style');s.id='vxPartsRequestStyles';s.textContent=`
    #vxPartsRequestModal{position:fixed;inset:0;background:rgba(10,29,48,.56);backdrop-filter:blur(2px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px}
    #vxPartsRequestModal .vx-pr-modal{width:min(780px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 24px 70px rgba(0,24,48,.28);border:1px solid #d7e1ea}
    #vxPartsRequestModal .vx-pr-head{background:#0c2b4b;color:#fff;padding:18px 22px;border-bottom:4px solid #ef8b17;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
    #vxPartsRequestModal .vx-pr-head h3{margin:0;font-size:18px}.vx-pr-head p{margin:5px 0 0;color:#d8e4ee;font-size:12px}.vx-pr-close{border:0;background:rgba(255,255,255,.12);color:#fff;width:32px;height:32px;border-radius:7px;font-size:20px;cursor:pointer}
    #vxPartsRequestModal .vx-pr-body{padding:20px 22px}.vx-pr-section{margin-bottom:18px}.vx-pr-section-title{font-size:11px;font-weight:900;color:#0c2b4b;text-transform:uppercase;letter-spacing:.45px;margin-bottom:8px}.vx-pr-hint{font-size:11px;color:#66788a;margin:3px 0 10px}
    .vx-pr-part-list{display:grid;gap:7px}.vx-pr-part{display:grid;grid-template-columns:22px 1fr auto;gap:9px;align-items:center;border:1px solid #d9e2eb;border-radius:9px;padding:10px 12px;cursor:pointer}.vx-pr-part:hover{background:#f7f9fb;border-color:#9fb7ce}.vx-pr-part input{width:15px!important;height:15px!important}.vx-pr-part b{display:block;color:#19334d;font-size:12px}.vx-pr-part small{color:#718191}.vx-pr-part em{font-style:normal;font-weight:800;color:#0c2b4b;font-size:11px}
    .vx-pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.vx-pr-field{display:flex;flex-direction:column;gap:5px}.vx-pr-field.wide{grid-column:1/-1}.vx-pr-field label{font-size:10px;font-weight:800;color:#536a80;text-transform:uppercase}.vx-pr-field input,.vx-pr-field textarea{width:100%;border:1px solid #c8d4df;border-radius:7px;padding:9px 10px;font:inherit;color:#19334d;background:#fff}.vx-pr-field textarea{min-height:68px;resize:vertical}.vx-pr-field input:focus,.vx-pr-field textarea:focus{outline:none;border-color:#1767d9;box-shadow:0 0 0 2px rgba(23,103,217,.1)}
    .vx-pr-recipients{display:grid;grid-template-columns:1fr 1fr;gap:12px}.vx-pr-rec-group{border:1px solid #dce4eb;border-radius:9px;padding:10px}.vx-pr-rec-group>strong{display:block;font-size:10px;text-transform:uppercase;color:#62778b;margin-bottom:6px}.vx-pr-rec{display:flex;align-items:center;gap:8px;padding:5px 3px;font-size:12px}.vx-pr-rec input{width:15px!important;height:15px!important}
    .vx-pr-actions{display:flex;justify-content:flex-end;gap:9px;padding:14px 22px;background:#f7f9fb;border-top:1px solid #e0e7ee}.vx-pr-actions button{border-radius:7px;padding:9px 15px;font-weight:800;cursor:pointer}.vx-pr-cancel{background:#fff;border:1px solid #c7d3de;color:#385068}.vx-pr-save{background:#1670c8;border:1px solid #1670c8;color:#fff}.vx-pr-save:disabled{opacity:.55;cursor:wait}.vx-pr-empty{padding:10px;border:1px dashed #c9d4de;border-radius:8px;color:#718191;font-size:11px}
    @media(max-width:620px){#vxPartsRequestModal{padding:8px}.vx-pr-grid,.vx-pr-recipients{grid-template-columns:1fr}.vx-pr-field.wide{grid-column:auto}}
  `;document.head.appendChild(s)}

  window.vxOpenPartsRequestModal=async function(){
    const o=activeOrder();if(!o)return toast?.('Abra uma OS antes de solicitar peça.','err');
    document.querySelector('#vxPartsRequestModal')?.remove();styles();
    const [parts,people]=await Promise.all([loadOrderParts(o),loadPeople()]);
    const bg=document.createElement('div');bg.id='vxPartsRequestModal';
    bg.innerHTML=`<div class="vx-pr-modal"><div class="vx-pr-head"><div><h3>Solicitar peça — OS ${E(o.os_number)}</h3><p>Selecione uma peça já lançada na OS ou informe outra peça manualmente.</p></div><button type="button" class="vx-pr-close">×</button></div><div class="vx-pr-body">
      <section class="vx-pr-section"><div class="vx-pr-section-title">Peças cadastradas nesta OS</div><div class="vx-pr-hint">Marque uma ou mais peças. Você também pode deixar sem seleção e descrever uma peça abaixo.</div><div class="vx-pr-part-list">${parts.length?parts.map((p,i)=>`<label class="vx-pr-part"><input type="checkbox" data-os-part="${i}"><span><b>${E(p.description||'Peça sem descrição')}</b><small>${E(p.code?'Código: '+p.code:'Sem código cadastrado')}</small></span><em>Qtd. ${E(p.quantity||1)}</em></label>`).join(''):'<div class="vx-pr-empty">Esta OS ainda não possui peças cadastradas. Use a descrição manual abaixo.</div>'}</div></section>
      <section class="vx-pr-section"><div class="vx-pr-section-title">Outra peça / referência externa</div><div class="vx-pr-grid"><div class="vx-pr-field"><label>Código / referência</label><input id="vxPrCode" placeholder="Ex.: BN94-05666A"></div><div class="vx-pr-field"><label>Quantidade</label><input id="vxPrQty" type="number" min="1" step="1" value="1"></div><div class="vx-pr-field wide"><label>Descrição da peça</label><input id="vxPrDescription" placeholder="Descreva a peça mesmo que ela não esteja cadastrada na OS"></div><div class="vx-pr-field wide"><label>Link da peça (opcional)</label><input id="vxPrLink" type="url" placeholder="Cole aqui o link do fornecedor, fabricante ou anúncio"></div><div class="vx-pr-field wide"><label>Observação do pedido</label><textarea id="vxPrNotes" placeholder="Ex.: confirmar disponibilidade, original, prazo máximo, cor/modelo específico..."></textarea></div></div></section>
      <section class="vx-pr-section"><div class="vx-pr-section-title">Enviar solicitação para</div><div class="vx-pr-hint">Selecione pessoas e/ou grupos responsáveis por tratar este pedido.</div><div class="vx-pr-recipients"><div class="vx-pr-rec-group"><strong>Grupos</strong>${ROLE_GROUPS.map(([v,l])=>`<label class="vx-pr-rec"><input type="checkbox" value="role:${v}">${E(l)}</label>`).join('')}</div><div class="vx-pr-rec-group"><strong>Pessoas</strong>${people.length?people.map(p=>`<label class="vx-pr-rec"><input type="checkbox" value="user:${E(p.id)}">${E(p.full_name)} <small>(${E(p.role||'')})</small></label>`).join(''):'<div class="vx-pr-empty">Nenhum usuário ativo encontrado.</div>'}</div></div></section>
    </div><div class="vx-pr-actions"><button type="button" class="vx-pr-cancel">Cancelar</button><button type="button" class="vx-pr-save">Criar solicitação</button></div></div>`;
    document.body.appendChild(bg);
    const close=()=>bg.remove();bg.querySelector('.vx-pr-close').onclick=close;bg.querySelector('.vx-pr-cancel').onclick=close;bg.onclick=e=>{if(e.target===bg)close()};
    bg.querySelector('.vx-pr-save').onclick=async()=>{
      const selected=[...bg.querySelectorAll('[data-os-part]:checked')].map(el=>parts[Number(el.dataset.osPart)]).filter(Boolean);
      const manualDesc=bg.querySelector('#vxPrDescription').value.trim(),manualCode=bg.querySelector('#vxPrCode').value.trim(),link=bg.querySelector('#vxPrLink').value.trim(),notes=bg.querySelector('#vxPrNotes').value.trim(),qty=Math.max(1,Number(bg.querySelector('#vxPrQty').value||1));
      const recipients=[...bg.querySelectorAll('.vx-pr-recipients input:checked')].map(el=>el.value);
      if(!selected.length&&!manualDesc&&!manualCode&&!link)return toast?.('Selecione uma peça da OS ou informe a peça que deseja solicitar.','err');
      if(!recipients.length)return toast?.('Selecione para quem o pedido deve ser enviado.','err');
      const btn=bg.querySelector('.vx-pr-save');btn.disabled=true;
      const requests=[];
      selected.forEach(p=>requests.push({service_order_id:o.id,company_id:companyId(),description:p.description||p.code||'PEÇA',code:p.code||null,quantity:Number(p.quantity||1),status:'SOLICITADO',requested_by:userId(),notes:notes||null}));
      if(manualDesc||manualCode||link)requests.push({service_order_id:o.id,company_id:companyId(),description:manualDesc||manualCode||'PEÇA INFORMADA POR LINK',code:manualCode||null,quantity:qty,status:'SOLICITADO',requested_by:userId(),notes:[notes,link?`LINK: ${link}`:''].filter(Boolean).join('\n')||null});
      try{
        const directUsers=recipients.filter(r=>r.startsWith('user:')).map(r=>r.slice(5));
        const roles=recipients.filter(r=>r.startsWith('role:')).map(r=>r.slice(5));
        const roleUsers=people.filter(p=>roles.includes(String(p.role||'').toUpperCase())).map(p=>p.id);
        const targets=[...new Set([...directUsers,...roleUsers])];
        const payload=[];requests.forEach(r=>{if(targets.length)targets.forEach(uid=>payload.push({...r,assigned_to:uid}));else payload.push(r)});
        await api('parts_requests',{method:'POST',body:JSON.stringify(payload)});
        toast?.(`Solicitação de peça criada para ${targets.length||recipients.length} destinatário${(targets.length||recipients.length)===1?'':'s'}.`);close();
      }catch(err){toast?.('Não foi possível criar a solicitação: '+(err.message||'erro desconhecido'),'err');btn.disabled=false}
    };
  };

  // Captura a ação antiga antes de ela trocar para a aba Orçamento.
  document.addEventListener('click',e=>{
    const b=e.target.closest('button,a');if(!b)return;
    const label=String(b.textContent||'').trim().toUpperCase();
    if(label==='SOLICITAR PEÇA'||label==='SOLICITAR PECA'){
      e.preventDefault();e.stopImmediatePropagation();window.vxOpenPartsRequestModal();
    }
  },true);
})();
