// Keep repeated cards on the same proportional column tracks, even when the
// last Figma row has fewer children and its cards were accidentally left Fixed.
import { fmt } from "../core/color";
import { BREAKPOINTS, type FrameNode, type IRNode } from "../core/ir";
import { toKebab } from "../core/naming";
import type { Decl } from "./css";
import type { StyledElement } from "./tree";
import { isControl } from "./responsive";

const near = (a: number, b: number) => Math.abs(a - b) <= 2;
const bounded = (node: IRNode) => node.minWidth !== undefined || node.maxWidth !== undefined;
const signature = (node: FrameNode) => {
  const name = toKebab(node.component?.name ?? node.name);
  if (!name || /^(frame|group|instance|component)(-\d+)?$/.test(name)) return null;
  return JSON.stringify([name, node.fills, node.strokes, node.radius, node.effects]);
};

function isRow(node: IRNode): node is FrameNode {
  return node.kind === "frame" && node.layout?.direction === "row" &&
    node.layout.justify === "start" && node.layout.gap >= 0 && !node.layout.wrap &&
    node.maxHeight === undefined && node.sizing.horizontal !== "hug" && !bounded(node) &&
    node.positioning === "flow" && node.box.rotation === 0 && !node.box.flip &&
    node.strokes.length === 0 && node.children.length > 0 &&
    node.children.every((card) => card.kind === "frame" && card.positioning === "flow" &&
      card.box.rotation === 0 && !card.box.flip && !bounded(card) && !card.margin);
}

function fullRow(row: FrameNode): boolean {
  const first = row.children[0] as FrameNode;
  const key = signature(first);
  const layout = row.layout!;
  const contentWidth = row.box.width - layout.padding.left - layout.padding.right;
  return row.children.length > 1 && key !== null && row.children.every((card) =>
    card.sizing.horizontal === "fill" && signature(card as FrameNode) === key &&
    near(card.box.width, first.box.width)) &&
    near(first.box.width * row.children.length + layout.gap * (row.children.length - 1), contentWidth);
}

function sameSlots(reference: FrameNode, row: FrameNode): boolean {
  const card = reference.children[0] as FrameNode;
  return row.children.length <= reference.children.length &&
    near(row.box.width, reference.box.width) && row.layout!.gap === reference.layout!.gap &&
    JSON.stringify(row.layout!.padding) === JSON.stringify(reference.layout!.padding) &&
    row.children.every((item, index) => signature(item as FrameNode) === signature(card) &&
      near(item.box.width, card.box.width) &&
      near(item.box.x, row.layout!.padding.left + index * (card.box.width + row.layout!.gap)));
}

/** Called after fluid fitting, or before merging authored responsive frames.
 * `fluid` keeps mobile one-column and uses the existing md tier for the measured
 * multi-column layout. Authored screens receive only their own column count.
 */
export function alignColumnSlots(source: IRNode, tree: StyledElement, fluid: boolean): StyledElement {
  if (source.kind !== "frame" || isControl(tree)) return tree;
  const children = tree.children.map((child, index) => child.kind === "element"
    ? alignColumnSlots(source.children[index], child, fluid) : child);
  if (source.layout?.direction !== "column" || source.sizing.horizontal === "hug") return { ...tree, children };

  let reference: FrameNode | undefined;
  let referenceIndex = -1;
  const fittedRows = new Set<number>();
  for (let index = 0; index < source.children.length; index++) {
    const row = source.children[index];
    const built = children[index];
    if (!isRow(row) || built.kind !== "element" || isControl(built) ||
      built.children.some((card) => card.kind === "element" && isControl(card)) ||
      (fluid && row.children.length > 1 && !built.style.some(([p, v]) => p === "flex-wrap" && v === "wrap"))) {
      reference = undefined;
      continue;
    }
    if (fullRow(row)) {
      if (!reference || row.children.length !== reference.children.length || !sameSlots(reference, row)) {
        reference = row;
        referenceIndex = index;
      }
      continue;
    }
    if (reference && row.children.length === reference.children.length && sameSlots(reference, row)) continue;
    if (!reference || row.children.length >= reference.children.length ||
      !row.children.every((card) => card.sizing.horizontal === "fixed") || !sameSlots(reference, row)) {
      reference = undefined;
      continue;
    }

    const count = reference.children.length;
    const totalGap = fmt(reference.layout!.gap * (count - 1));
    const width = `calc((100% - ${totalGap}px) / ${count})`;
    for (let rowIndex = referenceIndex; rowIndex <= index; rowIndex++) {
      const built = children[rowIndex];
      if (built.kind !== "element" || fittedRows.has(rowIndex)) continue;
      fittedRows.add(rowIndex);
      children[rowIndex] = {
        ...built,
        children: built.children.map((card) => {
          if (card.kind !== "element") return card;
          const style: Decl[] = [...new Map([...card.style, ["width", fluid ? "100%" : width], ["flex", "0 0 auto"]] as Decl[]).entries()];
          if (!fluid) return { ...card, style };
          const tier = BREAKPOINTS[1];
          return { ...card, style, responsive: [...(card.responsive ?? []), { minWidth: tier.minWidth, prefix: tier.prefix, style: [["width", width]] }] };
        }),
      };
    }
  }
  return { ...tree, children };
}
