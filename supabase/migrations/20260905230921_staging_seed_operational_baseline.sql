-- STAGING ONLY: synthetic operational baseline for the existing synthetic services/professionals.
insert into public.service_professionals(service_id,professional_id)
select s.id,p.id
from public.services s cross join public.professionals p
where s.is_active=true and p.is_active=true and p.deleted_at is null
on conflict(service_id,professional_id) do nothing;

insert into public.professional_time_slots(professional_id,slot,is_available,sort_order)
select p.id,t.slot,t.is_available,t.sort_order
from public.professionals p cross join public.time_slots t
where p.is_active=true and p.deleted_at is null
on conflict(professional_id,slot) do nothing;

insert into public.professional_availability_periods(professional_id,weekday,period,is_available)
select p.id,d.weekday,per.period,true
from public.professionals p
cross join (values (1::smallint),(2::smallint),(3::smallint),(4::smallint),(5::smallint),(6::smallint)) d(weekday)
cross join (values ('morning'::text),('afternoon'::text),('evening'::text)) per(period)
where p.is_active=true and p.deleted_at is null
on conflict(professional_id,weekday,period) do nothing;

insert into public.professional_weekday_time_slots(professional_id,weekday,slot,is_available,sort_order)
select p.id,d.weekday,t.slot,t.is_available,t.sort_order
from public.professionals p
cross join (values (1::smallint),(2::smallint),(3::smallint),(4::smallint),(5::smallint),(6::smallint)) d(weekday)
cross join public.time_slots t
where p.is_active=true and p.deleted_at is null
on conflict(professional_id,weekday,slot) do nothing;
