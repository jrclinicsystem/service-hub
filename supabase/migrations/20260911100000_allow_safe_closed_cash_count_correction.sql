create or replace function public.finance_guard_closed_cash_session()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if old.status = 'closed' then
    if tg_op = 'DELETE' then
      raise exception 'Caixa fechado não pode ser alterado ou excluído diretamente.';
    end if;

    if tg_op = 'UPDATE' then
      if new.status <> 'closed' then
        raise exception 'Caixa fechado não pode ser reaberto ou alterado diretamente.';
      end if;

      if not public.finance_has_role(array['admin','finance','reception']) then
        raise exception 'Acesso insuficiente para corrigir o fechamento do caixa.' using errcode = '42501';
      end if;

      if (to_jsonb(new) - array['counted_cash','difference_amount','updated_at']::text[])
         is distinct from
         (to_jsonb(old) - array['counted_cash','difference_amount','updated_at']::text[]) then
        raise exception 'Caixa fechado só pode ter a contagem e a diferença corrigidas pelo fluxo de correção.';
      end if;

      return new;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;
