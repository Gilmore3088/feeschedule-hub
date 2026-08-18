import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { ConsumerMobileNav } from "./consumer-mobile-nav";

describe("ConsumerMobileNav", () => {
  it("should_portal_the_drawer_to_body_so_header_backdrop_filter_cannot_clip_it", () => {
    const { container } = render(<header style={{ backdropFilter: "blur(2px)" }}><ConsumerMobileNav isLoggedIn={false} isPro={false} /></header>);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const dialog = screen.getByRole("dialog", { name: /menu/i });
    expect(container.contains(dialog)).toBe(false);          // not inside the header
    expect(document.body.contains(dialog)).toBe(true);
  });
  it("should_close_on_escape_and_backdrop_click", () => {
    render(<ConsumerMobileNav isLoggedIn={false} isPro={false} />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
