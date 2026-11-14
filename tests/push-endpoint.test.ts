import { describe, expect, test } from "bun:test";
import { allowedPushEndpoint } from "../src/lib/push-endpoint";

describe("Web Push network destination policy", () => {
  test("permits browser push provider endpoints", () => {
    expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/test")).toBe(true);
    expect(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/test")).toBe(true);
    expect(allowedPushEndpoint("https://web.push.apple.com/test")).toBe(true);
    expect(allowedPushEndpoint("https://gateway.push.apple.com/3/device/test")).toBe(true);
    expect(allowedPushEndpoint("https://foo.notify.windows.com/?token=test")).toBe(true);
  });

  test("rejects local, private and untrusted destinations", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/test",
      "https://127.0.0.1/admin",
      "https://localhost/private",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.1/admin",
      "https://fcm.googleapis.com.evil.invalid/a",
      "https://fcm.googleapis.com@127.0.0.1/a",
      "https://fcm.googleapis.com:8443/a",
      "https://fcm.googleapis.com/a#section",
      "not-a-url",
    ]) {
      expect(allowedPushEndpoint(endpoint)).toBe(false);
    }
  });
});
