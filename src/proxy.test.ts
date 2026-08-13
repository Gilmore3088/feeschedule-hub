import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function request(url: string, host = new URL(url).host) {
  return new NextRequest(url, {
    headers: {
      host,
    },
  });
}

describe("proxy", () => {
  it("lets public routes reach the App Router", () => {
    const response = proxy(request("https://feeinsight.com/methodology"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("content-type")).toBeNull();
  });

  it("redirects retired public domains to feeinsight.com", () => {
    const response = proxy(request("https://bankfeeindex.com/fees?category=wire"));

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://feeinsight.com/fees?category=wire");
  });

  it("redirects unauthenticated admin routes to login", () => {
    const response = proxy(request("https://feeinsight.com/admin/knox?queue=fees"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://feeinsight.com/admin/login?from=%2Fadmin%2Fknox%3Fqueue%3Dfees",
    );
  });
});
