/* VoxAssist V0.8.12 — Cancelamento controlado de OS */
(function(){
 const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('_',' ').trim();
 function isManager(){return ['GESTOR','ADMIN','ADMINISTRADOR'].includes(norm(state?.profile?.role||state?.session?.user?.role));}
 async function allowed(){if(isManager())return true;try{const uid=state?.session?.user?.id;if(!uid)return false;const r=await api(`user_permissions?user_id=eq.${encodeURIComponent(uid)}&permission_key=eq.atendimento.os.cancelar&allowed=eq.true&select=id&limit=1`);return !!r?.length;}catch(e){return false;}}
 async function cancelOs(){const o=state?.activeOs;if(!o?.id)return; if(norm(o.status)==='CANCELADA')return toast('Esta O.S. já está cancelada.','err');if(!(await allowed()))return toast('Acesso restrito. Somente Gestor ou usuário autorizado pode cancelar uma O.S.','err');
  const reason=prompt(`CANCELAR O.S. ${o.os_number||''}\n\nInforme obrigatoriamente o motivo do cancelamento:`);if(reason===null)return;if(!String(reason).trim())return toast('Informe o motivo do cancelamento.','err');
  if(!confirm(`Confirma o CANCELAMENTO da O.S. ${o.os_number||''}?\n\nOs dados e o histórico serão preservados.`))return;
  const now=new Date().toISOString(),prev=o.status,uid=state?.session?.user?.id||null;
  try{let patch={status:'CANCELADA',updated_at:now};
   // Campos adicionais são tentados quando a migration estiver disponível; status/histórico funcionam na base atual.
   try{await api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({...patch,cancellation_reason:reason.trim(),cancelled_at:now,cancelled_by:uid})});}
   catch(e){await api(`service_orders?id=eq.${encodeURIComponent(o.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});}
   await api('os_status_history',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({service_order_id:o.id,previous_status:prev,new_status:'CANCELADA',change_type:'CANCELAMENTO',reason:reason.trim(),changed_by:uid,changed_at:now})});
   o.status='CANCELADA';o.cancellation_reason=reason.trim();o.cancelled_at=now;o.cancelled_by=uid;const core=state.orders?.find(x=>x.id===o.id);if(core)Object.assign(core,o);
   const st=document.querySelector('#vxStatusArea strong');if(st)st.textContent='Cancelada';toast('O.S. cancelada. Dados e histórico preservados.');
  }catch(e){toast('Não foi possível cancelar a O.S.: '+e.message,'err');}
 }
 window.vxCancelOs=cancelOs;window.vxCanCancelOs=allowed;
})();