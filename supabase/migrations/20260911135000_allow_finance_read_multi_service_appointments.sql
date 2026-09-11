-- O financeiro precisa ler os serviços que compõem agendamentos com múltiplos procedimentos
-- para exibir todos os itens do pacote, sem reduzir a descrição ao serviço principal.

drop policy if exists "Finance roles read appointment services" on public.appointment_services;
create policy "Finance roles read appointment services"
on public.appointment_services
for select
to authenticated
using (public.finance_has_role(array['admin','finance','reception']));
