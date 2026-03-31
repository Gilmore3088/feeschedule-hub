// src/lib/scout/audit-agents.ts

import Anthropic from "@anthropic-ai/sdk";
import type { InstitutionRow } from "./types";
import type { AuditResult, DiscoveryResponse } from "./audit-types";
import {
  clearFeeScheduleUrl,
  setFeeScheduleUrl,
  recordAuditResult,
} from "./audit-db";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Emit = (msg: string) => void;

const FEE_CONTENT_KEYWORDS = [
  "monthly maintenance fee",
  "overdraft fee",
  "nsf fee",
  "insufficient funds",
  "atm fee",
  "wire transfer fee",
  "service charge",
  "account fee",
  "statement fee",
  "dormant",
  "inactivity fee",
  "stop payment",
  "returned item",
  "foreign transaction",
];

const NON_FEE_URL_KEYWORDS = [
  "annual-report",
  "cra",
  "complaint",
  "privacy",
  "loan",
  "mortgage",
  "career",
  "job",
  "social-media",
  "donation",
  "enrollment",
  "payroll",
];

// ── Agent 1: Validator ───────────────────────────────────────────────────────

export async function validator(
  institution: InstitutionRow,
  auditRunId: number,
  emit: Emit
): Promise<AuditResult> {
  const urlBefore = institution.fee_schedule_url;

  if (!urlBefore) {
    emit("No fee_schedule_url set — skipping validation");
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: "No URL to validate",
    };
  }

  emit(`Checking: ${urlBefore}`);

  // Check for obviously wrong URLs by path keywords
  const urlLower = urlBefore.toLowerCase();
  const badKeyword = NON_FEE_URL_KEYWORDS.find((kw) => urlLower.includes(kw));
  if (badKeyword) {
    emit(`URL contains non-fee keyword "${badKeyword}" — clearing`);
    await clearFeeScheduleUrl(institution.id);
    await recordAuditResult(
      auditRunId,
      institution.id,
      urlBefore,
      null,
      "cleared",
      null,
      null,
      `URL path contains "${badKeyword}"`
    );
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore,
      urlAfter: null,
      action: "cleared",
      discoveryMethod: null,
      confidence: null,
      reason: `URL path contains "${badKeyword}"`,
    };
  }

  // Fetch the page and check content
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(urlBefore, {
      signal: controller.signal,
      headers: { "User-Agent": "BankFeeIndex/1.0 (fee-schedule-audit)" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      emit(`HTTP ${res.status} — clearing dead URL`);
      await clearFeeScheduleUrl(institution.id);
      await recordAuditResult(
        auditRunId,
        institution.id,
        urlBefore,
        null,
        "cleared",
        null,
        null,
        `HTTP ${res.status}`
      );
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore,
        urlAfter: null,
        action: "cleared",
        discoveryMethod: null,
        confidence: null,
        reason: `HTTP ${res.status}`,
      };
    }

    const contentType = res.headers.get("content-type") || "";

    // PDFs: trust if URL path suggests fee schedule
    if (contentType.includes("application/pdf") || urlBefore.toLowerCase().endsWith(".pdf")) {
      const hasFeeKeyword = /fee|schedule|disclosure|truth.in.savings|reg.dd/i.test(urlBefore);
      if (hasFeeKeyword) {
        emit("PDF URL looks valid (fee-related path)");
        await recordAuditResult(auditRunId, institution.id, urlBefore, urlBefore, "validated", null, 0.9, "PDF with fee-related path");
        return {
          institutionId: institution.id,
          institutionName: institution.institution_name,
          urlBefore,
          urlAfter: urlBefore,
          action: "validated",
          discoveryMethod: null,
          confidence: 0.9,
          reason: "PDF with fee-related path",
        };
      }
      emit("PDF URL has no fee keywords in path — clearing");
      await clearFeeScheduleUrl(institution.id);
      await recordAuditResult(auditRunId, institution.id, urlBefore, null, "cleared", null, null, "PDF without fee keywords");
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore,
        urlAfter: null,
        action: "cleared",
        discoveryMethod: null,
        confidence: null,
        reason: "PDF without fee keywords",
      };
    }

    // HTML: check content for 2+ fee keywords
    if (contentType.includes("text/html")) {
      const text = await res.text();
      const lower = text.toLowerCase();
      const matches = FEE_CONTENT_KEYWORDS.filter((kw) => lower.includes(kw)).length;

      if (matches >= 2) {
        emit(`Valid — ${matches} fee keywords found in content`);
        await recordAuditResult(auditRunId, institution.id, urlBefore, urlBefore, "validated", null, 0.85, `${matches} fee keywords found`);
        return {
          institutionId: institution.id,
          institutionName: institution.institution_name,
          urlBefore,
          urlAfter: urlBefore,
          action: "validated",
          discoveryMethod: null,
          confidence: 0.85,
          reason: `${matches} fee keywords found`,
        };
      }

      emit(`Only ${matches} fee keyword(s) — clearing`);
      await clearFeeScheduleUrl(institution.id);
      await recordAuditResult(auditRunId, institution.id, urlBefore, null, "cleared", null, null, `Only ${matches} fee keyword(s)`);
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore,
        urlAfter: null,
        action: "cleared",
        discoveryMethod: null,
        confidence: null,
        reason: `Only ${matches} fee keyword(s)`,
      };
    }

    emit("Unknown content type — clearing");
    await clearFeeScheduleUrl(institution.id);
    await recordAuditResult(auditRunId, institution.id, urlBefore, null, "cleared", null, null, `Unknown content type: ${contentType}`);
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore,
      urlAfter: null,
      action: "cleared",
      discoveryMethod: null,
      confidence: null,
      reason: `Unknown content type: ${contentType}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(`Fetch error: ${msg} — clearing`);
    await clearFeeScheduleUrl(institution.id);
    await recordAuditResult(auditRunId, institution.id, urlBefore, null, "cleared", null, null, `Fetch error: ${msg}`);
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore,
      urlAfter: null,
      action: "cleared",
      discoveryMethod: null,
      confidence: null,
      reason: `Fetch error: ${msg}`,
    };
  }
}

// ── Agent 2: Discoverer ──────────────────────────────────────────────────────

export async function discoverer(
  institution: InstitutionRow,
  auditRunId: number,
  emit: Emit
): Promise<AuditResult> {
  const websiteUrl = institution.website_url;
  if (!websiteUrl) {
    emit("No website_url — cannot discover");
    await recordAuditResult(auditRunId, institution.id, null, null, "not_found", null, null, "No website_url");
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: "No website_url",
    };
  }

  emit(`Running heuristic discovery on ${websiteUrl}...`);

  const modalUrl = process.env.MODAL_DISCOVER_URL;
  if (!modalUrl) {
    emit("MODAL_DISCOVER_URL not configured — skipping heuristic discovery");
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: "MODAL_DISCOVER_URL not configured",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const res = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        website_url: websiteUrl,
        institution_id: institution.id,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      emit(`Discovery endpoint error: ${res.status}`);
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: null,
        confidence: null,
        reason: `Discovery endpoint ${res.status}: ${text.slice(0, 100)}`,
      };
    }

    const data: DiscoveryResponse = await res.json();
    emit(`Methods tried: ${data.methods_tried.join(", ")}`);

    if (data.found && data.fee_schedule_url) {
      emit(`Found: ${data.fee_schedule_url} (method: ${data.method}, confidence: ${data.confidence})`);
      await setFeeScheduleUrl(institution.id, data.fee_schedule_url, data.document_type);
      await recordAuditResult(
        auditRunId,
        institution.id,
        null,
        data.fee_schedule_url,
        "discovered",
        data.method,
        data.confidence,
        `Pages checked: ${data.pages_checked}`
      );
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: data.fee_schedule_url,
        action: "discovered",
        discoveryMethod: data.method,
        confidence: data.confidence,
        reason: `Pages checked: ${data.pages_checked}`,
      };
    }

    emit(`Not found after checking ${data.pages_checked} pages`);
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: `Heuristics failed after ${data.pages_checked} pages`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(`Discovery error: ${msg}`);
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: `Discovery error: ${msg}`,
    };
  }
}

// ── Agent 3: AI Scout ────────────────────────────────────────────────────────

export async function aiScout(
  institution: InstitutionRow,
  auditRunId: number,
  emit: Emit
): Promise<{ result: AuditResult; costCents: number }> {
  const websiteUrl = institution.website_url;
  if (!websiteUrl) {
    emit("No website_url — cannot AI scout");
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: null,
        confidence: null,
        reason: "No website_url for AI scout",
      },
      costCents: 0,
    };
  }

  emit(`Fetching homepage: ${websiteUrl}`);

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "BankFeeIndex/1.0 (fee-schedule-audit)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) {
      emit(`Homepage returned ${res.status}`);
      return {
        result: {
          institutionId: institution.id,
          institutionName: institution.institution_name,
          urlBefore: null,
          urlAfter: null,
          action: "not_found",
          discoveryMethod: null,
          confidence: null,
          reason: `Homepage HTTP ${res.status}`,
        },
        costCents: 0,
      };
    }
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(`Homepage fetch error: ${msg}`);
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: null,
        confidence: null,
        reason: `Homepage fetch error: ${msg}`,
      },
      costCents: 0,
    };
  }

  // Extract links with anchor text
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: { href: string; text: string }[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].trim();
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (href && text && href.startsWith("http")) {
      links.push({ href, text: text.slice(0, 100) });
    }
  }

  // Also include relative links resolved against the base URL
  const baseUrl = new URL(websiteUrl);
  const relativeRegex = /<a[^>]+href=["']\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = relativeRegex.exec(html)) !== null) {
    const href = `${baseUrl.origin}/${match[1].trim()}`;
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text) {
      links.push({ href, text: text.slice(0, 100) });
    }
  }

  if (!links.length) {
    emit("No links found on homepage");
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: null,
        confidence: null,
        reason: "No links found on homepage",
      },
      costCents: 0,
    };
  }

  emit(`Found ${links.length} links — sending to Claude...`);

  const response = await claude.messages.create(
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: `You find fee schedule URLs on bank/credit union websites. Given a list of links from an institution's homepage, identify which URL most likely leads to their fee schedule, schedule of fees, or fee disclosure document.

Return ONLY raw JSON:
{"url": "https://...", "confidence": 0.8, "reasoning": "one sentence"}

If no link looks like a fee schedule, return:
{"url": null, "confidence": 0, "reasoning": "No fee schedule link found"}`,
      messages: [
        {
          role: "user",
          content: `Institution: ${institution.institution_name}\nWebsite: ${websiteUrl}\n\nLinks found on homepage:\n${links.slice(0, 50).map((l) => `- ${l.text}: ${l.href}`).join("\n")}`,
        },
      ],
    },
    { timeout: 30_000 }
  );

  // Estimate cost
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costCents = Math.round((inputTokens * 0.3 + outputTokens * 1.5) / 100);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const src = fenced ? fenced[1] : text;
    const s = src.indexOf("{");
    const e = src.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("No JSON");
    const parsed = JSON.parse(src.slice(s, e + 1));

    if (parsed.url && parsed.confidence >= 0.6) {
      emit(`AI found: ${parsed.url} (confidence: ${parsed.confidence})`);
      emit(`Reasoning: ${parsed.reasoning}`);
      await setFeeScheduleUrl(institution.id, parsed.url, null);
      await recordAuditResult(
        auditRunId,
        institution.id,
        null,
        parsed.url,
        "ai_found",
        "ai_scout",
        parsed.confidence,
        parsed.reasoning
      );
      return {
        result: {
          institutionId: institution.id,
          institutionName: institution.institution_name,
          urlBefore: null,
          urlAfter: parsed.url,
          action: "ai_found",
          discoveryMethod: "ai_scout",
          confidence: parsed.confidence,
          reason: parsed.reasoning,
        },
        costCents,
      };
    }

    emit(`AI result: ${parsed.reasoning || "No fee schedule found"} (confidence: ${parsed.confidence})`);
    await recordAuditResult(auditRunId, institution.id, null, null, "not_found", "ai_scout", parsed.confidence, parsed.reasoning);
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: "ai_scout",
        confidence: parsed.confidence,
        reason: parsed.reasoning,
      },
      costCents,
    };
  } catch {
    emit("AI response could not be parsed");
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: "ai_scout",
        confidence: null,
        reason: "AI response parse error",
      },
      costCents,
    };
  }
}
