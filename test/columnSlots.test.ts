import { describe, expect, it } from "vitest";
import type { FrameNode } from "../src/core/ir";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { designContext } from "../src/generators/designContext";
import { buildProject } from "../src/generators/project";
import { cardColumns } from "./cardColumnsFixture";

const settings = { target: "html-css" as const, fluidSingleFrame: true, semanticHtml: true };
const lastCard = (root: FrameNode) => (root.children[1] as FrameNode).children[0] as FrameNode;
const css = (root: FrameNode) => generate([root], [], settings, new Warnings()).sections[1].code;

describe("repeated column slots across row wrappers", () => {
  it("uses dynamic column width for an incomplete row without a fixed card width", () => {
    const root = cardColumns();
    const before = JSON.stringify(root);
    const output = css(root);
    expect(output).toContain("width: calc((100% - 16px) / 2)");
    expect(output).not.toContain("width: 565px");
    expect(JSON.stringify(root)).toBe(before);
  });

  it("derives three columns from evidence instead of hardcoding half width", () => {
    expect(css(cardColumns(3, 2))).toContain("width: calc((100% - 32px) / 3)");
  });

  it("shares the rule with design context and project export", () => {
    const root = cardColumns();
    const context = designContext([root], [], settings.target, new Warnings(), settings);
    const project = buildProject([root], [], settings.target, new Warnings(), settings);
    for (const output of [context.sections[1].code, project.files.find((f) => f.path === "styles.css")!.text!]) {
      expect(output).toContain("width: calc((100% - 16px) / 2)");
    }
  });

  it.each(["html-tailwind", "react-tailwind"] as const)("emits the same dynamic slot in %s", (target) => {
    const result = generate([cardColumns()], [], { ...settings, target }, new Warnings());
    expect(result.sections[0].code).toContain("md:w-[calc((100%_-_16px)_/_2)]");
  });

  it("does not invent columns for mobile-only rows", () => {
    expect(css(cardColumns(2, 1, true))).not.toContain("width: calc(");
  });

  it.each(["bound", "full-span", "different-card", "different-padding"])("preserves intentional sizing: %s", (reason) => {
    const root = cardColumns();
    const last = lastCard(root);
    if (reason === "bound") last.minWidth = 400;
    if (reason === "full-span") last.box.width = root.box.width;
    if (reason === "different-card") last.name = "Summary Panel";
    if (reason === "different-padding") (root.children[1] as FrameNode).layout!.padding.left = 24;
    expect(css(root)).not.toContain("width: calc(");
  });

  it("keeps every full row in a repeated run on the same mobile/desktop tracks", () => {
    const root = cardColumns();
    const firstRow = root.children[0] as FrameNode;
    const secondRow = { ...firstRow, id: "extra-row", children: firstRow.children.map((card) => ({ ...card, id: `${card.id}-extra` })) };
    root.children.splice(1, 0, secondRow);
    expect(css(root).match(/width: calc\(\(100% - 16px\) \/ 2\)/g)).toHaveLength(5);
  });

  it.each(["state", "height-cap", "authored-wrap"])("does not reinterpret an explicitly constrained row: %s", (reason) => {
    const root = cardColumns();
    const row = root.children[0] as FrameNode;
    if (reason === "state") root.state = "loading";
    if (reason === "height-cap") row.maxHeight = 182;
    if (reason === "authored-wrap") row.layout!.wrap = true;
    expect(css(root)).not.toContain("width: calc(");
  });

  it.each(["cards", "root", "rows"])("does not cross a control boundary: %s", (where) => {
    const root = cardColumns();
    if (where === "root") root.name = "Payment Controls";
    for (const row of root.children as FrameNode[]) {
      if (where === "rows") row.name = "Payment Controls";
      if (where === "cards") for (const card of row.children) card.name = "Payment Button";
    }
    expect(css(root)).not.toContain("width: calc(");
  });

  it("does not replace intrinsic width inside a hugging row", () => {
    const root = cardColumns();
    root.children[1].sizing.horizontal = "hug";
    expect(css(root)).not.toContain("width: calc(");
  });

  it("retains mobile fallback for a single tagged desktop frame", () => {
    const root = { ...cardColumns(), breakpoint: "desktop" as const };
    expect(css(root)).toContain("@media (min-width: 768px)");
    expect(css(root)).toMatch(/\.card-payment-method-3 \{[^}]*width: 100%/);
  });

  it("recognizes a matching fixed full row between a Fill row and the final card", () => {
    const root = cardColumns();
    const firstRow = root.children[0] as FrameNode;
    const secondRow = { ...firstRow, id: "extra-row", children: firstRow.children.map((card) => ({ ...card, id: `${card.id}-extra`, sizing: { ...card.sizing, horizontal: "fixed" as const } })) };
    root.children.splice(1, 0, secondRow);
    expect(css(root).match(/width: calc\(\(100% - 16px\) \/ 2\)/g)).toHaveLength(5);
  });

  it("leaves exact export opt-out unchanged", () => {
    const result = generate([cardColumns()], [], { ...settings, fluidSingleFrame: false }, new Warnings());
    expect(result.sections[1].code).toContain("width: 565px");
    expect(result.sections[1].code).not.toContain("width: calc(");
  });
});
