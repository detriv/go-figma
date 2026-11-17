import { expect, test, type Page } from "@playwright/test";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import type { FrameNode } from "../src/core/ir";
import { buildProject } from "../src/generators/project";
import { cardColumns } from "../test/cardColumnsFixture";

const settings = { target: "html-css" as const, fluidSingleFrame: true, semanticHtml: true };
async function sizes(page: Page) {
  return page.locator('[class^="card-payment-method"]:visible').evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, x: box.x, y: box.y, bottom: box.bottom };
  }));
}

for (const columns of [2, 3]) {
  for (const width of [320, 375, 767, 768, 1000, 1280, 1440, 1920]) {
    test(`${columns}-column collection keeps equal last-row slots at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(generate([cardColumns(columns, 1)], [], settings, new Warnings()).previewHtml);
      const cards = await sizes(page);
      expect(cards).toHaveLength(columns + 1);
      for (const card of cards) expect(Math.abs(card.width - cards[0].width)).toBeLessThan(1);
      expect(cards[columns].x).toBeCloseTo(cards[0].x, 0);
      if (width < 768) {
        for (const card of cards) expect(card.width).toBeCloseTo(width, 0);
        for (let i = 1; i < cards.length; i++) expect(cards[i].y).toBeGreaterThanOrEqual(cards[i - 1].bottom);
      } else {
        for (let i = 1; i < columns; i++) expect(cards[i].y).toBeCloseTo(cards[0].y, 0);
        expect(cards[columns].y).toBeGreaterThanOrEqual(cards[0].bottom);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}

test("slot widths follow container resizing without regeneration", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const project = buildProject([cardColumns()], [], settings.target, new Warnings(), settings);
  const html = project.files.find((f) => f.path === "index.html")!.text!;
  const css = project.files.find((f) => f.path === "styles.css")!.text!;
  await page.setContent(html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`));
  const widths: number[] = [];
  for (const width of [1000, 800, 1200]) {
    await page.locator(".payment-page").evaluate((node, value) => { (node as HTMLElement).style.width = `${value}px`; }, width);
    const cards = await sizes(page);
    expect(cards[0].width).toBeCloseTo((width - 16) / 2, 0);
    expect(cards[2].width).toBeCloseTo(cards[0].width, 0);
    widths.push(cards[2].width);
  }
  expect(new Set(widths).size).toBe(3);
});

test("authored mobile frames keep full-width cards after desktop column inference", async ({ page }) => {
  const mobile = { ...cardColumns(2, 1, true), breakpoint: "mobile" as const };
  const desktop = { ...cardColumns(), breakpoint: "desktop" as const };
  const result = generate([mobile, desktop], [], settings, new Warnings());
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.setContent(result.previewHtml);
  const narrow = await sizes(page);
  expect(narrow).toHaveLength(3);
  for (const card of narrow) expect(card.width).toBeCloseTo(375, 0);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const wide = await sizes(page);
  expect(wide).toHaveLength(3);
  for (const card of wide) expect(card.width).toBeCloseTo(wide[0].width, 0);
});

test("single tagged desktop frame still stacks all cards on mobile", async ({ page }) => {
  const root = { ...cardColumns(), breakpoint: "desktop" as const };
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.setContent(generate([root], [], settings, new Warnings()).previewHtml);
  const cards = await sizes(page);
  for (const card of cards) expect(card.width).toBeCloseTo(375, 0);
  for (let i = 1; i < cards.length; i++) expect(cards[i].y).toBeGreaterThanOrEqual(cards[i - 1].bottom);
});

test("button collections are not forced into nowrap full-width slots", async ({ page }) => {
  const root = cardColumns();
  for (const row of root.children as FrameNode[]) for (const card of row.children) card.name = "Payment Button";
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.setContent(generate([root], [], settings, new Warnings()).previewHtml);
  await expect(page.locator("button")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("hugging rows preserve intrinsic card width instead of collapsing to zero", async ({ page }) => {
  const root = cardColumns();
  root.children[1].sizing.horizontal = "hug";
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.setContent(generate([root], [], settings, new Warnings()).previewHtml);
  const cards = await sizes(page);
  expect(cards[2].width).toBeCloseTo(565, 0);
});

for (const width of [375, 1200]) {
  test(`mixed Fill/Fixed full rows share all five card slots at ${width}px`, async ({ page }) => {
    const root = cardColumns();
    const first = root.children[0] as FrameNode;
    const second = { ...first, id: "extra-row", children: first.children.map((card) => ({ ...card, id: `${card.id}-extra`, sizing: { ...card.sizing, horizontal: "fixed" as const } })) };
    root.children.splice(1, 0, second);
    await page.setViewportSize({ width, height: 1400 });
    await page.setContent(generate([root], [], settings, new Warnings()).previewHtml);
    const cards = await sizes(page);
    expect(cards).toHaveLength(5);
    for (const card of cards) expect(card.width).toBeCloseTo(width < 768 ? width : (width - 16) / 2, 0);
  });
}
