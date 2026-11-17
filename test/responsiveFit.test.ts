import { describe, expect, it } from "vitest";
import type { AutoLayout, FrameNode, IRNode } from "../src/core/ir";
import { Warnings } from "../src/core/warnings";
import { buildTree, type StyledElement } from "../src/generators/tree";
import { generate } from "../src/generators";
import { frame, segment, shape, text } from "./fixtures";

const layout = (direction: "row" | "column", padding = 0): AutoLayout => ({
  direction, gap: 0, crossGap: 0, wrap: false, justify: "start", align: "start",
  padding: { top: padding, right: padding, bottom: padding, left: padding },
});
const box = (width: number, height = 100) => ({ x: 0, y: 0, width, height, rotation: 0 });
const tree = (roots: IRNode[], fluidSingleFrame = true) => buildTree(roots, {
  warnings: new Warnings(), imageUrl: (hash) => hash, fluidSingleFrame, semanticHtml: true,
})[0];
const element = (parent: StyledElement, name: string): StyledElement => {
  const found = parent.children.find((child) => child.kind === "element" && child.name === name);
  if (!found || found.kind !== "element") throw new Error(`Missing ${name}`);
  return found;
};
const at = (node: StyledElement, viewport = 0) => new Map([
  ...node.style, ...(node.responsive ?? []).filter((tier) => tier.minWidth <= viewport).flatMap((tier) => tier.style),
]);

describe("responsive layout fit", () => {
  it("keeps navigation/control subtrees and absolute overlays at their explicit sizes", () => {
    const pair = frame({ name: "Pair", box: box(320), layout: layout("row"), children: [
      frame({ name: "Part one", box: box(120) }), frame({ name: "Part two", box: box(120) }),
    ] });
    const nav = frame({ name: "Navigation", box: box(320, 40), layout: layout("row"), children: [pair] });
    const overlay = frame({ ...pair, name: "Overlay", positioning: "absolute", box: box(900) });
    const root = frame({ name: "Page", box: box(1440), layout: layout("column"), children: [nav, overlay] });
    const result = tree([root]);
    const navigation = element(result, "Navigation");
    expect(at(navigation).get("width")).toBe("320px");
    expect(at(element(navigation, "Pair")).has("flex-wrap")).toBe(false);
    expect(at(element(navigation, "Pair")).get("width")).toBe("320px");
    expect(at(element(result, "Overlay")).get("width")).toBe("900px");
    expect(at(element(result, "Overlay")).has("flex-wrap")).toBe(false);
  });

  it("preserves authored min/max dimensions and does not wrap icon/label rows", () => {
    const constrained = frame({ name: "Constrained", box: box(600), minWidth: 580, maxWidth: 620,
      maxHeight: 100, layout: layout("row"), children: [
        frame({ name: "A", box: box(200) }), frame({ name: "B", box: box(200) }),
      ] });
    const label = frame({ name: "Label pair", box: box(200, 40), layout: layout("row"), children: [
      shape({ name: "Icon" }), text([segment({ text: "Label" })]),
    ] });
    const root = frame({ box: box(640), layout: layout("column", 20), children: [constrained, label] });
    const result = tree([root]);
    const style = at(element(result, "Constrained"));
    expect(style.get("width")).toBe("600px");
    expect(style.get("min-width")).toBe("580px");
    expect(style.get("max-width")).toBe("620px");
    expect(style.get("height")).toBe("100px");
    expect(style.get("max-height")).toBe("100px");
    expect(style.get("flex-shrink")).toBe("0");
    expect(style.has("flex-wrap")).toBe(false);
    expect(at(element(result, "Label pair")).has("flex-wrap")).toBe(false);
  });

  it("recognizes full-width content against its immediate parent, not the page", () => {
    const inner = frame({ name: "Inner", box: box(568) });
    const container = frame({ name: "Container", box: box(600), layout: layout("column", 16), children: [inner] });
    const root = frame({ box: box(1440), layout: layout("column"), children: [container] });
    const result = tree([root]);
    expect(at(element(result, "Container")).get("width")).toBe("600px");
    expect(at(element(element(result, "Container"), "Inner")).get("width")).toBe("100%");
  });
  it("lets a newly wrapping nested row grow beyond its measured 100px height", () => {
    const row = frame({ name: "Tiles", box: box(1200), layout: layout("row"), children: [
      frame({ name: "Tile one", box: box(500) }), frame({ name: "Tile two", box: box(500) }),
    ] });
    const root = frame({ name: "Page", box: box(1440, 900), layout: layout("column"), children: [
      row, frame({ name: "Following section", box: box(1200, 80) }),
    ] });
    const result = tree([root]);
    const tiles = at(element(result, "Tiles"));
    expect(tiles.get("flex-wrap")).toBe("wrap");
    expect(tiles.has("height")).toBe(false);
    expect(tiles.get("min-height")).toBe("100px");
    expect(element(result, "Following section").name).toBe("Following section");
  });
  it("wraps a single fluid root row of content cards", () => {
    const root = frame({ name: "Cards", box: box(1440), layout: layout("row"), children: [
      frame({ name: "First card", box: box(600) }), frame({ name: "Second card", box: box(600) }),
    ] });
    expect(at(tree([root])).get("flex-wrap")).toBe("wrap");
    expect(at(tree([root], false)).has("flex-wrap")).toBe(false);
    const output = generate([root], [], { target: "react-tailwind", fluidSingleFrame: true }, new Warnings());
    expect(output.sections[0].code).toContain("flex-wrap");
  });
  it("fits merged desktop content to its padded parent at the 1024px tier boundary", () => {
    const screen = (breakpoint: "mobile" | "desktop", width: number): FrameNode => frame({
      name: `${breakpoint} Page`, breakpoint, box: box(width, 900), layout: layout("column", 16),
      children: [frame({ name: "Content", box: box(width - 32), layout: layout("column") })],
    });
    const roots = [screen("mobile", 375), screen("desktop", 1440)];
    const content = element(tree(roots), "Content");
    expect(at(content, 1024).get("width")).toBe("100%");
    expect(at(content, 1024).get("min-width")).toBe("0");
    const css = generate(roots, [], { target: "html-css" }, new Warnings()).sections[1].code;
    expect(css).not.toContain("width: 1408px;");
    expect(css).not.toContain("overflow: hidden;");
  });
});
