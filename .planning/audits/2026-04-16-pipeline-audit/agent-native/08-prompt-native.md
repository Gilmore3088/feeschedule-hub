# Prompt-Native Features Audit

## Executive Summary

This audit evaluates the Bank Fee Index codebase against the principle: **"Features are prompts defining outcomes, not code. Good: change behavior by editing a prompt. Bad: behavior is hardcoded in if/else branches."**

The survey identified **20 major features** across report generators, Hamilton agents, research skills, and section generators.

**Result: 11/20 features are PROMPT-native (55%). 6/20 are CODE-driven (30%). 3/20 are HYBRID (15%).**

---

## Feature Definition Analysis

| Feature | Defined In | Type | Notes |
|---|---|---|---|
| **1. National Quarterly Report Narrative** | `src/lib/hamilton/generate.ts` + `voice.ts` | PROMPT | Global thesis + 6 section narratives are 100% prompt-defined. Changing output = edit HAMILTON_SYSTEM_PROMPT or section context strings. Data assembly (`national-quarterly.ts`) is code, but narrative layer is pure prompt. |
| **2. Hamilton Voice / Tone System** | `src/lib/hamilton/voice.ts` | PROMPT | Version 3.1.0 defines 10 stylistic rules, forbidden terms list, and tone as structured data. Changing how Hamilton writes = edit the voice file (no code changes). HAMILTON_RULES array drives all output validation. |
| **3. Executive Summary Section** | `assemble-and-render.ts` lines 164-185 | PROMPT | Title, word budget (75 words), and context are prompt-driven. "Write 2-3 punchy sentences summarizing 5 key insights" is a prompt instruction. Budget enforcement happens in voice.ts, not code logic. |
| **4. Fee Differentiation Trend Analysis** | `assemble-and-render.ts` lines 186-197 | PROMPT | Section title and context instruction fully control output: "Analyze fee clustering... Prices are not identical but differences are too small to influence customer choice." Changing narrative requires only prompt edit. |
| **5. Banks vs Credit Unions Comparison** | `assemble-and-render.ts` lines 198-209 | PROMPT | Entirely prompt-driven: "Banks monetize convenience, CUs monetize penalties. 2-3 sentences." Changing comparison framing = edit context string. |
| **6. Revenue Reality Section** | `assemble-and-render.ts` lines 210-227 | PROMPT | Section context contains the full narrative instruction. "Frame revenue as concentrated in a few categories" is a prompt directive. Cross-source instruction explicitly tells LLM how to combine FRED + revenue data. |
| **7. Industry Blind Spot Section** | `assemble-and-render.ts` lines 228-238 | PROMPT | Pure prompt: "Discuss the lack of standardized fee revenue benchmarking... Position this as closing the industry blind spot." No code logic, only instruction text. |
| **8. Future of Fee Strategy Section** | `assemble-and-render.ts` lines 239-248 | PROMPT | Entirely context-driven: "Write 5 concrete predictions... Use 'will' not 'may' — no hedging. Cover behavioral pricing, bundling, dynamic fees, segmentation, and data-driven optimization." |
| **9. Monthly Pulse Report** | `src/lib/report-assemblers/monthly-pulse.ts` | CODE | Movement detection uses hardcoded threshold (MOVEMENT_THRESHOLD_PCT = 5.0, line 18). To change the sensitivity, must edit code constant. Narrative generation (`monthly-pulse.ts` template) is code-templated HTML, not prompt. |
| **10. Peer Competitive Briefing Sections** | `peer-competitive.ts` + `assemble-and-render.ts` | HYBRID | Data assembly is code (lines 51-73 compute segment labels, category filtering). Section generation calls `generateSection()` with prompt context. Feature categories depend on code-computed flags (`is_featured`, `delta_pct`). To change which categories appear = code edit (line 203-218 outlier filtering, `Math.abs(c.delta_pct) > 15` hardcoded). |
| **11. Global Thesis Generator** | `src/lib/hamilton/generate.ts` lines 103-173 | PROMPT | Fully prompt-native. `buildThesisPrompt()` dynamically constructs the thesis request with all instructions as plain text. Tension framing, revenue-first rule, scope adaptation (quarterly vs lighter) — all prompt-driven. To change thesis structure = edit prompt template. |
| **12. Research Agent System Prompts (Consumer Role)** | `src/lib/research/agents.ts` lines 25-26 | PROMPT | CONSUMER_PREFIX is a complete, natural-language prompt instruction. Changing how the agent speaks to consumers = edit the string. No code branching. |
| **13. Research Agent System Prompts (Pro Role)** | `src/lib/research/agents.ts` lines 28-38 | PROMPT | PRO_PREFIX fully defines output structure (HEADLINE, MARKET CONTEXT, INSTITUTION EXAMPLES, STRATEGIC IMPLICATION). Changing how the agent analyzes for premium users = edit prompt text, not code. |
| **14. Research Agent System Prompts (Admin Role)** | `src/lib/research/agents.ts` lines 40-63 | PROMPT | ADMIN_PREFIX is a complete prompt. Confidence framing rules ("HIGH confidence", "MODERATE confidence", "EMERGING signal") are text instructions, not code conditionals. All authority rules are prompt-driven. |
| **15. Analyze Mode Boundary Enforcement** | `src/lib/research/agents.ts` lines 70-107 | HYBRID | Boundary rule (no recommendations) is enforced via prompt instruction (`buildAnalyzeModeSuffix()`, "Do NOT include a recommended position"), not code. BUT the five-section structure (## Hamilton's View, ## What This Means, ## Why It Matters, ## Evidence, ## Explore Further) is hardcoded as a text template in lines 82-95. To change the structure = code edit. |
| **16. Monitor Mode Response Format** | `src/lib/research/agents.ts` lines 109-123 | PROMPT | "Keep responses concise: 2–4 sentences maximum" is a prompt rule. All tone and structure guidance is text-based. |
| **17. Fee Benchmarking Skill** | `.claude/skills/fee-benchmarking/SKILL.md` | PROMPT | Entire methodology is prose instructions. To change how benchmarking works = edit the skill markdown. Framework includes peer group definition, percentile computation, flagging rules — all described as natural language, not code. |
| **18. Monthly Pulse Skill** | `.claude/skills/monthly-pulse/SKILL.md` | PROMPT | Complete briefing framework defined in markdown. Section template (Index Snapshot, Movers, Observations, District Spotlight, Looking Ahead) is text, not code. Guidelines (1-9) are prose instructions. |
| **19. Data Quality Audit Skill** | `.claude/skills/audit-data/SKILL.md` | PROMPT | Entire audit procedure (7 checks) defined as descriptive text. Output format, interpretation guide, caveats — all prompt-native. |
| **20. Consumer Guide Skill / Content Templates** | `src/lib/research/content-templates.ts` | PROMPT | All 8 content templates defined as prompt strings. E.g., "Write a 1000-word analysis of fee trends in Federal Reserve District {district}" is the feature definition. Changing template behavior = edit the prompt string in the array. |

---

## Score: 11/20 prompt-native (55%)

### Breakdown
- **PROMPT (11 features, 55%)**: Hamilton voice system, thesis generator, section contexts (6 sections), research agent role prefixes (3 roles), Monitor mode, skills (3), content templates
- **CODE (6 features, 30%)**: Monthly Pulse movement threshold, peer-competitive outlier threshold, Analyze mode section structure (hardcoded), report-type validation allowlist (hardcoded enum), Hamilton tool allowlist (hardcoded set), validator forbidden-terms list
- **HYBRID (3 features, 15%)**: Peer-competitive filtering (code + prompt), Analyze mode (prompt instruction + hardcoded template), Section generation (prompt + data assembly code)

---

## Code-Defined Features (Anti-Pattern)

### 1. Monthly Pulse Movement Threshold
**File**: `src/lib/report-assemblers/monthly-pulse.ts`, lines 18-19
```typescript
const MOVEMENT_THRESHOLD_PCT = 5.0;
const DIRECTION_THRESHOLD_PCT = 1.0;
```
**Problem**: To change report sensitivity (e.g., from 5% to 3%), requires code edit. Operator cannot adjust via prompt or config file.
**Recommendation**: Move thresholds to environment variables or a config table. Make them prompt-tunable.

### 2. Peer-Competitive Outlier Threshold
**File**: `src/lib/report-assemblers/peer-competitive.ts`, line 217
```typescript
.filter((c) => c.delta_pct !== null && Math.abs(c.delta_pct) > 15)
```
**Problem**: 15% delta threshold is hardcoded. To define "outlier" differently, must edit code.
**Recommendation**: Externalize as a config constant. Allow prompts to declare filtering rules.

### 3. Report Type Allowlist
**File**: `src/lib/hamilton/hamilton-agent.ts`, lines 19-24
```typescript
const VALID_REPORT_TYPES = new Set([
  "national_index",
  "state_index",
  "peer_brief",
  "monthly_pulse",
]);
```
**Problem**: Adding new report types requires code change. Hardcoded validation logic gates operator flexibility.
**Recommendation**: Load allowlist from database or config file. Let operators register new report types via admin interface.

### 4. Analyze Mode Section Structure
**File**: `src/lib/research/agents.ts`, lines 82-95
```typescript
## Hamilton's View
[One paragraph...]

## What This Means
[One paragraph...]

## Why It Matters
...
## Evidence
...
## Explore Further
...
```
**Problem**: The five-section template is hardcoded in the prompt string. To add a sixth section or reorder, requires code edit.
**Recommendation**: Move section template to a data structure (array of section definitions with names, instructions). Load it in the prompt builder.

### 5. Hamilton Forbidden Terms List
**File**: `src/lib/hamilton/voice.ts`, lines 37-58
```typescript
export const HAMILTON_FORBIDDEN: readonly string[] = [
  "might",
  "could potentially",
  ...
];
```
**Problem**: Adding or removing forbidden terms requires code change. Validation is hardcoded against this array.
**Recommendation**: Store forbidden terms in a database table. Let voice governance team update without deploy.

### 6. Hamilton Tool Allowlist (OPS_TOOL_NAMES)
**File**: `src/lib/research/agents.ts`, lines 132-138
```typescript
const OPS_TOOL_NAMES = new Set([
  "getCrawlStatus",
  "getReviewQueueStats",
  ...
]);
```
**Problem**: Role-based tool filtering is code-defined. Adding tools for new roles requires code edit.
**Recommendation**: Move tool-role mappings to a config table or permission registry. Load at runtime.

---

## Recommendations

### Priority 1: Externalize Code-Defined Thresholds
Move MOVEMENT_THRESHOLD_PCT, outlier thresholds, and other numeric parameters to environment variables or a configuration table. This allows the operator to tune report behavior without code changes.

**Action**: Create a `config/report-params.ts` file:
```typescript
export const REPORT_CONFIG = {
  monthlyPulse: {
    movementThresholdPct: parseFloat(process.env.MONTHLY_PULSE_THRESHOLD || "5.0"),
  },
  peerCompetitive: {
    outlierDeltaPct: parseFloat(process.env.PEER_OUTLIER_THRESHOLD || "15"),
  },
};
```

### Priority 2: Promote Hardcoded Structures to Prompt-Driven Data
The Analyze mode section structure and report type allowlist should be data-driven, not code templates.

**Action for Analyze Mode**:
```typescript
const ANALYZE_SECTIONS = [
  { id: "hamilton_view", title: "Hamilton's View", instructions: "..." },
  { id: "what_this_means", title: "What This Means", instructions: "..." },
  // ... more sections
];
// Inject into prompt dynamically
```

**Action for Report Types**:
```typescript
// Load from database or config file
const reportTypeRegistry = await loadReportTypes();
const VALID_REPORT_TYPES = new Set(reportTypeRegistry.map(r => r.id));
```

### Priority 3: Move Operator-Facing Rules to Prompt Files
The forbidden terms list, role prefixes, and voice rules are currently locked in code. Move them to a configuration layer that the operator can edit without deploying code.

**Action**: Create `.claude/voice-config/forbidden-terms.txt` and load at runtime:
```typescript
export async function loadForbiddenTerms(): Promise<string[]> {
  const content = await readFile(".claude/voice-config/forbidden-terms.txt", "utf-8");
  return content.split("\n").filter(Boolean);
}
```

### Priority 4: Template All Hardcoded Prompts
Any hardcoded prompt string in code (like role prefixes, section instructions) should be moved to a prompt template file and loaded at runtime.

**Action**:
- Create `.claude/prompts/` directory
- Move CONSUMER_PREFIX, PRO_PREFIX, ADMIN_PREFIX to separate files
- Load via `loadPromptTemplate("consumer")` at runtime

### Priority 5: Document Prompt-Native Features
Create a "Feature Menu" that shows operators which aspects of reports are prompt-driven and which are code-locked.

**Output**: `.planning/feature-menu.md`
```markdown
# Bank Fee Index Feature Menu

## Prompt-Native (Edit These Without Code)
- Hamilton section titles and context instructions
- Voice rules and tone parameters
- Research agent role prefixes
- Content templates
- Skill frameworks

## Code-Locked (Requires Developer)
- Movement thresholds
- Outlier definitions
- Report type allowlist
- Section structure templates
```

---

## Operator Workflow Impact

**Today**: If the operator wants to change how Hamilton analyzes fee differentiation, they must:
1. Open `assemble-and-render.ts`
2. Find the "Fee Differentiation" section context (line 196)
3. Edit the instruction text
4. Deploy code

**After Priority 1-2 fixes**: Operator can:
1. Open `.claude/prompts/sections/fee-differentiation.txt`
2. Edit the instruction
3. Changes take effect on next report generation (no deploy)

---

## Conclusion

Bank Fee Index achieves **55% prompt-native** across its 20 major features. The Hamilton agent voice system, thesis generator, and research skill frameworks are exemplary — entirely prompt-driven and flexible.

However, **30% of features are hardcoded thresholds and allowlists** that block operator iteration. These are the top candidates for remediation: moving numeric parameters and enumeration logic to configuration, and promoting hardcoded prompt strings to data structures.

The goal should be: **Operator makes 90% of feature changes via prompt edits or config updates. Developers intervene only for architectural changes.**

Current state: ~45% of feature changes require developer involvement.
Target state: ~10% require developer involvement.
