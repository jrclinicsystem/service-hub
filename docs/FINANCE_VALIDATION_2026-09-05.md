# JR Clinic — Validação do Financeiro em Staging — 05/09/2026

Ambiente validado: **JR Clinic Finance Staging** (`aurualytmbmudlfebujv`).

> Produção não foi alterada. Todos os cenários abaixo usam dados sintéticos.

## Configurações sintéticas usadas para teste

### Comissões
- Emily - TESTE STAGING: 50% sobre o líquido após taxas.
- Aryanne - TESTE STAGING: R$ 30,00 fixos por atendimento.
- Override manual já validado em testes anteriores, com motivo e auditoria.

### Taxas de pagamento de teste
- Débito: 1,50% em 1x.
- Crédito: 3,00% em 1x.
- Crédito: 4,50% de 2x a 6x.
- Link de pagamento: 4,00% de 1x a 12x.

Essas taxas são **somente para staging**. Produção deve usar as taxas reais informadas pela clínica.

### Centro de custo
Os 8 serviços sintéticos do staging receberam mapeamento em `service_cost_centers` apenas para validar o fluxo de relatórios. O vínculo real dos serviços deve ser configurado antes do rollout em produção.

## Correção funcional aplicada

O fluxo automático `Atendido -> Financeiro` agora resolve o centro de custo nesta ordem:

1. `appointments.cost_center_code`, quando houver override explícito;
2. `service_cost_centers`, usando o serviço do atendimento;
3. sem centro de custo, caso nenhum vínculo exista.

Migration aplicada no staging:
- `20260905194156_finance_use_service_cost_center_mapping`

## Hardening de segurança aplicado

- Helpers internos de integração financeira não ficam executáveis por `anon`/`authenticated`.
- `finance_has_role`, `mark_commission_paid`, `close_cash_session` e o trigger financeiro passaram a usar `search_path = ''`.
- As RPCs de negócio continuam exigindo autenticação e validam o perfil financeiro internamente.

Migration aplicada no staging:
- `20260905194534_finance_harden_security_definer_paths`

## Cenários validados nesta rodada

### Profissional / RLS
Perfil profissional sintético vinculado à Aryanne:
- entradas visíveis próprias: 2;
- entradas de outras profissionais: 0;
- comissões visíveis próprias: 2;
- comissões de outras profissionais: 0.

### Recepção / restrições
Perfil recepção-only sintético:
- tentativa de alterar taxa financeira: bloqueada por regra de função;
- tentativa de inserir despesa diretamente: bloqueada por RLS.

### Comissão fixa
Atendimento sintético da Aryanne:
- valor: R$ 280,00;
- comissão: `fixed_per_patient`;
- comissão calculada: R$ 30,00;
- parte da clínica: R$ 250,00.

### Taxas e recebimentos
- Débito R$ 420,00 a 1,50% -> taxa R$ 6,30 -> líquido R$ 413,70 -> comissão Emily R$ 206,85.
- Link R$ 380,00 a 4,00% -> taxa R$ 15,20 -> líquido R$ 364,80 -> comissão Emily R$ 182,40.
- Crédito R$ 180,00 em 3x a 4,50% -> taxa R$ 8,10 -> líquido R$ 171,90 -> comissão Emily R$ 85,95.

### Caixa
Caixa sintético de 06/09/2026:
- fundo inicial: R$ 200,00;
- dinheiro: R$ 280,00;
- débito: R$ 420,00;
- crédito: R$ 180,00;
- link: R$ 380,00;
- valor esperado em espécie: R$ 480,00;
- valor contado: R$ 480,00;
- diferença: R$ 0,00;
- fechamento concluído e auditado.

### Conta recorrente
Conta sintética mensal:
- vencimento original: 10/09/2026;
- paga via Pix;
- próxima ocorrência gerada automaticamente para 10/10/2026 com status pendente.

### Idempotência
Reprocessamento do mesmo `appointment_id` no helper financeiro manteve exatamente **1 lançamento** para o atendimento.

### Relatórios
`get_financial_report_breakdowns` retornou seções válidas para:
- dia;
- semana;
- quinzena;
- mês;
- profissional;
- serviço;
- forma de pagamento;
- categoria de despesa;
- centro de custo.

### Fechamento profissional
Fechamento sintético da Aryanne de 01/09/2026 a 15/09/2026:
- 3 atendimentos;
- faturamento bruto: R$ 930,00;
- faturamento líquido: R$ 930,00;
- comissão: R$ 185,00;
- parte da clínica: R$ 745,00;
- comissão pendente: R$ 185,00.

### Consultas públicas
Consultas executadas como role `anon` sem erro de permissão:
- `professionals`;
- `service_professionals` com join em `professionals`;
- `promotions`;
- `services`.

O erro anterior `permission denied for function is_current_user_admin` não se reproduziu no teste atual de RLS/grants.

## Advisors do Supabase

### Segurança
Persistem avisos de `SECURITY DEFINER` para RPCs que são intencionalmente chamáveis por usuários autenticados. Essas RPCs mantêm checagem interna de perfil via `finance_has_role` e `anon` não tem `EXECUTE`.

Também existe aviso de proteção contra senhas vazadas desabilitada no Auth; avaliar ativação antes da produção.

### Performance
Há avisos de:
- foreign keys sem índice de cobertura;
- políticas RLS com `auth.uid()` que podem ser otimizadas com initplan;
- múltiplas policies permissivas em algumas tabelas;
- índices ainda não utilizados em staging.

Esses pontos não bloquearam os testes funcionais e podem ser tratados na etapa de otimização antes/depois do rollout controlado.

## Pendências antes da produção

1. Substituir taxas sintéticas pelas taxas reais da clínica.
2. Configurar o mapeamento real `Serviço -> Centro de custo`.
3. Fazer smoke test visual/autenticado no preview do Lovable (`/admin/financeiro`, Excel/PDF e responsividade).
4. O workspace Lovable está sem créditos no momento, então o smoke test automatizado pelo agente não pôde ser executado nesta rodada.
5. Fazer backup/checkpoint da produção antes de aplicar migrations.
6. Aplicar apenas as migrations financeiras aprovadas e executar smoke test pós-deploy.
