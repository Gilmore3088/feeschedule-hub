# Agent Model Strategy: Right-Size for Cost & Quality

## The Key Insight

All 4 agents do the same core work: **understand a question -> call SQLite tools -> format the response**. The "intelligence" is in tool selection and data synthesis, not reasoning. You're querying your own database, not solving novel problems. This means you're overpaying on every single query.

## Current State (All Sonnet)

| Agent | Model | Max Tokens | Steps | Cost/Query | What It Does |
|-------|-------|-----------|-------|------------|-------------|
| Ask the Data | Sonnet | 1,024 | 3 | ~$0.02 | Simple Q&A: "What's the median overdraft?" |
| Fee Analyst | Sonnet | 2,048 | 5 | ~$0.05 | Peer comparisons, outlier analysis |
| Content Writer | Sonnet | 6,000 | 10 | ~$0.15 | 1000-word articles with data citations |
| Custom Query | Sonnet | 4,096 | 8 | ~$0.10 | Multi-step analytical queries |

**Estimated daily cost:** ~$5-8/day at current usage

## Proposed: Tiered Model Strategy

| Agent | Current | Proposed | Why | Savings |
|-------|---------|----------|-----|---------|
| Ask the Data | Sonnet ($3/$15) | **Haiku 4.5** ($0.80/$4) | Simple tool routing + formatting. Haiku handles this perfectly. | ~80% |
| Fee Analyst | Sonnet ($3/$15) | **Sonnet** (keep) | Needs multi-step reasoning for peer analysis. Sweet spot. | 0% |
| Content Writer | Sonnet ($3/$15) | **Sonnet** (keep) | Long-form writing quality matters for published content. | 0% |
| Custom Query | Sonnet ($3/$15) | **Sonnet** (keep) | Complex chaining needs Sonnet-level reasoning. | 0% |

### Why Not Opus?

Opus ($15/$75 per M tokens) is 5x more expensive than Sonnet. Your agents are data-retrieval + formatting — the bottleneck is tool call accuracy, not deep reasoning. Sonnet handles this at the same quality level for these tasks.

### Why Haiku for "Ask the Data"?

The public-facing agent does 3 things:
1. Parse user question -> pick the right tool (searchFees, searchIndex, searchInstitutions, getInstitution)
2. Call the tool with correct parameters
3. Format a 2-4 paragraph response with the data

Haiku 4.5 excels at all three. It's fast (better UX with quicker responses), cheap ($0.80/$4 vs $3/$15), and accurate for structured tool use.

### Why Not OpenAI?

Your stack uses `@ai-sdk/anthropic` with `ai` SDK from Vercel. You could add `@ai-sdk/openai` and use GPT-4o-mini for the Ask agent. However:
- **Switching cost**: need to add OpenAI dependency, test tool compatibility
- **Marginal savings**: Haiku 4.5 is already cheaper than GPT-4o-mini ($0.80 vs $0.15 input, $4 vs $0.60 output)
- **Quality**: Haiku 4.5 is comparable to GPT-4o-mini for tool use
- **Consistency**: one provider means one API key, one rate limit, one billing

**Recommendation**: Stay Anthropic-only. Use Haiku where speed/cost matters, Sonnet where quality matters. No need for OpenAI.

## Implementation

### Phase 1: Switch Ask agent to Haiku

**File**: `src/lib/research/agents.ts`

```typescript
ask: {
  ...
  model: "claude-haiku-4-5-20251001",  // was claude-sonnet-4-5-20250514
  maxTokens: 1024,
  maxSteps: 3,
}
```

**File**: `src/app/api/research/[agentId]/route.ts`

Add Haiku to cost estimation:

```typescript
const COST_PER_M_INPUT: Record<string, number> = {
  "claude-haiku-4-5-20251001": 80,     // $0.80/M
  "claude-sonnet-4-5-20250514": 300,   // $3/M
  "claude-opus-4-5-20250514": 1500,    // $15/M
};
const COST_PER_M_OUTPUT: Record<string, number> = {
  "claude-haiku-4-5-20251001": 400,    // $4/M
  "claude-sonnet-4-5-20250514": 1500,  // $15/M
  "claude-opus-4-5-20250514": 7500,    // $75/M
};
```

### Phase 2: Add model flexibility for future tuning

Add a `MODEL_OVERRIDES` env var so you can change models without code changes:

```typescript
// In agents.ts
function getModelForAgent(agentId: string, defaultModel: string): string {
  const override = process.env[`BFI_MODEL_${agentId.toUpperCase().replace(/-/g, "_")}`];
  return override || defaultModel;
}
```

Then set in `.env.local`:
```
BFI_MODEL_ASK=claude-haiku-4-5-20251001
BFI_MODEL_FEE_ANALYST=claude-sonnet-4-5-20250514
BFI_MODEL_CONTENT_WRITER=claude-sonnet-4-5-20250514
BFI_MODEL_CUSTOM_QUERY=claude-sonnet-4-5-20250514
```

### Phase 3: Quality guardrails

Add a simple quality check: if Haiku's response is very short (<50 chars) or contains "I don't have access", automatically retry with Sonnet. This catches edge cases where Haiku misroutes a tool call.

## Cost Projection

| Scenario | Daily Cost | Monthly Cost | Annual Cost |
|----------|-----------|-------------|-------------|
| Current (all Sonnet) | ~$5.00 | ~$150 | ~$1,825 |
| Proposed (Haiku for Ask) | ~$3.50 | ~$105 | ~$1,280 |
| If traffic grows 5x | ~$17.50 | ~$525 | ~$6,400 |

The biggest savings come from the **Ask** agent because it handles the most volume (public-facing, rate-limited to 50/day per IP, but many IPs).

## Acceptance Criteria

- [ ] Ask agent uses Haiku 4.5 with no quality degradation
- [ ] Cost estimation in route.ts includes Haiku pricing
- [ ] Model overrides configurable via env vars
- [ ] Usage dashboard shows per-model cost breakdown
- [ ] Public Ask agent responds noticeably faster (Haiku latency benefit)

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/research/agents.ts` | Switch Ask model to Haiku, add getModelForAgent() |
| `src/app/api/research/[agentId]/route.ts` | Add Haiku cost rates |
| `.env.example` | Add BFI_MODEL_* env vars |

## References

- `src/lib/research/agents.ts` — agent configs with model assignments
- `src/app/api/research/[agentId]/route.ts` — cost estimation, streaming endpoint
- `src/lib/research/rate-limit.ts` — per-IP and per-user limits
