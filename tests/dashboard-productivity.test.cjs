const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../runtime/dashboard-canonical-v1.js'),'utf8');
function calculate(orders,payments=[]){
 const context={orders,revenuePayments:payments,role:()=> 'GESTOR',techs:[{id:'t',store_id:'s'}],storeAuthorized:()=>true,me:()=> 't',norm:s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),pct:(a,b)=>Math.round(a/b*100)};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('    const prodTechs='),source.indexOf('    // Feed em tempo real'))+'\nglobalThis.result={prodRows,prodDrills,totalRecebidoOS};',context);
 return context.result;
}
test('four pending and two cancelled orders do not inflate one finalized service or receipts',()=>{
 const statuses=['FINALIZADA',...Array(4).fill('AGUARDANDO ANALISE'),'CANCELADA','CANCELADA'];
 const orders=statuses.map((status,i)=>({id:String(i),technician_id:'t',status}));
 const r=calculate(orders,orders.map(o=>({service_order_id:o.id,amount:100})));
 assert.equal(r.prodRows[0].os,1);
 assert.deepEqual(Array.from(r.prodDrills.prodOs_t,o=>o.id),['0']);
 assert.equal(r.totalRecebidoOS,100);
});
test('ready orders remain separate and technicians with only pending or cancelled orders disappear',()=>{
 const r=calculate([{id:'ready',technician_id:'t',status:'PRONTO PARA ENTREGA'}]);
 assert.equal(r.prodRows[0].os,0);assert.equal(r.prodRows[0].prontos,1);
 assert.equal(r.prodDrills.prodOs_t.length,0);
 assert.equal(calculate([{technician_id:'t',status:'CANCELADA'},{technician_id:'t',status:'AGUARDANDO ANALISE'}]).prodRows.length,0);
});
