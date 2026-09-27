import { test, expect } from "@playwright/test";
async function fresh(page) {
  await page.goto("/");
  await page.getByTestId("login-email").fill("dana@example.test");
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("app-shell")).toBeVisible();
  page.once("dialog", (d) => d.accept(`Workflow ${Date.now()}`));
  await page.getByTestId("create-org").click();
  await expect(page.getByTestId("devices-empty")).toBeVisible();
}
test("device and session lifecycle through the UI", async ({ page }) => {
  await fresh(page);
  await page.getByTestId("add-device").click();
  await page.getByLabel("Device name").fill("workflow-device");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const row = page.getByTestId("device-row");
  await expect(row).toContainText("workflow-device");
  await row.getByTestId("rename-device").click();
  await page.getByLabel("Device name").fill("renamed-workflow-device");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(row).toContainText("renamed-workflow-device");
  await row.getByTestId("start-control").click();
  await expect(page.getByRole("status")).toContainText(
    "session record started",
  );
  await page.getByTestId("nav-sessions").click();
  await expect(page.getByTestId("session-row")).toContainText("active");
  await page.getByTestId("stop-session").click();
  await expect(page.getByTestId("session-row")).toContainText("ended");
  await page.getByTestId("nav-devices").click();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("decommission-device").click();
  await expect(page.getByTestId("devices-empty")).toBeVisible();
  await page.getByTestId("nav-audit").click();
  await expect(
    page.getByTestId("audit-row").filter({ hasText: "device.decommission" }),
  ).toHaveCount(1);
});
test("invitation creation and revocation through the UI", async ({ page }) => {
  await fresh(page);
  await page.getByTestId("nav-people").click();
  await page.getByTestId("invite-user").click();
  await page
    .getByLabel("Email address")
    .fill(`workflow-${Date.now()}@example.test`);
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(page.getByLabel("Invitation link")).toHaveValue(/\/invite\//);
  await page.getByRole("button", { name: "Close dialog" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("No pending invitations")).toBeVisible();
});
test("organization settings persist and active navigation can refresh", async ({
  page,
}) => {
  await fresh(page);
  await page.getByTestId("nav-devices").click();
  await expect(page.getByTestId("devices-empty")).toBeVisible();
  await page.getByTestId("nav-admin").click();
  await page.getByTestId("rename-org").click();
  const name = `Renamed ${Date.now()}`;
  await page.getByLabel("Organization name").fill(name);
  await page.getByLabel("Accent").selectOption("violet");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByTestId("app-shell")).toHaveAttribute(
    "data-org-theme",
    "violet",
  );
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
});
test("the selected organization survives a reload in its tab", async ({ page }) => {
  await fresh(page);
  const shell = page.getByTestId("app-shell");
  const orgId = await shell.getAttribute("data-org-id");
  await expect(page).toHaveURL(new RegExp(`[?&]org=${orgId}(?:&|$)`));
  await page.reload();
  await expect(page.getByTestId("app-shell")).toHaveAttribute(
    "data-org-id",
    orgId,
  );
});
test("network failure remains visible and accessible", async ({ page }) => {
  await page.goto("/");
  await page.route("**/v1/auth/login", (r) => r.abort("failed"));
  await page.getByTestId("login-email").fill("dana@example.test");
  await page.getByTestId("login-password").fill("demo1234");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toHaveAttribute(
    "role",
    "alert",
  );
  await expect(page.getByTestId("login-error")).toContainText(
    "Cannot reach RemoteOps",
  );
});
test("mobile controls remain reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.getByTestId("nav-admin").click();
  await expect(page.getByTestId("rename-org")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("initial render performance and desktop visual record", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const started = Date.now();
  await page.goto("/");
  await expect(page.getByTestId("login-form")).toBeVisible();
  const loginScreenMs = Date.now() - started;
  await page.getByTestId("login-email").fill("dana@example.test");
  await page.getByTestId("login-password").fill("demo1234");
  const signedIn = Date.now();
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("device-row").first()).toBeVisible();
  console.log(
    `PERFORMANCE login screen ${loginScreenMs}ms; sign-in to first device ${Date.now() - signedIn}ms`,
  );
  await page.screenshot({ path: "../artifacts/dashboard.png", fullPage: true });
});
