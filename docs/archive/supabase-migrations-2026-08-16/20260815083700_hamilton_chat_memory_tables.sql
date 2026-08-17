SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.hamilton_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hamilton_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.hamilton_conversations(id) ON DELETE CASCADE,
  user_id integer REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  tool_calls jsonb,
  token_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hamilton_conv_user
  ON public.hamilton_conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hamilton_msg_conv
  ON public.hamilton_messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_hamilton_msg_user
  ON public.hamilton_messages(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.hamilton_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hamilton_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hamilton_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hamilton_messages FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.hamilton_conversations IS
  'Hamilton internal chat conversation sessions scoped to authenticated users.';
COMMENT ON TABLE public.hamilton_messages IS
  'Hamilton internal chat turns with conversation and user lineage.';
COMMENT ON COLUMN public.hamilton_messages.user_id IS
  'Copied from hamilton_conversations.user_id at write time for audit and policy scoping.';

COMMIT;
