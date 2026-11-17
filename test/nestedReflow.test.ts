import { describe, expect, it } from "vitest";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { frame } from "./fixtures";

const layout = (direction: "column" | "row") => ({ direction, gap: 16, crossGap: 0, wrap: false, justify: "start" as const, align: "start" as const, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
const box = (width: number, height: number) => ({ x: 0, y: 0, width, height, rotation: 0 });

describe("nested reflow", () => {
  it("lets flow ancestors expand when a descendant card row gains wrapping", () => {
    const root = frame({ name: "Page", box: box(1440, 900), layout: layout("column"), children: [
      frame({ name: "Wrapper", box: box(1440, 100), layout: layout("column"), children: [
        frame({ name: "Cards", box: box(1440, 100), layout: layout("row"), children: [
          frame({ name: "Card A", box: box(360, 100) }), frame({ name: "Card B", box: box(360, 100) }),
        ] }),
      ] }),
      frame({ name: "Next Section", box: box(1440, 100) }),
    ] });
    const css = generate([root], [], { target: "html-css", fluidSingleFrame: true }, new Warnings()).sections[1].code;
    const wrapper = css.match(/\.wrapper \{([^}]+)\}/)![1];
    expect(wrapper).not.toMatch(/(?:^|\n)\s*height:/);
    expect(wrapper).toContain("min-height: 100px");
  });
});
