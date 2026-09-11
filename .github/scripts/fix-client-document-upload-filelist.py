from pathlib import Path

path = Path('src/components/client-profile-dialog.tsx')
text = path.read_text(encoding='utf-8')

old = '''  const uploadFiles = async (files: FileList | null) => {\n    if (!clientId || !files?.length) return;\n    setUploading(true);\n    try {\n      const { data: auth } = await supabase.auth.getUser();\n      for (const file of Array.from(files)) {'''
new = '''  const uploadFiles = async (files: FileList | null) => {\n    // FileList is tied to the input element and becomes empty when the input is reset.\n    // Snapshot the selected files synchronously before the first await.\n    const selectedFiles = files ? Array.from(files) : [];\n    if (!clientId || !selectedFiles.length) return;\n    setUploading(true);\n    try {\n      const { data: auth } = await supabase.auth.getUser();\n      for (const file of selectedFiles) {'''

if old not in text:
    raise SystemExit('uploadFiles start pattern not found')
text = text.replace(old, new, 1)

old_toast = '''      toast.success(files.length === 1 ? "Arquivo anexado à ficha." : `${files.length} arquivos anexados à ficha.`);'''
new_toast = '''      toast.success(selectedFiles.length === 1 ? "Arquivo anexado à ficha." : `${selectedFiles.length} arquivos anexados à ficha.`);'''
if old_toast not in text:
    raise SystemExit('uploadFiles toast pattern not found')
text = text.replace(old_toast, new_toast, 1)

path.write_text(text, encoding='utf-8')
print('client document FileList upload fix applied')
