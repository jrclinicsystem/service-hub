import { BellRing, Download, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { activateProfessionalPush, currentPushSubscription, isInstalledApp, isIosDevice } from "@/lib/web-push";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function ProfessionalAppSettings({ professionalId }: { professionalId: string }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isInstalledApp());
    setIos(isIosDevice());
    void currentPushSubscription().then((subscription) => setActive(Boolean(subscription)));
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      toast.success("JR Clinic instalado neste aparelho.");
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (installed) {
      toast.info("O JR Clinic já está instalado neste aparelho.");
      return;
    }
    if (ios) {
      toast.info("No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.", {
        description: "Para receber push no iPhone, é necessário iOS 16.4 ou superior e abrir pelo ícone instalado.",
        duration: 9000,
      });
      return;
    }
    if (!installPrompt) {
      toast.info("Use a opção Instalar aplicativo ou Adicionar à tela inicial do menu do navegador.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "dismissed") toast.info("A instalação ficou disponível para fazer depois.");
    setInstallPrompt(null);
  };

  const enable = async () => {
    setBusy(true);
    try {
      await activateProfessionalPush(professionalId);
      setActive(true);
      toast.success("Notificações ativadas neste aparelho.", {
        description: "A entrega depende da permissão do navegador e do serviço de push do aparelho.",
      });
    } catch (error) {
      toast.error("Não foi possível ativar as notificações.", {
        description: error instanceof Error ? error.message : "Tente novamente.",
        duration: 8000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-soft" aria-label="Aplicativo e notificações">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Smartphone className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">JR Clinic no seu aparelho</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              Instale o painel e ative cada aparelho separadamente. As notificações seguem sua permissão atual e não contêm dados da cliente na tela bloqueada.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={install}>
            <Download className="size-4" /> {installed ? "Aplicativo instalado" : "Instalar aplicativo"}
          </Button>
          <Button type="button" variant={active ? "secondary" : "default"} size="sm" className="rounded-full" disabled={busy} onClick={enable}>
            <BellRing className="size-4" /> {busy ? "Ativando..." : active ? "Revalidar notificações" : "Ativar notificações"}
          </Button>
        </div>
      </div>
      {ios && !installed ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          iPhone: Compartilhar → Adicionar à Tela de Início. Push requer iOS 16.4 ou superior; a entrega não é garantida pelo navegador.
        </p>
      ) : null}
    </section>
  );
}
