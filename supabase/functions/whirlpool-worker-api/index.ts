import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const REPOSITORY = "jeffersonadmrocks-web/voxassist-web";
const AUDIENCE = "voxassist-whirlpool";
const ISSUER = "https://token.actions.githubusercontent.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function b64url(value:string){
  const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
}
async function verifyGithubOidc(token:string){
  const parts=token.split(".");if(parts.length!==3)throw new Error("TOKEN_INVALIDO");
  const header=JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const claims=JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  if(header.alg!=="RS256"||!header.kid)throw new Error("TOKEN_INVALIDO");
  const jwks=await fetch(ISSUER+"/.well-known/jwks").then(r=>r.json());
  const jwk=jwks.keys?.find((k:any)=>k.kid===header.kid);if(!jwk)throw new Error("TOKEN_INVALIDO");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64url(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  const now=Math.floor(Date.now()/1000);
  if(!valid||claims.iss!==ISSUER||claims.aud!==AUDIENCE||claims.repository!==REPOSITORY||
     claims.ref!=="refs/heads/main"||Number(claims.exp||0)<now||Number(claims.nbf||0)>now+30)
    throw new Error("TOKEN_NAO_AUTORIZADO");
  if(!["schedule","workflow_dispatch","push"].includes(String(claims.event_name||"")))
    throw new Error("EVENTO_NAO_AUTORIZADO");
  return claims;
}
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}
async function connectionId(input:any){
  if(input.connection_id)return String(input.connection_id);
  const {data,error}=await admin.from("whirlpool_connections").select("id").eq("active",true).order("created_at").limit(1).maybeSingle();
  if(error||!data)throw new Error("CONEXAO_NAO_ENCONTRADA");return data.id;
}
Deno.serve(async req=>{
  if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  try{
    const bearer=req.headers.get("authorization")||"";
    if(!bearer.startsWith("Bearer "))throw new Error("TOKEN_AUSENTE");
    await verifyGithubOidc(bearer.slice(7));
    const input=await req.json();const action=String(input.action||"");
    const cid=await connectionId(input);

    if(action==="claim"){
      const {data,error}=await admin.rpc("whirlpool_worker_claim",{p_connection_id:cid,p_worker_id:String(input.worker_id),p_lease_seconds:Math.min(Number(input.lease_seconds)||900,900)});
      if(error)throw error;return json({...data,connection_id:cid});
    }
    if(action==="pending"){
      const limit=Math.min(Math.max(Number(input.limit)||3,1),3);
      const {data:q,error}=await admin.from("whirlpool_import_queue").select("id,external_order_id,created_at").eq("state","PENDENTE").eq("queue_reason","ATIVA_NOVA").order("created_at").limit(limit);
      if(error)throw error;
      const ids=(q||[]).map((x:any)=>x.external_order_id);
      const {data:ext,error:ee}=ids.length?await admin.from("whirlpool_external_orders").select("id,external_order_id,service_status").in("id",ids):{data:[],error:null};
      if(ee)throw ee;const byId=new Map((ext||[]).map((x:any)=>[x.id,x]));
      return json((q||[]).map((x:any)=>({queueId:x.id,external_order_id:byId.get(x.external_order_id)?.external_order_id,service_status:byId.get(x.external_order_id)?.service_status})).filter((x:any)=>x.external_order_id));
    }
    if(action==="report"){
      const {data,error}=await admin.rpc("whirlpool_worker_report",{p_connection_id:cid,p_lock_token:String(input.lock_token),p_outcome:String(input.outcome),p_session_state:input.session_state||null,p_error_code:input.error_code||null});
      if(error)throw error;return json(data);
    }
    if(action==="job_failed"){
      const queueId=String(input.queue_id||"");
      if(!queueId)throw new Error("QUEUE_ID_AUSENTE");
      const {error}=await admin.rpc("whirlpool_worker_job_failed",{p_queue_id:queueId,p_error_code:String(input.error_code||"").slice(0,100),p_error_message:String(input.error_message||"").slice(0,1600)});
      if(error)throw error;return json({ok:true});
    }
    if(action==="upload_import"){
      const id=String(input.external_order_id||"");
      if(!/^7015\d+$/.test(id))throw new Error("OS_INVALIDA");
      const bytes=Uint8Array.from(atob(String(input.pdf_base64||"")),c=>c.charCodeAt(0));
      if(bytes.length<1024||new TextDecoder().decode(bytes.slice(0,4))!=="%PDF")throw new Error("PDF_INVALIDO");
      const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
      const hash=[...digest].slice(0,8).map(x=>x.toString(16).padStart(2,"0")).join("");
      const storagePath="whirlpool/"+id+"/"+hash+".pdf";
      const {error:upload}=await admin.storage.from("voxassist-files").upload(storagePath,bytes,{contentType:"application/pdf",upsert:false});
      if(upload&&!/already exists|duplicate/i.test(upload.message))throw upload;
      const {data,error}=await admin.rpc("whirlpool_import_pdf",{p_filial:"SERRA",p_payload:input.payload,p_storage_path:storagePath});
      if(error){if(!upload)await admin.storage.from("voxassist-files").remove([storagePath]).catch(()=>{});throw error;}
      return json(data);
    }
    throw new Error("ACAO_INVALIDA");
  }catch(e){
    const code=String((e as any)?.message||e||"ERRO").replace(/[^A-Z0-9_ -]/gi,"").slice(0,100);
    return json({ok:false,error:code},/TOKEN|EVENTO/.test(code)?401:400);
  }
});