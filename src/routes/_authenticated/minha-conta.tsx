import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Camera, LogOut, Mail, Phone, Save, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyAppointments } from "@/lib/clinic.functions";
import { formatDate, formatPrice, statusVariant, type AppointmentStatus } from "@/lib/clinic";

const title = "Minha conta — JR Clinic";
const description =
  "Gerencie seus dados pessoais, foto de perfil e acompanhe seus agendamentos na JR Clinic.";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MinhaConta,
});

function appointmentDate(item: { scheduled_date: string; scheduled_time: string }) {
  return new Date(`${item.scheduled_date}T${item.scheduled_time}:00`);
}

function MinhaConta() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const avatarInput = useRef<HTMLInputElement>(null);
  const fetchAppointments = useServerFn(getMyAppointments);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url, created_at, updated_at")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const appointmentsQuery = useQuery({
    queryKey: ["my-appointments"],
    queryFn: () => fetchAppointments(),
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    setFullName(profileQuery.data.full_name ?? "");
    setPhone(profileQuery.data.phone ?? "");
  }, [profileQuery.data]);

  const avatarUrl =
    profileQuery.data?.avatar_url ||
    (typeof user?.user_metadata?.['avatar_url'] === "string" ? user.user_metadata['avatar_url'] : "");

  const displayName =
    fullName.trim() ||
    profileQuery.data?.full_name ||
    (typeof user?.user_metadata?.['full_name'] === "string" ? user.user_metadata['full_name'] : "") ||
    user?.email?.split("@")[0] ||
    "Paciente JR Clinic";

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const appointments = appointmentsQuery.data ?? [];
  const { upcoming, history } = useMemo(() => {
    const now = Date.now();
    return appointments.reduce(
      (groups: { upcoming: typeof appointments; history: typeof appointments }, item: (typeof appointments)[number]) => {
        const future = appointmentDate(item).getTime() >= now && item.status !== "cancelado";
        groups[future ? "upcoming" : "history"].push(item);
        return groups;
      },
      { upcoming: [] as typeof appointments, history: [] as typeof appointments },
    );
  }, [appointments]);

  const saveProfile = async () => {
    if (!user) return;
    if (fullName.trim().length < 2) { toast.error("Digite seu nome completo."); return; }

    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      avatar_url: avatarUrl || null,
    });

    if (!error) {
      await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
    }
    setSaving(false);

    if (error) { toast.error(error.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] });
    toast.success("Perfil atualizado.");
  };

  const uploadAvatar = async (file?: File) => {
    if (!user || !file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      { toast.error("Use uma imagem JPG, PNG ou WEBP."); return; }
    }
    if (file.size > 5 * 1024 * 1024) { toast.error("A foto deve ter no máximo 5 MB."); return; }

    setUploading(true);
    const path = `${user.id}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });

    if (uploadError) {
      setUploading(false);
      { toast.error(uploadError.message); return; }
    }

    const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
    const versionedUrl = `${publicData.publicUrl}?v=${Date.now()}`;
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, avatar_url: versionedUrl });

    if (!profileError) {
      await supabase.auth.updateUser({ data: { avatar_url: versionedUrl } });
    }
    setUploading(false);

    if (profileError) { toast.error(profileError.message); return; }
    await queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] });
    toast.success("Foto de perfil atualizada.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.replace("/auth");
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-8 sm:pb-14 sm:pt-10">
        <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => avatarInput.current?.click()}
              className="group relative size-20 shrink-0 overflow-hidden rounded-full border border-border bg-primary-soft sm:size-24"
              aria-label="Alterar foto de perfil"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Foto de perfil"
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="grid size-full place-items-center text-xl font-semibold text-primary sm:text-2xl">
                  {initials || <UserRound className="size-7" />}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex h-7 items-center justify-center bg-black/55 text-white opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                <Camera className="size-3.5" />
              </span>
            </button>
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                void uploadAvatar(file);
                event.currentTarget.value = "";
              }}
            />

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Minha conta</p>
              <h1 className="mt-1 truncate text-2xl font-semibold leading-tight sm:text-3xl">{displayName}</h1>
              <p className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">{user?.email}</p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                onClick={() => avatarInput.current?.click()}
                disabled={uploading}
              >
                <Camera className="size-3.5" /> {uploading ? "Enviando foto..." : "Alterar foto"}
              </button>
            </div>

            <Button variant="ghost" size="icon" className="shrink-0 rounded-full" onClick={signOut} aria-label="Sair da conta">
              <LogOut className="size-4" />
            </Button>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-6 sm:gap-4">
          <AccountMetric label="Próximos" value={String(upcoming.length)} />
          <AccountMetric label="Histórico" value={String(history.length)} />
          <AccountMetric label="Total" value={String(appointments.length)} />
        </div>

        <Tabs defaultValue="perfil" className="mt-5 sm:mt-8">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-secondary/70 p-1 sm:w-[340px]">
            <TabsTrigger value="perfil" className="rounded-lg">Perfil</TabsTrigger>
            <TabsTrigger value="agendamentos" className="rounded-lg">Agendamentos</TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="mt-4">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-6">
              <div>
                <h2 className="text-lg font-semibold">Dados pessoais</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Essas informações serão usadas nos seus agendamentos e nas próximas etapas do sistema.
                </p>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="profile-name">Nome completo</Label>
                  <div className="relative mt-2">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="profile-name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="h-11 rounded-xl pl-10"
                      placeholder="Seu nome completo"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="profile-phone">Telefone / WhatsApp</Label>
                  <div className="relative mt-2">
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="profile-phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="h-11 rounded-xl pl-10"
                      placeholder="(85) 99999-9999"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="profile-email">E-mail da conta</Label>
                  <div className="relative mt-2">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="profile-email" value={user?.email ?? ""} readOnly className="h-11 rounded-xl bg-secondary/40 pl-10" />
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">O e-mail é vinculado à sua forma de acesso à conta.</p>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Button className="w-full rounded-full sm:w-auto" onClick={saveProfile} disabled={saving || profileQuery.isLoading}>
                  <Save className="size-4" /> {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="agendamentos" className="mt-4 space-y-6">
            {appointmentsQuery.isLoading ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
                <p className="text-sm text-muted-foreground">Carregando seus agendamentos...</p>
              </div>
            ) : appointments.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
                <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <CalendarDays className="size-5" />
                </span>
                <p className="mt-4 text-sm font-medium">Você ainda não tem agendamentos.</p>
                <p className="mt-1 text-xs text-muted-foreground">Escolha um serviço e reserve seu primeiro horário.</p>
                <Button asChild className="mt-5 rounded-full">
                  <Link to="/catalogo">Ver serviços</Link>
                </Button>
              </div>
            ) : (
              <>
                <AppointmentSection title="Próximos agendamentos" items={upcoming} empty="Nenhum atendimento futuro no momento." />
                <AppointmentSection title="Histórico" items={history} empty="Seu histórico aparecerá aqui." />
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <SiteFooter />
    </div>
  );
}

function AccountMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3 text-center shadow-soft sm:px-4 sm:py-4">
      <p className="text-xl font-semibold text-primary sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}

function AppointmentSection({ title, items, empty }: { title: string; items: any[]; empty: string }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center">
          <p className="text-xs text-muted-foreground">{empty}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold sm:text-base">{item.service?.name ?? "Serviço"}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">
                    {item.service?.professional || "Equipe JR Clinic"}
                  </p>
                </div>
                <Badge
                  variant={statusVariant[item.status as AppointmentStatus] ?? "secondary"}
                  className="shrink-0 rounded-full px-2.5 text-[10px] font-normal capitalize sm:text-xs"
                >
                  {item.status}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-secondary/45 p-3 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Data</p>
                  <p className="mt-0.5 font-medium">{formatDate(item.scheduled_date)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Horário</p>
                  <p className="mt-0.5 font-medium">{item.scheduled_time}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Valor</p>
                  <p className="mt-0.5 font-medium text-primary">
                    {item.service ? formatPrice(Number(item.service.price)) : "—"}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
