-- STAGING ONLY: admin/professional operational RPCs.
create or replace function public.delete_professional_agenda(_professional_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not public.is_current_user_admin() then raise exception 'Apenas administradores gerais podem excluir agendas.' using errcode='42501'; end if;
 if not exists(select 1 from public.professionals where id=_professional_id and deleted_at is null) then raise exception 'Agenda não encontrada.' using errcode='P0002'; end if;
 delete from public.professional_access where professional_id=_professional_id;
 delete from public.service_professionals where professional_id=_professional_id;
 update public.professionals set is_active=false,deleted_at=now() where id=_professional_id;
end;
$$;
revoke all on function public.delete_professional_agenda(uuid) from public,anon;
grant execute on function public.delete_professional_agenda(uuid) to authenticated;

create or replace function public.set_my_professional_avatar(_avatar_url text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_uid uuid:=auth.uid();
begin
 if v_uid is null then raise exception 'Sessão inválida.' using errcode='42501'; end if;
 select professional_id into v_id from public.professional_access
 where enabled=true and lower(email)=lower(coalesce(auth.jwt()->>'email','')) limit 1;
 if v_id is null then raise exception 'Acesso profissional não encontrado.' using errcode='42501'; end if;
 if _avatar_url is null or position('/storage/v1/object/public/avatars/'||v_uid::text||'/' in _avatar_url)=0 then raise exception 'URL de foto inválida.' using errcode='23514'; end if;
 update public.professionals set avatar_url=_avatar_url where id=v_id;
end;
$$;
revoke all on function public.set_my_professional_avatar(text) from public,anon;
grant execute on function public.set_my_professional_avatar(text) to authenticated;

create or replace function public.update_appointment_custom_price(_appointment_id uuid,_new_price numeric)
returns numeric language plpgsql security definer set search_path=''
as $$
declare v_prof uuid; v_choice text; v_price numeric;
begin
 if auth.uid() is null then raise exception 'Sessão inválida.' using errcode='42501'; end if;
 if _new_price is null or _new_price<0 then raise exception 'Informe um valor válido para o atendimento.' using errcode='23514'; end if;
 select professional_id,payment_choice into v_prof,v_choice from public.appointments where id=_appointment_id;
 if not found then raise exception 'Agendamento não encontrado.' using errcode='P0002'; end if;
 if not public.is_current_user_admin() and (v_prof is null or not private.staff_can_manage_professional(v_prof)) then raise exception 'Você não tem permissão para alterar o valor deste atendimento.' using errcode='42501'; end if;
 if v_choice<>'onsite' then raise exception 'O valor de um agendamento com pagamento online não pode ser alterado manualmente.' using errcode='23514'; end if;
 v_price:=round(_new_price,2);
 update public.appointments set service_price_snapshot=v_price,custom_price=v_price,deposit_percent=0,deposit_amount=0,balance_amount=v_price where id=_appointment_id;
 return v_price;
end;
$$;
revoke all on function public.update_appointment_custom_price(uuid,numeric) from public,anon;
grant execute on function public.update_appointment_custom_price(uuid,numeric) to authenticated;
