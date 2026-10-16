/**
 * Only allow post-OAuth redirects back into this app. Without this, the Zotero auth route
 * was an open redirect: `/api/zotero/auth?callback=https://anywhere` bounced users off-site.
 */
export function safeCallback(callback: string | null | undefined): string {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const fallback = `${appUrl}/dashboard`;
  if (!callback) return fallback;
  try {
    const url = new URL(callback, appUrl);
    return url.origin === new URL(appUrl).origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}
