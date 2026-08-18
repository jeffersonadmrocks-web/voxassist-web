/* VoxAssist Web V0.8.12 — correção de navegação interna e abas */
(function(){
  const previousRender=window.render;
  const unsupported=new Set(['loja-vendas','docs-tecnicos','pareceres','anexos','whatsapp','relatorios-fin','relatorios-export','backup','integracoes']);
  const tabLabels={dashboard:'Início',os:'Atendimento',clientes:'Clientes',oficina:'Oficina',agenda:'Atividades',estoque:'Loja Virtual',financeiro:'Financeiro',testes:'Relatórios',usuarios:'Configurações','nova-os':'Nova O.S.'};

  window.renderTabs=function(label){
    const tabs=document.querySelector('#tabs'); if(!tabs)return;
    tabs.innerHTML=state.openTabs.map(v=>{
      const text=v.startsWith('os:')?'OS '+v.split(':')[1]:(tabLabels[v]||label||v.replace('feature:',''));
      return `<button class="tab ${state.view===v?'active':''}" data-tab="${v}"><span>${esc(text)}</span>${v!=='dashboard'?`<i data-close="${v}" title="Fechar guia">×</i>`:''}</button>`;
    }).join('')+`<button class="tab tab-plus" id="tabPlus" title="Nova guia">+</button>`;
    tabs.querySelectorAll('.tab[data-tab]').forEach(t=>t.addEventListener('click',e=>{if(e.target.closest('[data-close]'))return;window.render(t.dataset.tab);}));
    tabs.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeTab(x.dataset.close);}));
    const plus=document.querySelector('#tabPlus'); if(plus)plus.onclick=()=>window.render('dashboard');
  };

  function featureTab(id,label){const key='feature:'+id;if(!state.openTabs.includes(key))state.openTabs.push(key);state.view=key;renderTabs(label);return key}
  function kpi(label,value,color){return `<div class="feature-kpi" style="--accent:${color}"><span>${label}</span><b>${value}</b></div>`}
  function btn(label,action,kind=''){return `<button class="vx-btn ${kind}" data-action="${action}">${label}</button>`}
  function card(title,desc,actions,color='#1472d0'){return `<div class="feature-card" style="--accent:${color}"><h3>${title}</h3><p>${desc}</p>${actions}</div>`}
  function bindFeatureActions(){document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>runAction(b.dataset.action));}
  async function runAction(a){
    if(a==='os')return previousRender('os'); if(a==='nova-os')return previousRender('nova-os'); if(a==='clientes')return previousRender('clientes');
    if(a==='oficina')return previousRender('oficina'); if(a==='agenda')return previousRender('agenda'); if(a==='estoque')return previousRender('estoque');
    if(a==='financeiro')return previousRender('financeiro'); if(a==='testes')return previousRender('testes'); if(a==='usuarios')return previousRender('usuarios');
    if(a==='print')return window.print();
    if(a==='f11'){if(state.activeOs)return previousRender('os:'+state.activeOs);return toast('Abra uma OS para acessar F11 / Observações Internas.');}
    toast('Ação disponível para homologação nesta etapa.');
  }

  function featurePage(id,title,subtitle,html,actions=''){
    featureTab(id,title); const app=document.querySelector('#app'); if(!app)return;
    const h=document.querySelector('#title');if(h)h.textContent=title;
    app.innerHTML=`<div class="feature-page"><div class="feature-head"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="feature-actions">${actions}</div></div>${html}</div>`;
    bindFeatureActions();
  }

  function renderDocs(){
    const brands=[...new Set(state.orders.map(o=>o.equipments?.brand).filter(Boolean))];
    featurePage('docs-tecnicos','Documentação Técnica','Manuais, boletins, firmwares, vistas explodidas e materiais vinculados por marca/modelo.',
      `<div class="feature-summary">${kpi('Marcas em homologação',brands.length,'#7650d6')}${kpi('Equipamentos cadastrados',state.orders.filter(o=>o.equipments).length,'#1472d0')}${kpi('OS ativas',state.orders.filter(o=>o.status!=='FINALIZADA').length,'#ed7a00')}${kpi('Pendências', '—','#cf3542')}</div>
       <div class="feature-grid">${card('Consulta por Marca + Modelo','A pesquisa documental deve usar os dados do equipamento da OS.',btn('Abrir Oficina','oficina','primary'),'#7650d6')}${card('Manuais e Boletins','Área preparada para exibir arquivos técnicos cadastrados no Supabase/Storage.',btn('Ver OS','os'),'#2389b9')}${card('Modelos similares','Relacionamento entre modelos equivalentes e documentação compartilhada.',btn('Abrir Clientes','clientes'),'#13904b')}</div>
       <div class="feature-note">A tela agora é funcional e navegável. O cadastro físico de documentos/firmwares continua em homologação e será ligado ao Storage.</div>`);
  }
  function renderPareceres(){featurePage('pareceres','Pareceres Técnicos','Geração de parecer Vox e documentos por fabricante/seguradora.',
    `<div class="feature-summary">${kpi('OS ativas',state.orders.filter(o=>o.status!=='FINALIZADA').length,'#1472d0')}${kpi('Prontas',state.orders.filter(o=>o.status==='PRONTO PARA ENTREGA').length,'#13904b')}${kpi('Técnicos','—','#7650d6')}${kpi('Pendências','—','#ed7a00')}</div><div class="feature-grid">${card('Parecer Vox','Abra uma OS para preencher defeito constatado, serviço e parecer.',btn('Abrir pesquisa O.S.','os','primary'),'#1472d0')}${card('Assinatura do Técnico','A assinatura automática será vinculada ao perfil do técnico responsável.',btn('Usuários / Perfis','usuarios'),'#7650d6')}${card('Fabricantes / Seguradoras','Templates específicos ficam associados ao fabricante e tipo de OS.',btn('Testes de Funções','testes'),'#ed7a00')}</div>`)}
  function renderAnexos(){featurePage('anexos','Fotos / Anexos','Fotos obrigatórias, nota fiscal, etiqueta, PDFs e documentos vinculados à OS.',
    `<div class="feature-grid">${card('Nota Fiscal','Documento classificado e vinculado à OS.',btn('Selecionar O.S.','os','primary'),'#1472d0')}${card('Etiqueta do Produto','Foto/arquivo obrigatório conforme o fluxo.',btn('Abrir O.S.','os'),'#7650d6')}${card('Fotos do Aparelho','Frente, lateral e anexos livres pelo computador ou celular.',btn('Abrir testes','testes'),'#13904b')}</div><div class="feature-note">O bucket privado do Supabase já está preparado; upload/visualização final permanece em reteste.</div>`)}
  function renderWhatsapp(){featurePage('whatsapp','Lembretes / WhatsApp','Central de comunicações previstas para orçamento, pronto, retirada e documentos.',
    `<div class="feature-grid">${card('Orçamento concluído','Mensagem padrão para solicitar contato/aprovação.',btn('Ver aprovações','financeiro','primary'),'#13904b')}${card('Aparelho pronto','Aviso de disponibilidade para retirada.',btn('Ver OS prontas','os'),'#1472d0')}${card('Documentos da OS','Envio de OS, parecer e demais documentos.',btn('Pareceres','feature:pareceres'),'#7650d6')}</div><div class="feature-note">Integração efetiva com provedor/API de WhatsApp permanece pendente; a navegação e os fluxos internos já não ficam vazios.</div>`)}
  function renderLojaVendas(){featurePage('loja-vendas','Loja Virtual','Vendas de peças e aparelhos, catálogo e futuras integrações com site/marketplaces.',
    `<div class="feature-summary">${kpi('Itens em estoque',state.stock.length,'#13904b')}${kpi('OS ativas',state.orders.filter(o=>o.status!=='FINALIZADA').length,'#1472d0')}${kpi('Pedidos','—','#ed7a00')}${kpi('Integrações','—','#7650d6')}</div><div class="feature-grid">${card('Venda de Peças','Consulta de estoque e vínculo opcional à OS.',btn('Abrir estoque','estoque','primary'),'#13904b')}${card('Venda de Aparelho','Registro comercial de equipamentos e cliente.',btn('Clientes','clientes'),'#b7681d')}${card('Catálogo / Marketplace','Espelho da loja virtual e integrações futuras.',btn('Integrações','feature:integracoes'),'#7650d6')}</div>`)}
  function renderRelatorios(fin=false){featurePage(fin?'relatorios-fin':'relatorios-export',fin?'Relatórios Financeiros':'Exportação PDF / Excel',fin?'Caixa, recebimentos e formas de pagamento.':'Exportação gerencial dos módulos do VoxAssist.',
    `<div class="feature-grid">${card(fin?'Caixa / Recebimentos':'Ordens de Serviço',fin?'Use os dados financeiros persistidos na OS.':'Filtros de período, situação, marca, grupo e técnico.',btn(fin?'Abrir Financeiro':'Pesquisar O.S.',fin?'financeiro':'os','primary'),'#1472d0')}${card('PDF','Geração para conferência e compartilhamento.',btn('Imprimir / PDF','print'),'#cf3542')}${card('Excel','Exportação estruturada será habilitada por relatório.',btn('Testes de Funções','testes'),'#13904b')}</div>`)}
  function renderBackup(){featurePage('backup','Backup / Restauração','Proteção de banco, anexos e configurações do VoxAssist.',
    `<div class="feature-grid">${card('Backup do Banco','Estratégia de backup do Supabase e histórico de execução.',btn('Configurações','usuarios','primary'),'#13904b')}${card('Anexos / Storage','Arquivos privados vinculados às OS e clientes.',btn('Fotos / Anexos','feature:anexos'),'#1472d0')}${card('Restauração Segura','Antes de restaurar, gerar backup de segurança e registrar auditoria.',btn('Homologação','testes'),'#ed7a00')}</div><div class="feature-note">Execução administrativa de backup/restauração permanece restrita; esta tela substitui o botão vazio e centraliza o fluxo de homologação.</div>`)}
  function renderIntegracoes(){featurePage('integracoes','Integrações','WhatsApp, GestãoClick, site, Mercado Livre e APIs externas.',
    `<div class="feature-grid">${card('WhatsApp','Mensagens, documentos e notificações da OS.',btn('Abrir WhatsApp','feature:whatsapp','primary'),'#13904b')}${card('GestãoClick / Fiscal','Arquitetura fiscal será fechada nas etapas finais do projeto.',btn('Financeiro','financeiro'),'#1472d0')}${card('Site / Mercado Livre','Catálogo, vendas e espelho da Loja Virtual.',btn('Loja Virtual','feature:loja-vendas'),'#7650d6')}</div>`)}

  function renderFeature(id){if(id==='docs-tecnicos')return renderDocs();if(id==='pareceres')return renderPareceres();if(id==='anexos')return renderAnexos();if(id==='whatsapp')return renderWhatsapp();if(id==='loja-vendas')return renderLojaVendas();if(id==='relatorios-fin')return renderRelatorios(true);if(id==='relatorios-export')return renderRelatorios(false);if(id==='backup')return renderBackup();if(id==='integracoes')return renderIntegracoes();}

  document.addEventListener('click',function(e){const b=e.target.closest('[data-target]');if(!b||!unsupported.has(b.dataset.target))return;e.preventDefault();e.stopImmediatePropagation();renderFeature(b.dataset.target);},true);

  window.render=async function(view){
    if(String(view).startsWith('feature:'))return renderFeature(String(view).slice(8));
    const out=await previousRender(view);
    setTimeout(()=>{
      document.querySelectorAll('.desktop-menu .nav span').forEach(s=>{if(s.textContent.trim()==='LOJA')s.textContent='LOJA VIRTUAL'});
      if(document.querySelector('#tabs'))renderTabs();
    },0);
    return out;
  };
})();
