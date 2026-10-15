import { Email } from "@convex-dev/auth/providers/Email";
import { sendEmail } from "./email";

function digits(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += String(b % 10);
  return out;
}

/** 8-digit reset code sent through Resend. */
export const ResendOTPPasswordReset = Email({
  id: "resend-otp-reset",
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return digits(8);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const ok = await sendEmail({
      to: email,
      subject: `Your UnSplit reset code: ${token}`,
      text: `Use this code to set a new password: ${token}\n\nIt expires in 15 minutes. If you didn't ask for it, ignore this email.`,
      html: `<p>Use this code to set a new password:</p><p style="font-size:24px;font-weight:600;letter-spacing:2px">${token}</p><p>It expires in 15 minutes. If you didn't ask for it, ignore this email.</p>`,
    });
    if (!ok) throw new Error("Email isn't configured on this deployment (RESEND_API_KEY missing)");
  },
});
