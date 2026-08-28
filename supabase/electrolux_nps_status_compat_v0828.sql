alter table public.nps_cases drop constraint if exists nps_cases_situacao_check;

update public.nps_cases
set situacao='AGUARDANDO_ENCERRAMENTO', closure_inferred_at=null,
    eligible_at=null, closure_detection_method=null
where situacao in ('AGUARDANDO_ELEGIBILIDADE','ELEGIVEL_PARA_NPS');

alter table public.nps_cases add constraint nps_cases_situacao_check check(situacao in(
  'AGUARDANDO_ENCERRAMENTO','AGUARDANDO_PRAZO_NPS','AGUARDANDO_CONTATO',
  'PRIMEIRO_CONTATO_ENVIADO','AGUARDANDO_RESPOSTA','LEMBRETE_ENVIADO',
  'CLIENTE_CONFIRMOU_RESPOSTA','CLIENTE_NAO_RECEBEU','CLIENTE_NAO_RESPONDEU',
  'CLIENTE_NAO_DESEJA_CONTATO','CASO_DE_ATENCAO','FINALIZADO'
));

alter table public.nps_cases alter column situacao set default 'AGUARDANDO_ENCERRAMENTO';
