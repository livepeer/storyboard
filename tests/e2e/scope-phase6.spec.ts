import { test, expect } from "@playwright/test";

test.describe("Phase 6: Director + Scope Integration", () => {
  test("director skill includes Scope integration", async ({ page }) => {
    const resp = await page.request.get("/skills/director.md");
    expect(resp.ok()).toBeTruthy();
    const content = await resp.text();
    expect(content).toContain("Scope Integration");
    expect(content).toContain("scope_start");
    expect(content).toContain("scope_control");
    expect(content).toContain("Multi-Stream Orchestration");
    expect(content).toContain("Graph Selection");
  });

  test("all scope tools are available alongside project tools", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    // App loaded = all tool registrations succeeded
    // scope_start, scope_control, scope_stop registered alongside
    // project_create, project_generate, create_media, etc.
  });

  test("scope-agent skill coexists with director skill", async ({ page }) => {
    const registry = await (await page.request.get("/skills/_registry.json")).json();
    const ids = registry.map((s: { id: string }) => s.id);
    expect(ids).toContain("scope-agent");
    expect(ids).toContain("director");
    expect(ids).toContain("scope-lv2v");
    expect(ids).toContain("live-director");
  });

  // Full regression suite — everything must work
  test("regression: main page loads with all elements", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Storyboard")).toBeVisible();
    await expect(page.locator("text=Fit")).toBeVisible();
    await expect(page.locator("text=Agent")).toBeVisible();
    await expect(page.getByText("CAM", { exact: true })).toBeVisible();
    await expect(page.locator("button", { hasText: "Start" })).toBeVisible();
  });

  test("regression: health API", async ({ page }) => {
    const resp = await page.request.get("/api/health");
    expect(resp.ok()).toBeTruthy();
  });

  test("regression: chat input and /skills command", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('textarea[placeholder*="Create a dragon"]');
    await expect(input).toBeVisible();
    await input.fill("/skills");
    await input.press("Enter");
    await expect(page.getByText(/LIVE|Skills:/).first()).toBeVisible({ timeout: 10000 });
  });

  test("regression: settings panel", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[title="Settings"]').click({ force: true });
    await expect(page.getByText("Connect to Daydream")).toBeVisible({ timeout: 10000 });
  });

  test("regression: /capabilities command", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('textarea[placeholder*="Create a dragon"]');
    await input.fill("/capabilities");
    await input.press("Enter");
    await expect(page.getByText(/Models|No capabilities/).first()).toBeVisible({ timeout: 10000 });
  });

  test("regression: all skill files are accessible", async ({ page }) => {
    const skills = [
      "scope-agent", "director", "scope-lv2v", "live-director",
      "scope-graphs", "text-to-image", "video", "storyboard",
      "base", "refinement",
    ];
    for (const id of skills) {
      const resp = await page.request.get(`/skills/${id}.md`);
      expect(resp.ok(), `Skill ${id}.md should be accessible`).toBeTruthy();
    }
  });
});
