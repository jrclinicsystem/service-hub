import { useLocation } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

const whatsappUrl =
  "https://wa.me/5585991608575?text=Ol%C3%A1%21%20Estou%20no%20sistema%20da%20JR%20Clinic%20e%20preciso%20de%20ajuda.";

export function SupportWhatsapp() {
  const location = useLocation();

  if (location.pathname.startsWith("/admin")) return null;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar com o suporte da JR Clinic pelo WhatsApp"
      className="group fixed bottom-[5.1rem] right-3 z-[55] flex h-11 items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 text-primary shadow-lift backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card sm:bottom-6 sm:right-6 sm:h-12 sm:px-4"
    >
      <span className="relative grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
        <MessageCircle className="size-4" strokeWidth={1.8} />
        <span className="absolute right-0 top-0 size-2 rounded-full border-2 border-card bg-accent" />
      </span>
      <span className="text-xs font-semibold sm:text-sm">Suporte</span>
    </a>
  );
}
