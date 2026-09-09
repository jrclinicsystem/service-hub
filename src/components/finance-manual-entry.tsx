/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function fortalezaIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

async function loadManualEntryData() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada.");

  const [access, methods] = await Promise.all([
    db.from("financial_access").select("role").eq("user_id", data.user.id).eq("is_active", true),
    db.from("payment_methods").select("id,code,name").eq("is_active", true).order("sort_order"),
  ]);
  if (access.error) throw access.error;
  if (methods.error) throw methods.error;

  const roles = (access.data ?? []).map((row: any) => String(row.role));
  return {
    allowed: roles.some((role: string) => ["admin", "finance", "reception"].includes(role)),
    methods: methods.data ?? [],
  };
}

export function FinanceManualEntry() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["finance-manual-entry-data"], queryFn: loadManualEntryData });
  const [date, setDate] = useState(fortalezaIso());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [installments, setInstallments] = useState("1");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!method && query.data?.methods?.length) setMethod(query.data.methods[0].code);
  }, [method, query.data?.methods]);

  if (!query.data?.allowed) return null;

  const save = async () => {
    const value = parseMoney(amount);
    const parcelCount = Number(installments);
    if (!description.trim()) return toast.error("Informe a descrição da entrada.");
    if (!Number.isFinite(value) || value <= 0) return toast.error("Informe um valor maior que zero.");
    if (!method) return toast.error("Selecione a forma de pagamento.");
    if (!Number.isInteger(parcelCount) || parcelCount < 1 || parcelCount > 12)
      return toast.error("Parcelas devem ficar entre 1 e 12.");

    setBusy(true);
    try {
      const result = await db.rpc("register_manual_financial_entry", {
        _description: description.trim(),
        _amount: value,
        _payment_method_code: method,
        _installments: parcelCount,
        _occurred_at: `${date}T12:00:00-03:00`,
        _notes: notes.trim() || null,
      });
      if (result.error) throw result.error;
      toast.success("Entrada manual registrada.", {
        description: "Ela entra nos relatórios e não gera comissão para nenhuma profissional.",
      });
      setDescription("");
      setAmount("");
      setNotes("");
      setInstallments("1");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finance-full-v2"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-report"] }),
        queryClient.invalidateQueries({ queryKey: ["finance-completion-lookups"] }),
      ]);
    } catch (error: any) {
      toast.error("Não foi possível registrar a entrada.", { description: error?.message });
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <section className="finance-manual-entry hidden mx-auto w-full max-w-[1540px] px-5 pb-5 sm:px-8 lg:px-10">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <PlusCircle className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Adicionar entrada manual</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Registre receitas avulsas sem atendimento ou profissional. Entram nos relatórios, mas não geram comissão.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="xl:col-span-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: venda de produto" />
          </div>
          <div>
            <Label>Valor</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200,00" />
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
              {(query.data?.methods ?? []).map((row: any) => (
                <option key={row.id} value={row.code}>{row.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Parcelas</Label>
            <Input type="number" min="1" max="12" value={installments} onChange={(e) => setInstallments(e.target.value)} />
          </div>
          <div className="md:col-span-2 xl:col-span-5">
            <Label>Observação (opcional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhes adicionais" />
          </div>
          <div className="flex items-end">
            <Button className="w-full" disabled={busy} onClick={() => void save()}>
              {busy ? "Registrando..." : "Adicionar entrada"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
