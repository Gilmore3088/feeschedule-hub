"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const AskWidget = dynamic(
  () => import("@/components/public/ask-widget").then((m) => m.AskWidget),
  { ssr: false }
);

export function AskWidgetLoader() {
  const pathname = usePathname();
  return <AskWidget pagePath={pathname} />;
}
