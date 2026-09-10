import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function request(
  url: string,
  host = new URL(url).host,
  headers: Record<string, string> = {},
) {
  return new NextRequest(url, {
    headers: {
      host,
      ...headers,
    },
  });
}

describe("proxy", () => {
  it("lets public routes reach the App Router", () => {
    const response = proxy(request("https://feeinsight.com/methodology"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("content-type")).toBeNull();
  });

  it("forwards the requested path to App Router layouts", () => {
    const response = proxy(
      request("https://feeinsight.com/pro/research?prompt=competitive-brief&instId=2945", undefined, {
        cookie: "fsh_session=present",
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-x-invoke-path")).toBe(
      "/pro/research?prompt=competitive-brief&instId=2945",
    );
    expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/pro/research");
  });

  it("redirects retired public domains to feeinsight.com", () => {
    const response = proxy(request("https://bankfeeindex.com/fees?category=wire"));

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://feeinsight.com/fees?category=wire");
  });

  it("permanently redirects retired public paths to their current homes", () => {
    const cases: Array<[string, string]> = [
      ["https://feeinsight.com/consumer", "https://feeinsight.com/institutions"],
      ["https://feeinsight.com/check", "https://feeinsight.com/institutions"],
      ["https://feeinsight.com/districts", "https://feeinsight.com/research"],
      ["https://feeinsight.com/waitlist", "https://feeinsight.com/for-institutions#report"],
      ["https://feeinsight.com/pricing", "https://feeinsight.com/subscribe"],
      ["https://feeinsight.com/report", "https://feeinsight.com/for-institutions#report"],
      ["https://feeinsight.com/request-report", "https://feeinsight.com/for-institutions#report"],
      ["https://feeinsight.com/claim", "https://feeinsight.com/submit-fees?claim=1"],
    ];
    for (const [from, to] of cases) {
      const response = proxy(request(from));
      expect(response.status, from).toBe(301);
      expect(response.headers.get("location"), from).toBe(to);
    }
  });

  it("canonicalizes a lowercase state research code to uppercase", () => {
    const cases: Array<[string, string]> = [
      ["https://feeinsight.com/research/state/oh", "https://feeinsight.com/research/state/OH"],
      ["https://feeinsight.com/research/state/Oh", "https://feeinsight.com/research/state/OH"],
    ];
    for (const [from, to] of cases) {
      const response = proxy(request(from));
      expect(response.status, from).toBe(301);
      expect(response.headers.get("location"), from).toBe(to);
    }
  });

  it("does not redirect an already-canonical state research path", () => {
    const response = proxy(request("https://feeinsight.com/research/state/OH"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("canonicalizes legacy city slugs (%20 or uppercase) to a lowercase-hyphen path", () => {
    const cases: Array<[string, string]> = [
      ["https://feeinsight.com/fees/city/tx/fort%20worth", "https://feeinsight.com/fees/city/tx/fort-worth"],
      ["https://feeinsight.com/fees/city/TX/Fort-Worth", "https://feeinsight.com/fees/city/tx/fort-worth"],
      ["https://feeinsight.com/fees/city/tx/FORT-WORTH", "https://feeinsight.com/fees/city/tx/fort-worth"],
    ];
    for (const [from, to] of cases) {
      const response = proxy(request(from));
      expect(response.status, from).toBe(301);
      expect(response.headers.get("location"), from).toBe(to);
    }
  });

  it("does not redirect an already-canonical city path", () => {
    const response = proxy(request("https://feeinsight.com/fees/city/tx/fort-worth"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not treat the state city directory as a city page needing canonicalization", () => {
    const response = proxy(request("https://feeinsight.com/fees/city/tx"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not redirect nested or similarly named routes as legacy paths", () => {
    for (const path of ["/pro/districts", "/research/district/2", "/checkout", "/consumers"]) {
      const response = proxy(
        request(`https://feeinsight.com${path}`, undefined, { cookie: "fsh_session=present" }),
      );
      expect(response.headers.get("x-middleware-next"), path).toBe("1");
    }
  });

  it("redirects unauthenticated admin routes to login", () => {
    const response = proxy(request("https://feeinsight.com/admin/knox?queue=fees"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://feeinsight.com/admin/login?from=%2Fadmin%2Fknox%3Fqueue%3Dfees",
    );
  });

  it("does not treat similarly named public routes as admin routes", () => {
    const response = proxy(request("https://feeinsight.com/administer"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects unauthenticated Pro routes to login with the full return path", () => {
    const response = proxy(
      request("https://feeinsight.com/pro/analyze?instId=2945&intent=institution"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://feeinsight.com/login?from=%2Fpro%2Fanalyze%3FinstId%3D2945%26intent%3Dinstitution",
    );
  });

  it("does not treat similarly named public routes as Pro routes", () => {
    const response = proxy(request("https://feeinsight.com/products"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
