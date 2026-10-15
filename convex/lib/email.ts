/**
 * Transactional email through Resend's REST API. Returns false (and logs)
 * when RESEND_API_KEY is not set, so every caller degrades gracefully.
 */
export type EmailArgs = { to: string; subject: string; text: string; html?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

export async function sendEmail(args: EmailArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped: no RESEND_API_KEY] to=${args.to} subject=${args.subject}`);
    return false;
  }
  const from = process.env.EMAIL_FROM ?? "UnSplit <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
      html: args.html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(args.text)}</pre>`,
    }),
  });
  if (!res.ok) {
    console.error(`Resend error ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function layout(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f7f8;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#17171c">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e4e4e9;border-radius:14px;padding:28px">
    <div style="font-weight:700;font-size:18px;margin-bottom:16px">UnSplit</div>
    <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
    <div style="font-size:15px;line-height:22px;color:#5f5f6b">${bodyHtml}</div>
    ${ctaUrl ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600">${escapeHtml(ctaLabel ?? "Open UnSplit")}</a></p>` : ""}
    <p style="font-size:12px;color:#8a8a96;margin-top:24px">You get this email because of your UnSplit notification settings. Change them in Account → Notifications.</p>
  </div></body></html>`;
}
