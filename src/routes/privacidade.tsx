import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

const title = "Política de Privacidade — JR Clinic";
const description = "Política de Privacidade da plataforma JR Clinic.";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-8 sm:pb-16 sm:pt-14">
        <span className="eyebrow text-accent">Legal</span>
        <h1 className="mt-2 text-3xl font-semibold text-primary sm:text-5xl">Política de Privacidade</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Esta Política de Privacidade explica como a JR Clinic trata os dados pessoais utilizados na plataforma de serviços e agendamentos.
        </p>

        <div className="mt-8 space-y-7 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-8">
          <section>
            <h2 className="text-lg font-semibold">1. Dados que podemos coletar</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Podemos coletar dados fornecidos diretamente pelo usuário, como nome, e-mail, telefone, foto de perfil, informações inseridas no agendamento e dados necessários para identificar e administrar a conta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Login e autenticação</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O usuário pode acessar sua conta por e-mail e senha ou por provedores de autenticação, como o Google. Quando o login social é utilizado, recebemos apenas as informações necessárias para autenticar a conta, como identificador, nome, e-mail e imagem de perfil disponibilizados pelo provedor.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Como usamos os dados</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Os dados são utilizados para criar e administrar a conta, permitir agendamentos, exibir histórico de atendimentos, facilitar o contato relacionado aos serviços contratados, manter a segurança da plataforma e melhorar a experiência de uso.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Compartilhamento</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A JR Clinic não comercializa dados pessoais. Informações podem ser processadas por fornecedores tecnológicos necessários ao funcionamento da plataforma, como serviços de autenticação, hospedagem, banco de dados e, futuramente, processamento de pagamentos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Armazenamento e segurança</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              São adotadas medidas técnicas e administrativas compatíveis com a natureza da plataforma para proteger os dados contra acesso não autorizado, alteração, perda ou divulgação indevida.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Direitos do usuário</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O usuário pode solicitar atualização, correção ou exclusão de dados pessoais, observadas as informações que precisem ser mantidas para cumprimento de obrigações legais ou legítimas da operação.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Cookies e sessão</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A plataforma pode utilizar armazenamento local, cookies ou tecnologias equivalentes estritamente necessárias para manter sessões autenticadas, preferências e segurança do acesso.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Alterações desta política</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Esta Política de Privacidade poderá ser atualizada quando houver mudanças na plataforma, nos serviços oferecidos ou nas exigências legais aplicáveis. A versão publicada nesta página será considerada a versão vigente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Contato</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Dúvidas relacionadas à privacidade e ao tratamento de dados podem ser encaminhadas pelos canais oficiais disponibilizados pela JR Clinic.
            </p>
          </section>

          <p className="border-t border-border pt-5 text-xs text-muted-foreground">Última atualização: 29 de agosto de 2026.</p>
        </div>

        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
