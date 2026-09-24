-- Corrige a sincronizacao financeira das reservas de salas.
-- O fluxo anterior criava a conta apenas no INSERT e no cancelamento.
-- Agora alteracoes de valor/dados financeiros em reservas ativas tambem
-- criam ou atualizam os lancamentos pendentes e contas a receber.

create or replace function public.sync_room_reservation_finance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _room_name text;
  _center_id uuid;
  _original numeric := 0;
  _discount_amount numeric := 0;
  _charged numeric := 0;
  _entry public.financial_entries%rowtype;
begin
  -- Mantem o comportamento de cancelamento ja existente.
  if tg_op = 'UPDATE' and old.status = 'active' and new.status = 'cancelled' then
    select * into _entry
      from public.financial_entries fe
      where fe.room_reservation_id = new.id
      limit 1
      for update;

    if found then
      if _entry.status = 'received' then
        update public.financial_entries
          set status = 'refunded',
              updated_at = now(),
              notes = concat_ws(' ', notes, 'Reserva cancelada; lançamento estornado.')
          where id = _entry.id;
      elsif _entry.status = 'pending' then
        update public.financial_entries
          set status = 'cancelled',
              updated_at = now(),
              notes = concat_ws(' ', notes, 'Reserva cancelada.')
          where id = _entry.id;
      end if;
    end if;

    update public.accounts_receivable
      set status = 'cancelled',
          updated_at = now(),
          notes = concat_ws(' ', notes, 'Reserva cancelada.')
      where room_reservation_id = new.id
        and status = 'pending';

    return new;
  end if;

  -- Reservas sem valor continuam sem gerar cobranca ate que o valor seja informado.
  if new.status <> 'active' or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  select r.name
    into _room_name
    from public.rooms r
    where r.id = new.room_id;

  _room_name := coalesce(_room_name, 'Sala');
  _original := round(coalesce(new.amount, 0), 2);

  if new.discount_type is null then
    _discount_amount := 0;
  elsif new.discount_type = 'percent' then
    if coalesce(new.discount_value, 0) < 0 or new.discount_value > 100 then
      raise exception 'Percentual de desconto inválido.';
    end if;
    _discount_amount := round(_original * coalesce(new.discount_value, 0) / 100.0, 2);
  elsif new.discount_type = 'amount' then
    _discount_amount := round(coalesce(new.discount_value, 0), 2);
  else
    raise exception 'Tipo de desconto inválido.';
  end if;

  if _discount_amount < 0 or _discount_amount > _original then
    raise exception 'Desconto inválido.';
  end if;

  _charged := round(_original - _discount_amount, 2);

  select cc.id
    into _center_id
    from public.cost_centers cc
    where cc.code = 'outros'
      and cc.is_active = true
    limit 1;

  -- INSERT: preserva o fluxo original. Reservas ja recebidas continuam sendo
  -- tratadas pelo fluxo existente; as demais nascem como pendentes.
  if tg_op = 'INSERT' then
    if new.payment_received then
      -- Deixa o fluxo original de pagamento recebido para a funcao atual de
      -- contas a receber. Este caso nao e usado pela tela de reservas.
      return new;
    end if;

    insert into public.financial_entries(
      room_reservation_id,
      patient_name_snapshot,
      professional_name_snapshot,
      service_name_snapshot,
      occurred_at,
      original_amount,
      discount_type,
      discount_value,
      discount_amount,
      charged_amount,
      card_fee_amount,
      net_amount,
      payment_method_id,
      installments,
      cost_center_id,
      status,
      received_at,
      source,
      created_by,
      notes
    ) values (
      new.id,
      new.renter_name,
      'Locação de sala',
      'Reserva de sala — ' || _room_name,
      new.created_at,
      _original,
      new.discount_type,
      coalesce(new.discount_value, 0),
      _discount_amount,
      _charged,
      0,
      _charged,
      null,
      new.installments,
      _center_id,
      'pending',
      null,
      'room_reservation',
      new.created_by,
      'Gerado automaticamente a partir da reserva de sala.'
    )
    on conflict (room_reservation_id) where room_reservation_id is not null do nothing;

    insert into public.accounts_receivable(
      room_reservation_id,
      client_name_snapshot,
      service_name_snapshot,
      original_amount,
      amount_received,
      due_date,
      status,
      installments,
      created_by,
      notes
    ) values (
      new.id,
      new.renter_name,
      'Reserva de sala — ' || _room_name,
      _charged,
      0,
      coalesce(new.receivable_due_date, new.reservation_date),
      'pending',
      new.installments,
      new.created_by,
      'Gerado automaticamente a partir da reserva de sala.'
    )
    on conflict (room_reservation_id) where room_reservation_id is not null do nothing;

    return new;
  end if;

  -- UPDATE: era o ponto quebrado. Ao informar/alterar o valor depois da
  -- reserva, cria o financeiro se estiver faltando e mantem pendencias em sincronia.
  select * into _entry
    from public.financial_entries fe
    where fe.room_reservation_id = new.id
    limit 1
    for update;

  if not found then
    insert into public.financial_entries(
      room_reservation_id,
      patient_name_snapshot,
      professional_name_snapshot,
      service_name_snapshot,
      occurred_at,
      original_amount,
      discount_type,
      discount_value,
      discount_amount,
      charged_amount,
      card_fee_amount,
      net_amount,
      payment_method_id,
      installments,
      cost_center_id,
      status,
      received_at,
      source,
      created_by,
      notes
    ) values (
      new.id,
      new.renter_name,
      'Locação de sala',
      'Reserva de sala — ' || _room_name,
      new.created_at,
      _original,
      new.discount_type,
      coalesce(new.discount_value, 0),
      _discount_amount,
      _charged,
      0,
      _charged,
      null,
      new.installments,
      _center_id,
      'pending',
      null,
      'room_reservation',
      new.created_by,
      'Gerado automaticamente a partir da reserva de sala.'
    )
    returning * into _entry;
  elsif _entry.status = 'pending' then
    update public.financial_entries
      set patient_name_snapshot = new.renter_name,
          professional_name_snapshot = 'Locação de sala',
          service_name_snapshot = 'Reserva de sala — ' || _room_name,
          original_amount = _original,
          discount_type = new.discount_type,
          discount_value = coalesce(new.discount_value, 0),
          discount_amount = _discount_amount,
          charged_amount = _charged,
          card_fee_amount = 0,
          net_amount = _charged,
          payment_method_id = null,
          installments = new.installments,
          cost_center_id = _center_id,
          updated_at = now()
      where id = _entry.id
      returning * into _entry;
  end if;

  -- Nao altera contas que ja foram pagas; somente cria/atualiza a pendencia.
  if not new.payment_received and _charged > 0 then
    update public.accounts_receivable
      set client_name_snapshot = new.renter_name,
          service_name_snapshot = 'Reserva de sala — ' || _room_name,
          original_amount = _charged,
          due_date = coalesce(new.receivable_due_date, new.reservation_date),
          installments = new.installments,
          updated_at = now()
      where room_reservation_id = new.id
        and status = 'pending';

    if not found then
      null;
    end if;

    if not exists (
      select 1
      from public.accounts_receivable ar
      where ar.room_reservation_id = new.id
    ) then
      insert into public.accounts_receivable(
        room_reservation_id,
        client_name_snapshot,
        service_name_snapshot,
        original_amount,
        amount_received,
        due_date,
        status,
        installments,
        created_by,
        notes
      ) values (
        new.id,
        new.renter_name,
        'Reserva de sala — ' || _room_name,
        _charged,
        0,
        coalesce(new.receivable_due_date, new.reservation_date),
        'pending',
        new.installments,
        new.created_by,
        'Gerado automaticamente a partir da reserva de sala.'
      );
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists room_reservations_finance_sync on public.room_reservations;

create trigger room_reservations_finance_sync
after insert or update of
  status,
  amount,
  renter_name,
  reservation_date,
  receivable_due_date,
  installments,
  discount_type,
  discount_value,
  room_id
on public.room_reservations
for each row
execute function public.sync_room_reservation_finance();

-- Recupera reservas ativas com valor que ficaram sem lancamento durante o bug.
insert into public.financial_entries(
  room_reservation_id,
  patient_name_snapshot,
  professional_name_snapshot,
  service_name_snapshot,
  occurred_at,
  original_amount,
  discount_type,
  discount_value,
  discount_amount,
  charged_amount,
  card_fee_amount,
  net_amount,
  payment_method_id,
  installments,
  cost_center_id,
  status,
  received_at,
  source,
  created_by,
  notes
)
select
  rr.id,
  rr.renter_name,
  'Locação de sala',
  'Reserva de sala — ' || coalesce(r.name, 'Sala'),
  rr.created_at,
  round(rr.amount, 2),
  rr.discount_type,
  coalesce(rr.discount_value, 0),
  case
    when rr.discount_type = 'percent'
      then round(rr.amount * coalesce(rr.discount_value, 0) / 100.0, 2)
    when rr.discount_type = 'amount'
      then round(coalesce(rr.discount_value, 0), 2)
    else 0
  end,
  round(
    rr.amount -
    case
      when rr.discount_type = 'percent'
        then round(rr.amount * coalesce(rr.discount_value, 0) / 100.0, 2)
      when rr.discount_type = 'amount'
        then round(coalesce(rr.discount_value, 0), 2)
      else 0
    end,
    2
  ),
  0,
  round(
    rr.amount -
    case
      when rr.discount_type = 'percent'
        then round(rr.amount * coalesce(rr.discount_value, 0) / 100.0, 2)
      when rr.discount_type = 'amount'
        then round(coalesce(rr.discount_value, 0), 2)
      else 0
    end,
    2
  ),
  null,
  coalesce(rr.installments, 1),
  cc.id,
  'pending',
  null,
  'room_reservation',
  rr.created_by,
  'Backfill: reserva ativa recuperada após correção da sincronização financeira.'
from public.room_reservations rr
join public.rooms r on r.id = rr.room_id
left join public.cost_centers cc on cc.code = 'outros' and cc.is_active = true
where rr.status = 'active'
  and coalesce(rr.payment_received, false) = false
  and coalesce(rr.amount, 0) > 0
  and not exists (
    select 1
    from public.financial_entries fe
    where fe.room_reservation_id = rr.id
  )
on conflict do nothing;

insert into public.accounts_receivable(
  room_reservation_id,
  client_name_snapshot,
  service_name_snapshot,
  original_amount,
  amount_received,
  due_date,
  status,
  installments,
  created_by,
  notes
)
select
  rr.id,
  rr.renter_name,
  'Reserva de sala — ' || coalesce(r.name, 'Sala'),
  round(
    rr.amount -
    case
      when rr.discount_type = 'percent'
        then round(rr.amount * coalesce(rr.discount_value, 0) / 100.0, 2)
      when rr.discount_type = 'amount'
        then round(coalesce(rr.discount_value, 0), 2)
      else 0
    end,
    2
  ),
  0,
  coalesce(rr.receivable_due_date, rr.reservation_date),
  'pending',
  coalesce(rr.installments, 1),
  rr.created_by,
  'Backfill: reserva ativa recuperada após correção da sincronização financeira.'
from public.room_reservations rr
join public.rooms r on r.id = rr.room_id
where rr.status = 'active'
  and coalesce(rr.payment_received, false) = false
  and coalesce(rr.amount, 0) > 0
  and not exists (
    select 1
    from public.accounts_receivable ar
    where ar.room_reservation_id = rr.id
  )
on conflict do nothing;
