import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyCase, isValidBrazilianPhone, estimateVisitCount, daysBetween, FOLLOW_UP_WINDOW_DAYS } from "../_shared/npsClassification.ts";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SIX_HOURS=21600000;
type A={id:string;external_created_at:string|null;concluded_at:string|null;client_phone:string|null;nps_closed_inferred_at:string|null};
type C={id:string;external_appointment_id:string;situacao:string;eligible_at:string|null};
type H={previous_data:{appointment_date?:string|null};new_data:{appointment_date?:string|null}};
Deno.serve(async()=>{
 const started_at=new Date().toISOString(),now=new Date();let processed=0;
 try{
  const {data:rc,error:ce}=await db.from("nps_cases").select("id,external_appointment_id,situacao,eligible_at");if(ce)throw ce;
  const cases=new Map(((rc||[]) as C[]).map(c=>[c.external_appointment_id,c]));
  const {data:contacts,error:contactsError}=await db.from("nps_contacts").select("nps_case_id");if(contactsError)throw contactsError;
  const contacted=new Set((contacts||[]).map((c:{nps_case_id:string})=>c.nps_case_id));
  const {data:ra,error:ae}=await db.from("external_appointments").select("id,external_created_at,concluded_at,client_phone,nps_closed_inferred_at").eq("origin","ELECTROLUX").eq("status","CONCLUIDO");if(ae)throw ae;
  for(const a of (ra||[]) as A[]){if(!a.concluded_at)continue;
   const current=cases.get(a.id),inferred=a.nps_closed_inferred_at,eligible=inferred?new Date(new Date(inferred).getTime()+SIX_HOURS).toISOString():null;
   const waiting=inferred?(eligible&&new Date(eligible)<=now?"AGUARDANDO_CONTATO":"AGUARDANDO_PRAZO_NPS"):"AGUARDANDO_ENCERRAMENTO";
   if(!current){
    const {data:h}=await db.from("external_appointment_history").select("previous_data,new_data").eq("external_appointment_id",a.id);
    const visits=estimateVisitCount((h||[]) as H[]),valid=isValidBrazilianPhone(a.client_phone);
    const classification=classifyCase({daysToConclude:a.external_created_at?daysBetween(a.external_created_at,a.concluded_at):null,visitCount:visits,hasComplaint:false,hasReturnVisit:false,hasReopening:false,whatsappValid:valid,daysSinceConclusion:daysBetween(a.concluded_at,now.toISOString())});
    const situacao=classification==="NAO_ELEGIVEL"?"FINALIZADO":waiting;
    const {data:s,error}=await db.from("nps_cases").insert({external_appointment_id:a.id,classification,situacao,opened_at:a.external_created_at,concluded_at:a.concluded_at,visit_count:visits,whatsapp_valid:valid,survey_deadline_at:new Date(new Date(a.concluded_at).getTime()+2592000000).toISOString(),closure_inferred_at:inferred,eligible_at:eligible,closure_detection_method:inferred?"ENCERRAMENTO_POR_AUSENCIA":null,closed_reason:classification==="NAO_ELEGIVEL"?"Não elegível na inclusão automática":null}).select("id").single();
    if(error||!s)continue;processed++;
    await db.from("nps_case_history").insert({nps_case_id:s.id,action:"CRIADO_AUTOMATICAMENTE",previous_data:{},new_data:{classification,situacao,visit_count:visits,whatsapp_valid:valid,eligible_at:eligible},changed_by:null});
   }else if(!contacted.has(current.id)&&(current.situacao!==waiting||current.eligible_at!==eligible)){
    const {error}=await db.from("nps_cases").update({situacao:waiting,closure_inferred_at:inferred,eligible_at:eligible,closure_detection_method:inferred?"ENCERRAMENTO_POR_AUSENCIA":null}).eq("id",current.id);if(!error)processed++;
   }
  }
  await db.from("integration_sync_runs").insert({origin:"ELECTROLUX_NPS",started_at,finished_at:new Date().toISOString(),success:true,orders_processed:processed});
  return Response.json({ok:true,processed,eligibilityDelayHours:6,followUpWindowDays:FOLLOW_UP_WINDOW_DAYS});
 }catch(e){await db.from("integration_sync_runs").insert({origin:"ELECTROLUX_NPS",started_at,finished_at:new Date().toISOString(),success:false,orders_processed:processed,error_message:e instanceof Error?e.message:String(e)});return Response.json({ok:false,error:"nps_sync_failed"},{status:500});}
});
