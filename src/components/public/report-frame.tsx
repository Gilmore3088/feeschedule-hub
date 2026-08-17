"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Reports are laid out for US Letter: 8.5in at 96dpi. */
const REPORT_WIDTH_PX = 816;
const INITIAL_HEIGHT_PX = 1056;
const RESIZE_SETTLE_DELAYS_MS = [250, 1000, 2500];

interface ReportFrameProps {
  /** Complete HTML document (the report's own styles included). */
  html: string;
  title: string;
  /** Where "download the PDF" in the narrow-viewport note points. */
  pdfHref?: string;
}

/**
 * Renders a self-contained report document in a same-origin, script-free iframe so the
 * report's global styles (`*`, `body`, `@page`) never leak into the site and Tailwind's
 * preflight never leaks into the report. The frame grows to fit its content, is centered
 * on wide viewports, and on viewports narrower than the page scrolls horizontally at
 * native size (never scaled down to unreadable text).
 */
export function ReportFrame({ html, title, pdfHref }: ReportFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT_PX);

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    const next = doc?.documentElement?.scrollHeight ?? 0;
    if (next > 0) setHeight(next);
  }, []);

  useEffect(() => {
    const timers = RESIZE_SETTLE_DELAYS_MS.map((delay) => window.setTimeout(measure, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [measure]);

  const handleLoad = () => {
    measure();
    const body = frameRef.current?.contentDocument?.body;
    if (!body) return;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
  };

  return (
    <div className="mx-auto w-full" style={{ maxWidth: REPORT_WIDTH_PX + 2 }}>
      <p className="mb-2 text-[13px] text-[#6B6255] min-[840px]:hidden">
        Full report — pinch to zoom, or{" "}
        {pdfHref ? (
          <a href={pdfHref} className="font-semibold text-[#5A5347] underline">
            download the PDF
          </a>
        ) : (
          "download the PDF"
        )}
        .
      </p>
      <div
        className="w-full overflow-x-auto overflow-y-hidden rounded-xl border border-[#E0D7C9] bg-[#FDFBF8]"
        style={{ height: height + 2, WebkitOverflowScrolling: "touch" }}
      >
        <iframe
          ref={frameRef}
          title={title}
          srcDoc={html}
          sandbox="allow-same-origin"
          onLoad={handleLoad}
          scrolling="no"
          style={{
            width: REPORT_WIDTH_PX,
            height,
            border: 0,
            display: "block",
          }}
        />
      </div>
    </div>
  );
}
