from pathlib import Path

path = Path("src/components/finance-staging-workspace.tsx")
text = path.read_text()

def replace_panel(source: str, start_marker: str, replacement: str) -> str:
    start = source.index(start_marker)
    end_marker = "\n            </Panel>"
    end = source.index(end_marker, start) + len(end_marker)
    return source[:start] + replacement.rstrip("\n") + source[end:]

state_needle = '  const [editingRuleId, setEditingRuleId] = useState("");\n'
if state_needle not in text:
    raise SystemExit("editingRuleId state not found")
if 'const [editingFeeId' not in text:
    text = text.replace(
        state_needle,
        state_needle + '''  const [editingFeeId, setEditingFeeId] = useState("");
  const [editingPayableId, setEditingPayableId] = useState("");
  const [payableEdit, setPayableEdit] = useState({ amount: "", due: "" });
  const [editingReceivableId, setEditingReceivableId] = useState("");
  const [receivableEdit, setReceivableEdit] = useState({ amount: "", due: "" });
''',
        1,
    )

helper_anchor = text.index("\n  if (loading)", text.index("  const editCommissionRule"))
if "const resetFeeEditor" not in text:
    helpers = r'''
  const resetFeeEditor = () => {
    setEditingFeeId("");
    setFee({
      method: "credit",
      percent: "",
      fixed: "0",
      min: "1",
      max: "1",
      effective: fortalezaIso(),
    });
  };

  const editPaymentFee = (currentFee: any) => {
    const currentMethod = methods.find((method: any) => method.id === currentFee.payment_method_id);
    const today = fortalezaIso();
    setEditingFeeId(String(currentFee.id));
    setFee({
      method: currentMethod?.code ?? "credit",
      percent: String(currentFee.fee_percent ?? ""),
      fixed: String(currentFee.fixed_fee ?? "0"),
      min: String(currentFee.installments_min ?? "1"),
      max: String(currentFee.installments_max ?? "1"),
      effective:
        currentFee.effective_from && currentFee.effective_from > today
          ? currentFee.effective_from
          : today,
    });
  };

  const editPendingPayable = (currentPayable: any) => {
    setEditingPayableId(String(currentPayable.id));
    setPayableEdit({
      amount: String(currentPayable.amount ?? ""),
      due: currentPayable.due_date ?? "",
    });
  };

  const resetPayableEditor = () => {
    setEditingPayableId("");
    setPayableEdit({ amount: "", due: "" });
  };

  const editPendingReceivable = (currentReceivable: any) => {
    setEditingReceivableId(String(currentReceivable.id));
    setReceivableEdit({
      amount: String(currentReceivable.original_amount ?? ""),
      due: currentReceivable.due_date ?? "",
    });
  };

  const resetReceivableEditor = () => {
    setEditingReceivableId("");
    setReceivableEdit({ amount: "", due: "" });
  };
'''
    text = text[:helper_anchor] + helpers + text[helper_anchor:]

tax_panel = r'''            <Panel
              title="Taxas das formas de pagamento"
              subtitle="A porcentagem cadastrada é a taxa total aplicada à transação nessa quantidade/faixa de parcelas; não é uma cobrança mensal repetida a cada parcela."
            >
              {editingFeeId ? (
                <div className="mb-4 rounded-2xl border border-primary/15 bg-primary-soft/50 px-4 py-3 text-xs text-primary">
                  Editando uma taxa. A nova configuração valerá a partir da data escolhida e o
                  histórico financeiro já calculado será preservado.
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className={selectClass}
                  value={fee.method}
                  onChange={(e) => setFee({ ...fee, method: e.target.value })}
                >
                  {methods
                    .filter((m: any) => m.code !== "pix" && (m.is_card || m.code === "pix_machine"))
                    .map((m: any) => (
                      <option key={m.id} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                </select>
                <Input
                  placeholder="Taxa total %"
                  value={fee.percent}
                  onChange={(e) => setFee({ ...fee, percent: e.target.value })}
                />
                <Input
                  placeholder="Taxa fixa"
                  value={fee.fixed}
                  onChange={(e) => setFee({ ...fee, fixed: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Parcela mínima (1 a 12)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="12"
                      value={fee.min}
                      onChange={(e) => setFee({ ...fee, min: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Parcela máxima (1 a 12)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="12"
                      value={fee.max}
                      onChange={(e) => setFee({ ...fee, max: e.target.value })}
                    />
                  </div>
                </div>
                <Input
                  type="date"
                  value={fee.effective}
                  onChange={(e) => setFee({ ...fee, effective: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={busy === "fee"}
                    onClick={() =>
                      run(
                        "fee",
                        async () => {
                          const percent = parseMoney(fee.percent);
                          const fixed = parseMoney(fee.fixed);
                          if (
                            !Number.isFinite(percent) ||
                            percent < 0 ||
                            !Number.isFinite(fixed) ||
                            fixed < 0
                          )
                            throw new Error("Taxas inválidas.");
                          const min = Number(fee.min);
                          const max = Number(fee.max);
                          if (!Number.isInteger(min) || min < 1 || min > 12)
                            throw new Error("Parcela mínima deve ficar entre 1 e 12.");
                          if (!Number.isInteger(max) || max < 1 || max > 12)
                            throw new Error("Parcela máxima deve ficar entre 1 e 12.");
                          if (max < min)
                            throw new Error(
                              "Parcela máxima deve ser maior ou igual à parcela mínima.",
                            );
                          const result = await db.rpc("set_payment_method_fee", {
                            _payment_method_code: fee.method,
                            _fee_percent: percent,
                            _fixed_fee: fixed,
                            _installments_min: min,
                            _installments_max: max,
                            _effective_from: fee.effective,
                          });
                          if (result.error) throw result.error;
                          resetFeeEditor();
                        },
                        editingFeeId ? "Taxa atualizada." : "Taxa configurada.",
                      )
                    }
                  >
                    {editingFeeId ? "Atualizar taxa" : "Salvar taxa"}
                  </Button>
                  {editingFeeId ? (
                    <Button variant="outline" disabled={busy === "fee"} onClick={resetFeeEditor}>
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {(data.fees ?? [])
                  .filter(
                    (f: any) =>
                      f.is_active && (!f.effective_to || f.effective_to >= fortalezaIso()),
                  )
                  .map((f: any) => (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-xs"
                    >
                      <div>
                        <div>
                          {methodMap.get(f.payment_method_id) || "Pagamento"} · taxa total{" "}
                          {Number(f.fee_percent)}%
                          {Number(f.fixed_fee) > 0 ? ` + ${money(f.fixed_fee)}` : ""} ·{" "}
                          {Number(f.installments_min) === Number(f.installments_max)
                            ? `${f.installments_min}x`
                            : `${f.installments_min}x a ${f.installments_max}x`}{" "}
                          · desde {formatDate(f.effective_from)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Percentual aplicado uma única vez sobre o valor da transação.
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => editPaymentFee(f)}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          disabled={busy === `fee-disable-${f.id}`}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Excluir esta taxa da configuração atual? O histórico financeiro já calculado será preservado.",
                              )
                            )
                              return;
                            run(
                              `fee-disable-${f.id}`,
                              async () => {
                                const result = await db.rpc("deactivate_payment_method_fee", {
                                  _fee_id: f.id,
                                });
                                if (result.error) throw result.error;
                                if (editingFeeId === String(f.id)) resetFeeEditor();
                              },
                              "Taxa removida da configuração atual.",
                            );
                          }}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </Panel>'''

payable_panel = r'''            <Panel
              title="Contas a pagar"
              subtitle="Valor e vencimento podem ser editados enquanto a conta estiver pendente."
            >
              <select
                className={`${selectClass} mb-3`}
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                {methods.map((m: any) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                {(data.payables ?? []).map((row: any) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <strong className="text-sm">{row.title}</strong>
                      <p className="text-xs text-muted-foreground">
                        Vence {formatDate(row.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong>{money(row.amount)}</strong>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `pay-${row.id}`}
                              onClick={() => editPendingPayable(row)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `pay-${row.id}`}
                              onClick={() =>
                                run(
                                  `pay-${row.id}`,
                                  async () => {
                                    const result = await db.rpc("pay_account_payable", {
                                      _account_id: row.id,
                                      _payment_method_code: payMethod,
                                      _paid_at: new Date().toISOString(),
                                    });
                                    if (result.error) throw result.error;
                                    if (editingPayableId === String(row.id)) resetPayableEditor();
                                  },
                                  "Conta paga.",
                                )
                              }
                            >
                              Pagar
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {editingPayableId === String(row.id) ? (
                      <div className="grid w-full gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <div>
                          <Label className="text-xs">Valor</Label>
                          <Input
                            value={payableEdit.amount}
                            onChange={(e) =>
                              setPayableEdit({ ...payableEdit, amount: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Vencimento</Label>
                          <Input
                            type="date"
                            value={payableEdit.due}
                            onChange={(e) => setPayableEdit({ ...payableEdit, due: e.target.value })}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy === `edit-payable-${row.id}`}
                            onClick={() =>
                              run(
                                `edit-payable-${row.id}`,
                                async () => {
                                  const value = parseMoney(payableEdit.amount);
                                  if (!Number.isFinite(value) || value <= 0)
                                    throw new Error("Informe um valor maior que zero.");
                                  if (!payableEdit.due)
                                    throw new Error("Informe a data de vencimento.");
                                  const result = await db.rpc("update_pending_account_payable", {
                                    _account_id: row.id,
                                    _amount: value,
                                    _due_date: payableEdit.due,
                                  });
                                  if (result.error) throw result.error;
                                  resetPayableEditor();
                                },
                                "Conta atualizada.",
                              )
                            }
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={resetPayableEditor}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>'''

receivable_panel = r'''            <Panel
              title="Contas a receber / fiado"
              subtitle="Valor e vencimento podem ser editados enquanto a conta estiver pendente e ainda não tiver recebido pagamento."
            >
              <select
                className={`${selectClass} mb-3`}
                value={receiveMethod}
                onChange={(e) => setReceiveMethod(e.target.value)}
              >
                {methods.map((m: any) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className="space-y-2">
                {(data.receivables ?? []).map((row: any) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <strong className="text-sm">{row.client_name_snapshot}</strong>
                      <p className="text-xs text-muted-foreground">
                        {row.service_name_snapshot || "Valor a receber"} · vence{" "}
                        {formatDate(row.due_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong>
                        {money(Number(row.original_amount) - Number(row.amount_received))}
                      </strong>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <Badge variant={statusVariant(row.display_status)}>
                          {statusLabel(row.display_status)}
                        </Badge>
                        {row.status === "pending" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `receive-${row.id}`}
                              onClick={() => editPendingReceivable(row)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === `receive-${row.id}`}
                              onClick={() =>
                                run(
                                  `receive-${row.id}`,
                                  async () => {
                                    const result = await db.rpc("receive_account_receivable", {
                                      _receivable_id: row.id,
                                      _payment_method_code: receiveMethod,
                                      _received_at: new Date().toISOString(),
                                    });
                                    if (result.error) throw result.error;
                                    if (editingReceivableId === String(row.id))
                                      resetReceivableEditor();
                                  },
                                  "Recebimento registrado.",
                                )
                              }
                            >
                              Receber
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {editingReceivableId === String(row.id) ? (
                      <div className="grid w-full gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <div>
                          <Label className="text-xs">Valor total a receber</Label>
                          <Input
                            value={receivableEdit.amount}
                            onChange={(e) =>
                              setReceivableEdit({ ...receivableEdit, amount: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Vencimento</Label>
                          <Input
                            type="date"
                            value={receivableEdit.due}
                            onChange={(e) =>
                              setReceivableEdit({ ...receivableEdit, due: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy === `edit-receivable-${row.id}`}
                            onClick={() =>
                              run(
                                `edit-receivable-${row.id}`,
                                async () => {
                                  const value = parseMoney(receivableEdit.amount);
                                  if (!Number.isFinite(value) || value <= 0)
                                    throw new Error("Informe um valor maior que zero.");
                                  if (!receivableEdit.due)
                                    throw new Error("Informe a data de vencimento.");
                                  const result = await db.rpc(
                                    "update_pending_account_receivable",
                                    {
                                      _receivable_id: row.id,
                                      _original_amount: value,
                                      _due_date: receivableEdit.due,
                                    },
                                  );
                                  if (result.error) throw result.error;
                                  resetReceivableEditor();
                                },
                                "Conta a receber atualizada.",
                              )
                            }
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={resetReceivableEditor}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>'''

text = replace_panel(
    text,
    '            <Panel title="Taxas das formas de pagamento">',
    tax_panel,
)
text = replace_panel(
    text,
    '            <Panel title="Contas a pagar" subtitle="Escolha a forma e marque como paga.">',
    payable_panel,
)
text = replace_panel(
    text,
    '            <Panel\n              title="Contas a receber / fiado"',
    receivable_panel,
)

migration_path = Path("supabase/migrations/20260908133000_add_finance_edit_actions.sql")
migration_path.write_text('''create or replace function public.deactivate_payment_method_fee(_fee_id uuid)
returns public.payment_method_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.payment_method_fees%rowtype;
  _fee public.payment_method_fees%rowtype;
  _today date := (now() at time zone 'America/Fortaleza')::date;
begin
  if not public.finance_has_role(array['admin','finance']) then
    raise exception 'Acesso financeiro insuficiente.';
  end if;

  select * into _old from public.payment_method_fees where id = _fee_id for update;
  if not found then raise exception 'Taxa não encontrada.'; end if;

  if _old.effective_from < _today then
    update public.payment_method_fees
       set effective_to = _today - 1, updated_at = now()
     where id = _fee_id
     returning * into _fee;
  else
    update public.payment_method_fees
       set is_active = false, updated_at = now()
     where id = _fee_id
     returning * into _fee;
  end if;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values ('payment_method_fees', _fee.id, 'deactivate', auth.uid(), to_jsonb(_old), to_jsonb(_fee), jsonb_build_object('effective_stop', _today));
  return _fee;
end;
$$;

revoke all on function public.deactivate_payment_method_fee(uuid) from public;
grant execute on function public.deactivate_payment_method_fee(uuid) to authenticated;

create or replace function public.update_pending_account_payable(_account_id uuid, _amount numeric, _due_date date)
returns public.accounts_payable
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.accounts_payable%rowtype;
  _account public.accounts_payable%rowtype;
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _amount is null or _amount <= 0 then raise exception 'Valor inválido.'; end if;
  if _due_date is null then raise exception 'Data de vencimento obrigatória.'; end if;

  select * into _old from public.accounts_payable where id = _account_id for update;
  if not found then raise exception 'Conta a pagar não encontrada.'; end if;
  if _old.status <> 'pending' then raise exception 'Somente contas pendentes podem ser editadas.'; end if;

  update public.accounts_payable
     set amount = round(_amount, 2), due_date = _due_date, updated_at = now()
   where id = _account_id
   returning * into _account;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values ('accounts_payable', _account.id, 'edit_pending', auth.uid(), to_jsonb(_old), to_jsonb(_account), jsonb_build_object('fields', jsonb_build_array('amount','due_date')));
  return _account;
end;
$$;

revoke all on function public.update_pending_account_payable(uuid, numeric, date) from public;
grant execute on function public.update_pending_account_payable(uuid, numeric, date) to authenticated;

create or replace function public.update_pending_account_receivable(_receivable_id uuid, _original_amount numeric, _due_date date)
returns public.accounts_receivable
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old public.accounts_receivable%rowtype;
  _receivable public.accounts_receivable%rowtype;
  _entry public.financial_entries%rowtype;
  _commission public.professional_commissions%rowtype;
  _calc record;
  _entry_found boolean := false;
  _amount numeric := round(_original_amount, 2);
begin
  if not public.finance_has_role(array['admin','finance']) then raise exception 'Acesso financeiro insuficiente.'; end if;
  if _original_amount is null or _original_amount <= 0 then raise exception 'Valor inválido.'; end if;
  if _due_date is null then raise exception 'Data de vencimento obrigatória.'; end if;

  select * into _old from public.accounts_receivable where id = _receivable_id for update;
  if not found then raise exception 'Conta a receber não encontrada.'; end if;
  if _old.status <> 'pending' or coalesce(_old.amount_received, 0) <> 0 then
    raise exception 'Somente contas pendentes e ainda não recebidas podem ser editadas.';
  end if;

  if _old.appointment_id is not null then
    select * into _entry from public.financial_entries
     where appointment_id = _old.appointment_id and status = 'pending'
     order by created_at desc limit 1 for update;
    _entry_found := found;
  elsif _old.room_reservation_id is not null then
    select * into _entry from public.financial_entries
     where room_reservation_id = _old.room_reservation_id and status = 'pending'
     order by created_at desc limit 1 for update;
    _entry_found := found;
  end if;

  if _entry_found then
    update public.financial_entries
       set original_amount = _amount, discount_type = null, discount_value = 0,
           discount_amount = 0, charged_amount = _amount, card_fee_amount = 0,
           net_amount = _amount, updated_at = now()
     where id = _entry.id
     returning * into _entry;

    select * into _commission from public.professional_commissions
     where financial_entry_id = _entry.id limit 1 for update;

    if found then
      if _commission.is_manual_override then
        if _commission.commission_amount > _amount then
          raise exception 'A comissão manual é maior que o novo valor da conta.';
        end if;
        update public.professional_commissions
           set base_amount = _amount,
               clinic_amount = round(_amount - commission_amount, 2),
               updated_at = now()
         where id = _commission.id;
      elsif _entry.professional_id is not null then
        select * into _calc from public.calculate_professional_commission(
          _entry.professional_id, _amount, _amount, _amount,
          (_entry.occurred_at at time zone 'America/Fortaleza')::date
        ) limit 1;
        if found then
          if _calc.commission_amount > _amount then
            raise exception 'Comissão calculada maior que o novo valor da conta.';
          end if;
          update public.professional_commissions
             set commission_type = _calc.commission_type,
                 calculation_base = _calc.calculation_base,
                 base_amount = _calc.base_amount,
                 percentage = _calc.percentage,
                 fixed_amount = _calc.fixed_amount,
                 commission_amount = _calc.commission_amount,
                 clinic_amount = round(_amount - _calc.commission_amount, 2),
                 updated_at = now()
           where id = _commission.id;
        else
          update public.professional_commissions
             set base_amount = _amount, commission_amount = 0,
                 clinic_amount = _amount, updated_at = now()
           where id = _commission.id;
        end if;
      end if;
    end if;
  end if;

  if _old.appointment_id is not null then
    update public.appointments
       set custom_price = _amount, discount_type = null, discount_value = 0,
           receivable_due_date = _due_date
     where id = _old.appointment_id;
  end if;

  if _old.room_reservation_id is not null then
    update public.room_reservations
       set amount = _amount, discount_type = null, discount_value = 0, updated_at = now()
     where id = _old.room_reservation_id;
  end if;

  update public.accounts_receivable
     set original_amount = _amount, due_date = _due_date, updated_at = now()
   where id = _receivable_id
   returning * into _receivable;

  insert into public.financial_audit_log(entity_type, entity_id, action, actor_id, old_data, new_data, metadata)
  values ('accounts_receivable', _receivable.id, 'edit_pending', auth.uid(), to_jsonb(_old), to_jsonb(_receivable),
    jsonb_build_object('fields', jsonb_build_array('original_amount','due_date'), 'linked_financial_entry_id', case when _entry_found then _entry.id else null end));
  return _receivable;
end;
$$;

revoke all on function public.update_pending_account_receivable(uuid, numeric, date) from public;
grant execute on function public.update_pending_account_receivable(uuid, numeric, date) to authenticated;
''')

path.write_text(text)
