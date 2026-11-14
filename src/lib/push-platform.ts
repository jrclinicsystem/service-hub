/**
 * iPadOS desktop Safari can omit the iOS version in its user-agent.
 * When the version is absent, rely on feature detection in the caller.
 */
export function iosPushVersionSupported(userAgent: string, isDesktopIpad = false) {
  const match = userAgent.match(/OS (\d+)[_.](\d+)(?:[_.]\d+)?/);
  if (!match) return isDesktopIpad;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 16 || (major === 16 && minor >= 4);
}
