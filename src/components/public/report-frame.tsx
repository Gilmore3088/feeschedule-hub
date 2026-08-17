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
}

/**
 * Renders a self-contained report document in a same-origin, script-free iframe so the
 * report's global styles (`*`, `body`, `@page`) never leak into the site and Tailwind's
 * preflight never leaks into the report. The frame grows to fit its content and scales
 * down on narrow viewports.
 */
export function ReportFrame({ html, title }: ReportFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT_PX);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    const next = doc?.documentElement?.scrollHeight ?? 0;
    if (next > 0) setHeight(next);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const fit = () => {
      const width = container.clientWidth;
      setScale(width > 0 && width < REPORT_WIDTH_PX ? width / REPORT_WIDTH_PX : 1);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
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
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-xl border border-[#E0D7C9] bg-[#FDFBF8]"
      style={{ height: Math.ceil(height * scale) }}
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
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}
