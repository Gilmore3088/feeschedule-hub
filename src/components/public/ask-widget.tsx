"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";

const DEFAULT_SUGGESTIONS = [
  "What is the national median overdraft fee?",
  "Compare bank vs credit union ATM fees",
  "Which states have the lowest monthly maintenance fees?",
];

const CONTEXT_SUGGESTIONS: Record<string, string[]> = {
  "/fees": [
    "Which fee category has the widest range?",
    "How do credit union fees compare to banks?",
    "What are the most common bank fees?",
  ],
  "/research": [
    "Which Fed district has the highest overdraft fees?",
    "What is the national trend for NSF fees?",
    "Compare fee levels across asset tiers",
  ],
  "/guides": [
    "How can I avoid overdraft fees?",
    "What is a reasonable monthly maintenance fee?",
    "Which banks have no-fee checking accounts?",
  ],
};

function getSuggestions(pagePath?: string, entityName?: string): string[] {
  if (entityName && pagePath?.startsWith("/institution/")) {
    return [
      `How does ${entityName} compare to similar institutions?`,
      `What fees does ${entityName} charge above the median?`,
      "Which banks in this area have the lowest fees?",
    ];
  }

  if (pagePath?.startsWith("/fees/")) {
    const category = pagePath.split("/fees/")[1]?.split("/")[0] ?? "";
    const label = category.replace(/_/g, " ");
    return [
      `What is the national median for ${label}?`,
      `How do ${label} fees vary by state?`,
      `Compare bank vs credit union ${label} fees`,
    ];
  }

  if (pagePath?.startsWith("/guides/")) {
    const slug = pagePath.split("/guides/")[1]?.split("/")[0] ?? "";
    const topic = slug.replace(/-/g, " ");
    return [
      `How can I reduce ${topic}?`,
      `What is the average cost for ${topic}?`,
      `Which banks have the lowest ${topic}?`,
    ];
  }

  if (pagePath?.startsWith("/research/state/")) {
    const code = pagePath.split("/research/state/")[1]?.split("/")[0] ?? "";
    return [
      `What are the average bank fees in ${code.toUpperCase()}?`,
      `How does ${code.toUpperCase()} compare to the national average?`,
      "Which states have the lowest overall fees?",
    ];
  }

  if (pagePath) {
    for (const [prefix, suggestions] of Object.entries(CONTEXT_SUGGESTIONS)) {
      if (pagePath.startsWith(prefix)) return suggestions;
    }
  }

  return DEFAULT_SUGGESTIONS;
}

interface AskWidgetProps {
  pagePath?: string;
  entityName?: string;
}

export function AskWidget({ pagePath, entityName }: AskWidgetProps = {}) {
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
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#C44B2E] px-4 py-3 text-[13px] font-medium text-white shadow-lg shadow-[#C44B2E]/20 transition-all hover:shadow-xl hover:shadow-[#C44B2E]/30"
        aria-label="Ask about bank fees"
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
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Ask about bank fees
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 flex w-full flex-col rounded-t-2xl border border-[#E8DFD1] bg-[#FFFDF9] shadow-2xl shadow-[#1A1815]/10 sm:bottom-6 sm:right-6 sm:w-[400px] sm:rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8DFD1] px-4 py-3">
        <div>
          <p
            className="text-[13px] font-medium text-[#1A1815]"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            Ask the Data
          </p>
          <p className="text-[11px] text-[#A09788]">
            Powered by Bank Fee Index
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-[#A09788] hover:bg-[#E8DFD1]/40 hover:text-[#5A5347] transition-colors"
          aria-label="Close widget"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
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
        style={{ maxHeight: "50vh", minHeight: "200px" }}
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-[#7A7062]">
              Ask a question about bank and credit union fees across the US.
            </p>
            <div className="space-y-1.5 pt-1">
              {getSuggestions(pagePath, entityName).map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestion(q)}
                  disabled={isLoading}
                  className="block w-full rounded-xl border border-[#E8DFD1] px-3 py-2 text-left text-[12px] text-[#5A5347] transition-colors hover:border-[#C44B2E]/30 hover:bg-[#FAF7F2] disabled:opacity-50"
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
              <div className="inline-block max-w-[85%] rounded-xl bg-[#1A1815] px-3 py-2 text-[13px] text-white">
                {message.parts
                  .filter((p) => p.type === "text")
                  .map((p, i) => (
                    <span key={i}>{(p as { type: "text"; text: string }).text}</span>
                  ))}
              </div>
            ) : (
              <div className="max-w-[95%] text-[13px] leading-relaxed text-[#1A1815]">
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={i}
                        className="prose-hub max-w-none"
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
                        className="my-1 rounded-lg border border-[#E8DFD1]/60 bg-[#FAF7F2]/50 px-2 py-1 text-[11px] text-[#A09788]"
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
          <div className="mb-3 flex items-center gap-1.5 text-[12px] text-[#A09788]">
            <div className="h-4 w-4 border-2 border-[#E8DFD1] border-t-[#C44B2E] rounded-full animate-spin" />
            Analyzing...
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50/50 px-3 py-2 text-[12px] text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-[#E8DFD1] px-3 py-2.5"
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-[#E8DFD1] bg-white px-3 py-2 text-[13px] text-[#1A1815] placeholder:text-[#A09788] focus:outline-none focus:ring-2 focus:ring-[#C44B2E]/30 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="rounded-xl bg-[#C44B2E] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#A83D25] disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[#A09788]">
          Data from published fee schedules. Not financial advice.
        </p>
      </form>
    </div>
  );
}

/** Minimal markdown to HTML for the widget */
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
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-[#E8DFD1]/40 px-1 text-[11px]">$1</code>');

  // Links
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" class="text-[#C44B2E] underline" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = `<p>${html}</p>`;

  return html;
}
