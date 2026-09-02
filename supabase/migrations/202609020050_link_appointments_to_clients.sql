alter table public.appointments
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists appointments_client_id_idx
  on public.appointments (client_id);

create or replace function private.link_appointment_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.client_id is null and new.user_id is not null then
    select c.id
      into new.client_id
    from public.clients c
    where c.auth_user_id = new.user_id
      and c.is_active = true
    limit 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists link_appointment_client on public.appointments;
create trigger link_appointment_client
before insert or update of user_id, client_id
on public.appointments
for each row execute function private.link_appointment_client();
