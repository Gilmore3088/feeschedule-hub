-- Seed scout / audit agent identities into agent_registry.
--
-- Production logs on 2026-08-10 showed agent_lessons FK failures for
-- agent_name='discoverer'. These names already exist in the web scout flow
-- (validator, discoverer, ai_scout, reporter) but were never added to the
-- canonical agent_registry seed set.
--
-- Keep this additive and idempotent. No agent_budgets rows are required:
-- budget enforcement already degrades cleanly when no row exists.

BEGIN;

INSERT INTO agent_registry (agent_name, display_name, description, role, parent_agent)
VALUES
  (
    'validator',
    'Validator',
    'Scout audit agent that validates an existing fee schedule URL before deeper discovery.',
    'data',
    NULL
  ),
  (
    'discoverer',
    'Discoverer',
    'Scout audit agent that runs heuristic fee schedule discovery when validation fails.',
    'data',
    NULL
  ),
  (
    'ai_scout',
    'AI Scout',
    'Scout audit agent that uses LLM-assisted search when heuristic discovery does not find a fee schedule.',
    'analyst',
    NULL
  ),
  (
    'reporter',
    'Reporter',
    'Scout audit agent that summarizes audit outcomes for operators and UI consumers.',
    'analyst',
    NULL
  )
ON CONFLICT (agent_name) DO NOTHING;

COMMIT;
