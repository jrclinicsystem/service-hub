import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { categorySlug, normalizeCategoryName, validateCategoryName } from "@/lib/category";

type Category = { id: string; name: string; sort_order?: number | null };

export function CategoryCreator({
  categories,
  onCreated,
  compact = false,
}: {
  categories: Category[];
  onCreated: (id: string) => void | Promise<void>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const validation = validateCategoryName(name, categories);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    const id = categorySlug(name);
    const sortOrder =
      categories.reduce((max, c) => Math.max(max, Number(c.sort_order ?? 0)), 0) + 1;
    const { error: insertError } = await supabase.from("categories").insert({
      id,
      name: normalizeCategoryName(name),
      description: description.trim(),
      sort_order: sortOrder,
    });
    setBusy(false);
    if (insertError) {
      const message =
        insertError.code === "23505"
          ? "Já existe uma especialidade com esse nome."
          : insertError.code === "42501" || /row-level security|permission/i.test(insertError.message)
            ? "Sua conta não tem permissão de administradora para criar especialidades."
            : `Não foi possível criar a especialidade: ${insertError.message}`;
      setError(message);
      toast.error(message);
      return;
    }
    toast.success("Especialidade criada.");
    setName("");
    setDescription("");
    setOpen(false);
    await onCreated(id);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={compact ? "h-8 px-2 text-xs" : "rounded-full"}>
          <Plus className="size-4" />
          {compact ? "Nova" : "Nova especialidade"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova especialidade</DialogTitle>
          <DialogDescription>
            Agrupa serviços no catálogo e no agendamento. Ela aparece para os clientes quando tiver serviços ativos.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 py-2"
          onSubmit={(event) => { event.preventDefault(); void submit(); }}
        >
          <div>
            <Label htmlFor="new-category-name" className="mb-2 block">Nome *</Label>
            <Input
              id="new-category-name"
              value={name}
              maxLength={80}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "new-category-error" : undefined}
              onChange={(event) => { setName(event.target.value); setError(null); }}
              placeholder="Ex.: Estética facial"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="new-category-description" className="mb-2 block">Descrição (opcional)</Label>
            <Input
              id="new-category-description"
              value={description}
              maxLength={200}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {error ? <p id="new-category-error" role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Criar especialidade"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
