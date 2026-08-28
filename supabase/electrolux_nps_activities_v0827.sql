alter table public.external_appointments add column if not exists nps_missing_count integer not null default 0, add column if not exists nps_missing_since timestamptz, add column if not exists nps_closed_inferred_at timestamptz;
alter table public.nps_cases add column if not exists closure_inferred_at timestamptz, add column if not exists eligible_at timestamptz, add column if not exists closure_detection_method text;
alter table public.nps_cases drop constraint if exists nps_cases_situacao_check;
alter table public.nps_cases add constraint nps_cases_situacao_check check(situacao in('AGUARDANDO_ENCERRAMENTO','AGUARDANDO_PRAZO_NPS','AGUARDANDO_CONTATO','PRIMEIRO_CONTATO_ENVIADO','AGUARDANDO_RESPOSTA','LEMBRETE_ENVIADO','CLIENTE_CONFIRMOU_RESPOSTA','CLIENTE_NAO_RECEBEU_PESQUISA','CLIENTE_NAO_RESPONDEU','CLIENTE_NAO_DESEJA_CONTATO','CASO_ATENCAO','FINALIZADO'));
alter table public.nps_cases drop constraint if exists nps_cases_closure_detection_method_check;
alter table public.nps_cases add constraint nps_cases_closure_detection_method_check check(closure_detection_method is null or closure_detection_method='ENCERRAMENTO_POR_AUSENCIA');
create index if not exists idx_nps_cases_eligible_at on public.nps_cases(eligible_at) where situacao in('AGUARDANDO_PRAZO_NPS','AGUARDANDO_CONTATO');
update public.nps_cases c set situacao='AGUARDANDO_ENCERRAMENTO',closure_inferred_at=null,eligible_at=null,closure_detection_method=null
where c.situacao='AGUARDANDO_CONTATO'
  and not exists (select 1 from public.nps_contacts n where n.nps_case_id=c.id);
