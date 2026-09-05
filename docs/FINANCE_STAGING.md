# JR Clinic — Finance Staging

This branch is reserved for development and validation of the financial module. It must not be merged into `main` until the financial workflow is approved in staging.

## Environment status

- Git branch: `finance-staging`
- Production branch: `main`
- Production Supabase: unchanged and isolated from finance development.
- Staging Supabase project: `JR Clinic Finance Staging`
- Staging Supabase project ref: `aurualytmbmudlfebujv`
- Staging region: `sa-east-1`
- Staging cost confirmed at creation: R$ 0 / free project according to the Supabase account response at setup time.
- `supabase/config.toml` on this branch points to staging, not production.
- The staging frontend no longer contains a fallback to the production Supabase project. It requires a staging publishable key through `VITE_SUPABASE_PUBLISHABLE_KEY` before it can connect.

## Safety rules

- Production remains on `main` and keeps using the current production Supabase project.
- Financial development happens only on `finance-staging`.
- Do not apply finance migrations to the production Supabase project during development.
- Do not copy real patient/client data into staging. Use synthetic test data.
- Never add the production Supabase URL/key as a fallback in `finance-staging`.
- Final production rollout should happen through reviewed migrations and a controlled merge after backup/checkpoint.

## Integration boundary

The financial module consumes operational data but should not redefine the existing scheduling workflow.

Canonical trigger for revenue: an appointment becomes `atendido`.

Flow:

`Agenda -> Confirmado -> Atendido -> Financeiro`

Scheduling/confirmation alone must not generate revenue.

## Financial domains

1. Entradas automáticas de atendimentos
2. Saídas/despesas
3. Contas a pagar
4. Contas a receber / fiado
5. Comissões configuráveis
6. Fechamento por profissional
7. Formas de pagamento
8. Taxas de cartão
9. Descontos
10. Dashboard financeiro
11. Relatórios e exportações
12. Filtros
13. Centros de custo
14. Permissões financeiras
15. Histórico/auditoria
16. Integração com atendimento
17. Abertura e fechamento de caixa

## Commission model

Each professional can use one of these defaults:

- `percentage`: percentual sobre a base configurada do atendimento.
- `fixed_per_patient`: valor fixo por atendimento/paciente.
- `manual`: comissão informada manualmente no fechamento/lançamento.

Examples for staging validation:

- Emily: 50%.
- Aryanne: R$ 30 por paciente.

A manual override must be possible when the clinic needs an exception, with audit trail.

## Initial data model proposal

Financial tables should remain separate from the operational core whenever possible:

- `financial_entries`
- `financial_expenses`
- `accounts_payable`
- `accounts_receivable`
- `professional_commission_rules`
- `professional_commissions`
- `payment_method_fees`
- `cash_sessions`
- `cash_movements`
- `cost_centers`
- `financial_audit_log`

Existing operational tables such as `appointments`, `clients`, `professionals` and `services` are referenced by foreign keys, not duplicated.

## Test scenarios before production

- Atendimento em dinheiro, Pix, débito, crédito e link.
- Atendimento com desconto.
- Cartão com taxa configurada.
- Emily com comissão percentual de 50%.
- Aryanne com R$ 30 por paciente.
- Comissão alterada manualmente com registro de auditoria.
- Conta a pagar pendente, paga e atrasada.
- Conta a receber/fiado pendente e quitada.
- Abertura de caixa com fundo inicial.
- Fechamento sem diferença.
- Fechamento com sobra/falta e observação.
- Fechamento quinzenal e mensal por profissional.
- Cancelamento/ajuste sem duplicar lançamentos financeiros.
- Reprocessamento idempotente de atendimento já integrado.
- Permissões: administrador, financeiro, recepção e profissional.

## Production rollout checklist

1. Validar o módulo completo no Supabase de staging.
2. Executar testes de integração e regressão da agenda.
3. Congelar o schema aprovado.
4. Fazer backup/checkpoint da produção.
5. Aplicar somente as migrations aprovadas.
6. Fazer merge controlado de `finance-staging` para `main`.
7. Publicar frontend.
8. Executar smoke test em produção.
9. Monitorar logs e permitir rollback caso necessário.
