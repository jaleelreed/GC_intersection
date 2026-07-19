import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated accessibility gate: no serious/critical WCAG violations on the
// key pages. Runs axe-core against the real rendered pages.
const SECRET = process.env.E2E_AUTH_SECRET;

async function scan(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test("landing page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  const serious = await scan(page);
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)).toEqual([]);
});

test("intake form has no serious accessibility violations", async ({ page }) => {
  await page.goto("/i/fixture-link");
  const serious = await scan(page);
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)).toEqual([]);
});

test("sign-in page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/auth/sign-in");
  const serious = await scan(page);
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)).toEqual([]);
});

test.describe("authenticated pages", () => {
  test.skip(!SECRET, "requires E2E_AUTH_SECRET (CI only)");
  test("leads page has no serious accessibility violations", async ({ page, context }) => {
    await context.addCookies([
      { name: "e2e_auth", value: SECRET!, domain: "localhost", path: "/" },
      { name: "e2e_email", value: "test-gc@example.com", domain: "localhost", path: "/" },
    ]);
    await page.goto("/app");
    const serious = await scan(page);
    expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.length })), null, 2)).toEqual([]);
  });
});
