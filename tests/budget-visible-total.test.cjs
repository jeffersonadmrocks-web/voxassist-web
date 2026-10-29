const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('visible budget includes visit while typing, editing and clearing formatted currency',()=>{
 const fields=Object.entries({'VALOR DAS PEÇAS':'940','MÃO DE OBRA':'500','FRETE':'30','VISITA TÉCNICA':'R$ 125,75','MATERIAL AUXILIAR':'20','PARECER TÉCNICO':'10','DESCONTO':'40'}).map(([label,value])=>({querySelector:s=>s==='label'?{textContent:label}:{value}}));
 const outputs={};const box={querySelector:s=>outputs[s]??=( {textContent:''})};
 const panel={querySelectorAll:()=>fields};const c={window:{},document:{querySelector:s=>s==='#vx-orcamento'?panel:box}};vm.createContext(c);
 const source=fs.readFileSync('equipment-save-v0812.js','utf8');vm.runInContext(source.slice(0,source.indexOf('  async function saveEquipmentComplementary'))+'})();',c);
 c.window.vxUpdateBudgetTotal();assert.match(outputs['[data-vx="total"]'].textContent,/1\.585,75/);assert.match(outputs['[data-vx="extras"]'].textContent,/185,75/);
 fields[3].querySelector= s=>s==='label'?{textContent:'VISITA TÉCNICA'}:{value:'0'};c.window.vxUpdateBudgetTotal();assert.match(outputs['[data-vx="total"]'].textContent,/1\.460,00/);
});
test('OS summary includes every extra charge',()=>{
 const source=fs.readFileSync('os-detail-v0812.js','utf8');const start=source.indexOf('const partsTotal=',source.indexOf('function osPanel()'));const end=source.indexOf(';const analysisDate',start);
 const c={parts:[{quantity:1,unit_value:940}],fin:{labor_value:500,freight_value:30,technical_visit_value:125.75,auxiliary_material_value:20,technical_report_value:10,discount_value:40},num:v=>Number(v)||0};vm.createContext(c);vm.runInContext(source.slice(start,end)+';globalThis.result=total;',c);assert.equal(c.result,1585.75);
});
