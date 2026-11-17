import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countNodes, normalizeSelection, scratchNodeIds } from "../src/core/normalize";
import { Warnings } from "../src/core/warnings";
import { DEFAULT_SETTINGS } from "../src/shared/settings";

// Minimal local plugin-API mock: no fonts, images, variables or remote calls.
function node(type: NodeType, id: string, children?: SceneNode[], props: Record<string, unknown> = {}): SceneNode {
  const result = {
    type, id, name: id, visible: true, width: 200, height: 100, rotation: 0,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]], opacity: 1, effects: [],
    fills: [], strokes: [], blendMode: "PASS_THROUGH", isMask: false,
    getPluginData: () => "",
    exportAsync: vi.fn().mockResolvedValue('<svg width="200" height="100"><mask id="mask"/></svg>'),
    clone: vi.fn(() => { throw new Error("read only"); }),
    ...(children ? { children } : {}),
    ...(type === "FRAME" ? { layoutMode: "NONE", clipsContent: false } : {}),
    ...props,
  };
  if (children) children.forEach((child) => Object.assign(child, { parent: result }));
  return result as unknown as SceneNode;
}

async function normalize(root: SceneNode, inlineSvg = true) {
  const warnings = new Warnings();
  const onProgress = vi.fn();
  const result = await normalizeSelection([root], { ...DEFAULT_SETTINGS, inlineSvg }, warnings, new Map(), { onProgress });
  return { ...result, warnings: warnings.list(), onProgress };
}

beforeEach(() => vi.stubGlobal("figma", { mixed: Symbol("mixed") }));
afterEach(() => { vi.unstubAllGlobals(); scratchNodeIds.clear(); });

describe("mask safety through normalizeSelection", () => {
  it("exports the smallest containing mask group, keeping unrelated siblings editable", async () => {
    const mask = node("RECTANGLE", "mask", undefined, { isMask: true });
    const artwork = node("VECTOR", "artwork");
    const group = node("GROUP", "masked", [mask, artwork]);
    const other = node("RECTANGLE", "other");
    const root = node("FRAME", "root", [group, other]);
    const result = await normalize(root);
    expect(result.roots[0]).toMatchObject({ kind: "frame", children: [
      { kind: "svg", id: "masked", svg: expect.stringContaining("<mask") },
      { kind: "shape", id: "other" },
    ] });
    expect(group.exportAsync).toHaveBeenCalledWith({ format: "SVG_STRING" });
    expect(root.exportAsync).not.toHaveBeenCalled();
    expect(artwork.exportAsync).not.toHaveBeenCalled();
    expect(result.warnings.join(" ")).toMatch(/mask.*SVG/i);
    expect(result.onProgress).toHaveBeenLastCalledWith(countNodes([root]));
  });

  it("skips an entire masked subtree if SVG export fails, not just the mask", async () => {
    const root = node("FRAME", "masked", [node("RECTANGLE", "mask", undefined, { isMask: true }), node("RECTANGLE", "art")]);
    vi.mocked(root.exportAsync).mockRejectedValue(new Error("cannot export"));
    const result = await normalize(root);
    expect(result.roots).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/mask.*skipped/i);
    expect(result.onProgress).toHaveBeenLastCalledWith(3);
  });

  it("does not expose unmasked siblings when inline SVG is disabled", async () => {
    const root = node("GROUP", "masked", [node("RECTANGLE", "mask", undefined, { isMask: true }), node("RECTANGLE", "art")]);
    const result = await normalize(root, false);
    expect(result.roots).toEqual([]);
    expect(root.exportAsync).not.toHaveBeenCalled();
    expect(result.warnings.join(" ")).toMatch(/mask.*skipped/i);
  });

  it("ignores hidden masks instead of rasterizing their container", async () => {
    const root = node("FRAME", "root", [node("RECTANGLE", "mask", undefined, { isMask: true, visible: false }), node("RECTANGLE", "art")]);
    const result = await normalize(root);
    expect(result.roots[0]).toMatchObject({ kind: "frame", children: [{ id: "art", kind: "shape" }] });
    expect(root.exportAsync).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
  });

  it("does not let the icon heuristic swallow an ancestor of a masked scope", async () => {
    const group = node("GROUP", "masked", [node("RECTANGLE", "mask", undefined, { isMask: true }), node("VECTOR", "art")], { width: 32, height: 32 });
    const root = node("FRAME", "icon-sized-parent", [group, node("RECTANGLE", "other")], { width: 64, height: 64 });
    const result = await normalize(root);
    expect(result.roots[0]).toMatchObject({ kind: "frame", children: [{ kind: "svg", id: "masked" }, { id: "other" }] });
    expect(root.exportAsync).not.toHaveBeenCalled();
  });

  it("warns for an isolated selected mask, without exporting it as visible artwork", async () => {
    const root = node("RECTANGLE", "mask", undefined, { isMask: true });
    const result = await normalize(root);
    expect(result.roots).toEqual([]);
    expect(root.exportAsync).not.toHaveBeenCalled();
    expect(result.warnings.join(" ")).toMatch(/mask/i);
  });
});

describe("group visual boundaries", () => {
  it.each([
    { opacity: 0.5 },
    { effects: [{ type: "LAYER_BLUR", visible: true, radius: 6 }] },
  ])("keeps a group wrapper with meaningful visual attributes: %j", async (props) => {
    const group = node("GROUP", "visual-group", [node("RECTANGLE", "child")], props);
    const result = await normalize(node("FRAME", "root", [group]));
    expect(result.roots[0]).toMatchObject({ kind: "frame", children: [
      { kind: "frame", id: "visual-group", opacity: props.opacity ?? 1, children: [{ id: "child" }] },
    ] });
    if (props.effects) {
      expect(result.roots[0]).toMatchObject({ children: [{ effects: [{ type: "layer-blur", radius: 6 }] }] });
    }
  });

  it("still flattens a visually inert group and preserves child coordinates", async () => {
    const child = node("RECTANGLE", "child", undefined, { absoluteTransform: [[1, 0, 45], [0, 1, 65]] });
    const group = node("GROUP", "plain", [child], { absoluteTransform: [[1, 0, 20], [0, 1, 30]] });
    const result = await normalize(node("FRAME", "root", [group]));
    expect(result.roots[0]).toMatchObject({ children: [{ id: "child", kind: "shape", box: { x: 45, y: 65 } }] });
  });
});
