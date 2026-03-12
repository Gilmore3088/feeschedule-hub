"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface ConversationSummary {
  id: number;
  title: string;
  updatedAt: string;
}

interface ResearchChatProps {
  agentId: string;
  agentName: string;
  agentDescription: string;
  exampleQuestions: string[];
  conversations: ConversationSummary[];
}

export function ResearchChat({
  agentId,
  agentName,
  agentDescription,
  exampleQuestions,
  conversations,
}: ResearchChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: `/api/research/${agentId}` }),
    onError: (err) => {
      const msg = err?.message || "";
      if (msg.includes("429") || msg.includes("rate limit")) {
        setError("Rate limit exceeded. Please wait before sending more queries.");
      } else if (msg.includes("503")) {
        setError("AI service temporarily unavailable. Daily cost limit may have been reached.");
      } else if (msg.includes("401") || msg.includes("403")) {
        setError("Authentication error. Please refresh the page.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setError(null);
    sendMessage({ text: input });
    setInput("");
  }

  function handleSuggestion(q: string) {
    setError(null);
    sendMessage({ text: q });
  }

  function handleNewChat() {
    setMessages([]);
    inputRef.current?.focus();
  }

  function toggleTool(key: string) {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCopyMarkdown() {
    const md = messages
      .map((m) => {
        const textParts = m.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { type: "text"; text: string }).text)
          .join("");
        return `**${m.role === "user" ? "You" : agentName}:** ${textParts}`;
      })
      .join("\n\n");
    navigator.clipboard.writeText(md);
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-56 shrink-0 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              History
            </p>
            <button
              onClick={() => setShowSidebar(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="text-[11px] text-gray-400">No conversations yet</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button className="w-full rounded px-2 py-1.5 text-left text-[11px] text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800">
                    <p className="truncate font-medium">{c.title}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-1 flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/research"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {agentName}
              </h1>
              <p className="text-[11px] text-gray-400">{agentDescription}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              title="Conversation history"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
            {messages.length > 0 && (
              <>
                <button
                  onClick={handleCopyMarkdown}
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                  title="Copy as markdown"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
                <button
                  onClick={handleNewChat}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
                >
                  New Chat
                </button>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="mx-auto max-w-lg pt-8 text-center">
              <p className="text-[13px] text-gray-500">
                Ask a question to get started, or try one of these:
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {exampleQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSuggestion(q)}
                    disabled={isLoading}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`mb-4 ${message.role === "user" ? "flex justify-end" : ""}`}
            >
              {message.role === "user" ? (
                <div className="max-w-[75%] rounded-lg bg-gray-900 px-3.5 py-2.5 text-[13px] text-white dark:bg-gray-700">
                  {message.parts
                    .filter((p) => p.type === "text")
                    .map((p, i) => (
                      <span key={i}>
                        {(p as { type: "text"; text: string }).text}
                      </span>
                    ))}
                </div>
              ) : (
                <div className="max-w-[90%]">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {agentName}
                  </p>
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <div
                          key={i}
                          className="prose prose-sm prose-gray max-w-none text-[13px] leading-relaxed dark:prose-invert [&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border-gray-200 [&_th]:border [&_td]:border [&_th]:bg-gray-50 dark:[&_th]:bg-gray-800 dark:[&_table]:border-gray-700"
                          dangerouslySetInnerHTML={{
                            __html: simpleMarkdown(
                              (part as { type: "text"; text: string }).text
                            ),
                          }}
                        />
                      );
                    }
                    if (part.type.startsWith("tool-")) {
                      const toolPart = part as {
                        type: string;
                        toolCallId: string;
                        toolName?: string;
                        state?: string;
                        input?: unknown;
                        output?: unknown;
                      };
                      const toolKey = `${message.id}-${i}`;
                      const isExpanded = expandedTools.has(toolKey);
                      return (
                        <div
                          key={i}
                          className="my-2 rounded border border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/50"
                        >
                          <button
                            onClick={() => toggleTool(toolKey)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-gray-500"
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                            <span className="font-medium">
                              {toolPart.toolName ?? "tool"}
                            </span>
                            {toolPart.state === "output" && (
                              <span className="text-emerald-500">done</span>
                            )}
                            {toolPart.state === "call" && (
                              <span className="animate-pulse text-amber-500">
                                running...
                              </span>
                            )}
                          </button>
                          {isExpanded && (
                            <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
                              <p className="text-[10px] font-semibold text-gray-400">
                                Parameters
                              </p>
                              <pre className="mt-1 overflow-x-auto text-[10px] text-gray-600 dark:text-gray-400">
                                {JSON.stringify(toolPart.input, null, 2)}
                              </pre>
                              {toolPart.output !== undefined && (
                                <>
                                  <p className="mt-2 text-[10px] font-semibold text-gray-400">
                                    Result
                                  </p>
                                  <pre className="mt-1 max-h-40 overflow-auto text-[10px] text-gray-600 dark:text-gray-400">
                                    {JSON.stringify(toolPart.output, null, 2).substring(0, 2000)}
                                  </pre>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="mb-4 flex items-center gap-2 text-[12px] text-gray-400">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-gray-400" />
              Analyzing...
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-2 underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-100 px-4 py-3 dark:border-gray-800"
        >
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Minimal markdown to HTML */
function simpleMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Tables
  html = html.replace(
    /^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, header: string, _sep: string, body: string) => {
      const headers = header
        .split("|")
        .filter((c: string) => c.trim())
        .map((c: string) => `<th>${c.trim()}</th>`)
        .join("");
      const rows = body
        .trim()
        .split("\n")
        .map((row: string) => {
          const cells = row
            .split("|")
            .filter((c: string) => c.trim())
            .map((c: string) => `<td>${c.trim()}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  );

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-gray-100 px-1 text-[11px] dark:bg-gray-800">$1</code>'
  );

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-blue-600 underline dark:text-blue-400">$1</a>'
  );

  // Lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  return html;
}
