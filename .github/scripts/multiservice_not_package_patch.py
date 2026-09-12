from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# Agenda: selecting two independent services is NOT a package.
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()
old = '''function appointmentComboProgress(item: any) {
  const sessions = appointmentSessionItems(item);
  if (sessions.length > 1) {
    const completed = sessions.filter((entry: any) => entry.status === "completed").length;
    return {
      items: sessions,
      total: sessions.length,
      completed,
      isCombo: true,
      started: completed > 0,
      allCompleted: completed === sessions.length,
    };
  }
  const items = appointmentServiceItems(item);
  const total = items.length;
  const completed = items.filter((entry: any) => entry.status === "completed").length;
  return {
    items,
    total,
    completed,
    isCombo: total > 1,
    started: total > 1 && completed > 0,
    allCompleted: total > 1 && completed === total,
  };
}
'''
new = '''function appointmentComboProgress(item: any) {
  const services = appointmentServiceItems(item);
  const sessions = appointmentSessionItems(item);
  const isPackage = services.length
    ? services.some((entry: any) => Number(entry?.session_count ?? serviceSessionCount(entry?.service)) > 1)
    : sessions.length > 1;

  if (isPackage) {
    const completed = sessions.filter((entry: any) => entry.status === "completed").length;
    return {
      items: sessions,
      total: sessions.length,
      completed,
      isCombo: true,
      started: completed > 0,
      allCompleted: sessions.length > 0 && completed === sessions.length,
    };
  }

  return {
    items: services,
    total: services.length,
    completed: 0,
    isCombo: false,
    started: false,
    allCompleted: false,
  };
}
'''
text = replace_once(text, old, new, "admin multiservice package classification")
path.write_text(text)


# Finance: package gating only applies when at least one selected service has >1 session.
path = Path("src/components/finance-attendance-completion.tsx")
text = path.read_text()

anchor = '''function packageSessions(appointment: any) {
  return [...(appointment?.appointment_sessions ?? [])].sort(
    (a: any, b: any) => Number(a.session_number ?? 0) - Number(b.session_number ?? 0),
  );
}
'''
insert = anchor + '''
function isPackageAppointment(appointment: any) {
  const items = comboItems(appointment);
  if (items.length) {
    return items.some((item: any) => Number(item?.session_count ?? item?.service?.session_count ?? 1) > 1);
  }
  return packageSessions(appointment).length > 1;
}
'''
text = replace_once(text, anchor, insert, "finance package helper")

text = replace_once(
    text,
    'appointment_services(service_id,position,price_snapshot,status,completed_at,service:services!appointment_services_service_id_fkey(name,price))',
    'appointment_services(service_id,position,price_snapshot,session_count,status,completed_at,service:services!appointment_services_service_id_fkey(name,price,session_count))',
    "finance session_count select",
)

text = replace_once(
    text,
    '''      const sessions = packageSessions(row);
      if (sessions.length > 1) return sessions.every((session: any) => session.status === "completed");
      return row.status === "confirmado";''',
    '''      const sessions = packageSessions(row);
      if (isPackageAppointment(row)) return sessions.length > 0 && sessions.every((session: any) => session.status === "completed");
      return row.status === "confirmado";''',
    "finance package queue filter",
)

text = replace_once(
    text,
    'const hasPendingPackageSessions = selectedSessions.length > 1 && selectedSessions.some((item: any) => item.status !== "completed");',
    'const hasPendingPackageSessions = isPackageAppointment(selected) && selectedSessions.some((item: any) => item.status !== "completed");',
    "finance package pending flag",
)

text = replace_once(
    text,
    '{selectedSessions.length > 1 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">',
    '{isPackageAppointment(selected) && selectedSessions.length > 0 ? <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">',
    "finance package sessions panel",
)

path.write_text(text)
