/* VoxAssist Web V0.9.12 — FG Electrolux Fase 1: identificação discreta
   no cabeçalho da OS (item 2: "OS 123456789 | ELECTROLUX | FORA DE
   GARANTIA") + badge/ação de conferência (item 8/10) quando a
   Electrolux encerrou externamente mas o VoxAssist ainda não conferiu.
   Nunca edita os-detail-v0812.js diretamente (STABILIZATION_LOCK proíbe
   novo *-patch.js pra tela de OS mexendo em fonte duplicada -- mas isso
   aqui é só injeção de DOM, mesmo padrão de security-whirlpool-
   hardening/permissions-catalog, não uma segunda implementação da tela). */
(function(){
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';

  function upgrade(){
    const o=state?.activeOs;
    if(!o||o.source!=='ELECTROLUX')return;
    const typeEl=document.querySelector('.vx-os-head-type');
    if(typeEl&&!typeEl.dataset.vxElxTagged){
      typeEl.dataset.vxElxTagged='1';
      typeEl.innerHTML=`ELECTROLUX · SVO ${typeEl.innerHTML}`;
    }
    const actions=document.querySelector('.vx-os-head-actions');
    if(actions&&o.electrolux_conference_status==='AGUARDANDO_CONFERENCIA'&&!document.querySelector('#vxElxConferBtn')){
      const wrap=document.createElement('div');
      wrap.className='vx-elx-confer-wrap';
      wrap.innerHTML=`<span class="vx-elx-confer-badge">⚠ ELECTROLUX: ENCERRADA · VOXASSIST: AGUARDANDO CONFERÊNCIA</span>${isGestor()?'<button type=\"button\" class=\"vx-action attention\" id=\"vxElxConferBtn\">CONFERIR ENCERRAMENTO</button>':''}`;
      actions.parentElement.insertBefore(wrap,actions.nextSibling);
      document.getElementById('vxElxConferBtn')?.addEventListener('click',async()=>{
        if(!confirm(`A Electrolux encerrou a SVO ${o.os_number}. Isto marca a conferência como feita (não encerra a OS -- use FINALIZAR normalmente depois de resolver qualquer pendência). Confirmar conferência?`))return;
        try{
          await api('rpc/confer_electrolux_fg_closure',{method:'POST',body:JSON.stringify({p_service_order_id:o.id})});
          o.electrolux_conference_status='CONFERIDO';
          toast?.('Conferência registrada.');
          wrap.remove();
        }catch(err){toast?.('Não foi possível registrar a conferência: '+err.message,'err');}
      });
    }
  }

  const style=document.createElement('style');
  style.textContent=`.vx-elx-confer-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fdf3e3;border:1px solid #e0bd7a;border-radius:8px;padding:8px 12px;margin:8px 0}.vx-elx-confer-badge{font-size:10.5px;font-weight:800;color:#5c3d0a}`;
  document.head.appendChild(style);

  const base=window.renderOsDetail;
  if(typeof base==='function')window.renderOsDetail=async function(){const r=await base.apply(this,arguments);setTimeout(upgrade,0);return r;};
})();
