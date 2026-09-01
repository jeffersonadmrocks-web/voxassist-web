/* VoxAssist — Catálogo único de permissões (Consolidação Geral, 2026-09-01)
 * Camada visual de leitura sobre os dados reais já usados por
 * user-permissions-ui-v0813.js (mesmos permissionGroups/roleOptions/
 * defaults). Não inventa módulo/permissão nova. A edição continua
 * acontecendo pelo fluxo por usuário já existente ("ALTERAR") -- esta
 * tela é a visão consolidada de papel x módulo x permissão para
 * conferência, não um novo caminho de gravação.
 */
(function(){
  'use strict';
  const E=window.esc||((v='')=>String(v??''));

  const roleOptions=['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'];
  const permissionGroups=[
    {title:'Ordens de Serviço',items:[['os.view','Visualizar O.S.'],['os.create','Criar O.S.'],['os.edit','Editar O.S.'],['os.cancel','Cancelar O.S.'],['os.status','Alterar situação da O.S.']]},
    {title:'Whirlpool',items:[['whirlpool.view','Visualizar modo Whirlpool'],['whirlpool.edit','Preencher / editar atendimento Whirlpool']]},
    {title:'Agenda',items:[['agenda.view_all','Visualizar todas as agendas'],['agenda.edit','Agendar / reagendar atendimentos'],['agenda.block','Bloquear períodos de agenda']]},
    {title:'Financeiro',critical:true,items:[['financeiro.view','Visualizar financeiro'],['financeiro.edit','Incluir / alterar lançamentos financeiros']]},
    {title:'Estoque',items:[['estoque.view','Visualizar estoque'],['estoque.edit','Movimentar / alterar estoque']]},
    {title:'Relatórios',items:[['relatorios.view','Visualizar e gerar relatórios']]},
    {title:'Configurações e Segurança',critical:true,items:[['config.view','Acessar Configurações'],['config.users','Gerenciar usuários e permissões']]}
  ];
  // Mesmos defaults por papel usados na gravação real (openPermissions -> data-default).
  const roleDefaults={
    GESTOR:permissionGroups.flatMap(g=>g.items.map(x=>x[0])),
    ATENDENTE:['os.view','os.create','os.edit','os.status','whirlpool.view','agenda.view_all','agenda.edit','estoque.view','relatorios.view'],
    TECNICO:['os.view','os.edit','whirlpool.view','whirlpool.edit','agenda.edit','estoque.view'],
    ESTOQUE:['estoque.view','estoque.edit','os.view'],
    FINANCEIRO:['financeiro.view','financeiro.edit','relatorios.view','os.view']
  };

  function matrixTable(){
    const rows=permissionGroups.flatMap(g=>g.items.map(([key,label],i)=>({group:g.title,critical:g.critical,first:i===0,span:g.items.length,key,label})));
    return `<div class="vx-permcat-tablewrap"><table class="vx-permcat-table"><thead><tr><th>Módulo</th><th>Permissão</th>${roleOptions.map(r=>`<th>${E(r)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(r=>`<tr class="${r.critical?'critical':''}">${r.first?`<td class="vx-permcat-group" rowspan="${r.span}">${E(r.group)}</td>`:''}<td>${E(r.label)}</td>${roleOptions.map(role=>`<td class="vx-permcat-cell">${roleDefaults[role].includes(r.key)?'<span class="yes">✓</span>':'<span class="no">—</span>'}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  }

  function catalogCard(){
    return `<section class="vx-admin-card vx-permcat-card">
      <div class="vx-admin-title"><h3>CATÁLOGO ÚNICO DE PERMISSÕES ${window.vxStatusBadge?window.vxStatusBadge('EM HOMOLOGAÇÃO','Visão consolidada para conferência. A edição em lote pela matriz ainda não existe -- use ALTERAR, na tabela de usuários, para gravar mudanças por pessoa.'):''}</h3><span>${permissionGroups.reduce((s,g)=>s+g.items.length,0)} permissões • ${roleOptions.length} perfis</span></div>
      <p class="vx-permcat-note">Módulos, permissões e valores padrão por perfil são os mesmos usados na gravação real de acesso por usuário. Esta matriz é só leitura -- edite pelo botão ALTERAR de cada usuário, na tabela acima.</p>
      ${matrixTable()}
    </section>`;
  }

  function inject(){
    const app=document.querySelector('#app');
    if(!app||!app.querySelector('.vx-admin-page'))return;
    if(app.querySelector('.vx-permcat-card'))return;
    const usersCard=[...app.querySelectorAll('.vx-admin-card')].find(s=>/USUÁRIOS DA EMPRESA ATIVA/.test(s.textContent||''));
    const wrap=document.createElement('div');
    wrap.innerHTML=catalogCard();
    const card=wrap.firstElementChild;
    if(usersCard&&usersCard.parentElement)usersCard.after(card);else app.appendChild(card);
  }

  const base=window.renderAdmin;
  if(typeof base==='function')window.renderAdmin=async function(){const r=await base.apply(this,arguments);setTimeout(inject,60);return r};
  setTimeout(inject,400);

  const style=document.createElement('style');
  style.textContent=`
  .vx-permcat-card{margin-top:12px}
  .vx-permcat-note{font-size:10px;color:#708296;margin:0 0 10px}
  .vx-permcat-tablewrap{overflow-x:auto}
  .vx-permcat-table{width:100%;border-collapse:collapse;font-size:10.5px}
  .vx-permcat-table th,.vx-permcat-table td{border:1px solid #e3e9ef;padding:6px 8px;text-align:left;white-space:nowrap}
  .vx-permcat-table thead th{background:#0d2536;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.03em}
  .vx-permcat-group{background:#f4f7fa;font-weight:800;color:#173650;font-size:9px;text-transform:uppercase;vertical-align:top}
  .vx-permcat-cell{text-align:center}
  .vx-permcat-cell .yes{color:#1f7a3d;font-weight:800}
  .vx-permcat-cell .no{color:#b7c0c9}
  tr.critical td:nth-child(2){color:#a72828;font-weight:700}
  `;
  document.head.appendChild(style);
})();
