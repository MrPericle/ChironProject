const sessionRefreshLeadMs = 60_000;
const fallbackSessionRefreshMs = 25 * 60_000;

export function accessTokenRefreshDelay(accessToken: string, now = Date.now()): number {
  try {
    const payloadSegment = accessToken.split(".")[1];
    if (payloadSegment === undefined) {
      return fallbackSessionRefreshMs;
    }
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp !== "number") {
      return fallbackSessionRefreshMs;
    }
    return Math.max(payload.exp * 1000 - now - sessionRefreshLeadMs, 1_000);
  } catch {
    return fallbackSessionRefreshMs;
  }
}
