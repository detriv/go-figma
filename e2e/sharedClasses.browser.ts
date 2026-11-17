import { expect, test } from "@playwright/test";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import { frame, segment, text, WHITE } from "../test/fixtures";

const settings = { ...DEFAULT_SETTINGS, target: "html-css" as const, fluidSingleFrame: false };
const row = { direction: "row" as const, gap: 8, crossGap: 0, wrap: false, justify: "start" as const, align: "center" as const, padding: { top: 0, right: 0, bottom: 0, left: 0 } };
const tabs = () => frame({ id: "3039:9444", name: "Tab Content Container", layout: row,
  box: { x: 0, y: 0, width: 800, height: 100, rotation: 0 }, children: ["Lite", "Basic", "Pro"].map((label, i) => frame({
    id: `tab-${i}`, name: "Tab", layout: row, fills: [{ type: "solid", color: WHITE }],
    box: { x: 0, y: 0, width: 120, height: 40, rotation: 0 },
    children: [text([segment({ text: `inTechgra ${label}`, fontFamily: "Arial" })], { id: `label-${i}`, name: "List Pegawai" })],
  })),
});

test("peer tabs and their corresponding labels share classes while active modifiers stay local", async ({ page }) => {
  const root = tabs();
  for (const [index, name] of ["Lite", "Basic", "Pro"].entries()) {
    const tab = root.children[index];
    if (tab.kind === "frame") tab.children[0].name = name;
  }
  const result = generate([root], [], settings, new Warnings());
  await page.setContent(result.previewHtml);
  const peers = page.locator("main > div");
  await expect(peers).toHaveCount(3);
  expect(await peers.evaluateAll((nodes) => new Set(nodes.map((node) => node.className)).size)).toBe(1);
  expect(await page.locator("main p").evaluateAll((nodes) => new Set(nodes.map((node) => node.className)).size)).toBe(1);
  await expect(peers.nth(0)).toContainText("Lite");
  await expect(peers.nth(1)).toContainText("Basic");
  await expect(peers.nth(2)).toContainText("Pro");
  await page.addStyleTag({ content: ".tab-store-active { background-color: rgb(0, 0, 255); }" });
  await peers.nth(1).evaluate((node) => node.classList.add("tab-store-active"));
  await expect(peers.nth(0)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(peers.nth(1)).toHaveCSS("background-color", "rgb(0, 0, 255)");
  await expect(peers.nth(2)).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("responsive differences are not merged into a shared peer class", async ({ page }) => {
  const mobile = { ...tabs(), breakpoint: "mobile" as const };
  const desktop = { ...tabs(), id: "3039:9555", breakpoint: "desktop" as const };
  desktop.children[1].box.width = 240;
  const result = generate([mobile, desktop], [], settings, new Warnings());
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.setContent(result.previewHtml);
  const peers = page.locator("main > div");
  await expect(peers.nth(0)).toHaveCSS("width", "120px");
  await expect(peers.nth(1)).toHaveCSS("width", "240px");
  await expect(peers.nth(2)).toHaveCSS("width", "120px");
  expect(await peers.nth(0).getAttribute("class")).toBe(await peers.nth(2).getAttribute("class"));
  expect(await peers.nth(1).getAttribute("class")).not.toBe(await peers.nth(0).getAttribute("class"));
});

test("state differences are isolated while equivalent peers reuse their class", async ({ page }) => {
  const initial = { ...tabs(), state: "default" };
  const error = { ...tabs(), id: "3039:9555", state: "error" };
  error.children[1].fills = [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }];
  await page.setContent(generate([initial, error], [], settings, new Warnings()).previewHtml);
  const peers = page.locator("[data-state] > div");
  await page.locator("[data-state]").evaluate((node) => { (node as HTMLElement).dataset.state = "error"; });
  await expect(peers.nth(0)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(peers.nth(1)).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await expect(peers.nth(2)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(await peers.nth(0).getAttribute("class")).toBe(await peers.nth(2).getAttribute("class"));
});
