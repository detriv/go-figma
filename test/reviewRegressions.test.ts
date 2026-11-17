import { describe, expect, it } from "vitest";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { frame, segment, shape, text } from "./fixtures";

const box = (width: number, height: number, x = 0, y = 0) => ({ x, y, width, height, rotation: 0 });
const layout = (direction: "row" | "column") => ({ direction, gap: 0, crossGap: 0, wrap: false, justify: "start" as const, align: "start" as const, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
const settings = { target: "html-css" as const, fluidSingleFrame: true, semanticHtml: true };

describe("review regressions", () => {
  it("fits the outside of desktop navigation without wrapping its internal controls", () => {
    const root = frame({ name: "Page", box: box(1440, 900), layout: layout("column"), children: [
      frame({ name: "Navigation", box: box(1440, 60), layout: layout("row"), children: [
        frame({ name: "Logo", box: box(100, 40) }),
      ] }),
    ] });
    const css = generate([root], [], settings, new Warnings()).sections[1].code;
    const nav = css.match(/\.navigation \{([^}]+)\}/)![1];
    expect(nav).toContain("width: 100%");
    expect(nav).not.toContain("flex-wrap: wrap");
  });

  it.each([{ opacity: 0.5 }, { effects: [{ type: "layer-blur" as const, radius: 8 }] }])("does not reparent text into a composited background %j", (visuals) => {
    const root = frame({ name: "Page", box: box(400, 200), children: [
      shape({ name: "Background", positioning: "absolute", box: box(400, 200), ...visuals }),
      text([segment({ text: "Opaque label" })], { name: "Label", positioning: "absolute", box: box(100, 24, 16, 16) }),
    ] });
    const html = generate([root], [], settings, new Warnings()).sections[0].code;
    expect(html).toMatch(/class="background"[^>]*><\/div>\s*<p class="label"/);
  });
});
