import { test, expect } from "@playwright/test";
test("map, filters, posting, interest persistence, cancellation and mobile layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const missing = [];
  page.on("response", (r) => {
    if (r.url().startsWith("http://127.0.0.1:3017") && r.status() >= 400)
      missing.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("#events .event")).toHaveCount(3);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".geo-pin")).toHaveCount(3);
  await page.locator('[data-filter="Workshop"]').click();
  await expect(page.locator("#events .event")).toHaveCount(1);
  await page.locator("#events .event").click();
  await page.locator("#interest").click();
  await page.reload();
  await page.locator('[data-view="Interested"]').click();
  await expect(page.locator("#events .event")).toHaveCount(1);
  await page.locator("#add").click();
  for (const [name, value] of Object.entries({
    title: "Test meetup",
    room: "E-101",
    host: "Test club",
    description: "A new campus meetup",
  }))
    await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('#postForm button[type="submit"]').click();
  await expect(page.locator("#detail h2")).toHaveText("Test meetup");
  await page.reload();
  await page.locator('[data-view="Mine"]').click();
  await expect(page.locator("#events .event")).toHaveCount(1);
  await page.locator("#events .event").click();
  await page.locator("#cancelEvent").click();
  await expect(page.locator("#events .event")).toHaveCount(0);
  await page.locator("#toggleClassrooms").click();
  await expect(page.locator("#toggleClassrooms")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#campusMap")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(missing).toEqual([]);
});
