export function normalizeCategoryName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

export function categorySlug(name: string) {
  return normalizeCategoryName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Returns an error message, or null when the name can be created. */
export function validateCategoryName(
  name: string,
  existing: { id: string; name: string }[],
): string | null {
  const clean = normalizeCategoryName(name);
  if (!clean) return "Informe o nome da especialidade.";
  if (clean.length < 2) return "O nome precisa ter pelo menos 2 caracteres.";
  if (clean.length > 80) return "Use no máximo 80 caracteres.";
  const slug = categorySlug(clean);
  if (!slug) return "Use letras ou números no nome.";
  const duplicate = existing.some(
    (c) => categorySlug(c.name) === slug || c.id === slug,
  );
  return duplicate ? "Já existe uma especialidade com esse nome." : null;
}
