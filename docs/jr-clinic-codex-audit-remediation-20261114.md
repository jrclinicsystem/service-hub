# JR Clinic — Correções pós-auditoria Codex (14/11/2026)

**Repositório:** `jrclinicsystem/service-hub` (branch `main`).
**Supabase de produção:** `ldrqcbqaekmohwpneekx`.
**Publicação:** alterações sincronizadas no editor Lovable, sem confirmação de republicação da interface.
**Web Push real:** não ativado; ainda faltam VAPID, chave privilegiada no runtime e job scheduler autenticado.

## Achados e medidas

| # | Achado | Correção |
|---|---|---|
| 1 | Views financeiras públicas | `anon` revogado; três views com `security_invoker=true`; RLS em tabelas de origem |
| 2 | Cache de conta anterior | Query keys privadas por `user.id`, remoção de placeholder entre identidades, limpeza global em mudanças de conta |
| 3 | Push após logout/troca | Sessão Auth vinculada à inscrição, FK `auth.sessions` com cascade; logout central e rotas removendo inscrições e notificações visíveis |
| 4 | Dados novos na transferência de A para B | Evento de saída usa `OLD`, e oculta serviço, data, horário e ID do agendamento |
| 5 | SSRF no dispatcher | Destinos de provedores reconhecidos validados no banco e servidor; redirecionamentos rejeitados, timeout e testes CI |
| 6 | Remarcação arrastando outra sessão | Trigger genérico deixou de mover sessões; somente operação explícita de remarcação da visita atualiza sessões correspondentes |
| 7 | Confirmação de cartão antigo | `schedule_revision` monotônico; nova RPC com comparação de versão e linha bloqueada |
| 8 | Reativar Push apaga fila | Inscrição da própria sessão usa UPSERT sem DELETE; mudança de conta roda unsubscribe e cria inscrição nova |
| 9 | Duplicidade por falha de conclusão | Claimed lease token e conclusão obrigatória; recuperação de tentativas esgotadas; erro de persistência retorna HTTP 502 |
| 10 | Sessões secundárias sem avisos | Trigger específico de remarcação de sessões, com supressão transacional de duplicação |
| 11 | Central aberta desatualizada | Polling enquanto aberta, contador e lista com chaves ligadas à identidade |
| 12 | iPad desktop Safari bloqueado | Detecta capacidades e não rejeita iPad só por user-agent sem versão iOS |

## Evidências de validação

- As três views financeiras: `anon` sem SELECT; administradora autenticada consegue consultar os relatórios (contagens 198/400/53); teste de profissional encontrou zero registros financeiros de outras profissionais.
- Inscrição Push autenticada com vínculo à sessão validada em transação reversível.
- Fila de entrega simulada: claim + token incorreto rejeitado + conclusão com token correto, com rollback.
- Claim/complete v2 verificados executando como papel `service_role`; `anon` e `authenticated` sem permissão de executar claim.
- Evento de transferência conferido sem metadados novos; evento de sessão individual e supressão de duplicidade testados em transação reversível.
- GitHub Actions executa lint, build, teste de reativação e teste específico de bloqueio SSRF.

**Nenhum paciente/colaboradora recebeu push nesses testes.** Testes transacionais foram revertidos.

## Pendências para ativação e publicação

1. Configurar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
   `JR_CLINIC_SERVICE_ROLE_KEY` e `PUSH_DISPATCH_SECRET` na hospedagem segura do servidor.
2. Configurar cron/scheduler autenticado que chame `POST /api/public/push-dispatch` com body `{}`.
3. Testar envio real em dois perfis profissionais distintos e dois aparelhos, incluindo troca de conta no mesmo dispositivo, Android e iOS PWA instalado.
4. Executar nova revisão Codex das mudanças, especialmente **views financeiras**, **trigger de remarcação** e **Web Push**.
5. Publicar manualmente a nova interface no Lovable somente depois de confirmar os testes.

**Nota:** o Supabase Security Advisor mantém avisos preexistentes em outras funções `SECURITY DEFINER`; isso exige uma auditoria própria para evitar alterar indiscriminadamente regras do financeiro e de agendamento.


## Segunda passagem técnica (14/11/2026, continuação)

Esta seção é uma **revisão técnica adicional assistida**, e NÃO se apresenta como
uma nova execução da ferramenta Codex. A auditoria independente do Codex ainda
deve ser rodada sobre o novo commit.

### Ajustes adicionais

- Corrigido o parse de `OS 16_3` e `OS 16_4` no Safari; o código anterior
  continha um regex com barra invertida dupla. Testes cobrem versões antigas,
  iOS 16.4+ e modo desktop no iPad.
- No painel profissional, o botão de ativação permanece desabilitado e informa
  “Notificações em preparação” enquanto o servidor não disponibiliza a
  configuração Web Push. Isso evita solicitar permissão sem capacidade de envio.
- `SystemAccess` é remontado com uma chave por `user.id` imediatamente após
  uma troca de identidade, evitando retenção visual de estado privado anterior.
- Foi identificada e corrigida uma regressão secundária: o redirecionamento
  automático da referência principal para a próxima sessão poderia disparar o
  gatilho de histórico e remover confirmações anteriores. O gatilho agora
  ignora `jr_clinic.suppress_main_push = 'on'` nesse fluxo interno.
- Criado `docs/sql/jr-clinic-push-cron-template.sql` para operação manual
  com Supabase Cron, pg_net e Vault. **Não habilitamos o job**, porque a URL
  de publicação e os cinco segredos do servidor ainda não foram confirmados.

### Evidência de testes sem efeitos persistentes

- Transação temporária com uma sessão futura pertencente a pacote cujo
  agendamento principal está `atendido`: gerou precisamente um evento
  `remarcacao_sessao`, com data e horário corretos; alterações revertidas.
- Transação temporária com remarcação interna da referência principal:
  `schedule_history` e respostas anteriores preservadas; alterações revertidas.
- A validação da versão `schedule_revision` e isolamento financeiro/notificações
  foi confirmada em testes prévios; nenhuma entrega real de Push foi executada.
- O CI passa lint, build, testes de reativação, bloqueio de endpoints SSRF
  e compatibilidade iOS. Build verde **não substitui testes físicos**.

### Estado de implantação

- Lovable e GitHub sincronizados, porém `is_published=true` indica que existe
  uma versão publicada; não comprova que o commit novo foi republicado.
- `pg_cron` e `pg_net` ainda não estão instalados na base da JR Clinic.
- Fila, inscrições e notificações reais continuam vazias.
- Próximo bloqueador: definir os segredos no runtime do Lovable e ativar
  o job **apenas após** a publicação controlada e verificação do endpoint.
