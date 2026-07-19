import { test, expect } from "@playwright/test";

// The public intake flow, end to end in a real browser against the built app
// and a real database — the homeowner's happy path from form to confirmation.
test("homeowner fills the intake form and sees a confirmation", async ({ page }) => {
  await page.goto("/i/fixture-link");

  // Step 1 — about you
  await expect(page.locator('[data-field="contact_name"] input')).toBeVisible();
  await page.locator('[data-field="contact_name"] input').fill("E2E Homeowner");
  await page.locator('[data-field="contact_email"] input').fill(`e2e-${Date.now()}@intake-test.example`);
  await page.locator('[data-field="address_line1"] input').fill("42 E2E Test St");
  await page.locator('[data-field="city"] input').fill("Washington");
  await page.locator('[data-field="state"] input').fill("DC");
  await page.locator('[data-field="postal_code"] input').fill("20001");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2 — the work: tap a scope toggle
  await page.locator('[data-toggle="bath"] button').first().click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3 — the place: square footage required
  await page.locator('[data-field="square_footage"] input').fill("1400");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 4 — narrative (optional) → Send
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Sent.")).toBeVisible({ timeout: 15_000 });
});

test("an unknown intake link 404s", async ({ page }) => {
  const res = await page.goto("/i/definitely-not-a-real-slug");
  expect(res?.status()).toBe(404);
});
