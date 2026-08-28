-- ============================================================
-- VoxAssist — Gestão Operacional: correção de RLS (2026-08-27)
-- Achado no security-review: a policy de insert de operational_tasks
-- ("Usuários criam tarefas manuais") só checava origin='MANUAL' e
-- created_by=auth.uid() — não restringia responsible_user_id, então
-- qualquer usuário autenticado conseguia plantar uma tarefa MANUAL na
-- fila pessoal de outra pessoa (com due_at no passado, attention_flag,
-- etc.), o que também infla o pendingTaskCount que o
-- operational-alerts-scan usa pra decidir escalonamento de alerta.
-- Corrige pra só permitir tarefa manual atribuída a si mesmo ou sem
-- responsável (o comentário original já dizia "só a própria" — a
-- policy só não refletia isso). Idempotente.
-- ============================================================

drop policy if exists "Usuários criam tarefas manuais" on public.operational_tasks;
create policy "Usuários criam tarefas manuais"
  on public.operational_tasks for insert
  with check (
    origin = 'MANUAL'
    and created_by = auth.uid()
    and responsible_user_id is not distinct from auth.uid()
  );
