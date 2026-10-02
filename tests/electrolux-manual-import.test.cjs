const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../electrolux-reports-v0813.js'),'utf8');
const helpers=source.slice(source.indexOf('  function osImportSection()'),source.indexOf('  function renderModal()'));

test('agenda cron cannot create an OS automatically',()=>{
  const sync=fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/sync-electrolux-agenda/index.ts'),'utf8');
  assert.doesNotMatch(sync,/rpc\(["'](?:upsert_electrolux_fg_service_order|electrolux_import_service_order)["']/);
  assert.doesNotMatch(sync,/from\(["']service_orders["']\)\s*\.(?:insert|upsert)/);
});

function harness({linked=[],role='GESTOR',permissions=[],lookupError=false}={}){
  const button={disabled:true},message={},label={},type={value:'Fora de Garantia'};
  const section={isConnected:true,querySelector(selector){return {'[data-elx-os-action]':button,'[data-elx-os-message]':message,'[data-elx-os-type-label]':label,'[data-elx-os-type]':type}[selector];}};
  const wrap={querySelector:()=>section,remove(){section.isConnected=false;}};
  const calls=[],renders=[];
  const context={state:{profile:{active_company_id:'company-a'},session:{user:{id:'user-a'}}},
    api:async path=>{if(path.startsWith('service_orders')){if(lookupError)throw Error('offline');return linked;}return permissions;},
    rpc:async(name,body)=>{calls.push({name,body});return name==='current_company_role'?role:{id:'os-a',os_number:'123',created:true};},
    fetchServiceOrder:async()=>({cellPhone:'27999990000',address:{city:'Serra'}}),
    toast:()=>{},window:{render:async view=>renders.push(view)}};
  vm.createContext(context);vm.runInContext(helpers,context);
  const svo={id:'external-a',svoNumber:'123',clientName:'Cliente',productName:'Geladeira',orderType:'Fora de Garantia'};
  return {context,wrap,svo,button,message,label,type,calls,renders,bind:()=>context.bindOsImport(wrap,svo,null,'connection-a')};
}

test('creates a real OS with detail data and opens the canonical OS screen',async()=>{
  const h=harness();await h.bind();assert.equal(h.button.textContent,'CRIAR OS NO VOXASSIST');
  await h.button.onclick();const call=h.calls.find(x=>x.name==='electrolux_import_service_order');
  assert.equal(call.body.p_connection_id,'connection-a');assert.equal(call.body.p_order.clientPhone,'27999990000');
  assert.equal(call.body.p_order.address.city,'Serra');assert.deepEqual(h.renders,['os:os-a']);
});
test('existing link opens without creation or financial mutation',async()=>{
  const h=harness({linked:[{id:'existing',os_number:'123'}]});await h.bind();
  assert.equal(h.button.textContent,'ABRIR OS NO VOXASSIST');await h.button.onclick();
  assert.equal(h.calls.length,0);assert.deepEqual(h.renders,['os:existing']);
});
test('explicit os.create denial overrides attendant default',async()=>{
  const h=harness({role:'ATENDENTE',permissions:[{allowed:false}]});await h.bind();
  assert.equal(h.button.disabled,true);assert.match(h.message.textContent,/não tem permissão/);
});
test('lookup failure never offers blind creation',async()=>{
  const h=harness({lookupError:true});await h.bind();
  assert.equal(h.button.textContent,'VERIFICAR NOVAMENTE');assert.equal(h.calls.length,0);
});
test('company switch blocks importing the previous company SVO',async()=>{
  const h=harness();await h.bind();h.context.state.profile.active_company_id='company-b';
  await h.button.onclick();assert.equal(h.calls.filter(x=>x.name==='electrolux_import_service_order').length,0);
  assert.match(h.message.textContent,/empresa ativa mudou/);
});
test('closed SVO without upstream type asks for an explicit type',async()=>{
  const h=harness();delete h.svo.orderType;await h.bind();assert.equal(h.label.hidden,false);
  h.type.value='Garantia';await h.button.onclick();
  assert.equal(h.calls.find(x=>x.name==='electrolux_import_service_order').body.p_order.orderType,'Garantia');
});
