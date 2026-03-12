import { getWriteDb } from "@/lib/crawler-db/connection";
import { getDb } from "@/lib/crawler-db/connection";

export interface Conversation {
  id: number;
  user_id: number;
  agent_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls: string | null;
  token_count: number | null;
  created_at: string;
}

/** Ensure research tables exist */
export function ensureResearchTables(): void {
  const db = getWriteDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS research_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        title TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS research_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES research_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
        content TEXT NOT NULL,
        tool_calls TEXT,
        token_count INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS research_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        ip_address TEXT,
        agent_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_research_conv_user ON research_conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_research_msg_conv ON research_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_research_usage_user_date ON research_usage(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_research_usage_ip_date ON research_usage(ip_address, created_at);
    `);
  } finally {
    db.close();
  }
}

export function saveConversation(
  userId: number,
  agentId: string,
  title: string | null
): number {
  const db = getWriteDb();
  try {
    const result = db
      .prepare(
        "INSERT INTO research_conversations (user_id, agent_id, title) VALUES (?, ?, ?)"
      )
      .run(userId, agentId, title);
    return result.lastInsertRowid as number;
  } finally {
    db.close();
  }
}

export function saveMessage(
  conversationId: number,
  role: "user" | "assistant" | "tool",
  content: string,
  toolCalls?: string,
  tokenCount?: number
): void {
  const db = getWriteDb();
  try {
    db.prepare(
      "INSERT INTO research_messages (conversation_id, role, content, tool_calls, token_count) VALUES (?, ?, ?, ?, ?)"
    ).run(conversationId, role, content, toolCalls ?? null, tokenCount ?? null);

    db.prepare(
      "UPDATE research_conversations SET updated_at = datetime('now') WHERE id = ?"
    ).run(conversationId);
  } finally {
    db.close();
  }
}

export function getConversation(conversationId: number): Conversation | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM research_conversations WHERE id = ?")
      .get(conversationId) as Conversation | undefined) ?? null
  );
}

export function getMessages(conversationId: number): Message[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM research_messages WHERE conversation_id = ? ORDER BY created_at ASC"
    )
    .all(conversationId) as Message[];
}

export function listConversations(
  userId: number,
  agentId?: string,
  limit = 20
): Conversation[] {
  const db = getDb();
  if (agentId) {
    return db
      .prepare(
        "SELECT * FROM research_conversations WHERE user_id = ? AND agent_id = ? ORDER BY updated_at DESC LIMIT ?"
      )
      .all(userId, agentId, limit) as Conversation[];
  }
  return db
    .prepare(
      "SELECT * FROM research_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?"
    )
    .all(userId, limit) as Conversation[];
}

export function deleteConversation(
  conversationId: number,
  userId: number
): boolean {
  const db = getWriteDb();
  try {
    const result = db
      .prepare(
        "DELETE FROM research_conversations WHERE id = ? AND user_id = ?"
      )
      .run(conversationId, userId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function logUsage(
  userId: number | null,
  ipAddress: string | null,
  agentId: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCostCents: number
): void {
  const db = getWriteDb();
  try {
    db.prepare(
      "INSERT INTO research_usage (user_id, ip_address, agent_id, input_tokens, output_tokens, estimated_cost_cents) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      userId,
      ipAddress,
      agentId,
      inputTokens,
      outputTokens,
      estimatedCostCents
    );
  } finally {
    db.close();
  }
}

export function getUsageStats(userId: number): {
  today: number;
  month: number;
  total_cost_cents: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM research_usage WHERE user_id = ? AND created_at >= date('now')) as today,
         (SELECT COUNT(*) FROM research_usage WHERE user_id = ? AND created_at >= date('now', 'start of month')) as month,
         (SELECT COALESCE(SUM(estimated_cost_cents), 0) FROM research_usage WHERE user_id = ?) as total_cost_cents`
    )
    .get(userId, userId, userId) as {
    today: number;
    month: number;
    total_cost_cents: number;
  };
  return row;
}

/** Full usage dashboard stats for admin view */
export interface UsageDashboard {
  today_queries: number;
  today_cost_cents: number;
  month_queries: number;
  month_cost_cents: number;
  total_queries: number;
  total_cost_cents: number;
  by_agent: { agent_id: string; queries: number; cost_cents: number }[];
  by_day: { date: string; queries: number; cost_cents: number }[];
  top_users: { user_id: number; username: string; queries: number; cost_cents: number }[];
}

export function getUsageDashboard(): UsageDashboard {
  const db = getDb();

  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM research_usage WHERE created_at >= date('now')) as today_queries,
         (SELECT COALESCE(SUM(estimated_cost_cents), 0) FROM research_usage WHERE created_at >= date('now')) as today_cost_cents,
         (SELECT COUNT(*) FROM research_usage WHERE created_at >= date('now', 'start of month')) as month_queries,
         (SELECT COALESCE(SUM(estimated_cost_cents), 0) FROM research_usage WHERE created_at >= date('now', 'start of month')) as month_cost_cents,
         (SELECT COUNT(*) FROM research_usage) as total_queries,
         (SELECT COALESCE(SUM(estimated_cost_cents), 0) FROM research_usage) as total_cost_cents`
    )
    .get() as {
    today_queries: number;
    today_cost_cents: number;
    month_queries: number;
    month_cost_cents: number;
    total_queries: number;
    total_cost_cents: number;
  };

  const by_agent = db
    .prepare(
      `SELECT agent_id, COUNT(*) as queries, COALESCE(SUM(estimated_cost_cents), 0) as cost_cents
       FROM research_usage
       GROUP BY agent_id
       ORDER BY queries DESC`
    )
    .all() as { agent_id: string; queries: number; cost_cents: number }[];

  const by_day = db
    .prepare(
      `SELECT date(created_at) as date, COUNT(*) as queries, COALESCE(SUM(estimated_cost_cents), 0) as cost_cents
       FROM research_usage
       WHERE created_at >= date('now', '-30 days')
       GROUP BY date(created_at)
       ORDER BY date DESC`
    )
    .all() as { date: string; queries: number; cost_cents: number }[];

  const top_users = db
    .prepare(
      `SELECT ru.user_id, COALESCE(u.username, 'public') as username,
              COUNT(*) as queries, COALESCE(SUM(ru.estimated_cost_cents), 0) as cost_cents
       FROM research_usage ru
       LEFT JOIN users u ON ru.user_id = u.id
       WHERE ru.created_at >= date('now', 'start of month')
       GROUP BY ru.user_id
       ORDER BY queries DESC
       LIMIT 10`
    )
    .all() as { user_id: number; username: string; queries: number; cost_cents: number }[];

  return { ...totals, by_agent, by_day, top_users };
}

/** Check if daily cost threshold is exceeded (circuit breaker) */
export function getDailyCostCents(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(estimated_cost_cents), 0) as cost
       FROM research_usage
       WHERE created_at >= date('now')`
    )
    .get() as { cost: number };
  return row.cost;
}

/** Search conversations for Cmd+K */
export function searchConversations(
  query: string,
  limit = 5
): { id: number; agent_id: string; title: string; updated_at: string }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, agent_id, title, updated_at
       FROM research_conversations
       WHERE title LIKE ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(`%${query}%`, limit) as {
    id: number;
    agent_id: string;
    title: string;
    updated_at: string;
  }[];
}
