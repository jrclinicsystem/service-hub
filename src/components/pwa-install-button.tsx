import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { isInstalledApp, isIosDevice } from "@/lib/web-push";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/** PWA installation is a browser feature, never a requirement for desktop use. */
export function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isInstalledApp());
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
    } else if (isIosDevice()) {
      toast.info("Para instalar no iPhone: Safari → Compartilhar → Adicionar à Tela de Início.");
    } else {
      toast.info("Abra o menu do navegador e escolha 'Instalar aplicativo' ou 'Adicionar à tela inicial'.");
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={install}>
      <Download className="size-4" /> Instalar aplicativo
    </Button>
  );
}
