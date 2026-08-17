"use client";

import { useState, type FormEvent } from "react";
import { trackEvent } from "@/lib/analytics";

const LEADS_ENDPOINT = "/api/leads";
const REPORT_USE_CASE = "competitive-fee-position-report";
const REPORT_SOURCE = "report";

const SUCCESS_MESSAGE = "Thanks — we'll confirm your peer set and deliver within 48 hours.";
const GENERIC_ERROR = "We couldn't send that request. Please try again or email us directly.";

const INPUT_CLASS =
  "w-full rounded-md border border-[#D5CBBF] bg-white px-3 py-2 text-sm text-[#1A1815] " +
  "placeholder:text-[#7A7062] focus:outline-none focus:ring-2 focus:ring-[#C44B2E] focus:border-transparent";
const LABEL_CLASS = "block text-sm font-medium text-[#1A1815] mb-1";

type Status = "idle" | "submitting" | "success" | "error";

interface RequestReportFormProps {
  contactEmail: string;
}

export function RequestReportForm({ contactEmail }: RequestReportFormProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      company: String(formData.get("institution") ?? "").trim(),
      role: String(formData.get("role") ?? "").trim() || null,
      use_case: REPORT_USE_CASE,
      source: REPORT_SOURCE,
    };

    try {
      const response = await fetch(LEADS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || GENERIC_ERROR);
      }
      trackEvent("request_report", { source: REPORT_SOURCE });
      setStatus("success");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : GENERIC_ERROR);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-lg border border-[#E0D7C9] bg-[#FDFBF8] p-6 text-sm text-[#1A1815]"
      >
        <p className="font-semibold">{SUCCESS_MESSAGE}</p>
        <p className="mt-2 text-[#5A5347]">
          Questions in the meantime? Email{" "}
          <a href={`mailto:${contactEmail}`} className="font-medium underline underline-offset-2">
            {contactEmail}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[#E0D7C9] bg-[#FDFBF8] p-6 space-y-4"
      aria-label="Request a Competitive Fee Position Report"
    >
      {status === "error" && errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="report-institution" className={LABEL_CLASS}>
          Institution
        </label>
        <input
          id="report-institution"
          name="institution"
          type="text"
          required
          autoComplete="organization"
          placeholder="First National Bank"
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="report-name" className={LABEL_CLASS}>
            Name
          </label>
          <input
            id="report-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="report-email" className={LABEL_CLASS}>
            Work email
          </label>
          <input
            id="report-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <div>
        <label htmlFor="report-role" className={LABEL_CLASS}>
          Role <span className="font-normal text-[#7A7062]">(optional)</span>
        </label>
        <input
          id="report-role"
          name="role"
          type="text"
          autoComplete="organization-title"
          placeholder="VP Retail Banking"
          className={INPUT_CLASS}
        />
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-md bg-[#C44B2E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#A93D25] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {status === "submitting" ? "Sending…" : "Request a report — $300"}
      </button>
      <p className="text-xs leading-relaxed text-[#7A7062]">
        No payment is taken at this step. We confirm your peer set by email before any work
        starts.
      </p>
    </form>
  );
}
