const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function harness(fields=[]){
  const listeners={},windowListeners={};
  const document={querySelector:()=>null,querySelectorAll:selector=>fields.filter(el=>!selector.includes('[data-entity="')||selector.includes('[data-entity="'+el.dataset.entity+'"]')),addEventListener:(name,fn)=>{(listeners[name]??=[]).push(fn);}};
  const context={document,window:{addEventListener:(name,fn)=>windowListeners[name]=fn,confirm:()=>false},state:{activeOs:{id:'os'},view:'os:os'},Option:class {constructor(value){this.value=value;}},toast:()=>{}};
  const source=read('os-global-save-v0812.js').replace(/\}\)\(\);\s*$/, 'window.testCollect=collect;window.testSync=syncField;})();');
  vm.createContext(context);vm.runInContext(source,context);
  return {context,listeners,windowListeners};
}
function field(entity,name,value,readonly=false){return {dataset:{entity,name},value,readOnly:readonly,disabled:false,isConnected:true,type:'text',tagName:'INPUT',matches:()=>true,closest:()=>({})};}
test('summary edit cannot be overwritten by a hidden equipment field',()=>{
  const summary=field('equipment','model','IB54'),hidden=field('equipment','model','');
  const h=harness([summary,hidden]);h.context.window.testSync(summary);
  assert.equal(hidden.value,'IB54');assert.equal(h.context.window.testCollect('equipment').model,'IB54');
});
test('client edit updates readonly summary and collection uses the latest field',()=>{
  const summary=field('client','address','old',true),client=field('client','address','Rua Moreira César');
  const h=harness([summary,client]);h.context.window.testSync(client);
  assert.equal(summary.value,'Rua Moreira César');assert.equal(h.context.window.testCollect('client').address,'Rua Moreira César');
});
test('custom product types are retained when copied to a select',()=>{
  const summary=field('equipment','product_type','LAVADORA');
  const equipment=field('equipment','product_type','IB54');equipment.tagName='SELECT';equipment.options=[{value:'IB54'}];equipment.add=o=>equipment.options.push(o);
  const h=harness([summary,equipment]);h.context.window.testSync(summary);
  assert.equal(equipment.value,'LAVADORA');assert.ok(equipment.options.some(o=>o.value==='LAVADORA'));
});
test('unsaved changes warn on leaving, without RPCs on each input',()=>{
  const el=field('financial','labor_value','280');const h=harness([el]);
  h.listeners.input[0]({target:el});let prevented=false,stopped=false;
  h.listeners.click[0]({target:{closest:()=>({})},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.ok(prevented&&stopped);
  h.context.window.vxMarkOsPanelSaved(h.context.document);
  prevented=false;h.listeners.click[0]({target:{closest:()=>({})},preventDefault(){prevented=true;},stopImmediatePropagation(){}});
  assert.equal(prevented,false);
});
test('budget changes do not autosave or invoke the status engine',async()=>{
  let listener;const el={dataset:{entity:'financial',name:'labor_value'},closest:()=>({}),addEventListener:(name,fn)=>listener=fn};
  const source=read('os-detail-v0812.js');
  const block=source.slice(source.indexOf("    document.querySelectorAll('.vx-control[data-entity]')"),source.indexOf("    const s=document.querySelector('#vxClientSearch')"));
  const context={document:{querySelectorAll:()=>[el]},blockedFinalized:()=>{throw Error('should not validate on field change');},patch:()=>{throw Error('should not autosave budget');},window:{vxAdvanceOsStatus:()=>{throw Error('should not advance on field change');}}};
  vm.createContext(context);vm.runInContext(block,context);await listener();
});
for(const name of ['phone-mask-v0812.js','input-masks-v0813.js'])test(name+' keeps the DDD and every digit of Brazilian international phones',()=>{
  const context={document:{querySelectorAll:()=>[],addEventListener:()=>{},documentElement:{}},window:{},MutationObserver:class {observe(){}}};
  vm.createContext(context);vm.runInContext(read(name),context);
  assert.equal(context.window.vxFormatPhone('5527988824082'),'(27) 98882-4082');
  assert.equal(context.window.vxFormatPhone('+55 (27) 3333-4444'),'(27) 3333-4444');
  assert.equal(context.window.vxFormatPhone('55988887777'),'(55) 98888-7777');
});
test('part history only alerts for an actual status transition',async()=>{
  const source=read('event-alerts-v0904.js');const block=source.slice(source.indexOf('  async function relevantAlert('),source.indexOf('\n  // Achado do usuário em 2026-09-04: um toast',source.indexOf('  async function relevantAlert(')));
  const context={norm:s=>String(s||'').toUpperCase().replaceAll('_',' '),myGroups:async()=>new Set()};vm.createContext(context);vm.runInContext(block+';globalThis.alertFor=relevantAlert;',context);
  const h={previous_status:'AGUARDANDO APROVACAO',new_status:'AGUARDANDO APROVACAO',service_order_id:'os',service_orders:{os_number:'SVO'}};
  assert.equal(await context.alertFor(h,{role:'GESTOR'}),null);
  h.previous_status='AGUARDANDO ANALISE';assert.match((await context.alertFor(h,{role:'GESTOR'})).text,/Orçamento gerado/);
});
test('adding manual or stock parts does not evaluate budget completion',()=>{
  assert.doesNotMatch(read('os-manual-part.js'),/vxAdvanceOsStatus/);
  const source=read('os-detail-v0812.js');const block=source.slice(source.indexOf('window.vxUseStockPart='),source.indexOf('\n',source.indexOf('window.vxUseStockPart=')));
  assert.doesNotMatch(block,/vxAdvanceOsStatus/);
  assert.doesNotMatch(read('os-global-save-v0812.js'),/data-name="repair_started_at"/);
});
