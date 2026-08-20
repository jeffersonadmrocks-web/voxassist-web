/* VoxAssist V0.8.13 — Reset Master de ambiente de homologação */
(function(){
  const isGestor=()=>String(state?.profile?.role||'').toUpperCase()==='GESTOR';

  async function ensureFreshSession(){
    const s=state?.session;
    if(!s?.refresh_token) throw new Error('Sessão expirada. Faça login novamente.');
    const now=Math.floor(Date.now()/1000);
    const needsRefresh=!s.access_token || !s.expires_at || now>=Number(s.expires_at)-120;
    if(!needsRefresh) return true;
    try{
      const n=await auth('token?grant_type=refresh_token',{refresh_token:s.refresh_token});
      n.expires_at=Math.floor(Date.now()/1000)+(n.expires_in||3600);
      saveSession(n);
      return true;
    }catch(e){
      clearSession();
      throw new Error('Sua sessão expirou. Entre novamente antes de executar o Reset Master.');
    }
  }

  function mount(){
    if(!isGestor()||state?.view!=='usuarios')return;
    const actions=document.querySelector('.vx-admin-actions');
    if(!actions||actions.querySelector('[data-master-reset]'))return;
    const b=document.createElement('button');
    b.type='button';b.dataset.masterReset='1';b.className='secondary';
    b.textContent='RESET MASTER';
    b.style.borderColor='#c74646';b.style.color='#a51f1f';b.onclick=openReset;
    actions.appendChild(b);
  }

  function openReset(){
    const ov=document.createElement('div');ov.className='vx-admin-overlay';
    ov.innerHTML=`<div class="vx-admin-modal"><div class="vx-admin-modal-head"><h3>Reset Master do VoxAssist</h3><button type="button" data-close>×</button></div><div class="vx-admin-modal-body"><p><b>Uso exclusivo de homologação.</b> Esta ação apaga empresas, lojas, clientes, equipamentos, OS, agenda, importações, histórico, tarefas, estoque de teste e vínculos de usuários. A estrutura do sistema e os catálogos-base são preservados.</p><p>Seu login atual é mantido apenas para que você possa entrar novamente e refazer o cadastro inicial.</p><label>Digite <b>RESETAR VOXASSIST</b> para confirmar</label><input id="vxResetConfirm" autocomplete="off" placeholder="RESETAR VOXASSIST"><div class="vx-admin-form-actions"><button type="button" class="secondary" data-cancel>CANCELAR</button><button type="button" class="primary" data-exec style="background:#a51f1f;border-color:#a51f1f">APAGAR DADOS DE TESTE</button></div></div></div>`;
    document.body.appendChild(ov);
    const close=()=>ov.remove();ov.querySelector('[data-close]').onclick=close;ov.querySelector('[data-cancel]').onclick=close;
    ov.querySelector('[data-exec]').onclick=async()=>{
      const txt=ov.querySelector('#vxResetConfirm').value.trim();
      if(txt!=='RESETAR VOXASSIST'){toast('Digite exatamente RESETAR VOXASSIST para confirmar.','err');return;}
      if(!confirm('Confirma o Reset Master? Todos os dados de homologação serão apagados.'))return;
      const btn=ov.querySelector('[data-exec]');btn.disabled=true;btn.textContent='VALIDANDO SESSÃO…';
      try{
        await ensureFreshSession();
        btn.textContent='RESETANDO…';
        await api('rpc/master_reset_test_environment',{method:'POST',body:JSON.stringify({confirm_text:'RESETAR VOXASSIST'})});
        ov.remove();
        localStorage.removeItem('vox_active_company');
        localStorage.removeItem('vox_active_store');
        alert('Reset Master concluído. O VoxAssist será recarregado como ambiente inicial.');
        location.reload();
      }catch(e){
        const msg=String(e?.message||e);
        if(/JWT expired|token|sessão expirou|session/i.test(msg)){
          toast('Sessão expirada. Faça login novamente e repita o Reset Master.','err');
          setTimeout(()=>{try{clearSession();loginScreen()}catch{}},900);
        }else{
          toast('Falha no Reset Master: '+msg,'err');
        }
        btn.disabled=false;btn.textContent='APAGAR DADOS DE TESTE';
      }
    };
  }

  const mo=new MutationObserver(()=>mount());mo.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('DOMContentLoaded',mount);setTimeout(mount,500);
})();