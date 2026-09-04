do $migration$
declare
  fn text;
  old_block text := $old$    if new.payment_choice <> 'onsite' or new.status <> 'pendente' then raise exception 'A colaboradora deve criar o agendamento como pendente e com pagamento presencial.' using errcode = '23514'; end if;
    if new.service_price_snapshot is distinct from total then raise exception 'O valor do serviço não corresponde ao catálogo atual.' using errcode = '23514'; end if;
    if coalesce(new.deposit_percent, 0) <> 0 or coalesce(new.deposit_amount, 0) <> 0 or new.balance_amount is distinct from total then raise exception 'Os valores do agendamento manual estão inconsistentes.' using errcode = '23514'; end if;
  elsif not is_trusted then$old$;
  new_block text := $new$    if new.payment_choice <> 'onsite' or new.status <> 'pendente' then raise exception 'A colaboradora deve criar o agendamento como pendente e com pagamento presencial.' using errcode = '23514'; end if;
    if new.service_price_snapshot is null or new.service_price_snapshot < 0 then raise exception 'Informe um valor válido para o atendimento.' using errcode = '23514'; end if;
    new.service_price_snapshot := round(new.service_price_snapshot::numeric, 2);
    if coalesce(new.deposit_percent, 0) <> 0 or coalesce(new.deposit_amount, 0) <> 0 or new.balance_amount is distinct from new.service_price_snapshot then raise exception 'Os valores do agendamento manual estão inconsistentes.' using errcode = '23514'; end if;
  elsif not is_trusted then$new$;
begin
  select pg_get_functiondef('private.guard_appointment_insert()'::regprocedure) into fn;
  if position(old_block in fn) = 0 then
    raise exception 'Trecho esperado do guard_appointment_insert não foi encontrado.';
  end if;
  execute replace(fn, old_block, new_block);
end;
$migration$;

alter table public.appointments
  drop constraint if exists appointments_nonnegative_custom_price_check;

alter table public.appointments
  add constraint appointments_nonnegative_custom_price_check
  check (service_price_snapshot is null or service_price_snapshot >= 0);
