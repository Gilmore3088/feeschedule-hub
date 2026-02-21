/**
 * Email integration for Bank Fee Index.
 * Uses Resend when RESEND_API_KEY is set, otherwise logs to console (mock mode).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "Bank Fee Index <alerts@bankfeeindex.com>";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; id?: string }> {
  if (!RESEND_API_KEY) {
    console.log("[EMAIL MOCK]", {
      to: payload.to,
      subject: payload.subject,
      bodyLength: payload.html.length,
    });
    return { success: true, id: "mock_" + Date.now() };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[EMAIL ERROR]", error);
    return { success: false };
  }

  const data = await response.json();
  return { success: true, id: data.id };
}

export function buildAlertEmailHtml(digest: {
  period: string;
  fee_increases: { institution_name: string; fee_display_name: string; old_amount: number; new_amount: number; change_pct: number }[];
  fee_decreases: { institution_name: string; fee_display_name: string; old_amount: number; new_amount: number; change_pct: number }[];
  new_institutions: number;
}): string {
  const rows = (items: typeof digest.fee_increases, direction: "up" | "down") =>
    items
      .map(
        (i) =>
          `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${i.institution_name}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${i.fee_display_name}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${i.old_amount.toFixed(2)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;text-align:right">$${i.new_amount.toFixed(2)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:${direction === "up" ? "#dc2626" : "#059669"}">
              ${direction === "up" ? "+" : ""}${i.change_pct}%
            </td>
          </tr>`
      )
      .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;max-width:640px;margin:0 auto;padding:20px">
  <h1 style="font-size:18px;font-weight:700;margin-bottom:4px">Bank Fee Index - Weekly Alert</h1>
  <p style="font-size:13px;color:#64748b;margin-top:0">${digest.period}</p>

  ${digest.fee_increases.length > 0 ? `
  <h2 style="font-size:14px;font-weight:600;margin-top:24px;color:#dc2626">Fee Increases (&gt;10%)</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#f8fafc">
      <th style="padding:6px 12px;text-align:left">Institution</th>
      <th style="padding:6px 12px;text-align:left">Fee</th>
      <th style="padding:6px 12px;text-align:right">Old</th>
      <th style="padding:6px 12px;text-align:right">New</th>
      <th style="padding:6px 12px;text-align:right">Change</th>
    </tr></thead>
    <tbody>${rows(digest.fee_increases, "up")}</tbody>
  </table>` : ""}

  ${digest.fee_decreases.length > 0 ? `
  <h2 style="font-size:14px;font-weight:600;margin-top:24px;color:#059669">Fee Decreases (&gt;10%)</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#f8fafc">
      <th style="padding:6px 12px;text-align:left">Institution</th>
      <th style="padding:6px 12px;text-align:left">Fee</th>
      <th style="padding:6px 12px;text-align:right">Old</th>
      <th style="padding:6px 12px;text-align:right">New</th>
      <th style="padding:6px 12px;text-align:right">Change</th>
    </tr></thead>
    <tbody>${rows(digest.fee_decreases, "down")}</tbody>
  </table>` : ""}

  ${digest.new_institutions > 0 ? `
  <p style="font-size:13px;margin-top:24px"><strong>${digest.new_institutions}</strong> new institution${digest.new_institutions === 1 ? "" : "s"} added this week.</p>
  ` : ""}

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="font-size:11px;color:#94a3b8">
    Bank Fee Index | <a href="https://bankfeeindex.com/account" style="color:#64748b">Manage alerts</a>
    | <a href="https://bankfeeindex.com" style="color:#64748b">bankfeeindex.com</a>
  </p>
</body>
</html>`;
}
