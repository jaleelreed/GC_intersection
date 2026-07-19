// Error reporting, pluggable. Always logs structured JSON (visible in Vercel
// logs); forwards to a webhook when MONITOR_WEBHOOK_URL is set (Sentry, Slack,
// etc.). No account required to ship; wire the URL later for alerts.
export async function captureError(err: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const payload = {
    level: "error",
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    ...context,
  };
  console.error("[captureError]", JSON.stringify(payload));

  const url = process.env.MONITOR_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* monitoring must never break the request */
    }
  }
}
