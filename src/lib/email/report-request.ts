/**
 * Emails behind the Competitive Fee Position Report request form, the contact
 * form, and confirmation-only leads (newsletter signups, notify-me requests).
 * Storage happens first in /api/leads; these only report delivery status.
 */
import { PRODUCT_NAME, REPORT_OFFER, SITE_NAME } from "@/lib/constants";
import {
  adminLeadsUrl,
  sendLeadNotificationPair,
  type LeadNotificationOutcome,
} from "./lead-notification";

export type { LeadNotificationOutcome } from "./lead-notification";

export interface ReportRequestNotificationInput {
  name: string;
  email: string;
  institution: string;
  role: string | null;
  institutionId: number | null;
  src: string | null;
}

export interface ContactRequestNotificationInput {
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  message: string | null;
  inquiryType: string | null;
}

/** Lead sources that only ever get a requester confirmation, never a team page. */
export type ConfirmationOnlyLeadSource = "newsletter" | "notify";

export interface ConfirmationOnlyNotificationInput {
  source: ConfirmationOnlyLeadSource;
  email: string;
  /** Institution name for `notify` leads; unused for `newsletter`. */
  institution: string | null;
}

export const REPORT_REQUEST_CONFIRMATION_LINE =
  "We confirm your peer set within one business day and deliver the " +
  `${REPORT_OFFER.name} within 48 hours of confirmation.`;

const CONTACT_CONFIRMATION_LINE = "We reply within one business day.";

const NEWSLETTER_CONFIRMATION_SUBJECT = `You're on the ${SITE_NAME} list`;
const NEWSLETTER_CONFIRMATION_LINE =
  `You're on the list — the next issue goes out with the next ${PRODUCT_NAME} update. ` +
  "Reply to this email any time to unsubscribe.";

const NOTIFY_CONFIRMATION_SUBJECT = "We'll tell you when this fee schedule is verified";
const DEFAULT_NOTIFY_INSTITUTION = "this institution";

function notifyConfirmationLine(institution: string | null): string {
  const name = institution ?? DEFAULT_NOTIFY_INSTITUTION;
  return (
    `Thanks — we'll email you when ${name}'s fee schedule has been verified and ` +
    `published on ${SITE_NAME}.`
  );
}

function detailLine(label: string, value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? null : `${label}: ${value}`;
}

export async function sendReportRequestNotifications(
  input: ReportRequestNotificationInput,
): Promise<LeadNotificationOutcome> {
  const roleSuffix = input.role ? `, ${input.role}` : "";
  const notificationLines = [
    `${input.name} requested a ${REPORT_OFFER.name} (${REPORT_OFFER.priceLabel}) for ${input.institution}.`,
    "",
    ...[
      detailLine("Institution", input.institution),
      detailLine("Institution ID", input.institutionId),
      detailLine("Name", input.name),
      detailLine("Email", input.email),
      detailLine("Role", input.role),
      detailLine("Source", input.src),
    ].filter((line): line is string => line !== null),
    "",
    "Reply to this email to reach the requester directly.",
  ];

  return sendLeadNotificationPair({
    requesterEmail: input.email,
    notification: {
      subject: `New report request: ${input.institution} — ${input.name}, ${input.email}${roleSuffix}`,
      lines: notificationLines,
      cta: { label: "Open /admin/leads", href: adminLeadsUrl() },
    },
    confirmation: {
      subject: `We received your request for ${input.institution}`,
      lines: [
        `We received your request for ${input.institution}. ${REPORT_REQUEST_CONFIRMATION_LINE}`,
        "",
        "No payment is taken until the peer set is confirmed. Reply to this email with questions.",
      ],
    },
  });
}

export async function sendContactRequestNotifications(
  input: ContactRequestNotificationInput,
): Promise<LeadNotificationOutcome> {
  const who = input.company ? `${input.company} — ${input.name}` : input.name;
  const inquiry = input.inquiryType ? ` (${input.inquiryType})` : "";
  const notificationLines = [
    `${input.name} sent a message through the contact form.`,
    "",
    ...[
      detailLine("Company", input.company),
      detailLine("Name", input.name),
      detailLine("Email", input.email),
      detailLine("Role", input.role),
      detailLine("Inquiry", input.inquiryType),
    ].filter((line): line is string => line !== null),
    "",
    input.message ? `Message:\n${input.message}` : "No message body was provided.",
  ];

  return sendLeadNotificationPair({
    requesterEmail: input.email,
    notification: {
      subject: `New contact request${inquiry}: ${who}, ${input.email}`,
      lines: notificationLines,
      cta: { label: "Open /admin/leads", href: adminLeadsUrl() },
    },
    confirmation: {
      subject: "We received your message",
      lines: [
        `We received your message. ${CONTACT_CONFIRMATION_LINE}`,
        "",
        "Reply to this email if you want to add anything.",
      ],
    },
  });
}

/**
 * Newsletter signups and "notify me when verified" requests: a requester
 * confirmation tailored to the source, never a team-inbox page.
 */
export async function sendConfirmationOnlyNotification(
  input: ConfirmationOnlyNotificationInput,
): Promise<LeadNotificationOutcome> {
  const confirmation =
    input.source === "newsletter"
      ? { subject: NEWSLETTER_CONFIRMATION_SUBJECT, lines: [NEWSLETTER_CONFIRMATION_LINE] }
      : { subject: NOTIFY_CONFIRMATION_SUBJECT, lines: [notifyConfirmationLine(input.institution)] };

  return sendLeadNotificationPair({
    requesterEmail: input.email,
    notifyTeam: false,
    confirmation,
  });
}
