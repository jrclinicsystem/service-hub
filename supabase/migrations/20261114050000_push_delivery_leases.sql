-- JR Clinic Web Push queue reliability: leased attempts with owner tokens.
alter table public.push_deliveries add column if not exists claim_token uuid;
create or replace function public.claim_push_deliveries_v2(_batch_size integer default 20)
returns table(delivery_id uuid, notification_id uuid, endpoint text, p256dh text,
  auth text, title text, body text, deep_link text, claim_token uuid)
language plpgsql security invoker set search_path = ''
as $$
begin
  -- A crashed final attempt must not remain stuck in PROCESSING forever.
  update public.push_deliveries d
     set status='dead', locked_at=null, claim_token=null,
         last_error=coalesce(d.last_error,'Tentativas esgotadas após interrupção.'),
         completed_at=now()
   where d.attempts >= 5
     and (d.status in ('pending','failed')
       or (d.status='processing' and d.locked_at < now() - interval '10 minutes'));

  return query
  with eligible as (
    select d.id from public.push_deliveries d
    join public.push_subscriptions s on s.id=d.subscription_id and s.is_active
    join public.professional_notifications n on n.id=d.notification_id
      and n.recipient_professional_id=s.professional_id
    join public.professionals p on p.id=s.professional_id
      and p.is_active and p.deleted_at is null
    join auth.users u on u.id=s.user_id and u.email_confirmed_at is not null
    where d.attempts < 5
      and d.next_attempt_at <= now()
      and public.push_endpoint_allowed(s.endpoint)
      and (d.status in ('pending','failed')
        or (d.status='processing' and d.locked_at < now() - interval '10 minutes'))
      and exists(
        select 1 from public.professional_access pa
        where pa.professional_id=s.professional_id and pa.enabled
          and lower(trim(pa.email))=lower(trim(u.email))
      )
    order by d.created_at
    limit least(greatest(_batch_size,1),50)
    for update of d skip locked
  ), claimed as (
    update public.push_deliveries d
       set status='processing', attempts=d.attempts+1,
           locked_at=now(), claim_token=gen_random_uuid()
      from eligible e where d.id=e.id returning d.*
  )
  select c.id,c.notification_id,s.endpoint,s.p256dh,s.auth,
         n.title,n.body,n.deep_link,c.claim_token
  from claimed c
  join public.push_subscriptions s on s.id=c.subscription_id
  join public.professional_notifications n on n.id=c.notification_id;
end;
$$;
revoke all on function public.claim_push_deliveries_v2(integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries_v2(integer) to service_role;

create or replace function public.complete_push_delivery_v2(
  _delivery_id uuid, _claim_token uuid, _outcome text,
  _error text default null, _gone boolean default false)
returns void language plpgsql security invoker set search_path = ''
as $$
declare _subscription_id uuid;
begin
  if _outcome not in ('sent','failed') or _claim_token is null
    then raise exception 'Invalid delivery outcome or claim' using errcode='22023';
  end if;
  update public.push_deliveries d
     set status=case
       when _outcome='sent' then 'sent'
       when _gone or d.attempts>=5 then 'dead'
       else 'failed' end,
         last_error=left(_error,1000),
         next_attempt_at=now()+make_interval(secs=>
           least(3600,30 * power(2,greatest(d.attempts-1,0)))::integer),
         completed_at=case when _outcome='sent' or _gone or d.attempts>=5
                             then now() else null end,
         locked_at=null, claim_token=null
   where d.id=_delivery_id and d.status='processing'
     and d.claim_token=_claim_token
  returning subscription_id into _subscription_id;
  if not found then
    raise exception 'Delivery claim expired or already completed' using errcode='40001';
  end if;
  if _gone then
    update public.push_subscriptions set is_active=false, updated_at=now()
    where id=_subscription_id;
  end if;
end;
$$;
revoke all on function public.complete_push_delivery_v2(uuid,uuid,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.complete_push_delivery_v2(uuid,uuid,text,text,boolean)
  to service_role;

-- Disable legacy functions to enforce lease verification for every send.
revoke execute on function public.claim_push_deliveries(integer) from service_role;
revoke execute on function public.complete_push_delivery(uuid,text,text,boolean) from service_role;
