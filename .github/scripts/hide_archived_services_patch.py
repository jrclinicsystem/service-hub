from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)


path = Path("src/routes/admin.tsx")
text = path.read_text(encoding="utf-8")

old_select = '"id, slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation, session_count, is_active",'
new_select = '"id, slug, name, category_id, professional, professional_role, duration_min, price, rating, reviews_count, summary, description, includes, preparation, session_count, is_active, archived_at",'
if new_select not in text:
    text = replace_once(text, old_select, new_select, "services select archived_at")

old_metrics = '''  const uniquePatients = new Set(data.appointments.map((item: any) => item.patient_email)).size;
  const activeServices = data.services.filter((item: any) => item.is_active).length;'''
new_metrics = '''  const uniquePatients = new Set(data.appointments.map((item: any) => item.patient_email)).size;
  const visibleServices = data.services.filter((item: any) => !item.archived_at);
  const activeServices = visibleServices.filter((item: any) => item.is_active).length;'''
if "const visibleServices =" not in text:
    text = replace_once(text, old_metrics, new_metrics, "visible services collection")

text = text.replace("{data.services.map((service: any) => (", "{visibleServices.map((service: any) => (", 2)
text = text.replace("<PromotionEditor services={data.services} onSaved={refresh} />", "<PromotionEditor services={visibleServices} onSaved={refresh} />", 1)

old_toast = '''      if (String(data ?? "") === "archived") {
        toast.success("Serviço arquivado.", {
          description: "O histórico foi preservado e ele não aparece em novos agendamentos.",
        });
      } else {
        toast.success("Serviço excluído.");
      }'''
new_toast = '''      if (String(data ?? "") === "archived") {
        toast.success("Serviço removido da lista.", {
          description: "Os agendamentos antigos continuam preservados no histórico.",
        });
      } else {
        toast.success("Serviço excluído.");
      }'''
if "Serviço removido da lista." not in text:
    text = replace_once(text, old_toast, new_toast, "archive toast copy")

old_confirm = '''      `Excluir "${service.name}"?\\n\\nSe esse serviço já tiver histórico, ele será apenas arquivado para preservar os agendamentos antigos.`,'''
new_confirm = '''      `Excluir "${service.name}"?\\n\\nEle sairá da lista de serviços. Se houver agendamentos antigos, o histórico continuará preservado.`,'''
if "Ele sairá da lista de serviços." not in text:
    text = replace_once(text, old_confirm, new_confirm, "delete confirmation copy")

path.write_text(text, encoding="utf-8")
print("Archived services catalog patch applied")
