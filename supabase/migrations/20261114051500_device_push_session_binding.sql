-- Bind every device subscription to a live, verified Supabase Auth session.
alter table public.push_subscriptions add column if not exists session_id uuid
  references auth.sessions(id) on delete cascade;
alter table public.push_subscriptions alter column session_id
  set default ((auth.jwt() ->> 'session_id')::uuid);
alter table public.push_subscriptions alter column session_id set not null;
drop policy if exists "Own authorized push subscriptions read" on public.push_subscriptions;
create policy "Own authorized push subscriptions read" on public.push_subscriptions
for select to authenticated using (
  user_id=auth.uid() and professional_id=private.current_push_professional_id()
  and session_id=(auth.jwt() ->> 'session_id')::uuid);
drop policy if exists "Own authorized push subscriptions insert" on public.push_subscriptions;
create policy "Own authorized push subscriptions insert" on public.push_subscriptions
for insert to authenticated with check (
  user_id=auth.uid() and professional_id=private.current_push_professional_id()
  and session_id=(auth.jwt() ->> 'session_id')::uuid);
drop policy if exists "Own authorized push subscriptions update" on public.push_subscriptions;
create policy "Own authorized push subscriptions update" on public.push_subscriptions
for update to authenticated using (
  user_id=auth.uid() and professional_id=private.current_push_professional_id()
  and session_id=(auth.jwt() ->> 'session_id')::uuid)
with check (
  user_id=auth.uid() and professional_id=private.current_push_professional_id()
  and session_id=(auth.jwt() ->> 'session_id')::uuid);
drop policy if exists "Own push subscriptions delete" on public.push_subscriptions;
create policy "Own push subscriptions delete" on public.push_subscriptions
for delete to authenticated using (
  user_id=auth.uid() and session_id=(auth.jwt() ->> 'session_id')::uuid);

CREATE OR REPLACE FUNCTION public.claim_push_deliveries_v2(_batch_size integer DEFAULT 20)
 RETURNS TABLE(delivery_id uuid, notification_id uuid, endpoint text, p256dh text, auth text, title text, body text, deep_link text, claim_token uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    join auth.sessions sess on sess.id=s.session_id and sess.user_id=s.user_id
      and (sess.not_after is null or sess.not_after > now())
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
$function$;

CREATE OR REPLACE FUNCTION private.queue_professional_push_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.push_deliveries(notification_id, subscription_id)
  select new.id, s.id
  from public.push_subscriptions s
  join auth.users u on u.id = s.user_id and u.email_confirmed_at is not null
  join auth.sessions sess on sess.id=s.session_id and sess.user_id=s.user_id
    and (sess.not_after is null or sess.not_after > now())
  join public.professional_access pa
    on pa.professional_id = s.professional_id and pa.enabled = true
   and lower(trim(pa.email)) = lower(trim(u.email))
  join public.professionals p
    on p.id = s.professional_id and p.is_active = true and p.deleted_at is null
  where s.professional_id = new.recipient_professional_id and s.is_active
  on conflict (notification_id,subscription_id) do nothing;
  return new;
end;
$function$;
