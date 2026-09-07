-- VoxAssist V0.9.07 -- prazo de garantia em meses
-- Achado do usuário em 2026-09-07: ao abrir OS com TIPO DE ORDEM DE
-- SERVIÇO = GARANTIA, o sistema deve pedir Nº da NF, Data da Compra,
-- Revendedor e Prazo de garantia (meses), e calcular se a OS está
-- dentro do prazo (data da compra + meses vs. data de entrada).
-- equipments já tinha invoice_number/purchase_date/purchase_store
-- (reaproveitados) -- só faltava um campo numérico pro prazo em meses
-- (warranty_info é texto livre, não dá pra calcular em cima dele).
alter table public.equipments add column if not exists warranty_months integer;
