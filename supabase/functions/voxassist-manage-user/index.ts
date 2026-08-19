import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceRole);

    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) throw new Error('Sessão inválida');
    const uid = userData.user.id;
    const { data: profile, error: profileErr } = await admin.from('profiles').select('id,role,active_company_id').eq('id', uid).single();
    if (profileErr || !profile || profile.role !== 'GESTOR') throw new Error('Apenas gestor pode cadastrar usuários');

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.full_name || '').trim().toUpperCase();
    const role = String(body.role || 'ATENDENTE').trim().toUpperCase();
    const companyId = body.company_id || profile.active_company_id;
    const storeIds = [...new Set((Array.isArray(body.store_ids) ? body.store_ids : [body.store_id]).filter(Boolean).map(String))];

    if (!email || !password || password.length < 6 || !fullName) throw new Error('Nome, e-mail e senha mínima de 6 caracteres são obrigatórios');
    if (!['GESTOR','ATENDENTE','TECNICO','ESTOQUE','FINANCEIRO'].includes(role)) throw new Error('Perfil inválido');
    if (!storeIds.length) throw new Error('Selecione pelo menos uma loja para o usuário');

    const { data: access } = await admin.from('user_companies').select('id').eq('user_id', uid).eq('company_id', companyId).eq('role','GESTOR').eq('active',true).maybeSingle();
    if (!access) throw new Error('Gestor sem permissão nesta empresa');

    const { data: validStores, error: storesErr } = await admin.from('stores').select('id').in('id',storeIds).eq('company_id', companyId).eq('active',true);
    if (storesErr) throw storesErr;
    if ((validStores||[]).length !== storeIds.length) throw new Error('Uma ou mais lojas não pertencem à empresa selecionada');

    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (createErr || !created.user) throw createErr || new Error('Falha ao criar usuário');
    const newId = created.user.id;
    const primaryStoreId = storeIds[0];

    const { error: profErr } = await admin.from('profiles').upsert({ id:newId, full_name:fullName, email, role, store_id:primaryStoreId, active_company_id:companyId, active:true });
    if (profErr) throw profErr;
    const { error: linkErr } = await admin.from('user_companies').upsert({ user_id:newId, company_id:companyId, role, store_id:primaryStoreId, active:true, is_default:true }, { onConflict:'user_id,company_id' });
    if (linkErr) throw linkErr;
    const rows=storeIds.map(store_id=>({user_id:newId,company_id:companyId,store_id,active:true}));
    const { error: storeAccessErr } = await admin.from('user_store_access').upsert(rows,{onConflict:'user_id,company_id,store_id'});
    if (storeAccessErr) throw storeAccessErr;

    return new Response(JSON.stringify({ ok:true, user_id:newId, store_ids:storeIds }), { status:200, headers:{...cors(),'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:e?.message || String(e) }), { status:400, headers:{...cors(),'Content-Type':'application/json'} });
  }
});
function cors(){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}}
