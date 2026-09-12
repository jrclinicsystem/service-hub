from pathlib import Path

# Client profile needs icons introduced by the main package-sessions patch.
path = Path("src/components/client-profile-dialog.tsx")
text = path.read_text()
old = 'import { CalendarDays, FileText, FolderOpen, Image, Loader2, Paperclip, Plus, ReceiptText, Save, Trash2, Upload, UserRound } from "lucide-react";'
new = 'import { CalendarDays, FileText, FolderOpen, Image, Loader2, Paperclip, Pencil, Plus, ReceiptText, Save, Stethoscope, Trash2, Upload, UserRound } from "lucide-react";'
if new not in text:
    if old not in text:
        raise SystemExit("client profile lucide import anchor not found")
    text = text.replace(old, new, 1)
path.write_text(text)

# Reopening should also work for a one-visit multi-service attendance. Only true
# multi-session packages require reopening a specific session instead.
path = Path("src/components/admin-appointments-workspace.tsx")
text = path.read_text()
text = text.replace(
    '{!combo.isCombo ? <Button type="button" size="sm" variant="outline" className="w-full rounded-xl" disabled={attendanceBusy} onClick={onReopen}>',
    '{appointmentSessionItems(appointment).length <= 1 ? <Button type="button" size="sm" variant="outline" className="w-full rounded-xl" disabled={attendanceBusy} onClick={onReopen}>',
)
text = text.replace(
    '{!combo.isCombo ? <Button type="button" variant="outline" className="w-full rounded-xl" disabled={busy} onClick={onReopen}>',
    '{appointmentSessionItems(appointment).length <= 1 ? <Button type="button" variant="outline" className="w-full rounded-xl" disabled={busy} onClick={onReopen}>',
)
path.write_text(text)
