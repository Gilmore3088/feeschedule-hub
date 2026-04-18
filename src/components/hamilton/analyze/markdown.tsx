import type { ReactNode } from "react";

// Render a minimal inline markdown subset: **bold** and *italic*.
// Splits on bold first, then italic inside non-bold runs. No HTML injection —
// output is a React node array, so any literal characters are escaped.
export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const boldSplit = text.split(/\*\*(.+?)\*\*/g);
  boldSplit.forEach((chunk, i) => {
    if (i % 2 === 1) {
      nodes.push(<strong key={`b-${i}`}>{renderItalic(chunk, `b-${i}`)}</strong>);
    } else if (chunk) {
      nodes.push(...renderItalic(chunk, `t-${i}`));
    }
  });
  return nodes;
}

function renderItalic(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g);
  parts.forEach((chunk, i) => {
    if (i % 2 === 1) {
      nodes.push(<em key={`${keyPrefix}-i-${i}`}>{chunk}</em>);
    } else if (chunk) {
      nodes.push(chunk);
    }
  });
  return nodes;
}
