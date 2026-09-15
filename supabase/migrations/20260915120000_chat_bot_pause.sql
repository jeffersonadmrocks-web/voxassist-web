-- Robô de Atendimento: pausa de emergência.
-- Achado do usuário (2026-09-15): já houve um loop infinito real --
-- robô de uma conexão respondendo automaticamente ao robô de outra
-- conexão (número confundido com um contato comum), cada resposta
-- disparando a próxima. Não existia nenhuma forma de parar o robô sem
-- apagar a configuração publicada (que é imutável -- trigger
-- chat_bot_flow_versions_block_retroactive_update).
--
-- paused é deliberadamente OMITIDO da lista de colunas protegidas
-- pelo trigger de imutabilidade: alternar só este campo numa versão
-- PUBLICADA nunca dispara a exceção "versão publicada não pode ser
-- alterada" (a RLS de UPDATE já permite GESTOR em qualquer status,
-- só o trigger restringia). Qualquer outra coluna mudando junto ainda
-- é bloqueada normalmente.
alter table public.chat_bot_flow_versions
  add column if not exists paused boolean not null default false;

comment on column public.chat_bot_flow_versions.paused is
  'Pausa de emergência do robô -- GESTOR liga/desliga sem criar rascunho nem afetar o conteúdo publicado. chat-inbound-webhook trata paused=true como se não houvesse fluxo publicado (nem triagem, nem mensagem de ausência, nem boas-vindas).';
