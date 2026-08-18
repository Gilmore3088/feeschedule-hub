import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContactForm, INQUIRY_TYPES, inquiryTypeFromParam } from "./contact-form";

describe("inquiryTypeFromParam", () => {
  it("should_map_known_type_params_to_inquiry_values", () => {
    expect(inquiryTypeFromParam("pro")).toBe("enterprise");
    expect(inquiryTypeFromParam("advisory")).toBe("advisory");
    expect(inquiryTypeFromParam("api")).toBe("partnership");
    expect(inquiryTypeFromParam("correction")).toBe("correction");
    expect(inquiryTypeFromParam("report")).toBe("report");
  });

  it("should_return_empty_string_for_unknown_missing_or_array_type", () => {
    expect(inquiryTypeFromParam("nonsense")).toBe("");
    expect(inquiryTypeFromParam(undefined)).toBe("");
    expect(inquiryTypeFromParam(["pro"])).toBe("");
  });
});

describe("INQUIRY_TYPES", () => {
  it("should_include_the_correction_inquiry_type", () => {
    expect(INQUIRY_TYPES.map((t) => t.value)).toContain("correction");
  });
});

describe("ContactForm", () => {
  it("should_preselect_the_inquiry_type_from_the_type_query_param", async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ContactForm searchParamsPromise={Promise.resolve({ type: "pro" })} />
        </Suspense>,
      );
    });

    const select = screen.getByLabelText("Inquiry type") as HTMLSelectElement;
    expect(select.value).toBe("enterprise");
  });

  it("should_default_to_general_when_type_is_absent", async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ContactForm searchParamsPromise={Promise.resolve({})} />
        </Suspense>,
      );
    });

    const select = screen.getByLabelText("Inquiry type") as HTMLSelectElement;
    expect(select.value).toBe("general");
  });
});
