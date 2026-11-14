import { describe, expect, test } from "bun:test";
import { iosPushVersionSupported } from "../src/lib/push-platform";

describe("iOS Home Screen Web Push version support", () => {
  test("blocks iOS before 16.4", () => {
    expect(iosPushVersionSupported("Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X)")).toBe(false);
    expect(iosPushVersionSupported("Mozilla/5.0 (iPad; CPU OS 15_7 like Mac OS X)")).toBe(false);
  });
  test("allows iOS 16.4 and later", () => {
    expect(iosPushVersionSupported("Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)")).toBe(true);
    expect(iosPushVersionSupported("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(iosPushVersionSupported("Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X)")).toBe(true);
  });
  test("permits feature detection on iPadOS desktop Safari", () => {
    const desktopSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15";
    expect(iosPushVersionSupported(desktopSafari, true)).toBe(true);
    expect(iosPushVersionSupported(desktopSafari, false)).toBe(false);
  });
});
