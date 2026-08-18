import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { InstitutionSearchBar } from "./search-bar";

const HUNTINGTON_RESULT = {
  id: 22,
  institution_name: "The Huntington National Bank",
  city: "Columbus",
  state_code: "OH",
  charter_type: "bank",
  fee_count: 13,
  published_fee_count: 0,
  provisional_fee_count: 13,
};

describe("InstitutionSearchBar", () => {
  // Fresh mocks per test: `push` call history and the fetch response are
  // reset here rather than shared at module scope, so one test's dropdown
  // data or navigation calls can never bleed into the next.
  beforeEach(() => {
    push.mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [HUNTINGTON_RESULT],
    }) as never;
  });

  it("should_expose_listbox_and_navigate_on_arrow_enter", async () => {
    render(<InstitutionSearchBar />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Hunt" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/institution/22");
  });

  it("should_submit_free_text_on_enter_with_no_selection", async () => {
    render(<InstitutionSearchBar />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Ohio" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/institutions?q=Ohio");
    // "Ohio" is >= 2 chars, so handleChange also armed the 250ms debounced
    // fetch. Let it resolve while the component is still mounted instead of
    // leaving it pending — otherwise it fires after RTL's automatic
    // unmount (afterEach) and can warn or race the next test.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
});
