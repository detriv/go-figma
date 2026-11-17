import { expect, test, type Page } from "@playwright/test";
import { generate } from "../src/generators/index";
import { buildProject } from "../src/generators/project";
import { Warnings } from "../src/core/warnings";
import type { AutoLayout, IRNode } from "../src/core/ir";
import { frame, segment, shape, text } from "../test/fixtures";

const box = (width: number, height: number, x = 0, y = 0) => ({ x, y, width, height, rotation: 0 });
const layout = (direction: "row" | "column", padding = 0): AutoLayout => ({
  direction, gap: 16, crossGap: 0, wrap: false, justify: "start", align: "start",
  padding: { top: padding, right: padding, bottom: padding, left: padding },
});
const settings = { target: "html-css" as const, fluidSingleFrame: true, semanticHtml: true };

async function render(page: Page, roots: IRNode[], width: number, exported = false) {
  await page.setViewportSize({ width, height: 900 });
  // Network-independent geometry tests use a known local font.
  await page.route("**/*", (route) => route.abort());
  if (exported) {
    const project = buildProject(roots, [], settings.target, new Warnings(), settings);
    const html = project.files.find((f) => f.path === "index.html")!.text!;
    const css = project.files.find((f) => f.path === "styles.css")!.text!;
    await page.setContent(html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`));
  } else {
    const result = generate(roots, [], settings, new Warnings());
    await page.setContent(result.previewHtml);
  }
  await page.addStyleTag({ content: "* { font-family: Arial, sans-serif !important; }" });
}

async function expectNoPageOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.width + 1);
}

for (const width of [320, 375, 768, 1023, 1024, 1440]) {
  test(`root card row fits viewport ${width}`, async ({ page }) => {
    const root = frame({ name: "Root Row", box: box(1440, 200), layout: layout("row"), children: [
      frame({ name: "Card A", box: box(280, 100) }),
      frame({ name: "Card B", box: box(280, 100) }),
    ] });
    await render(page, [root], width);
    await expectNoPageOverflow(page);
  });
}

for (const depth of [0, 1, 3]) {
  test(`wrapping a row with ${depth} flow wrappers does not overlap the next section`, async ({ page }) => {
    let cards = frame({ name: "Cards", box: box(1440, 100), layout: layout("row"), children: [
      frame({ name: "Card A", box: box(360, 100) }),
      frame({ name: "Card B", box: box(360, 100) }),
    ] });
    for (let i = 0; i < depth; i++) cards = frame({ name: `Wrapper ${i}`, box: box(1440, 100), layout: layout("column"), children: [cards] });
    const root = frame({ name: "Page", box: box(1440, 900), layout: layout("column"), children: [
      cards, frame({ name: "Next Section", box: box(1440, 100) }),
    ] });
    await render(page, [root], 375);
    const card = await page.locator(".card-b").boundingBox();
    const next = await page.locator(".next-section").boundingBox();
    expect(next!.y).toBeGreaterThanOrEqual(card!.y + card!.height);
    await expectNoPageOverflow(page);
  });
}

for (const width of [320, 375, 767, 768, 1023, 1024, 1280, 1440]) {
  test(`merged frames fit at intermediate width ${width}`, async ({ page }) => {
    const screen = (breakpoint: "mobile" | "desktop", designWidth: number) => frame({
      name: `${breakpoint} Page`, breakpoint, box: box(designWidth, 900), layout: layout("column", 16),
      children: [frame({ name: "Content", box: box(designWidth - 32, 100) })],
    });
    await render(page, [screen("mobile", 375), screen("desktop", 1440)], width);
    await expectNoPageOverflow(page);
    const content = await page.locator(".content").boundingBox();
    expect(content!.width).toBeLessThanOrEqual(width - 32 + 1);
  });
}

for (const exported of [false, true]) {
  test(`semantic controls keep valid DOM and design defaults (${exported ? "export" : "preview"})`, async ({ page }) => {
    const root = frame({ name: "Page", box: box(600, 500), layout: layout("column"), children: [
      text([segment({ text: "Regular title", fontFamily: "Arial", fontWeight: 400, fontSize: 36 })], { name: "Page Title" }),
      frame({ name: "Buttons", layout: layout("row"), children: [
        frame({ name: "Primary Button", layout: { ...layout("row"), align: "center", justify: "center" }, children: [
          text([segment({ text: "Save  now", fontFamily: "Arial" })], { name: "Label" }),
        ] }),
      ] }),
    ] });
    await render(page, [root], 600, exported);
    await expect(page.locator("button")).toHaveCount(1);
    await expect(page.locator(".buttons > button")).toHaveCount(1);
    await expect(page.locator("button p, button h1, button button")).toHaveCount(0);
    await expect(page.locator("h1")).toHaveCSS("font-weight", "400");
    await expect(page.locator("h1")).toHaveCSS("margin-top", "0px");
    await expect(page.locator("button")).toHaveCSS("border-top-width", "0px");
    await expect(page.locator("button")).toHaveCSS("padding-left", "0px");
    await expect(page.locator("button")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const spaces = await page.locator(".label").evaluate((node) => {
      const width = () => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().width; };
      const double = width();
      node.textContent = "Save now";
      return { double, single: width() };
    });
    expect(spaces.double).toBeGreaterThan(spaces.single);
  });
}

test("unambiguous freeform cards become flow content on mobile", async ({ page }) => {
  const root = frame({ name: "Page", box: box(800, 200), children: [
    frame({ name: "Card A", positioning: "absolute", box: box(360, 100, 16, 16) }),
    frame({ name: "Card B", positioning: "absolute", box: box(360, 100, 392, 16) }),
  ] });
  await render(page, [root], 375);
  await expectNoPageOverflow(page);
  await expect(page.locator(".card-a")).not.toHaveCSS("position", "absolute");
  const first = await page.locator(".card-a").boundingBox();
  const second = await page.locator(".card-b").boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
});

test("nested action-like layers remain inside their real button", async ({ page }) => {
  const root = frame({ name: "Buttons", box: box(600, 300), layout: layout("row"), children: [
    frame({ name: "Primary Button", children: [
      frame({ name: "Nested Button", children: [text([segment({ text: "Confirm" })])] }),
    ] }),
  ] });
  await render(page, [root], 600);
  await expect(page.locator("button")).toHaveCount(1);
  await expect(page.locator(".buttons > button .nested-button")).toHaveCount(1);
  await expect(page.locator("button button, button p, button div")).toHaveCount(0);
});

for (const selectedRoot of [false, true]) {
  test(`desktop navigation fits without reflowing controls (selected root: ${selectedRoot})`, async ({ page }) => {
    const navigation = frame({ name: "Navigation", box: box(1440, 60), layout: layout("row"), children: [
      frame({ name: "Logo", box: box(100, 40) }),
      frame({ name: "Links", box: box(1200, 40) }),
    ] });
    const root = selectedRoot ? navigation : frame({ name: "Page", box: box(1440, 900), layout: layout("column"), children: [navigation] });
    await render(page, [root], 375);
    await expectNoPageOverflow(page);
    await expect(page.locator("nav")).toHaveCSS("flex-wrap", "nowrap");
    const sizes = await page.locator("nav").evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }));
    expect(sizes.width).toBeLessThanOrEqual(375);
    expect(sizes.scroll).toBeGreaterThan(sizes.width);
    await expect(page.locator("nav .links")).toHaveCSS("width", "1200px");
  });
}

test("freeform text does not inherit a sibling background's opacity", async ({ page }) => {
  const root = frame({ name: "Page", box: box(400, 200), children: [
    shape({ name: "Background", positioning: "absolute", opacity: 0.5, box: box(400, 200) }),
    text([segment({ text: "Opaque label" })], { name: "Label", positioning: "absolute", box: box(100, 24, 16, 16) }),
  ] });
  await render(page, [root], 400);
  await expect(page.locator(".page > .background")).toHaveCount(1);
  await expect(page.locator(".page > .label")).toHaveCount(1);
  const effectiveOpacity = await page.locator(".label").evaluate((node) => {
    let opacity = 1;
    for (let current: Element | null = node; current; current = current.parentElement) opacity *= Number(getComputedStyle(current).opacity);
    return opacity;
  });
  expect(effectiveOpacity).toBe(1);
});

test("tables scroll locally instead of stretching the page", async ({ page }) => {
  const root = frame({ name: "Page", box: box(1440, 900), layout: layout("column"), children: [
    frame({ name: "Data Table", box: box(1200, 240), children: [
      frame({ name: "Table Row", box: box(1200, 48), layout: layout("row"), children: [
        shape({ name: "Cell A", box: box(600, 48) }), shape({ name: "Cell B", box: box(600, 48) }),
      ] }),
    ] }),
  ] });
  await render(page, [root], 375);
  await expectNoPageOverflow(page);
  const table = await page.locator(".data-table").evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }));
  expect(table.scroll).toBeGreaterThan(table.width);
});
