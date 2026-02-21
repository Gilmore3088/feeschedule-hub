"use client";

import { useEffect, useState } from "react";

export function TableOfContents({
  headings,
}: {
  headings: { id: string; text: string }[];
}) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings]);

  return (
    <nav className="space-y-0.5">
      {headings.map((h) => (
        <a
          key={h.id}
          href={`#${h.id}`}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
          }}
          className={`block rounded-md px-2.5 py-1.5 text-[12px] leading-snug transition-colors ${
            activeId === h.id
              ? "bg-slate-100 text-slate-900 font-medium"
              : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
          }`}
        >
          {h.text.length > 40 ? h.text.slice(0, 40) + "..." : h.text}
        </a>
      ))}
    </nav>
  );
}
