# JR Clinic — implantação controlada de PWA e Web Push

**Projeto de banco de dados correto:** `ldrqcbqaekmohwpneekx`. A migração
`supabase/migrations/20261114030000_secure_professional_web_push.sql`
foi aplicada diretamente nesse projeto em 14/11/2026; **não a execute em outro projeto**.

## O que o sistema faz

- Web app instalável no Android e iPhone, com service worker sem cache de dados privados.
- Central individual de notificações; administração tem central de leitura global.
- Eventos transacionais no banco para novos agendamentos, pagamentos que liberam agenda,
  confirmação, cancelamento, remarcação e transferência de profissional.
- `appointments.professional_id` define o destinatário; RLS e o despachante
  revalidam o vínculo entre `auth.users`, `professional_access` e `professionals`.
- Fila de entregas com tentativas limitadas e desativação de inscrições expiradas.

## Segredos obrigatórios do runtime de PRODUÇÃO

Configure via mecanismo seguro de variáveis/segredos do ambiente que executa o
servidor TanStack Start (não no frontend, banco, repositório ou arquivos `.env` versionados).

| Variável | Valor esperado |
|---|---|
| `JR_CLINIC_SERVICE_ROLE_KEY` | chave secreta service role do projeto **ldrqcbqaekmohwpneekx**, exclusivamente servidor |
| `VAPID_PUBLIC_KEY` | chave pública de um par VAPID recém-gerado em ambiente seguro |
| `VAPID_PRIVATE_KEY` | chave privada correspondente à pública, exclusivamente servidor |
| `VAPID_SUBJECT` | contato responsável em formato `mailto:` ou URL HTTPS válida |
| `PUSH_DISPATCH_SECRET` | segredo aleatório forte (mínimo 32 bytes de entropia) para autenticar chamadas internas |

Gere o par VAPID com uma ferramenta Web Push confiável, por exemplo o CLI
`npx web-push generate-vapid-keys` em máquina administrativa. Não publique a chave privada.
Não utilizar a chave anon/publishable como `JR_CLINIC_SERVICE_ROLE_KEY`.

## Acionamento da fila

O endpoint `POST /api/public/push-dispatch` somente processa a fila com cabeçalho
`Authorization: Bearer <PUSH_DISPATCH_SECRET>` e body JSON `{}`.
Configure **uma chamada agendada uma vez por minuto** em serviço confiável
(Supabase Cron + Vault/pg_net ou scheduler equivalente), usando a URL HTTPS
da publicação real da JR Clinic e o mesmo segredo protegido.
**Nunca** exponha este token em JavaScript do navegador, links ou URL de query.
O sistema NÃO entrega push de fundo enquanto este agendamento não existir.
A versão auditada permanece com `pg_cron` e `pg_net` **não instalados**
e sem inscrições de aparelhos; **não interprete build aprovado como entrega real**.

### Operação segura no Supabase e Lovable

1. No projeto Lovable da JR Clinic, vá às configurações de **Secrets**
   e registre os cinco nomes acima como **variáveis do servidor**, sem prefixo `VITE_`.
   A chave de serviço é a do projeto Supabase `ldrqcbqaekmohwpneekx`, nunca de outra instância.
2. Confirme a URL **efetivamente publicada** (não use automaticamente a URL de preview).
3. No [Supabase Vault](https://supabase.com/dashboard/project/ldrqcbqaekmohwpneekx),
   crie os segredos privados `jr_clinic_push_origin` e
   `jr_clinic_push_dispatch_secret`; este último deve ter exatamente o mesmo
   valor de `PUSH_DISPATCH_SECRET` no Lovable. Não salve nenhum valor em GitHub.
4. Execute manualmente, após essas configurações, o roteiro
   `docs/sql/jr-clinic-push-cron-template.sql` no SQL Editor do mesmo projeto.
   Ele verifica os nomes do Vault e cria uma chamada por minuto.
5. Confirme o HTTP 200 do despachante e teste entrega real, retorno 404/410,
   troca de conta e Android/iOS. **Não execute o cron antes de confirmar a publicação**.

**A execução do roteiro é intencionalmente manual.** O arquivo está em
`docs/sql/`, não em `supabase/migrations/`, para evitar agendar automaticamente
o envio no ambiente errado.

Permissão de notificação, HTTPS, assinatura válida e conectividade do aparelho também são necessárias.

## Checklist antes de publicar

1. Validar se o site publicado recebe os arquivos `/manifest.webmanifest`,
   `/sw.js` e os ícones de `/icons`.
2. Configurar os cinco segredos na hospedagem correta e testar um envio controlado.
3. Verificar login de duas profissionais diferentes A e B, com aparelhos diferentes.
4. Criar agendamento para A: apenas A recebe push e vê a notificação; B recebe zero;
   administradora enxerga o registro na central.
5. Repetir invertendo A e B. Testar cancelamento, remarcação, confirmação e transferência.
6. Testar desativação de acesso, logout, troca de conta no mesmo aparelho, reinscrição
   e múltiplos dispositivos por pessoa.
7. Testar Android Chrome e iOS Safari 16.4+ instalado na tela de início.
8. Confirmar que a publicação de código foi sincronizada pelo GitHub e então
   **publicar manualmente** no Lovable, apenas após os testes.

**Limitação importante:** Web Push não garante entrega em 100% das condições
(bateria, rede, permissão, navegador e sistema operacional). O histórico persistido
continua disponível no painel, respeitando a autorização da conta.
