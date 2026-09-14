from pathlib import Path

path = Path("src/components/admin-appointments-workspace.tsx")
source = path.read_text(encoding="utf-8")

start_marker = "  const removeAppointment = async (appointment: any) => {"
end_marker = "\n\n  const reopenAppointment = async (appointment: any) => {"

if start_marker not in source or end_marker not in source:
    raise SystemExit("Could not locate the appointment deletion handler")

start = source.index(start_marker)
end = source.index(end_marker, start)

replacement = '''  const removeAppointment = async (appointment: any) => {
    if (
      !window.confirm(
        `Excluir definitivamente o agendamento de ${appointment.patient_name}? Esta ação é irreversível e o registro não ficará no Histórico.`,
      )
    )
      return;
    setDeletingId(appointment.id);
    const { error } = await db.rpc("delete_appointment_permanently", {
      _appointment_id: appointment.id,
    });
    setDeletingId(null);
    if (error) {
      toast.error("Não foi possível excluir o agendamento.", {
        description: error.message,
      });
      return;
    }
    if (selected?.id === appointment.id) setSelected(null);
    if (incoming?.id === appointment.id) setIncoming(null);
    toast.success("Agendamento excluído definitivamente.", {
      description: "O registro foi removido e não aparecerá mais no Histórico.",
    });
    onRefresh();
  };'''

source = source[:start] + replacement + source[end:]

old_title = '          title="Cancelar e arquivar agendamento"'
new_title = '          title="Excluir agendamento definitivamente"'
if old_title not in source:
    raise SystemExit("Could not locate the trash-button title")
source = source.replace(old_title, new_title, 1)

path.write_text(source, encoding="utf-8")
