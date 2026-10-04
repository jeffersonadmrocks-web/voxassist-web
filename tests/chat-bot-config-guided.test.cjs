const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 const calls=[],notices=[],elements={};
 const context={window:{render:()=>{}},document:{getElementById:id=>elements[id],querySelector:()=>null,querySelectorAll:()=>[]},state:{profile:{role:'GESTOR'},session:{user:{id:'p1'}}},toast:(text,kind)=>notices.push({text,kind}),confirm:()=>true,api:async(path,opts)=>{calls.push({path,opts});return []},console};
 let source=fs.readFileSync(require('node:path').join(__dirname,'../runtime/chat-bot-config-v1.js'),'utf8');
 source=source.replace(/\}\)\(\);\s*$/,`window.test={set:data=>{bf=data},flowIssues,guideCard,flowMapCard,handlePublish,patchDraft,saveSettings,testRoutingCombo,isStepEligibleSim,nextEligibleStepSim,getSim:()=>simState,simAnswer};})();`);
 vm.runInNewContext(source,context);
 const data={draft:{id:'v1',welcome_message:'Olá',retry_limit:3,default_attendant_id:'p1'},published:null,versions:[],steps:[{id:'s1',step_key:'loja',step_order:1,question_text:'Qual loja?',active:true,answer_type:'CHOICE',routing_dimension:'STORE',options:[{value:'store1',label:'Serra'}]}],conditions:[],rules:[{id:'r1',store_id:'store1',target_queue_id:'q1',specificity:1}],stores:[{id:'store1',name:'Serra'}],profiles:[{id:'p1',role:'ATENDENTE'}],queues:[{id:'q1',name:'Equipe Serra'}],queueMembers:[{queue_id:'q1',user_id:'p1'}],auditEvents:[]};
 context.window.test.set(data);
 for(const [id,value] of Object.entries({vxBfRetryLimit:'3',vxBfWelcome:'Olá',vxBfInvalidMsg:'Escolha uma opção',vxBfDefaultAttendant:'p1',vxBfBusinessHoursText:'8h às 18h',vxBfAfterHoursMsg:''}))elements[id]={value};
 for(const id of ['vxBfAlwaysHuman','vxBfLookup','vxBfAfterHoursToggle'])elements[id]={checked:false};
 return {context,api:context.window.test,data,calls,notices,elements};
}
test('valid flow and four didactic stages',()=>{const {api}=setup();assert.equal(api.flowIssues().length,0);assert.equal((api.guideCard().match(/data-guide-tab=/g)||[]).length,4);assert.match(api.guideCard(),/Publique após testar/)});
test('empty and ambiguous choice options block publication',()=>{const {api,data}=setup();data.steps[0].options=[];assert(api.flowIssues().some(i=>i.level==='error'));data.steps[0].options=[{value:'a',label:'Serra'},{value:'b',label:'SERRA'}];assert(api.flowIssues().some(i=>i.text.includes('ambíguas')))});
test('STORE requires known store values and choice answer type',()=>{const {api,data}=setup();data.steps[0].options[0].value='unknown';assert(api.flowIssues().some(i=>i.text.includes('lojas ativas')));data.steps[0].answer_type='FREE_TEXT';assert(api.flowIssues().some(i=>i.text.includes('identificar a loja')))});
test('inactive or empty teams block publication',()=>{const {api,data}=setup();data.queueMembers=[];assert(api.flowIssues().some(i=>i.text.includes('integrante ativo')));data.queues[0].active=false;assert(api.flowIssues().some(i=>i.text.includes('inativa')))});
test('routing dimensions must be collected',()=>{const {api,data}=setup();data.rules[0].brand_value='ELECTROLUX';assert(api.flowIssues().some(i=>i.text.includes('Marca')))});
test('condition cycles and inactive parents detected',()=>{const {api,data}=setup();data.steps.push({...data.steps[0],id:'s2',step_key:'other'});data.conditions=[{step_id:'s1',depends_on_step_id:'s2',depends_on_value:'store1'},{step_id:'s2',depends_on_step_id:'s1',depends_on_value:'store1'}];assert(api.flowIssues().some(i=>i.text.includes('ciclo')));data.steps[1].active=false;assert(api.flowIssues().some(i=>i.text.includes('inativa')))});
test('simulation conditional eligibility and routing priority match production contract',()=>{const {api,data}=setup();data.conditions=[{step_id:'s1',depends_on_step_id:'s2',depends_on_value:'GARANTIA'}];data.steps.push({id:'s2',step_key:'garantia',active:true,step_order:2});assert.equal(api.isStepEligibleSim(data.steps[0],{}),false);assert.equal(api.isStepEligibleSim(data.steps[0],{garantia:' garantia '}),true);data.rules.push({id:'r2',store_id:'store1',warranty_value:'GARANTIA',specificity:2});assert.equal(api.testRoutingCombo('store1','garantia',null).id,'r2')});
test('escaping protects overview text and conditions',()=>{const {api,data}=setup();data.steps[0].question_text='<img src=x onerror=alert(1)>';assert(!api.flowMapCard().includes('<img'));assert(api.flowMapCard().includes('&lt;img'))});
test('failed save reports failure rather than success and leaves draft unchanged',async()=>{const {api,context,data}=setup();context.api=async()=>{throw Error('offline')};assert.equal(await api.patchDraft({welcome_message:'Changed'}),false);assert.equal(data.draft.welcome_message,'Olá')});
test('retry limit validates before saving',async()=>{const {api,elements,calls}=setup();elements.vxBfRetryLimit.value='11';assert.equal(await api.saveSettings(),false);assert.equal(calls.length,0)});
test('invalid configuration cannot call publication RPC',async()=>{const {api,data,calls}=setup();data.queueMembers=[];await api.handlePublish();assert(!calls.some(c=>c.path==='rpc/publish_chat_bot_flow'))});
test('valid flow uses canonical publication RPC',async()=>{const {api,calls}=setup();await api.handlePublish();assert.equal(calls.filter(c=>c.path==='rpc/publish_chat_bot_flow').length,1)});

test('ambiguous rules with equally specific destinations block publication',()=>{const {api,data}=setup();data.rules.push({id:'r2',store_id:'store1',target_queue_id:'q2',specificity:1});assert(api.flowIssues().some(i=>i.text.includes('Duas regras')))});
