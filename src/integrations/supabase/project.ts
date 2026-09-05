export const JR_CLINIC_SUPABASE_PROJECT_ID = "aurualytmbmudlfebujv";
export const JR_CLINIC_SUPABASE_URL = "https://aurualytmbmudlfebujv.supabase.co";

const stagingPublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!stagingPublishableKey) {
  throw new Error(
    "Finance staging Supabase key is not configured. Production access is intentionally disabled on this branch.",
  );
}

export const JR_CLINIC_SUPABASE_PUBLISHABLE_KEY = stagingPublishableKey;
