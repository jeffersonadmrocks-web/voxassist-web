/* VoxAssist — exibição de erros de formulário (achado do usuário em
 * 2026-09-02): SALVAR ORÇAMENTO / ANÁLISE TÉCNICA mostrava um toast
 * genérico ("cadastro está incompleto ou a empresa ativa não foi
 * definida corretamente") que some sozinho em poucos segundos e nunca
 * diz qual campo é o problema.
 *
 * Auditoria feita ANTES de mexer em qualquer coisa (harness isolado,
 * cada condição testada separadamente): SALVAR ORÇAMENTO / ANÁLISE
 * TÉCNICA hoje NÃO valida nenhum campo -- técnico responsável, defeito
 * constatado, serviço, valores financeiros, tudo pode ficar em branco
 * que o salvamento é aceito. A única condição que bloqueia é não
 * haver OS carregada (mensagem já clara, "Nenhuma OS aberta para
 * salvar."). Ou seja: a mensagem genérica relatada pelo usuário NUNCA
 * vinha de um campo obrigatório não preenchido -- vinha de um erro
 * técnico real (RLS, sessão, empresa ativa desalinhada etc.) sendo
 * mal traduzido por humanMessage() em
 * security-whirlpool-hardening-v0813.js, que sempre que via
 * "invalid input syntax for type uuid" (22P02) respondia com a mesma
 * frase fixa, incondicional, sem checar a causa real nem logar nada
 * pro suporte investigar depois.
 *
 * Por instrução explícita do usuário, este arquivo NÃO cria nenhuma
 * validação de campo nova -- só a INFRAESTRUTURA de apresentação
 * (caixa de erro persistente, destaque vermelho, rolar+focar o
 * primeiro campo inválido, diferenciar erro técnico de erro de
 * preenchimento). Telas que já têm validação de campo (e futuras
 * validações que vierem a ser adicionadas, se um dia forem) chamam
 * window.vxShowFormErrors(...); erros técnicos usam
 * window.vxShowTechnicalError(...).
 */
(function(){
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');

  function ensureStyle(){
    if(document.getElementById('vxFormErrorStyle'))return;
    const s=document.createElement('style');
    s.id='vxFormErrorStyle';
    s.textContent=`
      .vx-form-error-box{background:#fdeaea;border:1px solid #e2a5a5;border-left:4px solid #c0392b;border-radius:6px;padding:10px 34px 10px 12px;margin:10px 0;position:relative;color:#7a1f1f;font-size:12px;line-height:1.5}
      .vx-form-error-box strong{display:block;margin-bottom:4px;color:#7a1f1f}
      .vx-form-error-box ul{margin:2px 0 0;padding-left:18px}
      .vx-form-error-box[data-kind="technical"]{background:#fdf3e3;border-color:#e0bd7a;border-left-color:#a0651b;color:#5c3d0a}
      .vx-form-error-box[data-kind="technical"] strong{color:#5c3d0a}
      .vx-form-error-close{position:absolute;top:6px;right:8px;border:0;background:none;color:inherit;font-size:16px;line-height:1;cursor:pointer;opacity:.7;padding:4px}
      .vx-form-error-close:hover{opacity:1}
      .vx-field-invalid .vx-control,.vx-field-invalid input,.vx-field-invalid select,.vx-field-invalid textarea{border-color:#c0392b!important;background:#fff6f6!important}
      .vx-field-invalid label{color:#c0392b!important}
    `;
    document.head.appendChild(s);
  }

  function clearFieldHighlights(panel){
    panel.querySelectorAll('.vx-field-invalid').forEach(f=>f.classList.remove('vx-field-invalid'));
  }

  function findFieldByLabel(panel,label){
    const n=String(label||'').trim().toUpperCase();
    return [...panel.querySelectorAll('.vx-field')].find(f=>String(f.querySelector('label')?.textContent||'').trim().toUpperCase()===n);
  }

  /* errors: [{label, message, el}] -- "label" acha o campo pelo texto
     do <label> dentro de panel (mesmo padrão de labelField() já usado
     em os-corrections-v0812.js/os-summary-lock-alignment-v0812.js);
     "el" pode ser passado direto quando quem chama já tem o elemento
     em mãos. Sempre mantém a caixa até o usuário fechar ou salvar com
     sucesso -- nunca some sozinha. */
  window.vxShowFormErrors=function(panel,errors){
    if(!panel||!errors||!errors.length)return;
    ensureStyle();
    clearFieldHighlights(panel);
    document.getElementById('vxFormErrorBox')?.remove();

    let firstField=null;
    errors.forEach(e=>{
      const field=e.el?e.el.closest('.vx-field'):findFieldByLabel(panel,e.label);
      if(field){
        field.classList.add('vx-field-invalid');
        if(!firstField)firstField=field;
      }
    });

    const box=document.createElement('div');
    box.id='vxFormErrorBox';
    box.className='vx-form-error-box';
    box.dataset.kind='validation';
    const title=errors.length>1?'Não foi possível salvar. Corrija os campos abaixo:':'Não foi possível salvar.';
    box.innerHTML=`<button type="button" class="vx-form-error-close" aria-label="Fechar">×</button><strong>${E(title)}</strong>${errors.length>1?`<ul>${errors.map(e=>`<li>${E(e.message||e.label)}</li>`).join('')}</ul>`:`<span>${E(errors[0].message||errors[0].label)}</span>`}`;
    panel.insertBefore(box,panel.firstChild);
    box.querySelector('.vx-form-error-close').onclick=()=>box.remove();

    const scrollTarget=firstField||box;
    scrollTarget.scrollIntoView?.({behavior:'smooth',block:'center'});
    const focusable=firstField?.querySelector('input,select,textarea');
    focusable?.focus();
  };

  /* Erro TÉCNICO (backend/RLS/sessão/rede) -- nunca confundido com
     campo em branco. Detalhe completo (rawError) vai só pro console,
     nunca pra tela -- o operador vê uma mensagem honesta, o suporte
     vê a causa real no log. */
  window.vxShowTechnicalError=function(panel,userMessage,rawError){
    if(rawError)console.error('[VoxAssist] Erro técnico ao salvar:',rawError);
    if(!panel)return;
    ensureStyle();
    document.getElementById('vxFormErrorBox')?.remove();
    const box=document.createElement('div');
    box.id='vxFormErrorBox';
    box.className='vx-form-error-box';
    box.dataset.kind='technical';
    box.innerHTML=`<button type="button" class="vx-form-error-close" aria-label="Fechar">×</button><strong>Não foi possível salvar por um problema técnico.</strong><span>${E(userMessage||'Tente novamente em instantes. Se o problema continuar, contate o suporte -- os detalhes técnicos já foram registrados.')}</span>`;
    panel.insertBefore(box,panel.firstChild);
    box.querySelector('.vx-form-error-close').onclick=()=>box.remove();
    box.scrollIntoView?.({behavior:'smooth',block:'center'});
  };

  window.vxClearFormErrors=function(panel){
    document.getElementById('vxFormErrorBox')?.remove();
    if(panel)clearFieldHighlights(panel);
  };
})();
