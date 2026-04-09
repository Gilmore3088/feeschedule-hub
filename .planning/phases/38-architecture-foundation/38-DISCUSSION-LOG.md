# Phase 38: Architecture Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-08
**Phase:** 38-architecture-foundation
**Areas discussed:** Design token source, Branding consistency, Product architecture scope

---

## Design Token Source

| Option | Description | Selected |
|--------|-------------|----------|
| Literal implementation | Implement every token from DESIGN.md as CSS custom properties | |
| Adapt to Tailwind | Map DESIGN.md intent to Tailwind utility classes where possible | |
| You decide | Claude picks the approach | |
| Other (user) | Strive for design image samples, within brand, elevate core if needed | ✓ |

**User's choice:** "I want to strive for my design image samples. But all within our brand. If we need to elevate our core to advance the product, we should."
**Notes:** HTML prototype screenshots are the visual target. Tailwind adaptation is fine where it matches, but custom tokens are acceptable where needed to hit the editorial aesthetic.

---

## Branding Consistency

| Option | Description | Selected |
|--------|-------------|----------|
| Hamilton | Just "Hamilton" everywhere | |
| Hamilton Intelligence | Full product name with shorthand | |
| Bank Fee Index + Hamilton | Company + persona hierarchy | |
| Other (user) | FeeInsight.com / Bank Fee Index / Hamilton hierarchy | ✓ |

**User's choice:** "FeeInsight.com and the Bank Fee Index. 'FeeInsight.com, powered by the Bank Fee Index.' Hamilton is a pro feature tool of the website."
**Notes:** Three-tier brand hierarchy established. Hamilton is NOT a separate product — it's a premium feature within the Bank Fee Index platform on FeeInsight.com. "Sovereign Intelligence" is banned from code/UI.

---

## Product Architecture Scope

**User's clarifications (unsolicited but critical):**

1. "We've only really developed Hamilton on the backend. We should unify the front/back Hamilton experience."
   - Backend (voice, thesis, tools, agents) is strong. Frontend is the gap this milestone fills.

2. "The admin simply has more tools. Like the current tools. (Securely). All this work is to create an award-winning, $5,000/yr consulting tool."
   - Admin and Pro share the same 5-screen Hamilton. Admin gets additional pipeline/ops tools.

3. "We need to ensure the quarterly reporting, monthly, state, category, etc reports, not the admin TOOLS. Those are true backend."
   - Hamilton reporting (quarterly, monthly pulse, state index, peer brief) = part of Hamilton, lives in Report Builder.
   - Admin tools (pipeline, review queue, crawl monitoring) = separate, NOT part of this milestone.

---

## Claude's Discretion

- CSS custom property naming convention
- Whether to use separate hamilton.css or extend globals.css
- Exact Tailwind v4 integration approach for custom tokens

## Deferred Ideas

None
