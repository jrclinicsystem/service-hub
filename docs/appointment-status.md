# Status e remarcação de agendamentos

## Comportamento

- **Confirmado** mantém a reserva ativa.
- **Cancelado** libera o horário e mantém o registro e pagamentos existentes. A ação agora também está disponível nos detalhes de confirmados.
- **Remarcado** identifica a reserva que mudou de data/horário e aguarda nova confirmação. O estado operacional continua `pendente`, com `schedule_history` persistido, preservando as funções atuais de confirmação da profissional e conclusão financeira.
- Uma remarcação troca o horário em uma única transação, arquiva a resposta anterior da profissional, pede nova confirmação e move somente as sessões pendentes vinculadas à visita anterior. Não recria serviços, pagamentos, vendedores ou vínculos de combos.
- Atendimentos finalizados, com registro financeiro ou sessões concluídas mantêm a proteção existente contra remarcação. Pagamentos online que ainda aguardam processamento conservam `aguardando_pagamento`.
- O histórico de alterações permanece após confirmar ou cancelar. Alterações antigas não são reconstruídas retroativamente.

## Migração e ativação

Aplicar `supabase/migrations/20261106190000_appointment_schedule_status.sql` antes de ativar a nova remarcação em produção. A migração está preparada e testada localmente; não foi aplicada ao Supabase neste trabalho, pois não havia sessão autenticada disponível.

A migração adiciona uma coluna JSONB, estende a função de disponibilidade existente com um parâmetro opcional e acrescenta a operação restrita de remarcação. Os chamadores atuais com dois parâmetros continuam compatíveis. Não altera políticas RLS.

O índice parcial protege horários ativos por profissional. Se houver duplicidades históricas ativas, a migração inteira aborta sem modificar ou apagar esses registros; os conflitos precisam ser conferidos antes de repetir a aplicação.

Enquanto a migração estiver pendente, as consultas retornam ao formato anterior somente quando a nova coluna não existe. As telas existentes continuam carregando, e o novo botão de remarcação permanece desabilitado. Nenhum erro de autorização é ocultado.

Não foi acionado o **Publicar** do Lovable nem executado deploy.

## Validação reproduzível

```sh
bun install --frozen-lockfile
bun run lint
bunx tsc --noEmit
bun run build
bun test src/lib/auth-access.test.ts tests/appointment-status.test.ts
JR_TEST_DATABASE_URL='<conexão de um banco PostgreSQL descartável e vazio>' node --test tests/appointment-status.integration.mjs
```

O teste PostgreSQL cria seu próprio esquema de teste; nunca apontar para produção. Usa as funções reais de disponibilidade e proteção presentes nas migrações do repositório, com dados sintéticos e identidade simulada. Não equivale à validação integral das políticas RLS do projeto remoto.

Resultados locais: build aprovado; lint sem erros (avisos de formatação e hooks); 16 testes PostgreSQL aprovados e 16 testes Bun aprovados (6 novos, 10 existentes).

A verificação completa de tipos permanece com os mesmos dois problemas da versão original: falta de declarações de `bun:test` em `src/lib/auth-access.test.ts` e incompatibilidade de `AuthError.code` com `exactOptionalPropertyTypes` em `src/routes/auth.tsx:175`. Nenhum erro de tipos novo foi introduzido.
