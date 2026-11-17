import { describe, expect, it } from "vitest";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { frame } from "./fixtures";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, rotation: 0 });
const options = { target: "html-css" as const, fluidSingleFrame: true };

describe("conservative freeform layout inference", () => {
  it("generates flowing cards for an unambiguous freeform row", () => {
    const root = frame({ name: "Page", box: box(0, 0, 800, 200), children: [
      frame({ name: "Card A", positioning: "absolute", box: box(16, 16, 360, 100) }),
      frame({ name: "Card B", positioning: "absolute", box: box(392, 16, 360, 100) }),
    ] });
    const result = generate([root], [], options, new Warnings());
    expect(result.sections[1].code).toContain("display: flex");
    expect(result.sections[1].code).toContain("flex-wrap: wrap");
    expect(result.sections[1].code).not.toContain("position: absolute");
  });

  it("keeps ambiguous freeform art unchanged and warns instead of inventing a layout", () => {
    const root = frame({ name: "Page", box: box(0, 0, 1440, 900), children: [
      frame({ name: "Far Card", positioning: "absolute", box: box(1000, 20, 300, 100) }),
    ] });
    const result = generate([root], [], options, new Warnings());
    expect(result.sections[1].code).toContain("left: 1000px");
    expect(result.warnings.some((w) => /freeform|absolute/i.test(w))).toBe(true);
  });

  it("preserves the exact-position opt-out", () => {
    const root = frame({ box: box(0, 0, 800, 200), children: [
      frame({ positioning: "absolute", box: box(16, 16, 360, 100) }),
      frame({ positioning: "absolute", box: box(392, 16, 360, 100) }),
    ] });
    const result = generate([root], [], { ...options, fluidSingleFrame: false }, new Warnings());
    expect(result.sections[1].code).toContain("position: absolute");
    expect(result.warnings).toEqual([]);
  });
});
