import { expect, test } from "@playwright/test";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { buildProject } from "../src/generators/project";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import { frame } from "../test/fixtures";

const settings = { ...DEFAULT_SETTINGS, target: "html-css" as const, fluidSingleFrame: false };
const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };
const screen = (id: string, color = red, width = 120) => frame({
  id, name: "Login", children: [frame({
    id: `${id}-child`, name: "Dropdown", fills: [{ type: "solid", color }],
    box: { x: 0, y: 0, width, height: 40, rotation: 0 },
  })],
});

test("separately exported same-named frames do not override each other or host dropdowns", async ({ page }) => {
  const first = generate([screen("12:34", red)], [], settings, new Warnings());
  const second = generate([screen("56:78", blue)], [], settings, new Warnings());
  await page.setContent(`<style>.dropdown { width: 77px; height: 20px; background-color: purple; }\n${first.sections[1].code}\n${second.sections[1].code}</style><div class="dropdown">Host UI</div>${first.sections[0].code}${second.sections[0].code}`);
  await expect(page.locator(".dropdown")).toHaveCSS("background-color", "rgb(128, 0, 128)");
  await expect(page.locator(".dropdown")).toHaveCSS("width", "77px");
  await expect(page.locator(".dropdown-login-12-34")).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await expect(page.locator(".dropdown-login-56-78")).toHaveCSS("background-color", "rgb(0, 0, 255)");
});

test("responsive media selectors use the renamed classes", async ({ page }) => {
  const mobile = { ...screen("10:1", red, 120), breakpoint: "mobile" as const };
  const desktop = { ...screen("10:2", blue, 240), breakpoint: "desktop" as const };
  const result = generate([mobile, desktop], [], settings, new Warnings());
  await page.setViewportSize({ width: 375, height: 700 });
  await page.setContent(result.previewHtml);
  const dropdown = page.locator(".dropdown-login-10-1");
  await expect(dropdown).toHaveCSS("width", "120px");
  await expect(dropdown).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await page.setViewportSize({ width: 1280, height: 700 });
  await expect(dropdown).toHaveCSS("width", "240px");
  await expect(dropdown).toHaveCSS("background-color", "rgb(0, 0, 255)");
});

test("state selectors remain attached to the frame-specific root", async ({ page }) => {
  const initial = { ...screen("20:1", red), state: "default" };
  const error = { ...screen("20:2", blue), state: "error" };
  const result = generate([initial, error], [], settings, new Warnings());
  await page.setContent(result.previewHtml);
  await expect(page.locator(".dropdown-login-20-1")).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await page.locator("[data-state]").evaluate((node) => { (node as HTMLElement).dataset.state = "error"; });
  await expect(page.locator(".dropdown-login-20-1")).toHaveCSS("background-color", "rgb(0, 0, 255)");
});

test("static export uses the same scoped selectors as preview", async ({ page }) => {
  const root = screen("12:34", red);
  const project = buildProject([root], [], settings.target, new Warnings(), settings);
  const html = project.files.find((file) => file.path === "index.html")!.text!;
  const css = project.files.find((file) => file.path === "styles.css")!.text!;
  await page.setContent(html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`));
  await expect(page.locator(".dropdown-login-12-34")).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await expect(page.locator(".dropdown-login-12-34")).toHaveCSS("width", "120px");
});
