import { expect, test } from "@playwright/test";
import type { FrameNode } from "../src/core/ir";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { designContext } from "../src/generators/designContext";
import { buildProject } from "../src/generators/project";
import { landmarkSettings, nestedLandmarkFixture, tableHeaderFixture } from "../test/landmarkFixture";

const seams = ["generate", "preview", "context", "project"] as const;
type Seam = typeof seams[number];
function documentFor(seam: Seam, root: FrameNode, semanticHtml = true): string {
  const settings = { ...landmarkSettings, semanticHtml };
  if (seam === "project") {
    const project = buildProject([root], [], settings.target, new Warnings(), settings);
    const html = project.files.find((file) => file.path === "index.html")!.text!;
    const css = project.files.find((file) => file.path === "styles.css")!.text!;
    return html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);
  }
  const result = seam === "context"
    ? designContext([root], [], settings.target, new Warnings(), settings)
    : generate([root], [], settings, new Warnings());
  if (seam === "preview" && "previewHtml" in result) return result.previewHtml;
  return `<!doctype html><html><head><style>body{margin:0}${result.sections[1].code}</style></head><body>${result.sections[0].code}</body></html>`;
}

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setViewportSize({ width: 1000, height: 500 });
});

for (const seam of seams) {
  test(`${seam}: table headers remain divs without changing the authored geometry or icons`, async ({ page }) => {
    const root = tableHeaderFixture();
    const geometry = async () => Promise.all(["Nama Toko", "Lokasi"].map(async (name) => {
      const label = page.getByText(name, { exact: true });
      const cell = label.locator("..");
      return cell.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const label = node.firstElementChild!;
        const labelRect = label.getBoundingClientRect();
        const typography = getComputedStyle(label);
        return {
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          display: style.display, gap: style.gap, padding: style.padding,
          label: { x: labelRect.x, y: labelRect.y, width: labelRect.width, height: labelRect.height,
            fontSize: typography.fontSize, fontWeight: typography.fontWeight, color: typography.color },
        };
      });
    }));
    await page.setContent(documentFor(seam, root, false), { waitUntil: "domcontentloaded" });
    const authored = await geometry();
    await page.setContent(documentFor(seam, root), { waitUntil: "domcontentloaded" });
    await expect(page.locator("header, footer, table, thead, tr, th")).toHaveCount(0);
    for (const name of ["Nama Toko", "Lokasi"]) {
      const cell = page.getByText(name, { exact: true }).locator("..");
      expect(await cell.evaluate((node) => node.tagName)).toBe("DIV");
      expect(await cell.locator("..").evaluate((node) => node.tagName)).toBe("DIV");
    }
    expect(await geometry()).toEqual(authored);
    expect(authored.map((cell) => cell.width)).toEqual([180, 180]);
    await expect(page.locator("svg, img")).toHaveCount(2);
    if (seam === "generate" || seam === "preview") {
      expect(await page.locator("svg").evaluateAll((nodes) => nodes.map((node) => node.namespaceURI)))
        .toEqual(["http://www.w3.org/2000/svg", "http://www.w3.org/2000/svg"]);
    }
  });
}

for (const outer of ["Header", "Footer"]) {
  for (const inner of ["Header", "Footer"]) {
    test(`${outer} → wrappers/section → ${inner} retains only the valid outer landmark`, async ({ page }) => {
      await page.setContent(documentFor("preview", nestedLandmarkFixture(outer, inner, 3)), { waitUntil: "domcontentloaded" });
      await expect(page.locator("header, footer")).toHaveCount(1);
      await expect(page.locator(outer.toLowerCase())).toHaveCount(1);
      await expect(page.locator("header header, header footer, footer header, footer footer")).toHaveCount(0);
      await expect(page.getByText("Nested content", { exact: true })).toBeVisible();
    });
  }
}
