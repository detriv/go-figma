import { expect, test, type Locator } from "@playwright/test";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { designContext } from "../src/generators/designContext";
import { buildProject } from "../src/generators/project";
import {
  ACTIVE_TAB_BASE as BASE, ACTIVE_TAB_MODIFIER as ACTIVE, ACTIVE_TAB_SETTINGS as settings,
  activeFallbackFixture, activeVariantFixture, activeVariantMultiLabelFixture, FALLBACK_CASES,
} from "../test/activeVariantFixture";

const SEAMS = ["preview", "generate", "design-context", "build-project"] as const;
type Seam = typeof SEAMS[number];
function documentFor(seam: Seam, activeFirst: boolean, shadow: boolean): string {
  const root = activeVariantFixture({ activeFirst, shadow });
  if (seam === "build-project") {
    const project = buildProject([root], [], settings.target, new Warnings(), settings);
    const html = project.files.find((file) => file.path === "index.html")!.text!;
    const css = project.files.find((file) => file.path === "styles.css")!.text!;
    return html.replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`);
  }
  if (seam === "design-context") {
    const context = designContext([root], [], settings.target, new Warnings(), settings);
    return `<style>${context.sections[1].code}</style>${context.sections[0].code}`;
  }
  const result = generate([root], [], settings, new Warnings());
  return seam === "preview" ? result.previewHtml : `<style>${result.sections[1].code}</style>${result.sections[0].code}`;
}

async function computed(tab: Locator) {
  return tab.evaluate((node) => {
    const root = getComputedStyle(node);
    const label = getComputedStyle(node.querySelector("p")!);
    return {
      width: root.width, height: root.height, alignSelf: root.alignSelf,
      paddingTop: root.paddingTop, paddingRight: root.paddingRight,
      paddingBottom: root.paddingBottom, paddingLeft: root.paddingLeft,
      background: root.backgroundColor, shadow: root.boxShadow,
      fontSize: label.fontSize, fontWeight: label.fontWeight, color: label.color, lineHeight: label.lineHeight,
    };
  });
}

async function expectAppearance(tab: Locator, active: boolean, shadow = false) {
  const actual = await computed(tab);
  expect(actual).toMatchObject({
    width: active ? "143px" : "173px", alignSelf: active ? "auto" : "stretch",
    paddingTop: "10px", paddingBottom: "10px", paddingLeft: active ? "10px" : "16px", paddingRight: active ? "10px" : "16px",
    background: active ? "rgb(255, 255, 255)" : "rgba(0, 0, 0, 0)",
    fontSize: "14px", fontWeight: active ? "500" : "400", color: active ? "rgb(96, 152, 255)" : "rgb(64, 64, 64)", lineHeight: "20px",
  });
  if (active) expect(actual.height).toBe("40px");
  if (active && shadow) expect(actual.shadow).not.toBe("none");
  else expect(actual.shadow).toBe("none");
  return actual;
}

// Prevent font/CDN availability from affecting a CSS-only geometry/typography test.
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.setViewportSize({ width: 1000, height: 500 });
});

for (const seam of SEAMS) {
  for (const activeFirst of [false, true]) {
    test(`${seam}: ${activeFirst ? "active-first" : "off-first"} modifier can be removed, moved and restored without erasing design differences`, async ({ page }) => {
      const shadow = activeFirst;
      await page.setContent(documentFor(seam, activeFirst, shadow), { waitUntil: "domcontentloaded" });
      const allLabels = page.locator("p");
      const lite = allLabels.filter({ hasText: /^Lite$/ }).locator("..");
      const basic = allLabels.filter({ hasText: /^Basic$/ }).locator("..");
      const pro = allLabels.filter({ hasText: /^Pro$/ }).locator("..");
      await expect(page.locator(`.${BASE}`)).toHaveCount(3);
      await expect(page.locator(`.${ACTIVE}`)).toHaveCount(1);
      await expect(pro).toHaveClass(`${BASE} ${ACTIVE}`);
      await expect(lite).toHaveClass(BASE);
      await expect(basic).toHaveClass(BASE);
      expect(await allLabels.evaluateAll((nodes) => new Set(nodes.map((node) => node.className)).size)).toBe(1);
      const originalContent = await allLabels.allTextContents();
      const originalAttrs = await page.locator(`.${BASE}`).evaluateAll((nodes) => nodes.map((node) => ({
        attrs: [...node.attributes].filter((attr) => attr.name !== "class").map((attr) => [attr.name, attr.value]),
        content: node.innerHTML,
      })));
      if (seam === "design-context") {
        await expect(pro).toHaveAttribute("data-node-id", "3250:81570");
        await expect(pro).toHaveAttribute("data-component", "tab");
        await expect(pro).toHaveAttribute("data-props", "type=capsule, active=on");
        await expect(pro.locator("p")).toHaveAttribute("data-name", "Pro");
      }
      const off = await expectAppearance(lite, false);
      expect(await expectAppearance(basic, false)).toEqual(off);
      const on = await expectAppearance(pro, true, shadow);

      // Removing a class must also restore properties that the active variant removed.
      await pro.evaluate((node, modifier) => node.classList.remove(modifier), ACTIVE);
      expect(await expectAppearance(pro, false)).toEqual(off);
      expect(await computed(lite)).toEqual(off);
      expect(await computed(basic)).toEqual(off);

      // A different peer becomes active by changing ONLY its root class.
      await lite.evaluate((node, modifier) => node.classList.add(modifier), ACTIVE);
      expect(await expectAppearance(lite, true, shadow)).toEqual(on);
      expect(await computed(pro)).toEqual(off);
      expect(await computed(basic)).toEqual(off);
      await lite.evaluate((node, modifier) => node.classList.remove(modifier), ACTIVE);
      expect(await computed(lite)).toEqual(off);
      await pro.evaluate((node, modifier) => node.classList.add(modifier), ACTIVE);
      expect(await computed(pro)).toEqual(on);

      expect(await allLabels.allTextContents()).toEqual(originalContent);
      expect(await page.locator(`.${BASE}`).evaluateAll((nodes) => nodes.map((node) => ({
        attrs: [...node.attributes].filter((attr) => attr.name !== "class").map((attr) => [attr.name, attr.value]),
        content: node.innerHTML,
      })))).toEqual(originalAttrs);
    });
  }
}

for (const kind of FALLBACK_CASES) {
  test(`unsafe ${kind} family retains original actual computed styles`, async ({ page }) => {
    const result = generate(activeFallbackFixture(kind), [], settings, new Warnings());
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.setContent(result.previewHtml, { waitUntil: "domcontentloaded" });
    const label = (name: string) => page.locator("p").filter({ hasText: new RegExp(`^${name}$`) });
    const lite = label("Lite").locator("..");
    const pro = label("Pro").locator("..");
    expect(result.sections[0].code).not.toContain("--active");
    expect(await lite.getAttribute("class")).not.toBe(await pro.getAttribute("class"));
    // The old renderer does not need a reset: no inactive align-self is inherited.
    const active = await computed(pro);
    expect(active).toMatchObject({ width: "143px", height: "40px", paddingLeft: "10px", paddingRight: "10px", alignSelf: "auto", background: "rgb(255, 255, 255)", fontWeight: "500", color: "rgb(96, 152, 255)" });
    expect(await computed(lite)).toMatchObject({ width: "173px", paddingLeft: "16px", paddingRight: "16px", alignSelf: "stretch", fontWeight: "400", color: "rgb(64, 64, 64)" });
    if (kind === "responsive-descendant") {
      await expect(label("Lite")).toHaveCSS("font-size", "18px");
      await page.setViewportSize({ width: 640, height: 500 });
      await expect(label("Lite")).toHaveCSS("font-size", "14px");
    } else if (kind === "state-descendant") {
      await expect(label("Lite")).toHaveCSS("font-size", "14px");
      await page.locator("[data-state]").evaluate((node) => node.setAttribute("data-state", "error"));
      await expect(label("Lite")).toHaveCSS("font-size", "18px");
      await expect(label("Pro")).toHaveCSS("font-size", "14px");
      await page.locator("[data-state]").evaluate((node) => node.setAttribute("data-state", "default"));
      await expect(label("Lite")).toHaveCSS("font-size", "14px");
    } else {
      await expect(label("Lite")).toHaveCSS("font-size", "14px");
    }
    await expect(label("Pro")).toHaveCSS("font-weight", "500");
    await expect(page.locator("p")).toHaveCount(3);
  });
}

test("equal inactive label slots retain their own active colors when the root modifier moves", async ({ page }) => {
  const result = generate([activeVariantMultiLabelFixture()], [], settings, new Warnings());
  await page.setContent(result.previewHtml, { waitUntil: "domcontentloaded" });
  const lite = page.locator("p").filter({ hasText: /^Lite$/ }).locator("..");
  const pro = page.locator("p").filter({ hasText: /^Pro$/ }).locator("..");
  const colors = (tab: Locator) => tab.locator(":scope > p").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));
  const inactive = ["rgb(64, 64, 64)", "rgb(64, 64, 64)"];
  const selected = ["rgb(96, 152, 255)", "rgb(255, 0, 0)"];
  expect(await colors(lite)).toEqual(inactive);
  expect(await colors(pro)).toEqual(selected);
  await pro.evaluate((node, modifier) => node.classList.remove(modifier), ACTIVE);
  await lite.evaluate((node, modifier) => node.classList.add(modifier), ACTIVE);
  expect(await colors(pro)).toEqual(inactive);
  expect(await colors(lite)).toEqual(selected);
});

test("legacy scopedClassNames=false keeps distinct styled peers and no generated modifier", async ({ page }) => {
  const result = generate([activeVariantFixture()], [], { ...settings, scopedClassNames: false }, new Warnings());
  expect(result.sections[0].code).not.toContain("--active");
  await page.setContent(result.previewHtml, { waitUntil: "domcontentloaded" });
  const lite = page.locator("p").filter({ hasText: /^Lite$/ }).locator("..");
  const pro = page.locator("p").filter({ hasText: /^Pro$/ }).locator("..");
  expect(await lite.getAttribute("class")).not.toBe(await pro.getAttribute("class"));
  await expectAppearance(lite, false);
  await expectAppearance(pro, true);
});
