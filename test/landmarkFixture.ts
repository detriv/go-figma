import type { AutoLayout, FrameNode, SvgNode } from "../src/core/ir";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import { frame, segment, shape, text } from "./fixtures";

export const landmarkSettings = { ...DEFAULT_SETTINGS, target: "html-css" as const, fluidSingleFrame: false };
const box = (width: number, height: number) => ({ x: 0, y: 0, width, height, rotation: 0 });
const row: AutoLayout = {
  direction: "row", gap: 8, crossGap: 0, wrap: false, justify: "start", align: "center",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
};

/** Content Container → Table → Header → Table header → column label + icon. */
export function tableHeaderFixture(): FrameNode {
  const cells = ["Nama Toko", "Lokasi"].map((label, index) => {
    const icon: SvgNode = {
      ...shape({ id: `sort-icon-${index}`, name: "Icon mini chevron up down", box: box(8, 14) }),
      kind: "svg",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="14" viewBox="0 0 8 14"><path d="M1 4L4 1L7 4M1 10L4 13L7 10" stroke="#616161" fill="none"/></svg>',
    };
    return frame({
      id: `column-${index}`, name: "Table header", box: box(180, 40), layout: row,
      children: [text([segment({ text: label, fontFamily: "Arial", fontSize: 14 })], {
        id: `column-label-${index}`, name: "Header sort", box: box(100, 20),
      }), icon],
    });
  });
  return frame({
    id: "3250:81563", name: "Content Container", box: box(360, 80),
    children: [frame({ id: "data-table", name: "Table", box: box(360, 40), children: [
      frame({ id: "header-row", name: "Header", box: box(360, 40), layout: { ...row, gap: 0 }, children: cells }),
    ] })],
  });
}

export function nestedLandmarkFixture(outer: string, inner: string, depth: number): FrameNode {
  let child = frame({ id: "inner-landmark", name: inner, box: box(100, 40), children: [
    text([segment({ text: "Nested content", fontFamily: "Arial", fontSize: 14 })]),
  ] });
  for (let index = 0; index < depth; index++) {
    child = frame({ id: `wrapper-${index}`, name: index % 2 ? "Section" : "Layout wrapper", children: [child] });
  }
  return frame({ id: "outer-landmark", name: outer, children: [child] });
}
