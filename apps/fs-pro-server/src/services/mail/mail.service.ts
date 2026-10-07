/**
 * Sends email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 *   RESEND_API_KEY   the API key. Without it nothing is sent: outside
 *                    production the message is printed to the server log
 *                    (links included) so sign-up flows work locally; in
 *                    production it logs an error and reports failure.
 *   MAIL_FROM        "FS Pro <noreply@your-domain>" - the domain must be
 *                    verified in Resend.
 *   APP_URL          the public address of the client, used in emailed links.
 *   RESEND_API_URL   override for tests; defaults to https://api.resend.com.
 *
 * Plain fetch, no SDK: one call, and one dependency fewer.
 */

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const isProduction = () => process.env.NODE_ENV?.trim() === 'production';

/** Where emailed links point: the client, which sits on the same origin as the API in production. */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim() || process.env.FSPRO_CLIENT_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const host = process.env.REMOTE_HOST?.trim();
  if (isProduction() && host && host !== 'localhost') return `https://${host}`;
  return 'http://localhost:8080';
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    if (isProduction()) {
      console.error(`[mail] RESEND_API_KEY is not set - could not send "${mail.subject}" to ${mail.to}`);
      return false;
    }
    console.log(`[mail] (not sent: no RESEND_API_KEY) to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return true;
  }
  const from = process.env.MAIL_FROM?.trim();
  if (!from) {
    console.error('[mail] MAIL_FROM is not set');
    return false;
  }
  const base = (process.env.RESEND_API_URL?.trim() || 'https://api.resend.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[mail] Resend rejected "${mail.subject}" to ${mail.to}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[mail] could not reach Resend: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The campus look in email-safe HTML: cream card, wooden header, green button. */
function layout(title: string, intro: string, button: { label: string; url: string }, outro: string): Pick<Mail, 'html' | 'text'> {
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#d8eef8;font-family:Fredoka,Arial,Helvetica,sans-serif;color:#4a3220">
<table role="presentation" align="center" width="100%" style="max-width:520px;background:#fdf4df;border:3px solid #c9a46a;border-radius:18px;border-collapse:separate">
<tr><td style="background:#5e3b22;color:#fff;padding:14px 22px;border-radius:14px 14px 0 0;font-size:20px;font-weight:700">FS Pro</td></tr>
<tr><td style="padding:22px">
<h1 style="margin:0 0 10px;font-size:22px;color:#5e3b22">${esc(title)}</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.5">${esc(intro)}</p>
<p style="margin:0 0 18px"><a href="${esc(button.url)}" style="display:inline-block;padding:12px 22px;background:#3fa526;border:3px solid #2c7d18;border-radius:14px;color:#fff;font-weight:700;text-decoration:none">${esc(button.label)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#8b7357">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(button.url)}</span></p>
<p style="margin:14px 0 0;font-size:13px;color:#8b7357">${esc(outro)}</p>
</td></tr></table></body></html>`;
  const text = `${title}\n\n${intro}\n\n${button.label}: ${button.url}\n\n${outro}\n`;
  return { html, text };
}

export function verificationMail(to: string, name: string, token: string): Mail {
  const url = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Confirm your email for FS Pro',
    ...layout(
      `Welcome, ${name}!`,
      'Confirm your email address to found your club and keep your account safe. The link works for 24 hours.',
      { label: 'Confirm my email', url },
      "If you didn't create an FS Pro account, you can ignore this email."
    ),
  };
}

export function resetMail(to: string, name: string, token: string): Mail {
  const url = `${appUrl()}/auth/reset?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Reset your FS Pro password',
    ...layout(
      `Hi ${name}, forgot your password?`,
      'Choose a new one with the button below. The link works for one hour and only once.',
      { label: 'Choose a new password', url },
      "If you didn't ask for this, ignore this email - your password stays as it is."
    ),
  };
}
