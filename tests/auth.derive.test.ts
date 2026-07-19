// Zero-paste auth config: derivations are pure and deterministic.
import { describe, expect, it } from "vitest";
import { deriveAuthBaseUrl, deriveCookieSecret } from "../lib/auth/derive";

describe("deriveAuthBaseUrl", () => {
  it("maps the unpooled Neon host to the neonauth endpoint", () => {
    expect(
      deriveAuthBaseUrl("postgresql://user:pw@ep-cool-sky-123456.us-east-1.aws.neon.tech/neondb?sslmode=require")
    ).toBe("https://ep-cool-sky-123456.neonauth.us-east-1.aws.neon.tech/neondb/auth");
  });

  it("strips a -pooler suffix if handed the pooled url anyway", () => {
    expect(
      deriveAuthBaseUrl("postgresql://u:p@ep-cool-sky-123456-pooler.us-east-1.aws.neon.tech/mydb")
    ).toBe("https://ep-cool-sky-123456.neonauth.us-east-1.aws.neon.tech/mydb/auth");
  });
});

describe("deriveCookieSecret", () => {
  it("is deterministic, salted, and never echoes the input", () => {
    const url = "postgresql://user:secretpw@host/db";
    const a = deriveCookieSecret(url);
    expect(a).toBe(deriveCookieSecret(url));
    expect(a).not.toBe(deriveCookieSecret(url + "x"));
    expect(a).not.toContain("secretpw");
    expect(a.length).toBeGreaterThanOrEqual(40); // 32 bytes base64
  });
});
