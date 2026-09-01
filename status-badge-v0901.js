/* VoxAssist — selo de status compartilhado (Consolidação Geral, 2026-09-01)
 * Rótulo visual único para módulos aprovados que ainda não estão 100% funcionais.
 * Não altera nenhuma tela existente sozinho -- é chamado por outras telas.
 */
(function(){
  'use strict';
  const E=v=>typeof esc==='function'?esc(v??''):String(v??'');
  const TONE={
    'FUNCIONAL':{cls:'vx-status-ok',label:'FUNCIONAL'},
    'EM HOMOLOGAÇÃO':{cls:'vx-status-warn',label:'EM HOMOLOGAÇÃO'},
    'PARCIAL':{cls:'vx-status-partial',label:'PARCIAL'},
    'ESTRUTURA DISPONÍVEL':{cls:'vx-status-structure',label:'ESTRUTURA DISPONÍVEL'}
  };

  window.vxStatusBadge=function(state,detail){
    const key=String(state||'').toUpperCase();
    const tone=TONE[key]||TONE['EM HOMOLOGAÇÃO'];
    return `<span class="vx-status-badge ${tone.cls}" title="${E(detail||'')}">${E(tone.label)}</span>`;
  };

  window.vxStructurePanel=function(title,detail){
    return `<div class="vx-status-panel"><div class="vx-status-panel-head"><strong>${E(title)}</strong>${window.vxStatusBadge('ESTRUTURA DISPONÍVEL')}</div><p>${E(detail||'Função registrada para evolução -- disponível para avaliação visual, integração funcional em homologação.')}</p></div>`;
  };

  if(!document.querySelector('#vxStatusBadgeStyle')){
    const style=document.createElement('style');
    style.id='vxStatusBadgeStyle';
    style.textContent=`
    .vx-status-badge{display:inline-flex;align-items:center;font-family:inherit;font-size:9px;font-weight:800;letter-spacing:.03em;padding:3px 8px;border-radius:999px;white-space:nowrap}
    .vx-status-ok{background:#e5f4ec;color:#1f7a3d}
    .vx-status-warn{background:#fdf0e3;color:#b8590a}
    .vx-status-partial{background:#fdf5d4;color:#8a6d00}
    .vx-status-structure{background:#eef1f8;color:#3a4a8f}
    .vx-status-panel{border:1px dashed #cbd3e0;border-radius:10px;padding:14px 16px;background:#fafbfd}
    .vx-status-panel-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
    .vx-status-panel-head strong{font-size:13px;color:#173650}
    .vx-status-panel p{margin:0;font-size:11px;color:#5a6b7d;line-height:1.5}
    `;
    document.head.appendChild(style);
  }
})();
