import { test, expect } from "@playwright/test";

// The authenticated GC journey, end to end: sign in (via the CI-only auth
// bypass) → see a lead → open it → edit a price → send a bid → buyer accepts.
// Skipped unless the bypass is enabled (E2E_AUTH_SECRET set in CI).
const SECRET = process.env.E2E_AUTH_SECRET;
const FIXTURE_GC_EMAIL = "test-gc@example.com"; // maps to the seeded fixture org

test.skip(!SECRET, "authed e2e requires E2E_AUTH_SECRET (CI only)");

test("GC signs in, edits a lead's estimate, sends a bid, buyer accepts", async ({ page, context, request }) => {
  // Authenticate as the fixture GC via the bypass cookies.
  await context.addCookies([
    { name: "e2e_auth", value: SECRET!, domain: "localhost", path: "/" },
    { name: "e2e_email", value: FIXTURE_GC_EMAIL, domain: "localhost", path: "/" },
  ]);
  // Suppress the first-run onboarding modal so it can't intercept the journey
  // (it has its own dedicated coverage below).
  await page.addInitScript(() => {
    try {
      localStorage.setItem("bideasy_onboarding", "seen");
    } catch {
      /* ignore */
    }
  });

  // Seed a fresh lead through the public intake API (lands in the fixture org).
  const email = `authed-${Date.now()}@intake-test.example`;
  const submit = await request.post("/api/intake/fixture-link", {
    data: {
      contact_name: "Authed E2E",
      contact_email: email,
      address_line1: "7 Authed Test Ave",
      city: "Washington",
      state: "DC",
      postal_code: "20001",
      square_footage: 1500,
      conditions: { year_built: 1940, occupied: false, access: "easy", known_problems: [] },
      scope_toggles: {
        bath: { on: true, class: "in_place" }, kitchen: { on: false, class: null },
        floors: { on: false, class: null }, walls: { on: false, class: null },
        utilities: { on: false, class: null }, plumbing: { on: false, class: null },
        electric: { on: false, class: null }, mechanical: { on: false, class: null },
        roof: { on: false, class: null }, basement: { on: false, class: null },
      },
      structural_flags: {}, finish_tier: "mid", narrative: "",
      form_started_at: Date.now() - 60000,
    },
  });
  expect(submit.status()).toBe(201);
  const { id } = await submit.json();

  // The lead shows on the reveal, priced.
  await page.goto(`/app/lead/${id}`);
  await expect(page.getByText("Why this range")).toBeVisible({ timeout: 15_000 });

  // Open the editor, change the first line's unit price, save.
  await page.getByRole("link", { name: "Edit to your prices" }).click();
  const unit = page.locator('input[aria-label^="unit cost"]').first();
  await unit.fill("123.45");
  await page.getByRole("button", { name: /Save \(\d+\)/ }).click();

  // Back on the reveal; send the bid.
  await expect(page).toHaveURL(new RegExp(`/app/lead/${id}$`), { timeout: 15_000 });
  await page.getByRole("button", { name: "Create bid link" }).click();
  const linkInput = page.getByTestId('bid-link');
  await expect(linkInput).toBeVisible({ timeout: 15_000 });
  const buyerUrl = await linkInput.inputValue();
  expect(buyerUrl).toContain("/p/");

  // Buyer opens the link and accepts (the bid page is token-based; auth
  // cookies are irrelevant to it).
  const buyer = await context.newPage();
  await buyer.goto(buyerUrl);
  await buyer.getByRole("button", { name: "Accept this bid" }).click();
  await buyer.getByRole("button", { name: "Yes, accept this bid" }).click();
  await expect(buyer.getByText("You accepted this bid")).toBeVisible({ timeout: 15_000 });
});

test("first-run onboarding shows + dismisses; side nav toggles", async ({ page, context }) => {
  await context.addCookies([
    { name: "e2e_auth", value: SECRET!, domain: "localhost", path: "/" },
    { name: "e2e_email", value: FIXTURE_GC_EMAIL, domain: "localhost", path: "/" },
  ]);

  await page.goto("/app");

  // First-run BidEasy onboarding auto-opens on the dashboard.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Welcome to BidEasy")).toBeVisible();
  // Paginates, then dismisses (Escape closes and marks it seen).
  await page.getByRole("button", { name: "Next" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Re-openable from the Help control.
  await page.getByRole("button", { name: "How BidEasy works" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Active route reflected on the nav, then the side nav collapses on toggle.
  await expect(page.getByRole("link", { name: "Leads" })).toHaveAttribute("aria-current", "page");
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("a brand-new email is provisioned on first /app visit (cost_items clone under RLS)", async ({ page, context }) => {
  // A fresh identity triggers ensureWorkspace, which clones the starter rate
  // library (FORCE-RLS'd cost_items) from the template org into the new org.
  // Under the non-superuser owner role CI runs as, this only succeeds if the
  // clone reads the template + writes the new org each under its own org
  // context — so a rendered shell here is the proof it works.
  const freshEmail = `newgc-${Date.now()}@example.com`;
  await context.addCookies([
    { name: "e2e_auth", value: SECRET!, domain: "localhost", path: "/" },
    { name: "e2e_email", value: freshEmail, domain: "localhost", path: "/" },
  ]);
  await page.goto("/app");
  await expect(page.getByRole("button", { name: "Toggle navigation" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Welcome to BidEasy")).toBeVisible();
});

test("mobile: hamburger opens the nav drawer; selecting an item closes it", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await context.addCookies([
    { name: "e2e_auth", value: SECRET!, domain: "localhost", path: "/" },
    { name: "e2e_email", value: FIXTURE_GC_EMAIL, domain: "localhost", path: "/" },
  ]);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("bideasy_onboarding", "seen");
    } catch {
      /* ignore */
    }
  });
  await page.goto("/app");

  const drawer = page.locator("#primary-drawer");
  await expect(drawer).toHaveAttribute("aria-hidden", "true"); // closed on load
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(drawer).toHaveAttribute("aria-hidden", "false"); // opens
  await page.getByRole("link", { name: "Bids" }).click(); // selecting an item…
  await expect(page).toHaveURL(/\/app\/bids$/); // …navigates…
  await expect(drawer).toHaveAttribute("aria-hidden", "true"); // …and closes it
  await context.close();
});
