create or replace function public.delete_appointment_permanently(_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _status text;
  _email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not (
    private.has_role('admin'::app_role)
    or exists (
      select 1
      from public.admin_emails ae
      where ae.enabled = true
        and lower(ae.email) = _email
    )
  ) then
    raise exception 'Apenas administradores podem excluir agendamentos definitivamente.';
  end if;

  select a.status
    into _status
  from public.appointments a
  where a.id = _appointment_id
  for update;

  if not found then
    raise exception 'Agendamento não encontrado.';
  end if;

  if _status = 'atendido' then
    raise exception 'Atendimentos concluídos não podem ser excluídos definitivamente.';
  end if;

  if exists (
    select 1
    from public.financial_entries fe
    where fe.appointment_id = _appointment_id
  ) or exists (
    select 1
    from public.accounts_receivable ar
    where ar.appointment_id = _appointment_id
  ) or exists (
    select 1
    from public.payments p
    where p.appointment_id = _appointment_id
      and p.status = 'approved'
  ) then
    raise exception 'Este agendamento possui movimentação financeira vinculada e não pode ser excluído definitivamente.';
  end if;

  delete from public.appointments
  where id = _appointment_id;
end;
$$;

revoke all on function public.delete_appointment_permanently(uuid) from public;
grant execute on function public.delete_appointment_permanently(uuid) to authenticated;

comment on function public.delete_appointment_permanently(uuid) is
  'Exclui definitivamente um agendamento sem movimentação financeira, apenas para administradores.';
