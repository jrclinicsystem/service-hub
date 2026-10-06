from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


admin_path = Path("src/routes/admin.tsx")
admin = admin_path.read_text(encoding="utf-8")

if "  Trash2,\n" not in admin:
    admin = replace_once(
        admin,
        '  Tag,\n  Users,\n} from "lucide-react";',
        '  Tag,\n  Trash2,\n  Users,\n} from "lucide-react";',
        "admin Trash2 import",
    )

start = admin.index("function ServiceEditor({")
end = admin.index("function PromotionEditor(", start)
service_editor = admin[start:end]

if "const [deleting, setDeleting]" not in service_editor:
    service_editor = replace_once(
        service_editor,
        '  const [descriptionText, setDescriptionText] = useState(service?.description ?? "");\n  const [busy, setBusy] = useState(false);',
        '  const [descriptionText, setDescriptionText] = useState(service?.description ?? "");\n  const [busy, setBusy] = useState(false);\n  const [deleting, setDeleting] = useState(false);',
        "service delete state",
    )

if "const remove = async ()" not in service_editor:
    anchor = '''    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>'''
    replacement = '''    onSaved();
  };

  const remove = async () => {
    if (!service?.id || busy) return;
    const confirmed = window.confirm(
      `Excluir "${service.name}"?\\n\\nSe esse serviço já tiver histórico, ele será apenas arquivado para preservar os agendamentos antigos.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setDeleting(true);
    try {
      const { data, error } = await db.rpc("delete_admin_service", {
        _service_id: service.id,
      });
      if (error) throw error;

      if (String(data ?? "") === "archived") {
        toast.success("Serviço arquivado.", {
          description: "O histórico foi preservado e ele não aparece em novos agendamentos.",
        });
      } else {
        toast.success("Serviço excluído.");
      }
      setOpen(false);
      onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível excluir o serviço.");
    } finally {
      setDeleting(false);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>'''
    service_editor = replace_once(service_editor, anchor, replacement, "service remove handler")

old_footer = '''        <DialogFooter>
          <Button className="w-full sm:w-auto" disabled={busy} onClick={save}>
            {busy ? "Salvando..." : "Salvar serviço"}
          </Button>
        </DialogFooter>'''
new_footer = '''        <DialogFooter className="gap-2 sm:justify-between">
          {service ? (
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={remove}
            >
              <Trash2 className="size-4" />
              {deleting ? "Excluindo..." : "Excluir serviço"}
            </Button>
          ) : null}
          <Button className="w-full sm:w-auto" disabled={busy} onClick={save}>
            {busy && !deleting ? "Salvando..." : "Salvar serviço"}
          </Button>
        </DialogFooter>'''
if "Excluir serviço" not in service_editor:
    service_editor = replace_once(service_editor, old_footer, new_footer, "service delete footer")

admin = admin[:start] + service_editor + admin[end:]
admin_path.write_text(admin, encoding="utf-8")

appointments_path = Path("src/components/admin-appointments-workspace.tsx")
appointments = appointments_path.read_text(encoding="utf-8")

active_query = '''      db
        .from("services")
        .select("id, name, price, duration_min, session_count, is_active")
        .eq("is_active", true)
        .order("name"),'''
all_query = '''      db
        .from("services")
        .select("id, name, price, duration_min, session_count, is_active")
        .order("name"),'''
if active_query in appointments:
    appointments = replace_once(appointments, active_query, all_query, "appointment service catalog query")

old_filter = '''  const filteredServices = useMemo(() => {
    const term = serviceSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return services;
    return services.filter((service) =>
      String(service.name ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [services, serviceSearch]);'''
new_filter = '''  const selectableServices = useMemo(
    () => services.filter((service) => service.is_active || serviceIds.includes(service.id)),
    [services, serviceIds],
  );

  const filteredServices = useMemo(() => {
    const term = serviceSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) return selectableServices;
    return selectableServices.filter((service) =>
      String(service.name ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [selectableServices, serviceSearch]);'''
if "const selectableServices = useMemo(" not in appointments:
    appointments = replace_once(appointments, old_filter, new_filter, "appointment selectable services")

old_price = '''                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {formatPrice(Number(service.price ?? 0))}
                          </span>'''
new_price = '''                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {formatPrice(Number(service.price ?? 0))}
                            {!service.is_active ? " · inativo (histórico)" : ""}
                          </span>'''
if "inativo (histórico)" not in appointments:
    appointments = replace_once(appointments, old_price, new_price, "inactive historical service label")

appointments_path.write_text(appointments, encoding="utf-8")
print("JR Clinic service hotfix applied")
