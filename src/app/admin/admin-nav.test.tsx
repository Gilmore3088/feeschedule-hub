// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminNav, AdminNavInline } from "./admin-nav";

const navigationState = vi.hoisted(() => ({
  pathname: "/admin/states",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  navigationState.pathname = "/admin/states";
});

describe("AdminNav", () => {
  it("labels Atlas subviews by operator task instead of repeating Atlas", () => {
    render(<AdminNav badges={{ trustPending: 3 }} />);

    expect(screen.getByText("State Lanes")).toBeInTheDocument();
    expect(screen.getByText("State queues")).toBeInTheDocument();
    expect(screen.getByText("Trust Review")).toBeInTheDocument();
    expect(screen.getByText("Source review")).toBeInTheDocument();
    expect(screen.getByText("Atlas")).toBeInTheDocument();
    expect(screen.queryByText("Atlas Lanes")).not.toBeInTheDocument();
    expect(screen.queryByText("Atlas Trust")).not.toBeInTheDocument();
  });

  it("uses the same clearer labels in the compact nav", () => {
    render(<AdminNavInline />);

    expect(screen.getByRole("link", { name: /State Lanes/ })).toHaveAttribute("href", "/admin/states");
    expect(screen.getByRole("link", { name: /Trust Review/ })).toHaveAttribute("href", "/admin/quality");
  });
});
