alter table public.room_reservations
  add column if not exists payment_received boolean not null default false,
  add column if not exists payment_method_code text,
  add column if not exists installments integer not null default 1,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(12,2) not null default 0,
  add column if not exists receivable_due_date date;

alter table public.room_reservations drop constraint if exists room_reservations_installments_finance_check;
alter table public.room_reservations add constraint room_reservations_installments_finance_check check (installments >= 1);
alter table public.room_reservations drop constraint if exists room_reservations_discount_type_finance_check;
alter table public.room_reservations add constraint room_reservations_discount_type_finance_check check (discount_type is null or discount_type in ('percent','amount'));
alter table public.room_reservations drop constraint if exists room_reservations_discount_value_finance_check;
alter table public.room_reservations add constraint room_reservations_discount_value_finance_check check (discount_value >= 0);

alter table public.financial_entries
  add column if not exists room_reservation_id uuid references public.room_reservations(id) on delete set null;

alter table public.accounts_receivable
  add column if not exists room_reservation_id uuid references public.room_reservations(id) on delete set null;

alter table public.financial_entries drop constraint if exists financial_entries_source_check;
alter table public.financial_entries
  add constraint financial_entries_source_check
  check (source in ('appointment','manual','accounts_receivable','room_reservation'));

create unique index if not exists financial_entries_room_reservation_unique
  on public.financial_entries(room_reservation_id)
  where room_reservation_id is not null;

create unique index if not exists accounts_receivable_room_reservation_unique
  on public.accounts_receivable(room_reservation_id)
  where room_reservation_id is not null;

create or replace function public.finance_require_open_cash_for_received_entry()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare _business_date date;
begin
  if new.status='received'
     and coalesce(new.charged_amount,0) > 0
     and (tg_op='INSERT' or old.status is distinct from 'received') then
    _business_date := (coalesce(new.received_at,new.occurred_at,now()) at time zone 'America/Fortaleza')::date;
    if not exists(
      select 1 from public.cash_sessions cs
      where cs.business_date=_business_date and cs.status='open'
    ) then
      raise exception 'Abra o caixa do dia antes de registrar um recebimento.';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.sync_room_reservation_finance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _room_name text;
  _method_id uuid;
  _center_id uuid;
  _session_id uuid;
  _original numeric := 0;
  _discount_amount numeric := 0;
  _charged numeric := 0;
  _fee numeric := 0;
  _net numeric := 0;
  _entry public.financial_entries%rowtype;
  _business_date date;
begin
  if tg_op='INSERT' then
    if new.status <> 'active' or coalesce(new.amount,0) <= 0 then
      return new;
    end if;

    select r.name into _room_name from public.rooms r where r.id=new.room_id;
    _room_name := coalesce(_room_name,'Sala');
    _original := round(coalesce(new.amount,0),2);

    if new.discount_type is null then
      _discount_amount := 0;
    elsif new.discount_type='percent' then
      if coalesce(new.discount_value,0) < 0 or new.discount_value > 100 then
        raise exception 'Percentual de desconto inválido.';
      end if;
      _discount_amount := round(_original * coalesce(new.discount_value,0) / 100.0,2);
    elsif new.discount_type='amount' then
      _discount_amount := round(coalesce(new.discount_value,0),2);
    else
      raise exception 'Tipo de desconto inválido.';
    end if;

    if _discount_amount < 0 or _discount_amount > _original then
      raise exception 'Desconto inválido.';
    end if;

    _charged := round(_original - _discount_amount,2);
    select cc.id into _center_id
      from public.cost_centers cc
      where cc.code='outros' and cc.is_active=true
      limit 1;

    if new.payment_received and _charged > 0 then
      select pm.id into _method_id
        from public.payment_methods pm
        where pm.code=new.payment_method_code and pm.is_active=true
        limit 1;
      if _method_id is null then
        raise exception 'Selecione uma forma de pagamento válida para a reserva.';
      end if;

      _business_date := (new.created_at at time zone 'America/Fortaleza')::date;
      select cs.id into _session_id
        from public.cash_sessions cs
        where cs.business_date=_business_date and cs.status='open'
        order by cs.opened_at desc
        limit 1;
      if _session_id is null then
        raise exception 'Abra o caixa do dia antes de registrar uma reserva já recebida.';
      end if;

      _fee := coalesce(public.calculate_payment_fee(_method_id,_charged,new.installments,_business_date),0);
      if _fee > _charged then raise exception 'Taxa maior que o valor da reserva.'; end if;
      _net := round(_charged - _fee,2);
    else
      _method_id := null;
      _fee := 0;
      _net := _charged;
    end if;

    insert into public.financial_entries(
      room_reservation_id,patient_name_snapshot,professional_name_snapshot,service_name_snapshot,
      occurred_at,original_amount,discount_type,discount_value,discount_amount,charged_amount,
      card_fee_amount,net_amount,payment_method_id,installments,cost_center_id,status,received_at,
      source,created_by,notes
    ) values (
      new.id,new.renter_name,'Locação de sala','Reserva de sala — '||_room_name,
      new.created_at,_original,new.discount_type,coalesce(new.discount_value,0),_discount_amount,_charged,
      _fee,_net,_method_id,new.installments,_center_id,
      case when new.payment_received or _charged=0 then 'received' else 'pending' end,
      case when new.payment_received or _charged=0 then new.created_at else null end,
      'room_reservation',new.created_by,'Gerado automaticamente a partir da reserva de sala.'
    )
    on conflict (room_reservation_id) where room_reservation_id is not null do nothing
    returning * into _entry;

    if _entry.id is null then
      select * into _entry from public.financial_entries fe where fe.room_reservation_id=new.id limit 1;
    end if;

    if new.payment_received and _charged > 0 and _entry.id is not null then
      insert into public.cash_movements(
        cash_session_id,movement_type,payment_method_id,financial_entry_id,amount,description,occurred_at,created_by
      ) values (
        _session_id,'income',_method_id,_entry.id,_charged,'Reserva de sala recebida',new.created_at,new.created_by
      )
      on conflict (financial_entry_id) where financial_entry_id is not null do nothing;
    elsif not new.payment_received and _charged > 0 then
      insert into public.accounts_receivable(
        room_reservation_id,client_name_snapshot,service_name_snapshot,original_amount,amount_received,
        due_date,status,installments,created_by,notes
      ) values (
        new.id,new.renter_name,'Reserva de sala — '||_room_name,_charged,0,
        coalesce(new.receivable_due_date,new.reservation_date),'pending',new.installments,new.created_by,
        'Gerado automaticamente a partir da reserva de sala.'
      )
      on conflict (room_reservation_id) where room_reservation_id is not null do nothing;
    end if;

    return new;
  end if;

  if tg_op='UPDATE' and old.status='active' and new.status='cancelled' then
    select * into _entry
      from public.financial_entries fe
      where fe.room_reservation_id=new.id
      limit 1
      for update;

    if found then
      if _entry.status='received' then
        update public.financial_entries
          set status='refunded', updated_at=now(), notes=concat_ws(' ',notes,'Reserva cancelada; lançamento estornado.')
          where id=_entry.id;
      elsif _entry.status='pending' then
        update public.financial_entries
          set status='cancelled', updated_at=now(), notes=concat_ws(' ',notes,'Reserva cancelada.')
          where id=_entry.id;
      end if;
    end if;

    update public.accounts_receivable
      set status='cancelled', updated_at=now(), notes=concat_ws(' ',notes,'Reserva cancelada.')
      where room_reservation_id=new.id and status='pending';

    return new;
  end if;

  return new;
end;
$function$;

drop trigger if exists room_reservations_finance_sync on public.room_reservations;
create trigger room_reservations_finance_sync
after insert or update of status on public.room_reservations
for each row execute function public.sync_room_reservation_finance();

create or replace function public.receive_account_receivable(
  _receivable_id uuid,
  _payment_method_code text,
  _received_at timestamptz default now()
)
returns public.accounts_receivable
language plpgsql
security definer
set search_path to ''
as $function$
declare
  _ar public.accounts_receivable%rowtype;
  _entry public.financial_entries%rowtype;
  _method_id uuid;
  _fee numeric:=0;
  _net numeric:=0;
  _session_id uuid;
  _commission public.professional_commissions%rowtype;
  _calc record;
  _entry_found boolean:=false;
begin
  if not public.finance_has_role(array['admin','finance','reception']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _ar from public.accounts_receivable ar where ar.id=_receivable_id for update;
  if not found then raise exception 'Conta a receber não encontrada.'; end if;
  if _ar.status<>'pending' then raise exception 'A conta a receber já foi processada.'; end if;

  select pm.id into _method_id from public.payment_methods pm
    where pm.code=_payment_method_code and pm.is_active=true limit 1;
  if _method_id is null then raise exception 'Forma de pagamento inválida.'; end if;

  if _ar.appointment_id is not null then
    select * into _entry from public.financial_entries fe
      where fe.appointment_id=_ar.appointment_id and fe.status<>'cancelled'
      order by fe.created_at desc limit 1 for update;
    _entry_found := found;
  elsif _ar.room_reservation_id is not null then
    select * into _entry from public.financial_entries fe
      where fe.room_reservation_id=_ar.room_reservation_id and fe.status<>'cancelled'
      order by fe.created_at desc limit 1 for update;
    _entry_found := found;
  end if;

  if _entry_found then
    _fee:=coalesce(public.calculate_payment_fee(_method_id,_entry.charged_amount,_entry.installments,(_received_at at time zone 'America/Fortaleza')::date),0);
    if _fee>_entry.charged_amount then raise exception 'Taxa maior que o valor recebido.'; end if;
    _net:=round(_entry.charged_amount-_fee,2);

    update public.financial_entries
      set payment_method_id=_method_id,card_fee_amount=_fee,net_amount=_net,status='received',received_at=_received_at,updated_at=now()
      where id=_entry.id returning * into _entry;

    select * into _commission from public.professional_commissions pc
      where pc.financial_entry_id=_entry.id limit 1 for update;
    if found then
      if _commission.is_manual_override then
        if _commission.commission_amount>_net then raise exception 'A comissão manual é maior que o valor líquido recebido.'; end if;
        update public.professional_commissions
          set clinic_amount=round(_net-commission_amount,2),updated_at=now()
          where id=_commission.id;
      elsif _entry.professional_id is not null then
        select * into _calc from public.calculate_professional_commission(
          _entry.professional_id,_entry.original_amount,_entry.charged_amount,_net,
          (_entry.occurred_at at time zone 'America/Fortaleza')::date
        ) limit 1;
        if found then
          if _calc.commission_amount>_net then raise exception 'Comissão calculada maior que o valor líquido recebido.'; end if;
          update public.professional_commissions
            set commission_type=_calc.commission_type,calculation_base=_calc.calculation_base,
                base_amount=_calc.base_amount,percentage=_calc.percentage,fixed_amount=_calc.fixed_amount,
                commission_amount=_calc.commission_amount,clinic_amount=round(_net-_calc.commission_amount,2),updated_at=now()
            where id=_commission.id;
        else
          update public.professional_commissions set commission_amount=0,clinic_amount=_net,updated_at=now()
            where id=_commission.id;
        end if;
      end if;
    end if;

    select cs.id into _session_id from public.cash_sessions cs
      where cs.business_date=(_received_at at time zone 'America/Fortaleza')::date and cs.status='open'
      order by cs.opened_at desc limit 1;
    if _session_id is not null then
      insert into public.cash_movements(
        cash_session_id,movement_type,payment_method_id,financial_entry_id,amount,description,occurred_at,created_by
      ) values (
        _session_id,'income',_method_id,_entry.id,_entry.charged_amount,'Recebimento de conta a receber',_received_at,auth.uid()
      ) on conflict(financial_entry_id) where financial_entry_id is not null do nothing;
    end if;
  else
    _fee:=coalesce(public.calculate_payment_fee(_method_id,_ar.original_amount,_ar.installments,(_received_at at time zone 'America/Fortaleza')::date),0);
    _net:=round(_ar.original_amount-_fee,2);
    insert into public.financial_entries(
      appointment_id,room_reservation_id,client_id,service_id,patient_name_snapshot,professional_name_snapshot,
      service_name_snapshot,occurred_at,original_amount,discount_amount,charged_amount,card_fee_amount,net_amount,
      payment_method_id,installments,status,received_at,source,created_by,notes
    ) values (
      _ar.appointment_id,_ar.room_reservation_id,_ar.client_id,_ar.service_id,_ar.client_name_snapshot,
      case when _ar.room_reservation_id is not null then 'Locação de sala' else null end,
      _ar.service_name_snapshot,_received_at,_ar.original_amount,0,_ar.original_amount,_fee,_net,
      _method_id,_ar.installments,'received',_received_at,
      case when _ar.room_reservation_id is not null then 'room_reservation' else 'accounts_receivable' end,
      auth.uid(),'Recebimento de conta a receber.'
    ) returning * into _entry;
  end if;

  update public.accounts_receivable
    set amount_received=original_amount,status='paid',payment_method_id=_method_id,paid_at=_received_at,updated_at=now()
    where id=_ar.id returning * into _ar;

  if _ar.room_reservation_id is not null then
    update public.room_reservations
      set payment_received=true,payment_method_code=_payment_method_code,updated_at=now()
      where id=_ar.room_reservation_id;
  end if;

  insert into public.financial_audit_log(entity_type,entity_id,action,actor_id,new_data,metadata)
    values('accounts_receivable',_ar.id,'pay',auth.uid(),to_jsonb(_ar),jsonb_build_object('payment_method_code',_payment_method_code));
  return _ar;
end;
$function$;

-- Backfill de atendimentos que já estavam marcados como atendidos antes da integração financeira.
alter table public.financial_entries disable trigger financial_entries_require_open_cash;

do $backfill$
declare
  a record;
  e public.financial_entries%rowtype;
  _method_id uuid;
  _original numeric;
  _discount numeric;
  _charged numeric;
  _fee numeric;
  _net numeric;
  _calc record;
  _commission_amount numeric;
  _commission_type text;
  _commission_base text;
  _commission_percentage numeric;
  _commission_fixed numeric;
  _happened_at timestamptz;
begin
  for a in
    select ap.*, s.name as service_name, s.price as current_service_price, p.name as professional_name
    from public.appointments ap
    join public.services s on s.id=ap.service_id
    left join public.professionals p on p.id=ap.professional_id
    where ap.status='atendido'
      and not exists (
        select 1 from public.financial_entries fe
        where fe.appointment_id=ap.id and fe.status<>'cancelled'
      )
  loop
    _happened_at := coalesce(a.attended_at,a.status_updated_at,a.created_at,now());
    _original := round(coalesce(a.custom_price,a.service_price_snapshot,a.current_service_price,0),2);
    if a.discount_type='percent' then
      _discount := round(_original*coalesce(a.discount_value,0)/100.0,2);
    elsif a.discount_type='amount' then
      _discount := round(coalesce(a.discount_value,0),2);
    else
      _discount := 0;
    end if;
    _discount := greatest(0,least(_discount,_original));
    _charged := round(_original-_discount,2);
    _method_id := null;
    _fee := 0;
    if coalesce(a.payment_received,false) and _charged>0 then
      select pm.id into _method_id from public.payment_methods pm
        where pm.code=coalesce(a.payment_method_code,'pix') and pm.is_active=true limit 1;
      if _method_id is not null then
        _fee := coalesce(public.calculate_payment_fee(_method_id,_charged,coalesce(a.installments,1),(_happened_at at time zone 'America/Fortaleza')::date),0);
      end if;
    end if;
    _net := round(_charged-_fee,2);

    insert into public.financial_entries(
      appointment_id,client_id,professional_id,service_id,patient_name_snapshot,professional_name_snapshot,
      service_name_snapshot,occurred_at,original_amount,discount_type,discount_value,discount_amount,charged_amount,
      card_fee_amount,net_amount,payment_method_id,installments,status,received_at,source,created_by,notes
    ) values (
      a.id,a.client_id,a.professional_id,a.service_id,a.patient_name,a.professional_name,a.service_name,
      _happened_at,_original,a.discount_type,coalesce(a.discount_value,0),_discount,_charged,_fee,_net,_method_id,
      coalesce(a.installments,1),case when coalesce(a.payment_received,false) then 'received' else 'pending' end,
      case when coalesce(a.payment_received,false) then _happened_at else null end,'appointment',null,
      'Backfill automático de atendimento concluído antes da integração financeira.'
    ) on conflict do nothing returning * into e;

    if e.id is not null and a.professional_id is not null then
      _commission_amount := 0;
      _commission_type := 'manual';
      _commission_base := 'manual';
      _commission_percentage := null;
      _commission_fixed := null;
      select * into _calc from public.calculate_professional_commission(
        a.professional_id,_original,_charged,_net,(_happened_at at time zone 'America/Fortaleza')::date
      ) limit 1;
      if found then
        _commission_amount := coalesce(_calc.commission_amount,0);
        _commission_type := _calc.commission_type;
        _commission_base := _calc.calculation_base;
        _commission_percentage := _calc.percentage;
        _commission_fixed := _calc.fixed_amount;
      end if;
      insert into public.professional_commissions(
        financial_entry_id,professional_id,commission_type,calculation_base,base_amount,percentage,fixed_amount,
        commission_amount,clinic_amount,is_manual_override,created_by
      ) values (
        e.id,a.professional_id,_commission_type,_commission_base,
        case _commission_base when 'original' then _original when 'after_discount' then _charged else _net end,
        _commission_percentage,_commission_fixed,_commission_amount,round(_net-_commission_amount,2),false,null
      ) on conflict do nothing;
    end if;
  end loop;
end;
$backfill$;

alter table public.financial_entries enable trigger financial_entries_require_open_cash;

-- Reservas antigas ativas com valor passam a nascer como contas a receber, sem presumir pagamento.
insert into public.financial_entries(
  room_reservation_id,patient_name_snapshot,professional_name_snapshot,service_name_snapshot,occurred_at,
  original_amount,discount_amount,charged_amount,card_fee_amount,net_amount,installments,cost_center_id,status,
  source,created_by,notes
)
select rr.id,rr.renter_name,'Locação de sala','Reserva de sala — '||coalesce(r.name,'Sala'),rr.created_at,
       round(rr.amount,2),0,round(rr.amount,2),0,round(rr.amount,2),coalesce(rr.installments,1),cc.id,'pending',
       'room_reservation',rr.created_by,'Reserva ativa existente integrada automaticamente ao financeiro.'
from public.room_reservations rr
join public.rooms r on r.id=rr.room_id
left join public.cost_centers cc on cc.code='outros' and cc.is_active=true
where rr.status='active' and coalesce(rr.amount,0)>0
  and not exists(select 1 from public.financial_entries fe where fe.room_reservation_id=rr.id)
on conflict do nothing;

insert into public.accounts_receivable(
  room_reservation_id,client_name_snapshot,service_name_snapshot,original_amount,amount_received,due_date,
  status,installments,created_by,notes
)
select rr.id,rr.renter_name,'Reserva de sala — '||coalesce(r.name,'Sala'),round(rr.amount,2),0,
       coalesce(rr.receivable_due_date,rr.reservation_date),'pending',coalesce(rr.installments,1),rr.created_by,
       'Reserva ativa existente integrada automaticamente ao financeiro.'
from public.room_reservations rr
join public.rooms r on r.id=rr.room_id
where rr.status='active' and coalesce(rr.amount,0)>0
  and not exists(select 1 from public.accounts_receivable ar where ar.room_reservation_id=rr.id)
on conflict do nothing;
