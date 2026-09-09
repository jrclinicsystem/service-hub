from pathlib import Path

p = Path('src/components/finance-staging-workspace.tsx')
s = p.read_text()
old = '''      {activeTab === "overview" ? <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={TrendingUp}
          label="Faturamento do dia"
          value={money(metricMap.get("revenue_today"))}
        />
        <MetricCard
          icon={CircleDollarSign}
          label="Faturamento do período"
          value={money(metricMap.get("revenue"))}
        />
        <MetricCard icon={WalletCards} label="Recebido" value={money(metricMap.get("received"))} />
        <MetricCard
          icon={Landmark}
          label="Saldo disponível"
          value={money(metricMap.get("available_balance"))}
        />
        <MetricCard icon={TrendingDown} label="Despesas" value={money(metricMap.get("expenses"))} />
        <MetricCard
          icon={UsersRound}
          label="Comissões"
          value={money(metricMap.get("commissions"))}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Resultado da clínica"
          value={money(metricMap.get("clinic_result"))}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Contas atrasadas"
          value={money(metricMap.get("payable_overdue"))}
        />
      </section> : null}
'''
new = '''      {activeTab === "overview" ? (
        <section className="mt-8 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_.9fr_.9fr]">
            <div className="relative overflow-hidden rounded-[28px] border border-primary/15 bg-primary p-6 text-primary-foreground shadow-[0_18px_50px_-34px_rgba(6,78,62,.75)] sm:p-7">
              <div className="absolute -right-16 -top-16 size-48 rounded-full border border-white/10" />
              <div className="absolute -bottom-24 right-8 size-44 rounded-full bg-white/[0.04]" />
              <div className="relative flex h-full min-h-[178px] flex-col justify-between gap-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/65">Resultado do período</p>
                    <p className="mt-2 text-sm text-primary-foreground/72">Líquido recebido menos despesas registradas</p>
                  </div>
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                    <CheckCircle2 className="size-5" />
                  </span>
                </div>
                <div>
                  <strong className="block text-3xl font-semibold tracking-tight sm:text-4xl">{money(metricMap.get("clinic_result"))}</strong>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-primary-foreground/70">
                    <span>Recebido <strong className="ml-1 text-primary-foreground">{money(metricMap.get("received"))}</strong></span>
                    <span>Despesas <strong className="ml-1 text-primary-foreground">{money(metricMap.get("expenses"))}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-6 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Movimento</p>
                  <h3 className="mt-1 text-lg font-semibold">Receitas</h3>
                </div>
                <span className="grid size-10 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-700">
                  <TrendingUp className="size-4.5" />
                </span>
              </div>
              <div className="mt-6 space-y-4">
                <div><p className="text-xs text-muted-foreground">Hoje</p><strong className="mt-1 block text-2xl font-semibold">{money(metricMap.get("revenue_today"))}</strong></div>
                <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">Período selecionado</p><strong className="mt-1 block text-xl font-semibold">{money(metricMap.get("revenue"))}</strong></div>
              </div>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-6 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Disponibilidade</p>
                  <h3 className="mt-1 text-lg font-semibold">Caixa e saldo</h3>
                </div>
                <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Landmark className="size-4.5" />
                </span>
              </div>
              <div className="mt-6 space-y-4">
                <div><p className="text-xs text-muted-foreground">Saldo disponível</p><strong className="mt-1 block text-2xl font-semibold">{money(metricMap.get("available_balance"))}</strong></div>
                <div className="border-t border-border pt-4"><p className="text-xs text-muted-foreground">Comissões geradas</p><strong className="mt-1 block text-xl font-semibold">{money(metricMap.get("commissions"))}</strong></div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-[26px] border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contas</p><h3 className="mt-1 text-lg font-semibold">Compromissos da clínica</h3></div>
                <CalendarClock className="size-5 text-muted-foreground" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-muted/45 p-4"><p className="text-xs text-muted-foreground">A pagar</p><strong className="mt-1 block text-xl">{money(metricMap.get("payable_pending"))}</strong></div>
                <div className="rounded-2xl bg-muted/45 p-4"><p className="text-xs text-muted-foreground">A receber</p><strong className="mt-1 block text-xl">{money(metricMap.get("receivable_pending"))}</strong></div>
              </div>
            </div>

            <div className="rounded-[26px] border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Atenção</p><h3 className="mt-1 text-lg font-semibold">Pendências e atrasos</h3></div>
                <AlertTriangle className="size-5 text-amber-600" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-amber-500/[0.07] p-4"><p className="text-xs text-muted-foreground">A pagar atrasado</p><strong className="mt-1 block text-lg">{money(metricMap.get("payable_overdue"))}</strong></div>
                <div className="rounded-2xl bg-amber-500/[0.07] p-4"><p className="text-xs text-muted-foreground">A receber atrasado</p><strong className="mt-1 block text-lg">{money(metricMap.get("receivable_overdue"))}</strong></div>
                <div className="rounded-2xl bg-muted/45 p-4"><p className="text-xs text-muted-foreground">Total atrasado</p><strong className="mt-1 block text-lg">{money(Number(metricMap.get("payable_overdue") ?? 0) + Number(metricMap.get("receivable_overdue") ?? 0))}</strong></div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
'''
if old not in s:
    raise SystemExit('overview metrics block not found')
s = s.replace(old, new, 1)

old2 = '''        <TabsContent value="overview" className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard
              icon={CalendarClock}
              label="A pagar"
              value={money(metricMap.get("payable_pending"))}
            />
            <MetricCard
              icon={AlertTriangle}
              label="A pagar atrasado"
              value={money(metricMap.get("payable_overdue"))}
            />
            <MetricCard
              icon={WalletCards}
              label="A receber"
              value={money(metricMap.get("receivable_pending"))}
            />
            <MetricCard
              icon={AlertTriangle}
              label="A receber atrasado"
              value={money(metricMap.get("receivable_overdue"))}
            />
          </div>
          <Panel title="Últimas entradas">
'''
new2 = '''        <TabsContent value="overview" className="mt-5 space-y-5">
          <Panel title="Últimas entradas">
'''
if old2 not in s:
    raise SystemExit('duplicate overview accounts cards not found')
s = s.replace(old2, new2, 1)
p.write_text(s)
