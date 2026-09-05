# JR Clinic — Validação do Financeiro em Staging — 05/09/2026

Ambiente validado: **JR Clinic Finance Staging** (`aurualytmbmudlfebujv`).

> Produção não foi alterada. Todos os cenários abaixo usam dados sintéticos.

## Status

O módulo financeiro está funcionalmente pronto para homologação em staging. A branch `finance-staging` passa no workflow de qualidade com **lint e production build aprovados**.

Ainda não devem ser copiadas para produção as taxas e associações de centro de custo usadas nos testes, pois são valores sintéticos.

## Configurações sintéticas usadas para teste

### Comissões
- Emily - TESTE STAGING: 50% sobre o líquido após taxas.
- Aryanne - TESTE STAGING: R$ 30,00 fixos por atendimento.
- Override manual validado com motivo obrigatório e auditoria.

### Taxas de pagamento de teste
- Débito: 1,50% em 1x.
- Crédito: 3,00% em 1x.
- Crédito: 4,50% de 2x a 6x.
- Link de pagamento: 4,00% de 1x a 12x.

Essas taxas são **somente para staging**. Produção deve usar as taxas reais informadas pela clínica.

### Centro de custo
Os 8 serviços sintéticos do staging receberam mapeamento em `service_cost_centers` para validar o fluxo de relatórios. O vínculo real dos serviços será configurado antes do rollout em produção.

## Correções e melhorias aplicadas

### Centro de custo automático
O fluxo `Atendido -> Financeiro` resolve o centro de custo nesta ordem:

1. `appointments.cost_center_code`, quando houver override explícito;
2. `service_cost_centers`, usando o serviço do atendimento;
3. sem centro de custo, caso nenhum vínculo exista.

Migration:
- `20260905194156_finance_use_service_cost_center_mapping`

### Hardening de segurança
- Helpers internos de integração financeira não ficam executáveis por `anon`/`authenticated`.
- Funções privilegiadas usam `search_path` restrito.
- RPCs de negócio mantêm autenticação e checagem interna de perfil financeiro.
- Recepção foi testada e bloqueada ao tentar executar operação administrativa de comissão.

Migration:
- `20260905194534_finance_harden_security_definer_paths`

### Pagamento individual de comissão
A interface financeira passou a permitir marcar uma comissão pendente individual como paga.

Quando uma comissão já pertence a um fechamento profissional aberto ou fechado, o sistema atualiza automaticamente:
- valor já repassado;
- valor pendente.

O teste foi feito dentro de transação com rollback: uma comissão de R$ 30,00 alterou temporariamente o fechamento de R$ 0,00 repassado / R$ 185,00 pendente para R$ 30,00 repassado / R$ 155,00 pendente e o rollback preservou o estado original.

Migration:
- `20260905201507_finance_sync_individual_commission_payment`

### Performance financeira
Foram adicionados índices para as foreign keys usadas nas tabelas financeiras de:
- contas a pagar;
- contas a receber;
- movimentos de caixa;
- despesas;
- taxas de pagamento;
- centros de custo dos serviços.

Após a migration, os avisos `unindexed_foreign_keys` das tabelas financeiras tratadas deixaram de aparecer no advisor. Os índices aparecem como `unused` apenas porque o banco de staging ainda possui volume muito pequeno de dados.

Migration:
- `20260905201629_finance_add_foreign_key_indexes`

### RLS do perfil profissional
As policies de `financial_access`, `financial_entries` e `professional_commissions` foram otimizadas para evitar reavaliação de `auth.uid()` linha a linha, sem alterar o modelo de acesso.

Depois da mudança, o perfil sintético da Aryanne continuou vendo:
- 3 entradas próprias;
- 0 entradas de outras profissionais;
- 3 comissões próprias;
- 0 comissões de outras profissionais.

Os três avisos de `auth_rls_initplan` específicos dessas policies financeiras deixaram de aparecer no advisor.

Migration:
- `20260905201713_finance_optimize_professional_rls`

## Melhorias de frontend

O workspace financeiro foi revisado para:
- carregar a lista diretamente de todos os profissionais ativos, e não apenas de quem já possui lançamento financeiro;
- permitir configurar comissão de uma profissional antes do primeiro atendimento;
- mostrar o nome da profissional nas comissões e fechamentos, evitando UUID na interface;
- permitir pagamento individual de comissão;
- impedir que campo monetário vazio seja interpretado silenciosamente como R$ 0,00;
- manter validação explícita na abertura e no fechamento de caixa;
- eliminar o warning de dependência instável do array de formas de pagamento.

Commit principal do frontend:
- `ca776218df50fbbe8281ab9752abca71d1fa1059`

O workflow GitHub Actions foi corrigido anteriormente e a branch permanece com lint e production build aprovados.

## Cenários funcionais validados

### Comissão fixa
Atendimento sintético da Aryanne:
- valor: R$ 280,00;
- comissão: `fixed_per_patient`;
- comissão calculada: R$ 30,00;
- parte da clínica: R$ 250,00;
- centro de custo herdado automaticamente do serviço.

### Taxas e recebimentos
- Débito R$ 420,00 a 1,50% -> taxa R$ 6,30 -> líquido R$ 413,70 -> comissão Emily R$ 206,85.
- Link R$ 380,00 a 4,00% -> taxa R$ 15,20 -> líquido R$ 364,80 -> comissão Emily R$ 182,40.
- Crédito R$ 180,00 em 3x a 4,50% -> taxa R$ 8,10 -> líquido R$ 171,90 -> comissão Emily R$ 85,95.

### Caixa com recebimentos
Caixa sintético de 06/09/2026:
- fundo inicial: R$ 200,00;
- dinheiro: R$ 280,00;
- débito: R$ 420,00;
- crédito: R$ 180,00;
- link: R$ 380,00;
- valor esperado em espécie: R$ 480,00;
- valor contado: R$ 480,00;
- diferença: R$ 0,00.

### Saída em dinheiro no caixa
Caixa sintético de 07/09/2026:
- fundo inicial: R$ 100,00;
- despesa paga em dinheiro: R$ 50,00;
- saída de caixa criada automaticamente: R$ 50,00;
- valor esperado: R$ 50,00;
- valor contado: R$ 50,00;
- diferença: R$ 0,00.

O trigger `financial_expenses_sync_cash` foi validado em execução real no staging.

### Conta recorrente
Conta sintética mensal:
- vencimento original: 10/09/2026;
- paga via Pix;
- próxima ocorrência gerada automaticamente para 10/10/2026 com status pendente.

### Contas a receber / fiado
Atendimentos concluídos sem recebimento:
- geraram conta a receber;
- puderam ser quitados posteriormente em dinheiro, débito, crédito e link;
- a quitação atualizou o lançamento financeiro e a comissão sem duplicar receita.

### Idempotência
Reprocessamento do mesmo `appointment_id` manteve exatamente **1 lançamento financeiro** para o atendimento.

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
- `service_professionals`;
- `promotions`;
- `services`.

O erro anterior `permission denied for function is_current_user_admin` não se reproduziu nos testes atuais.

## Permissões validadas

### Profissional
O usuário profissional sintético vê somente os próprios atendimentos e comissões.

### Recepção
Foi validado que a recepção:
- pode operar caixa e recebimentos permitidos;
- não pode cadastrar/alterar taxas financeiras;
- não pode inserir despesas administrativas diretamente por bypass;
- não pode marcar comissão de profissional como paga.

### Admin / Financeiro
Mantêm acesso às configurações, despesas, contas, comissões, fechamentos e relatórios.

## Advisors do Supabase

### Segurança
Persistem avisos do linter para RPCs `SECURITY DEFINER` que são intencionalmente chamadas por usuários autenticados. Essas RPCs possuem checagem interna de perfil via `finance_has_role`, e `anon` não possui `EXECUTE` nas operações financeiras privilegiadas.

Referência do advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Também permanece o aviso de proteção contra senhas vazadas desabilitada no Supabase Auth. Avaliar ativação antes da produção.

### Performance
Os avisos restantes estão principalmente no schema operacional legado ou são warnings de policies permissivas separadas por função de acesso. Os avisos específicos de foreign keys financeiras tratadas e de initplan das três policies financeiras otimizadas foram resolvidos.

## Pendências antes da produção

1. Substituir as taxas sintéticas pelas **taxas reais** da clínica.
2. Configurar o mapeamento real **Serviço -> Centro de custo** usando os serviços reais da produção.
3. Fazer uma conferência visual/autenticada do `/admin/financeiro`, especialmente responsividade, abertura das abas e os diálogos de impressão/Excel/PDF.
4. Ativar a proteção contra senhas vazadas no Auth se estiver disponível no plano/configuração usada pela produção.
5. Fazer backup/checkpoint da produção.
6. Aplicar somente as migrations financeiras aprovadas em rollout controlado.
7. Executar smoke test pós-deploy antes de liberar para a equipe.

O Lovable não é requisito para continuidade do desenvolvimento: as alterações do staging são mantidas pelo GitHub (`finance-staging`) e pelo Supabase de staging.
