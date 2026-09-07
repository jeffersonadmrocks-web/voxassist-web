-- VoxAssist V0.9.07 -- quem decidiu (aprovou/recusou) o orçamento
-- Achado do usuário em 2026-09-07: no bloco "APROVAÇÃO E CRONOGRAMA DA
-- O.S." faltava registrar QUEM tomou a decisão -- nem sempre é o
-- próprio cliente (pode ser um familiar, um funcionário da empresa
-- cliente, etc.). Texto livre (não é um profiles.id): quem decide
-- raramente é um usuário cadastrado no sistema.
alter table public.service_orders add column if not exists approval_by text;
