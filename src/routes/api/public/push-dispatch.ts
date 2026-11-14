import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";
import { z } from "zod";

import { JR_CLINIC_SUPABASE_URL } from "@/integrations/supabase/project";

const requestSchema = z.object({}).strict();
const MAX_BATCH = 20;

function authorized(request: Request, secret: string) {
  const supplied = new TextEncoder().encode(request.headers.get("authorization") ?? "");
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  let different = supplied.length ^ expected.length;
  for (let index = 0; index < Math.max(supplied.length, expected.length); index++) {
    different |= (supplied[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return different === 0;
}

function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isProvider = hostname === "fcm.googleapis.com"
      || hostname === "updates.push.services.mozilla.com"
      || hostname === "web.push.apple.com"
      || (hostname.endsWith(".push.apple.com") && hostname !== ".push.apple.com")
      || (hostname.endsWith(".notify.windows.com") && hostname !== ".notify.windows.com");
    return url.protocol === "https:" && !url.username && !url.password
      && !url.port && !url.hash && isProvider;
  } catch {
    return false;
  }
}

function createBackendClient(serviceKey: string) {
  return createClient(JR_CLINIC_SUPABASE_URL, serviceKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (serviceKey.startsWith("sb_") && headers.get("Authorization") === `Bearer ${serviceKey}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", serviceKey);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function complete(
  db: any, deliveryId: string, claimToken: string,
  outcome: "sent" | "failed", error?: string, gone = false,
) {
  const { error: completionError } = await db.rpc("complete_push_delivery_v2", {
    _delivery_id: deliveryId,
    _claim_token: claimToken,
    _outcome: outcome,
    _error: error?.slice(0, 1000) ?? null,
    _gone: gone,
  });
  if (completionError) throw new Error(`Unable to complete push delivery: ${completionError.message}`);
}

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const dispatchSecret = process.env["PUSH_DISPATCH_SECRET"];
        if (!dispatchSecret || !authorized(request, dispatchSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: unknown;
        try {
          const rawBody = await request.text();
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

        const serviceKey = process.env["JR_CLINIC_SERVICE_ROLE_KEY"];
        const publicKey = process.env["VAPID_PUBLIC_KEY"];
        const privateKey = process.env["VAPID_PRIVATE_KEY"];
        const subject = process.env["VAPID_SUBJECT"];
        if (!serviceKey || !publicKey || !privateKey || !subject) {
          return Response.json({ error: "Push delivery is not configured" }, { status: 503 });
        }

        const db = createBackendClient(serviceKey);
        const { data: deliveries, error } = await db.rpc("claim_push_deliveries_v2", { _batch_size: MAX_BATCH });
        if (error) {
          console.error("Unable to claim push deliveries", error.message);
          return Response.json({ error: "Unable to claim deliveries" }, { status: 502 });
        }

        const vapid: VapidKeys = { subject, publicKey, privateKey };
        let sent = 0;
        let failed = 0;
        let completionFailures = 0;

        for (let index = 0; index < (deliveries ?? []).length; index += 5) {
          const chunk = deliveries.slice(index, index + 5);
          await Promise.all(chunk.map(async (delivery: any) => {
            let outcome: "sent" | "failed" = "failed";
            let gone = false;
            let failureReason = "Falha desconhecida no serviço Web Push.";

            try {
              if (!allowedPushEndpoint(delivery.endpoint)) {
                gone = true;
                failureReason = "Inscrição com destino não permitido";
              } else {
                const subscription: PushSubscription = {
                  endpoint: delivery.endpoint,
                  expirationTime: null,
                  keys: { p256dh: delivery.p256dh, auth: delivery.auth },
                };
                const payload = await buildPushPayload({
                  data: JSON.stringify({
                    title: delivery.title,
                    body: delivery.body,
                    url: delivery.deep_link,
                    tag: delivery.notification_id,
                  }),
                  options: { ttl: 86400 },
                }, subscription, vapid);
                const response = await fetch(subscription.endpoint, {
                  ...payload,
                  redirect: "error",
                  signal: AbortSignal.timeout(12_000),
                });
                outcome = response.ok ? "sent" : "failed";
                gone = response.status === 404 || response.status === 410;
                failureReason = `Push service HTTP ${response.status}`;
              }
            } catch (pushError) {
              failureReason = pushError instanceof Error ? pushError.message : "Push request failed";
            }

            if (outcome === "sent") sent += 1;
            else failed += 1;

            try {
              await complete(db, delivery.delivery_id, delivery.claim_token,
                outcome, outcome === "sent" ? undefined : failureReason, gone);
            } catch (completionError) {
              completionFailures += 1;
              console.error("Push delivery state not persisted", completionError);
            }
          }));
        }

        return Response.json(
          { claimed: deliveries?.length ?? 0, sent, failed, completionFailures },
          { status: completionFailures > 0 ? 502 : 200 },
        );
      },
    },
  },
});
