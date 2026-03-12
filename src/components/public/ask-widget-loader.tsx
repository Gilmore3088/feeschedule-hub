"use client";

import dynamic from "next/dynamic";

const AskWidget = dynamic(
  () => import("@/components/public/ask-widget").then((m) => m.AskWidget),
  { ssr: false }
);

export function AskWidgetLoader() {
  return <AskWidget />;
}
