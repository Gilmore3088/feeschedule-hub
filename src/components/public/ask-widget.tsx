"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";

const SUGGESTIONS = [
  "What is the national median overdraft fee?",
  "Compare bank vs credit union ATM fees",
  "Which states have the lowest monthly maintenance fees?",
];

export function AskWidget() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/research/ask" }),
    onError: (err) => {
      const msg = err?.message || "";
      if (msg.includes("429") || msg.includes("rate limit")) {
        setError("You've reached the query limit. Please try again later.");
      } else if (msg.includes("503")) {
        setError("AI service is temporarily unavailable.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-[13px] font-medium text-white shadow-lg transition-all hover:bg-slate-800 hover:shadow-xl"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Ask about bank fees
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[400px] flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-slate-900">
            Ask the Data
          </p>
          <p className="text-[11px] text-slate-400">
            Powered by Fee Insight
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ maxHeight: "360px", minHeight: "200px" }}
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-slate-500">
              Ask a question about bank and credit union fees across the US.
            </p>
            <div className="space-y-1.5 pt-1">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestion(q)}
                  disabled={isLoading}
                  className="block w-full rounded-lg border border-slate-150 px-3 py-2 text-left text-[12px] text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
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
            className={`mb-3 ${message.role === "user" ? "text-right" : ""}`}
          >
            {message.role === "user" ? (
              <div className="inline-block max-w-[85%] rounded-lg bg-slate-900 px-3 py-2 text-[13px] text-white">
                {message.parts
                  .filter((p) => p.type === "text")
                  .map((p, i) => (
                    <span key={i}>{(p as { type: "text"; text: string }).text}</span>
                  ))}
              </div>
            ) : (
              <div className="max-w-[95%] text-[13px] leading-relaxed text-slate-700">
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={i}
                        className="prose prose-sm prose-slate max-w-none [&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border [&_th]:border [&_td]:border [&_th]:bg-slate-50"
                        dangerouslySetInnerHTML={{
                          __html: simpleMarkdown(part.text),
                        }}
                      />
                    );
                  }
                  if (part.type.startsWith("tool-")) {
                    const toolPart = part as { type: string; toolCallId: string; toolName?: string; state?: string };
                    return (
                      <div
                        key={i}
                        className="my-1 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] text-slate-400"
                      >
                        Querying {toolPart.toolName ?? "data"}...
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
          <div className="mb-3 flex items-center gap-1.5 text-[12px] text-slate-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
            Analyzing...
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-100 px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="rounded-lg bg-slate-900 px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-400">
          Data from published fee schedules. Not financial advice.
        </p>
      </form>
    </div>
  );
}

/** Minimal markdown → HTML for tables, bold, links, lists, code */
function simpleMarkdown(text: string): string {
  // Escape HTML
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
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 text-[11px]">$1</code>');

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-blue-600 underline" target="_blank">$1</a>'
  );

  // Lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  return html;
}
