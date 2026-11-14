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
