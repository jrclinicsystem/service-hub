import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import {
  JR_CLINIC_SUPABASE_PUBLISHABLE_KEY,
  JR_CLINIC_SUPABASE_URL,
} from "@/integrations/supabase/project";

function publicClient() {
  return createClient(JR_CLINIC_SUPABASE_URL, JR_CLINIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const getCatalogPresentation = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicClient() as any;
  const { data, error } = await db
    .from("categories")
    .select("id")
    .eq("is_featured", true)
    .maybeSingle();

  if (error) throw error;
  return { featuredCategoryId: data?.id ?? null };
});
