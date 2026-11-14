import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verifiedPortalAccess } from "@/lib/auth-access";

export const getPushNotificationConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const destination = await verifiedPortalAccess(context.supabase);
    if (destination !== "professional") return { enabled: false as const, publicKey: null };
    return {
      enabled: Boolean(process.env["VAPID_PUBLIC_KEY"] && process.env["VAPID_PRIVATE_KEY"] && process.env["VAPID_SUBJECT"] && process.env["PUSH_DISPATCH_SECRET"] && process.env["JR_CLINIC_SERVICE_ROLE_KEY"]),
      publicKey: process.env["VAPID_PUBLIC_KEY"] ?? null,
    };
  });
