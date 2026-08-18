import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { InstitutionSearchBar } from "./search-bar";

describe("InstitutionSearchBar", () => {
  it("should_expose_listbox_and_navigate_on_arrow_enter", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ([{ id: 22, institution_name: "The Huntington National Bank", city: "Columbus", state_code: "OH", charter_type: "bank", fee_count: 13, published_fee_count: 0, provisional_fee_count: 13 }]) }) as never;
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
  });
});
