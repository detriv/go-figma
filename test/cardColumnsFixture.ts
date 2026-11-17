import type { AutoLayout, FrameNode } from "../src/core/ir";
import { frame, WHITE } from "./fixtures";

const box = (width: number, height = 182, x = 0) => ({ x, y: 0, width, height, rotation: 0 });
const layout = (direction: "row" | "column"): AutoLayout => ({
  direction, gap: 16, crossGap: 0, wrap: false, justify: "start", align: "start",
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
});

/** Same pattern as the reported payment layout: fill cards then a fixed orphan. */
export function cardColumns(columns = 2, lastCount = 1, mobile = false): FrameNode {
  const cardWidth = mobile ? 343 : 565;
  const width = mobile ? 343 : columns * cardWidth + (columns - 1) * 16;
  const card = (index: number, fill: boolean) => frame({
    id: `card-${index}`, name: "Card Payment Method", box: box(cardWidth, 182, mobile ? 0 : (index % columns) * (cardWidth + 16)),
    sizing: { horizontal: fill ? "fill" : "fixed", vertical: "fixed" },
    fills: [{ type: "solid", color: WHITE }], radius: [8, 8, 8, 8],
  });
  const row = (children: FrameNode[], index: number) => frame({
    id: `row-${index}`, name: "Payment Row", box: box(width), layout: layout("row"),
    sizing: { horizontal: "fill", vertical: "hug" }, children,
  });
  const cards = Array.from({ length: columns + lastCount }, (_, index) => card(index, mobile || index < columns));
  return frame({
    id: "page", name: "Payment Page", box: box(width, 600), layout: layout("column"),
    children: mobile ? cards.map((item, index) => row([item], index)) : [row(cards.slice(0, columns), 0), row(cards.slice(columns), 1)],
  });
}
