"use client";

import dynamic from "next/dynamic";

const AskSearchBar = dynamic(
  () =>
    import("@/components/public/ask-search-bar").then((m) => m.AskSearchBar),
  { ssr: false }
);

export function AskSearchBarLoader() {
  return <AskSearchBar />;
}
