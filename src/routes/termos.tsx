import { createFileRoute, Link } from "@tanstack/react-router";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

const title = "Termos de Serviço — JR Clinic";
const description = "Termos de Serviço da plataforma JR Clinic.";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-8 sm:px-8 sm:pb-16 sm:pt-14">
        <span className="eyebrow text-accent">Legal</span>
        <h1 className="mt-2 text-3xl font-semibold text-primary sm:text-5xl">Termos de Serviço</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Estes Termos regulam o uso da plataforma JR Clinic para consulta de serviços, criação de conta e realização de agendamentos.
        </p>

        <div className="mt-8 space-y-7 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-8">
          <section>
            <h2 className="text-lg font-semibold">1. Uso da plataforma</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A plataforma pode ser utilizada para visualizar serviços, profissionais, valores, disponibilidade, promoções e outras informações oferecidas pela JR Clinic, bem como para realizar e acompanhar agendamentos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Conta do usuário</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Algumas funcionalidades exigem uma conta. O usuário é responsável por fornecer informações corretas, manter suas credenciais seguras e utilizar sua conta de forma legítima. O acesso pode ocorrer por e-mail e senha ou por provedores compatíveis, como o Google.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Agendamentos</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A solicitação de um horário pela plataforma registra a intenção de atendimento conforme a disponibilidade apresentada. A JR Clinic poderá confirmar, ajustar ou cancelar um agendamento quando necessário, informando o usuário pelos canais disponíveis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Valores e pagamentos</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Os valores exibidos correspondem às informações cadastradas na plataforma no momento da consulta. Quando recursos de pagamento online estiverem disponíveis, eventuais condições, taxas, parcelamentos e regras adicionais serão apresentadas antes da conclusão da cobrança.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Informações de saúde</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O conteúdo apresentado na plataforma tem finalidade informativa e operacional. Ele não substitui avaliação profissional, diagnóstico, prescrição ou orientação clínica individualizada.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Uso adequado</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Não é permitido utilizar a plataforma para fraude, tentativa de acesso não autorizado, interferência no funcionamento do sistema, envio de informações ilícitas ou qualquer uso que prejudique a JR Clinic, seus profissionais ou outros usuários.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Disponibilidade do sistema</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A JR Clinic busca manter a plataforma disponível e atualizada, mas poderão ocorrer manutenções, indisponibilidades temporárias ou alterações técnicas necessárias à segurança e evolução do serviço.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Privacidade</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              O tratamento de dados pessoais relacionado ao uso da plataforma é descrito na Política de Privacidade da JR Clinic.
            </p>
            <Link to="/privacidade" className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4">
              Consultar Política de Privacidade
            </Link>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Alterações dos termos</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Estes Termos podem ser atualizados para refletir mudanças no serviço, nas funcionalidades ou nas regras aplicáveis. A versão publicada nesta página será considerada vigente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Contato</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Dúvidas sobre estes Termos podem ser encaminhadas pelos canais oficiais disponibilizados pela JR Clinic.
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
