import { describe, expect, test } from "bun:test";
import { authErrorMessage, normalizeAuthEmail, verifiedPortalAccess } from "./auth-access";

function client({ confirmed = true, authenticated = true, enabled = true, active = true, deleted = false, admin = false } = {}) {
  const calls: string[] = [];
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: authenticated ? { email: " Staff@Example.test ", email_confirmed_at: confirmed ? "2026-10-23" : null } : null }, error: null }) },
    rpc: async (name: string) => { calls.push(name); return { data: admin, error: null }; },
    from: (table: string) => {
      const query: any = {
        select: () => query, ilike: (_key: string, value: string) => { expect(value).toBe("staff@example.test"); return query; }, eq: () => query,
        maybeSingle: async () => ({ error: null, data: table === "professional_access" ? (enabled ? { professional_id: "own-agenda", email: "STAFF@example.test", enabled: true } : null) : { id: "own-agenda", is_active: active, deleted_at: deleted ? "2026-10-23" : null } }),
      };
      return query;
    },
  };
}

describe("safe collaborator login", () => {
  test("email normalization preserves address identity", () => expect(normalizeAuthEmail(" Staff@Example.test ")).toBe("staff@example.test"));
  test("wrong credentials remain credential errors", () => expect(authErrorMessage({ code: "invalid_credentials" })).toContain("E-mail ou senha incorretos"));
  test("pending confirmation is not a password error", () => expect(authErrorMessage({ code: "email_not_confirmed" })).toContain("Confirme seu e-mail"));
  test("confirmed allowed collaborator gets professional portal without role promotion", async () => {
    const db = client();
    expect(await verifiedPortalAccess(db)).toBe("professional");
    expect(db.calls).toEqual(["is_current_user_admin"]);
  });
  test("revoked access cannot enter professional portal", async () => expect(await verifiedPortalAccess(client({ enabled: false }))).toBe("client"));
  test("inactive professional cannot enter professional portal", async () => expect(await verifiedPortalAccess(client({ active: false }))).toBe("client"));
  test("deleted professional cannot enter professional portal", async () => expect(await verifiedPortalAccess(client({ deleted: true }))).toBe("client"));
  test("unconfirmed account cannot enter", async () => expect(verifiedPortalAccess(client({ confirmed: false }))).rejects.toThrow("Confirme"));
  test("no session cannot enter", async () => expect(verifiedPortalAccess(client({ authenticated: false }))).rejects.toThrow("sessão"));
  test("existing admin stays admin", async () => expect(await verifiedPortalAccess(client({ admin: true }))).toBe("admin"));
});