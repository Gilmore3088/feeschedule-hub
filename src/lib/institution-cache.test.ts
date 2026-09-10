import { describe, expect, it } from "vitest";
import { institutionCacheKey, institutionTag } from "./institution-cache";

describe("institutionCacheKey", () => {
  it("should_include_the_institution_id", () => {
    expect(institutionCacheKey(22)).toEqual(["institution", "22"]);
  });

  it("should_append_extra_parts_to_distinguish_reads_for_the_same_institution", () => {
    expect(institutionCacheKey(22, "fees")).toEqual(["institution", "22", "fees"]);
    expect(institutionCacheKey(22, "profile")).toEqual(["institution", "22", "profile"]);
  });

  it("should_stringify_a_string_id_without_double_quoting", () => {
    expect(institutionCacheKey("22")).toEqual(["institution", "22"]);
  });
});

describe("institutionTag", () => {
  it("should_format_as_institution_colon_id", () => {
    expect(institutionTag(22)).toBe("institution:22");
  });

  it("should_produce_a_tag_matching_the_cache_key_id", () => {
    const id = 4491;
    const [, keyId] = institutionCacheKey(id);
    expect(institutionTag(id)).toBe(`institution:${keyId}`);
  });
});
