import { test, expect } from "@playwright/test";

test.describe("Storyboard App", () => {
  test("loads the main page with top bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    await expect(page.locator("text=Fit")).toBeVisible();
    await expect(page.getByRole("button", { name: "Train", exact: true }).first()).toBeVisible();
  });

  test("chat panel is visible with system message", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Agent")).toBeVisible();
    await expect(page.locator("text=Connected")).toBeVisible();
  });

  test("chat input accepts text", async ({ page }) => {
    await page.goto("/");
    const input = page.locator(
      'textarea[placeholder*="Create a dragon"]'
    );
    await expect(input).toBeVisible();
    await input.fill("Create a dragon");
    await expect(input).toHaveValue("Create a dragon");
  });

  test("settings panel opens and closes", async ({ page }) => {
    await page.goto("/");
    // Click the gear button via title attribute
    await page.locator('button[title="Settings"]').click({ force: true });
    await expect(page.getByText("Connect to Daydream")).toBeVisible({ timeout: 10000 });
    // Click overlay background to close
    await page.mouse.click(10, 10);
    await expect(
      page.getByText("Connect to Daydream")
    ).not.toBeVisible();
  });

  test("camera widget has start button", async ({ page }) => {
    await page.goto("/");
    // Camera widget has "CAM" badge and "Start" button
    await expect(page.getByText("CAM", { exact: true })).toBeVisible();
    await expect(
      page.locator("button", { hasText: "Start" })
    ).toBeVisible();
  });

  test("health API returns ok", async ({ page }) => {
    const resp = await page.request.get("/api/health");
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.status).toBe("ok");
  });
});
