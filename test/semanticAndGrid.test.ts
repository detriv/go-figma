import { describe, expect, it } from "vitest";
import type { AutoLayout } from "../src/core/ir";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { nodeStyle, type StyleContext } from "../src/generators/css";
import { inferFrameTag, inferTextTag } from "../src/generators/semantic";
import { toTailwind } from "../src/generators/tailwind";
import { BLACK, WHITE, frame, segment, shape, text } from "./fixtures";

const ctx = (): StyleContext => ({ warnings: new Warnings(), imageUrl: (hash) => `img/${hash}` });

describe("Semantic HTML Inference", () => {
  it("infers buttons, nav, headers, footers, asides, sections, and main from frame names", () => {
    expect(inferFrameTag(frame({ name: "Primary Button" }), null)).toEqual({
      tag: "button",
      attrs: [["type", "button"]],
    });
    expect(inferFrameTag(frame({ name: "Submit Btn" }), null)).toEqual({
      tag: "button",
      attrs: [["type", "button"]],
    });
    expect(inferFrameTag(frame({ name: "Hero CTA" }), null)).toEqual({
      tag: "button",
      attrs: [["type", "button"]],
    });
    expect(inferFrameTag(frame({ name: "Top Navbar" }), null)).toEqual({ tag: "nav" });
    expect(inferFrameTag(frame({ name: "Header" }), null)).toEqual({ tag: "header" });
    expect(inferFrameTag(frame({ name: "Footer" }), null)).toEqual({ tag: "footer" });
    expect(inferFrameTag(frame({ name: "Sidebar" }), null)).toEqual({ tag: "aside" });
    expect(inferFrameTag(frame({ name: "Features Section" }), null)).toEqual({ tag: "section" });
    expect(inferFrameTag(frame({ name: "Main Content" }), null)).toEqual({ tag: "main" });
    expect(inferFrameTag(frame({ name: "Card" }), null)).toEqual({ tag: "div" });
  });

  it("infers headings (h1-h4) and paragraphs from text node names and font sizes", () => {
    const h1Explicit = text([segment({ text: "Hello", fontSize: 20 })], { name: "Hero Title" });
    expect(inferTextTag(h1Explicit)).toEqual({ tag: "h1" });

    const h1ByFont = text([segment({ text: "Big Headline", fontSize: 40 })], { name: "Headline" });
    expect(inferTextTag(h1ByFont)).toEqual({ tag: "h1" });

    const h2Explicit = text([segment({ text: "Subtitle", fontSize: 16 })], { name: "Section Title" });
    expect(inferTextTag(h2Explicit)).toEqual({ tag: "h2" });

    const h2ByFont = text([segment({ text: "Medium Headline", fontSize: 28 })], { name: "Text" });
    expect(inferTextTag(h2ByFont)).toEqual({ tag: "h2" });

    const h3ByFont = text([segment({ text: "Card Header", fontSize: 24 })], { name: "Card Title" });
    expect(inferTextTag(h3ByFont)).toEqual({ tag: "h3" });

    const h4ByFont = text([segment({ text: "Subheader", fontSize: 18, fontWeight: 700 })], { name: "Subheader" });
    expect(inferTextTag(h4ByFont)).toEqual({ tag: "h4" });

    const paragraph = text([segment({ text: "Body copy description text here", fontSize: 14 })], { name: "Paragraph" });
    expect(inferTextTag(paragraph)).toEqual({ tag: "p" });
  });

  it("generates semantic HTML elements and cursor pointer when semanticHtml: true", () => {
    const btnText = text([segment({ text: "Click Me", fontSize: 16 })], { name: "Button Text" });
    const buttonFrame = frame({
      name: "Primary Button",
      layout: {
        direction: "row",
        gap: 8,
        crossGap: 0,
        wrap: false,
        justify: "center",
        align: "center",
        padding: { top: 8, right: 16, bottom: 8, left: 16 },
      },
      children: [btnText],
    });

    const navFrame = frame({
      name: "Navbar",
      layout: {
        direction: "row",
        gap: 16,
        crossGap: 0,
        wrap: false,
        justify: "space-between",
        align: "center",
        padding: { top: 12, right: 24, bottom: 12, left: 24 },
      },
      children: [],
    });

    const pageTitle = text([segment({ text: "Welcome to Our Platform", fontSize: 36, fontWeight: 700 })], {
      name: "Page Title",
    });

    const root = frame({
      name: "Page",
      children: [navFrame, pageTitle, buttonFrame],
    });

    // With semanticHtml: true
    const { sections } = generate([root], [], { target: "react-tailwind", semanticHtml: true }, new Warnings());
    const code = sections[0].code;

    expect(code).toContain("<nav");
    expect(code).toContain("<h1");
    expect(code).toContain("<button");
    expect(code).toContain('type="button"');
    expect(code).toContain("cursor-pointer");

    // With semanticHtml: false (backward compatibility)
    const disabled = generate([root], [], { target: "react-tailwind", semanticHtml: false }, new Warnings());
    const disabledCode = disabled.sections[0].code;

    expect(disabledCode).not.toContain("<nav");
    expect(disabledCode).not.toContain("<h1");
    expect(disabledCode).not.toContain("<button");
  });
});

describe("CSS Grid Auto-Layout Support", () => {
  const gridLayout: AutoLayout = {
    direction: "grid",
    gap: 16,
    crossGap: 24,
    wrap: false,
    justify: "start",
    align: "start",
    padding: { top: 20, right: 20, bottom: 20, left: 20 },
    grid: {
      columns: 3,
      rows: 2,
      columnGap: 16,
      rowGap: 24,
    },
  };

  it("generates CSS grid styles for grid auto-layout containers", () => {
    const gridContainer = frame({ name: "Product Grid", layout: gridLayout });
    const styles = nodeStyle(gridContainer, null, ctx());

    expect(styles).toContainEqual(["display", "grid"]);
    expect(styles).toContainEqual(["grid-template-columns", "repeat(3, minmax(0, 1fr))"]);
    expect(styles).toContainEqual(["grid-template-rows", "repeat(2, minmax(0, 1fr))"]);
    expect(styles).toContainEqual(["row-gap", "24px"]);
    expect(styles).toContainEqual(["column-gap", "16px"]);
  });

  it("uses unified gap property when columnGap and rowGap are identical", () => {
    const uniformGrid: AutoLayout = {
      ...gridLayout,
      gap: 16,
      crossGap: 16,
      grid: { columns: 4, columnGap: 16, rowGap: 16 },
    };
    const styles = nodeStyle(frame({ layout: uniformGrid }), null, ctx());
    expect(styles).toContainEqual(["display", "grid"]);
    expect(styles).toContainEqual(["grid-template-columns", "repeat(4, minmax(0, 1fr))"]);
    expect(styles).toContainEqual(["gap", "16px"]);
    expect(styles).not.toContainEqual(["row-gap", "16px"]);
    expect(styles).not.toContainEqual(["column-gap", "16px"]);
  });

  it("maps child column and row spanning and positioning", () => {
    const gridParent = frame({ layout: gridLayout });
    const child = shape({
      name: "Featured Card",
      gridChild: { colSpan: 2, rowSpan: 2, colStart: 1, rowStart: 1 },
      sizing: { horizontal: "fill", vertical: "fill" },
    });

    const styles = nodeStyle(child, gridParent, ctx());
    expect(styles).toContainEqual(["grid-column", "span 2"]);
    expect(styles).toContainEqual(["grid-row", "span 2"]);
    expect(styles).toContainEqual(["grid-column-start", "1"]);
    expect(styles).toContainEqual(["grid-row-start", "1"]);
    expect(styles).toContainEqual(["width", "100%"]);
    expect(styles).toContainEqual(["height", "100%"]);
    expect(styles).toContainEqual(["min-width", "0"]);
  });

  it("converts grid decls to Tailwind utility classes", () => {
    const classes = toTailwind([
      ["display", "grid"],
      ["grid-template-columns", "repeat(3, minmax(0, 1fr))"],
      ["grid-template-rows", "repeat(2, minmax(0, 1fr))"],
      ["gap", "16px"],
    ]);
    expect(classes).toContain("grid");
    expect(classes).toContain("grid-cols-3");
    expect(classes).toContain("grid-rows-2");
    expect(classes).toContain("gap-4");

    const childClasses = toTailwind([
      ["grid-column", "span 2"],
      ["grid-row", "span 3"],
      ["grid-column-start", "2"],
      ["grid-row-start", "1"],
      ["width", "100%"],
    ]);
    expect(childClasses).toContain("col-span-2");
    expect(childClasses).toContain("row-span-3");
    expect(childClasses).toContain("col-start-2");
    expect(childClasses).toContain("row-start-1");
    expect(childClasses).toContain("w-full");
  });

  it("generates complete React + Tailwind component with Grid container and spanning children", () => {
    const item1 = shape({
      name: "Item 1",
      gridChild: { colSpan: 2 },
      sizing: { horizontal: "fill", vertical: "fixed" },
      box: { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
      fills: [{ type: "solid", color: WHITE }],
    });
    const item2 = shape({
      name: "Item 2",
      sizing: { horizontal: "fill", vertical: "fixed" },
      box: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      fills: [{ type: "solid", color: BLACK }],
    });

    const gridContainer = frame({
      name: "Grid Section",
      layout: {
        direction: "grid",
        gap: 16,
        crossGap: 16,
        wrap: false,
        justify: "start",
        align: "start",
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
        grid: { columns: 3, columnGap: 16, rowGap: 16 },
      },
      children: [item1, item2],
    });

    const { sections } = generate([gridContainer], [], { target: "react-tailwind" }, new Warnings());
    const code = sections[0].code;

    expect(code).toContain("grid");
    expect(code).toContain("grid-cols-3");
    expect(code).toContain("gap-4");
    expect(code).toContain("col-span-2");
  });
});
