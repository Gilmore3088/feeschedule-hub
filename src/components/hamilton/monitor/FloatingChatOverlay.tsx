"use client";

/**
 * FloatingChatOverlay — Collapsible Hamilton chat in bottom-right corner.
 * Minimized by default. Expands on click. Does not disrupt the signal feed.
 * Uses raw fetch + ReadableStream to stay lightweight (no useChat hook dependency).
 * Parses Vercel AI SDK SSE format: lines starting with `0:"` contain text chunks.
 */

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface FloatingChatOverlayProps {
  userId: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function FloatingChatOverlay({ userId }: FloatingChatOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  function parseSSEChunk(line: string): string {
    // Vercel AI SDK SSE format: `0:"text content"`
    const match = line.match(/^0:"(.*)"$/);
    if (!match) return "";
    // Unescape common JSON escape sequences
    return match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMessage: Message = { role: "user", content: text };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInputValue("");
      setIsStreaming(true);

      // Placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        abortRef.current = new AbortController();

        const response = await fetch("/api/research/hamilton", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            mode: "monitor",
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const chunk = parseSSEChunk(line.trim());
            if (chunk) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + chunk,
                  };
                }
                return updated;
              });
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: "Hamilton is unavailable right now. Please try again.",
            };
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming]
  );

  function handleClose() {
    abortRef.current?.abort();
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Ask Hamilton"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 50,
          width: "3rem",
          height: "3rem",
          borderRadius: "9999px",
          backgroundColor: "var(--hamilton-text-accent, #1d4ed8)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          fontSize: "1.125rem",
        }}
        title="Ask Hamilton"
      >
        ✦
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 50,
        width: "360px",
        height: "480px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--hamilton-surface-1, #fff)",
        border: "1px solid var(--hamilton-border, #e7e5e4)",
        borderRadius: "0.75rem",
        boxShadow:
          "0 10px 25px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--hamilton-border)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--hamilton-text-primary)",
            fontFamily: "var(--hamilton-font-serif, serif)",
          }}
        >
          Hamilton
        </span>
        <button
          onClick={handleClose}
          aria-label="Close chat"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--hamilton-text-tertiary)",
            fontSize: "1rem",
            lineHeight: 1,
            padding: "0.25rem",
          }}
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.875rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {messages.length === 0 && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--hamilton-text-secondary)",
              lineHeight: 1.6,
              textAlign: "center",
              marginTop: "2rem",
            }}
          >
            Ask Hamilton about what you&rsquo;re seeing in the signal feed.
          </p>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "0.5rem 0.75rem",
                borderRadius:
                  msg.role === "user"
                    ? "0.75rem 0.75rem 0.125rem 0.75rem"
                    : "0.75rem 0.75rem 0.75rem 0.125rem",
                backgroundColor:
                  msg.role === "user"
                    ? "var(--hamilton-text-accent, #1d4ed8)"
                    : "var(--hamilton-surface-2, #f5f5f4)",
                color:
                  msg.role === "user"
                    ? "#fff"
                    : "var(--hamilton-text-primary)",
                fontSize: "0.8125rem",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content || (
                <span style={{ opacity: 0.5 }}>
                  {isStreaming ? "Thinking..." : ""}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--hamilton-border)",
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(inputValue);
            }
          }}
          placeholder="Ask Hamilton..."
          disabled={isStreaming}
          style={{
            flex: 1,
            fontSize: "0.8125rem",
            padding: "0.375rem 0.625rem",
            border: "1px solid var(--hamilton-border)",
            borderRadius: "0.375rem",
            backgroundColor: "var(--hamilton-surface-1)",
            color: "var(--hamilton-text-primary)",
            outline: "none",
            minWidth: 0,
          }}
        />
        <button
          onClick={() => sendMessage(inputValue)}
          disabled={isStreaming || !inputValue.trim()}
          style={{
            fontSize: "0.8125rem",
            fontWeight: 500,
            padding: "0.375rem 0.75rem",
            backgroundColor: "var(--hamilton-text-accent, #1d4ed8)",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            cursor:
              isStreaming || !inputValue.trim() ? "not-allowed" : "pointer",
            opacity: isStreaming || !inputValue.trim() ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
