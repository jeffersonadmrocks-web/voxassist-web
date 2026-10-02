const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
function harness(){
 const source=read('os-detail-v0812.js'),values=Array.from({length:4},()=>({}));
 const c={ctx:{o:{id:'os'},fin:{labor_value:0},parts:[{quantity:1,unit_value:940}],payments:[]},window:{},num:v=>Number(v)||0,money:v=>Number(v).toFixed(2),document:{querySelector:()=>({querySelectorAll:()=>values})},api:async()=>[]};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function budgetSummary(){'),source.indexOf('  function financePanel(){'))+'\nglobalThis.summary=budgetSummary;globalThis.refresh=refreshPaymentBudget;',c);return {c,values};
}
test('saved labor immediately updates finalization from 940 to 1440',()=>{
 const {c,values}=harness();assert.equal(c.summary().budget,940);c.window.vxApplySavedFinancial({labor_value:500},'os');assert.equal(c.summary().budget,1440);assert.equal(values[0].textContent,'1440.00');assert.equal(values[3].textContent,'1440.00');
});
test('all budget charges, discounts, receipts and reversals use the same summary',()=>{
 const {c}=harness();c.ctx.payments=[{amount:300,status:'RECEBIDO'},{amount:50,status:'DESCONTO'},{amount:-100,status:'ESTORNO'},{amount:999,status:'CANCELADO'}];c.window.vxApplySavedFinancial({labor_value:500,freight_value:30,auxiliary_material_value:20,technical_report_value:10,discount_value:40},'os');assert.equal(c.summary().budget,1460);assert.equal(c.summary().allocated,250);assert.equal(c.summary().bal,1210);
});
test('receipt refresh reads saved budget and propagates lookup failure',async()=>{
 const {c}=harness();c.api=async url=>url.startsWith('os_financial')?[{labor_value:500}]:url.startsWith('os_parts')?[{quantity:1,unit_value:940}]:[];await c.refresh();assert.equal(c.summary().bal,1440);c.api=async()=>{throw Error('network');};await assert.rejects(c.refresh(),/network/);
});
test('financial update for another OS cannot modify the open order',()=>{const {c}=harness();c.window.vxApplySavedFinancial({labor_value:500},'other');assert.equal(c.summary().budget,940);});
test('both save paths synchronize financial context after successful persistence',()=>{
 for(const name of ['os-global-save-v0812.js','equipment-save-v0812.js'])assert.match(read(name),/vxApplySavedFinancial\?\.\(financialBody,o.id\)/);
 const source=read('os-detail-v0812.js');const payment=source.slice(source.indexOf('window.vxOpenRegisterPayment=async function(){'));assert.ok(payment.indexOf('vxHasUnsavedBudget')<payment.indexOf('await refreshPaymentBudget()'));assert.ok(payment.indexOf('await refreshPaymentBudget()')<payment.indexOf('const {budget,received,bal}=budgetSummary()'));
});
