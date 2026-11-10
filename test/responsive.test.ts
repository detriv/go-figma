import { describe, expect, it } from "vitest";
import type { AutoLayout, Breakpoint, FrameNode, IRNode } from "../src/core/ir";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { buildProject } from "../src/generators/project";
import { pageGroups, pageName } from "../src/generators/responsive";
import { frame, segment, shape, text } from "./fixtures";

const layout = (direction: "row" | "column", padding = 0): AutoLayout => ({
  direction,
  gap: 0,
  crossGap: 0,
  wrap: false,
  justify: "start",
  align: "start",
  padding: { top: padding, right: padding, bottom: padding, left: padding },
});

const screen = (breakpoint: Breakpoint, width: number, overrides: Partial<FrameNode>): FrameNode =>
  frame({ name: `${breakpoint[0].toUpperCase()}${breakpoint.slice(1)} Product`, breakpoint, box: { x: 0, y: 0, width, height: 900, rotation: 0 }, ...overrides });

const gallery = (direction: "row" | "column") => frame({ name: "Gallery", layout: layout(direction) });
const title = (fontSize: number) => text([segment({ text: "Short printed dress", fontSize })], { name: "Title" });
const nav = shape({ name: "Nav" });

const css = (roots: IRNode[]) => generate(roots, [], { target: "html-css" }, new Warnings()).sections[1].code;
const tailwind = (roots: IRNode[]) => generate(roots, [], { target: "react-tailwind" }, new Warnings()).sections[0].code;

describe("responsive pages", () => {
  const mobile = screen("mobile", 375, { layout: layout("column", 16), children: [gallery("column"), title(24)] });
  const desktop = screen("desktop", 1440, { layout: layout("row", 32), children: [nav, gallery("row"), title(48)] });

  it("writes the markup once, with the smallest frame as the base and media queries above it", () => {
    const out = css([desktop, mobile]);
    expect(out).toContain(".product {\n  display: flex;\n  flex-direction: column;");
    expect(out).toContain("width: 100%;");
    expect(out).toContain("min-height: 900px;");
    expect(out).toContain("@media (min-width: 1024px) {\n  .product {\n    padding: 32px;\n    flex-direction: row;\n  }");
    expect(out).toContain("  .title {\n    font-size: 48px;");

    const html = generate([desktop, mobile], [], { target: "html-css" }, new Warnings()).sections[0].code;
    expect(html.match(/Short printed dress/g)).toHaveLength(1);
  });

  it("hides layers missing from a frame and shows them where they exist", () => {
    const out = css([mobile, desktop]);
    expect(out).toMatch(/\.nav \{\n {2}display: none;/);
    expect(out).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*\.nav \{[^}]*width: 40px;[^}]*display: block;/);
  });

  it("prefixes Tailwind classes with the breakpoint", () => {
    const out = tailwind([mobile, desktop]);
    expect(out).toContain("export default function Product()");
    expect(out).toContain('className="flex flex-col items-start p-4 min-h-225 w-full lg:p-8 lg:flex-row"');
    expect(out).toContain('className="hidden lg:w-10 lg:h-10 lg:shrink-0 lg:block"');
    expect(out).toMatch(/className="[^"]*text-2xl[^"]*lg:text-5xl"/);
  });

  it("reorders children whose order differs with `order`", () => {
    const a = shape({ name: "A" });
    const b = shape({ name: "B" });
    const out = css([
      screen("mobile", 375, { layout: layout("column"), children: [a, b] }),
      screen("tablet", 768, { layout: layout("column"), children: [b, a] }),
    ]);
    expect(out).toContain("@media (min-width: 768px) {\n  .a {\n    order: 1;\n  }\n\n  .b {\n    order: 0;\n  }\n}");
  });

  it("restates every padding side when one changes", () => {
    const out = css([
      screen("mobile", 375, { layout: { ...layout("column", 16), padding: { top: 16, right: 16, bottom: 16, left: 16 } } }),
      screen("desktop", 1440, { layout: { ...layout("column", 16), padding: { top: 40, right: 16, bottom: 16, left: 16 } } }),
    ]);
    expect(out).toContain("@media (min-width: 1024px) {\n  .product {\n    padding: 40px 16px 16px;");
  });

  it("previews each tagged frame at a width inside its breakpoint", () => {
    const tablet = screen("tablet", 1024, {});
    const result = generate([mobile, tablet, desktop], [], { target: "html-css" }, new Warnings());
    expect(result.previewSizes?.map((s) => [s.label, s.width])).toEqual([
      ["Mobile", 375],
      ["Tablet", 1023],
      ["Desktop", 1440],
    ]);
    expect(result.previewSize.width).toBe(1440);
  });

  it("groups tagged frames into one page and keeps the rest separate", () => {
    const warnings = new Warnings();
    const other = frame({ name: "Checkout" });
    const extraMobile = screen("mobile", 375, { name: "Mobile Copy" });
    const groups = pageGroups([other, desktop, mobile, extraMobile], warnings);
    expect(groups.map((g) => g.map((r) => r.name))).toEqual([["Checkout"], ["Mobile Product", "Desktop Product"], ["Mobile Copy"]]);
    expect(pageName(groups[1])).toBe("Product");
    expect(warnings.list()[0]).toContain('"Mobile Copy" is exported as a separate page');
  });

  it("exports a responsive page as one route", () => {
    const project = buildProject([desktop, mobile, frame({ name: "Checkout" })], [], "react-tailwind", new Warnings());
    const pages = project.files.filter((f) => f.path.endsWith("page.jsx")).map((f) => f.path);
    expect(project.name).toBe("product");
    expect(pages).toEqual(["app/page.jsx", "app/checkout/page.jsx"]);
    expect(project.files.find((f) => f.path === "app/page.jsx")?.text).toContain("lg:flex-row");
  });

  it("leaves untagged selections unchanged", () => {
    const plain = frame({ name: "Card", layout: layout("row") });
    expect(css([plain])).not.toContain("@media");
    expect(generate([plain], [], { target: "html-css" }, new Warnings()).previewSizes).toBeUndefined();
  });

  it("makes a single frame full-bleed fluid and responsive when fluidSingleFrame is enabled", () => {
    const card = frame({
      name: "Card",
      box: { x: 0, y: 0, width: 360, height: 200, rotation: 0 },
      sizing: { horizontal: "fixed", vertical: "fixed" },
    });
    const cardsRow = frame({
      name: "CardsRow",
      layout: layout("row", 16),
      box: { x: 0, y: 0, width: 1440, height: 300, rotation: 0 },
      sizing: { horizontal: "fixed", vertical: "fixed" },
      children: [card, frame({ name: "Card2", box: { x: 0, y: 0, width: 360, height: 200, rotation: 0 } })],
    });
    const singleScreen = frame({
      name: "LandingPage",
      box: { x: 0, y: 0, width: 1440, height: 900, rotation: 0 },
      layout: layout("column", 32),
      children: [cardsRow],
    });

    const cssResult = generate([singleScreen], [], { target: "html-css", fluidSingleFrame: true }, new Warnings());
    const cssCode = cssResult.sections[1].code;
    expect(cssCode).toContain("width: 100%;");
    expect(cssCode).toContain("min-height: 900px;");
    expect(cssCode).toContain("flex-wrap: wrap;");
    expect(cssCode).toContain("max-width: 100%;");
    expect(cssResult.previewSizes?.map((s) => [s.label, s.width])).toEqual([
      ["Mobile", 375],
      ["Tablet", 768],
      ["Desktop", 1440],
    ]);

    const twResult = generate([singleScreen], [], { target: "react-tailwind", fluidSingleFrame: true }, new Warnings());
    const twCode = twResult.sections[0].code;
    expect(twCode).toContain("w-full");
    expect(twCode).toContain("min-h-225");
    expect(twCode).toContain("flex-wrap");
    expect(twCode).toContain("max-w-full");

    const project = buildProject([singleScreen], [], "react-tailwind", new Warnings(), { fluidSingleFrame: true });
    const pageJsx = project.files.find((f) => f.path === "app/page.jsx")?.text;
    expect(pageJsx).toContain("w-full");
  });

  it("enables horizontal scrolling for tables when columns exceed container width without wrapping rows", () => {
    const col1 = frame({ name: "Col1", box: { x: 0, y: 0, width: 200, height: 40, rotation: 0 } });
    const col2 = frame({ name: "Col2", box: { x: 200, y: 0, width: 300, height: 40, rotation: 0 } });
    const col3 = frame({ name: "Col3", box: { x: 500, y: 0, width: 300, height: 40, rotation: 0 } });
    const tableRow = frame({
      name: "TableRow",
      layout: layout("row", 8),
      box: { x: 0, y: 0, width: 800, height: 40, rotation: 0 },
      sizing: { horizontal: "fixed", vertical: "fixed" },
      children: [col1, col2, col3],
    });
    const tableContainer = frame({
      name: "DataTable",
      layout: layout("column", 8),
      box: { x: 0, y: 0, width: 800, height: 400, rotation: 0 },
      sizing: { horizontal: "fixed", vertical: "fixed" },
      children: [tableRow],
    });
    const screen = frame({
      name: "Dashboard",
      box: { x: 0, y: 0, width: 1440, height: 900, rotation: 0 },
      layout: layout("column", 24),
      children: [tableContainer],
    });

    const cssResult = generate([screen], [], { target: "html-css", fluidSingleFrame: true }, new Warnings());
    const cssCode = cssResult.sections[1].code;
    expect(cssCode).toContain("overflow-x: auto;");
    expect(cssCode).toContain("max-width: 100%;");
    expect(cssCode).toContain("min-width: 800px;");
    // Table rows must NOT have flex-wrap: wrap
    expect(cssCode).not.toMatch(/\.table-row\s*\{[^}]*flex-wrap:\s*wrap;/);

    const twResult = generate([screen], [], { target: "react-tailwind", fluidSingleFrame: true }, new Warnings());
    const twCode = twResult.sections[0].code;
    expect(twCode).toContain("overflow-x-auto");
    expect(twCode).toContain("max-w-full");
    expect(twCode).toContain("min-w-200");
    // Table rows must NOT have flex-wrap or overflow-x-auto (overflow-x-auto belongs only on the table container)
    expect(twCode).not.toContain("flex-wrap min-w-200");
    expect(twCode).not.toMatch(/min-w-200[^"]*overflow-x-auto/);
    expect(cssCode).not.toMatch(/\.table-row\s*\{[^}]*overflow-x:\s*auto;/);
  });

  it("treats elements spanning content width (rootWidth minus padding) as full-width (100%)", () => {
    // Mobile frame: 390px wide with 16px padding on each side → content width = 358px.
    // A child drawn at 358px should become width: 100% because 358 >= 390 * 0.88 = 343.2.
    const card = frame({
      name: "ProdukBiasaOrganism",
      layout: layout("column", 0),
      box: { x: 0, y: 0, width: 358, height: 200, rotation: 0 },
      sizing: { horizontal: "fixed", vertical: "fixed" },
      children: [],
    });
    const mobileScreen = frame({
      name: "MobileDetailPesanan",
      box: { x: 0, y: 0, width: 390, height: 844, rotation: 0 },
      layout: layout("column", 16), // 16px padding all sides
      children: [card],
    });

    const cssResult = generate(
      [mobileScreen],
      [],
      { target: "html-css", fluidSingleFrame: true },
      new Warnings()
    );
    const cssCode = cssResult.sections[1].code;
    // The card at 358px should become width: 100% (not a fixed 358px)
    expect(cssCode).toMatch(/\.produk-biasa-organism\s*\{[^}]*width:\s*100%;/);
    expect(cssCode).not.toMatch(/\.produk-biasa-organism\s*\{[^}]*width:\s*358px;/);

    const twResult = generate(
      [mobileScreen],
      [],
      { target: "react-tailwind", fluidSingleFrame: true },
      new Warnings()
    );
    const twCode = twResult.sections[0].code;
    // Should contain w-full in Tailwind output, not a fixed width like w-[358px]
    expect(twCode).toContain("w-full");
    expect(twCode).not.toContain("w-[358px]");
  });
});
