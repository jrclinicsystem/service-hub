import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

import { JR_CLINIC_SUPABASE_URL } from "@/integrations/supabase/project";

const requestSchema = z.object({}).strict();
const MAX_BATCH = 20;

function authorized(request: Request, secret: string) {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
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

async function complete(db: any, deliveryId: string, outcome: "sent" | "failed", error?: string, gone = false) {
  const { error: completionError } = await db.rpc("complete_push_delivery", {
    _delivery_id: deliveryId,
    _outcome: outcome,
    _error: error?.slice(0, 1000) ?? null,
    _gone: gone,
  });
  if (completionError) console.error("Unable to complete push delivery", completionError.message);
}

export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const dispatchSecret = process.env["PUSH_DISPATCH_SECRET"];
        if (!dispatchSecret || !authorized(request, dispatchSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const rawBody = await request.text();
        const parsed = requestSchema.safeParse(rawBody ? JSON.parse(rawBody) : {});
        if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

        const serviceKey = process.env["JR_CLINIC_SERVICE_ROLE_KEY"];
        const publicKey = process.env["VAPID_PUBLIC_KEY"];
        const privateKey = process.env["VAPID_PRIVATE_KEY"];
        const subject = process.env["VAPID_SUBJECT"];
        if (!serviceKey || !publicKey || !privateKey || !subject) {
          return Response.json({ error: "Push delivery is not configured" }, { status: 503 });
        }

        const db = createBackendClient(serviceKey);
        const { data: deliveries, error } = await db.rpc("claim_push_deliveries", { _batch_size: MAX_BATCH });
        if (error) {
          console.error("Unable to claim push deliveries", error.message);
          return Response.json({ error: "Unable to claim deliveries" }, { status: 502 });
        }

        const vapid: VapidKeys = { subject, publicKey, privateKey };
        let sent = 0;
        let failed = 0;
        // Chunks stay below the server runtime outbound-connection limit.
        for (let index = 0; index < (deliveries ?? []).length; index += 5) {
          const chunk = deliveries.slice(index, index + 5);
          await Promise.all(chunk.map(async (delivery: any) => {
            const subscription: PushSubscription = {
              endpoint: delivery.endpoint,
              expirationTime: null,
              keys: { p256dh: delivery.p256dh, auth: delivery.auth },
            };
            try {
              const payload = await buildPushPayload({
                data: JSON.stringify({
                  title: delivery.title,
                  body: delivery.body,
                  url: delivery.deep_link,
                  tag: delivery.notification_id,
                }),
                options: { ttl: 86400 },
              }, subscription, vapid);
              const response = await fetch(subscription.endpoint, payload);
              if (response.ok) {
                sent += 1;
                await complete(db, delivery.delivery_id, "sent");
              } else {
                const gone = response.status === 404 || response.status === 410;
                failed += 1;
                await complete(db, delivery.delivery_id, "failed", `Push service HTTP ${response.status}`, gone);
              }
            } catch (pushError) {
              failed += 1;
              const message = pushError instanceof Error ? pushError.message : "Push request failed";
              await complete(db, delivery.delivery_id, "failed", message);
            }
          }));
        }

        return Response.json({ claimed: deliveries?.length ?? 0, sent, failed });
      },
    },
  },
});
