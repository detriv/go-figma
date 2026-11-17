import { describe, expect, it } from "vitest";
import type { FrameNode } from "../src/core/ir";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { buildProject } from "../src/generators/project";
import { designContext } from "../src/generators/designContext";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import { frame, segment, text } from "./fixtures";

const settings = { ...DEFAULT_SETTINGS, target: "html-css" as const, fluidSingleFrame: false };
const row = { direction: "row" as const, gap: 0, crossGap: 0, wrap: false, justify: "start" as const, align: "center" as const, padding: { top: 0, right: 0, bottom: 0, left: 0 } };
const tabs = (labels = ["inTechgra Lite", "inTechgra Basic", "inTechgra Pro"]): FrameNode => frame({
  id: "3039:9444", name: "Tab Content Container", layout: row,
  children: labels.map((label, i) => frame({
    id: `tab-${i}`, name: "Tab", layout: row,
    children: [text([segment({ text: label })], { id: `label-${i}`, name: "List Pegawai" })],
  })),
});
const htmlClasses = (html: string, tag: string) => [...html.matchAll(new RegExp(`<${tag} class="([^"]+)"`, "g"))].map((m) => m[1]);
const output = (root = tabs()) => generate([root], [], settings, new Warnings());

describe("shared classes for repeated peer elements", () => {
  it("reuses a single contextual class for three equivalent tabs and their labels", () => {
    const result = output();
    const divs = htmlClasses(result.sections[0].code, "div").filter((name) => name.startsWith("tab-tab-content-container-"));
    expect(divs).toEqual(Array(3).fill("tab-tab-content-container-3039-9444"));
    expect(new Set(htmlClasses(result.sections[0].code, "p")).size).toBe(1);
    expect(result.sections[1].code.split(".tab-tab-content-container-3039-9444 {").length - 1).toBe(1);
    for (const label of ["inTechgra Lite", "inTechgra Basic", "inTechgra Pro"]) expect(result.sections[0].code).toContain(label);
  });

  it("shares corresponding labels even when Figma names follow their different text", () => {
    const root = tabs();
    for (const [index, name] of ["Lite", "Basic", "Pro"].entries()) {
      (root.children[index] as FrameNode).children[0].name = name;
    }
    const names = htmlClasses(output(root).sections[0].code, "p");
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(1);
  });

  it("does not share a tab class when its styling differs", () => {
    const root = tabs();
    root.children[1].fills = [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }];
    const divs = htmlClasses(output(root).sections[0].code, "div").filter((name) => name.startsWith("tab-tab-content-container-"));
    expect(divs[0]).toBe(divs[2]);
    expect(divs[1]).not.toBe(divs[0]);
  });

  it("does not merge corresponding labels from differently styled parent contexts", () => {
    const root = tabs();
    root.children[1].fills = [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }];
    const labels = htmlClasses(output(root).sections[0].code, "p");
    expect(labels[0]).toBe(labels[2]);
    expect(labels[1]).not.toBe(labels[0]);
  });

  it("keeps different typography and geometry distinct", () => {
    const root = tabs();
    const middle = root.children[1] as FrameNode;
    middle.box = { ...middle.box, width: 240 };
    const label = middle.children[0];
    if (label.kind === "text") label.text.segments[0].fontSize = 24;
    const result = output(root);
    expect(htmlClasses(result.sections[0].code, "div")[1]).not.toBe(htmlClasses(result.sections[0].code, "div")[2]);
    const labels = [...result.sections[0].code.matchAll(/class="(list-pegawai[^\"]*)"/g)].map((match) => match[1]);
    expect(new Set(labels).size).toBe(2);
  });

  it("separates peers whose larger-breakpoint styles differ", () => {
    const mobile = { ...tabs(), breakpoint: "mobile" as const };
    const desktop = { ...tabs(), id: "3039:9555", breakpoint: "desktop" as const };
    desktop.children[1].box.width = 240;
    const result = generate([mobile, desktop], [], settings, new Warnings());
    const names = htmlClasses(result.sections[0].code, "div");
    expect(names[0]).toBe(names[2]);
    expect(names[1]).not.toBe(names[0]);
    expect(result.sections[1].code).toContain("@media (min-width: 1024px)");
  });

  it("separates peers whose error-state styles differ", () => {
    const initial = { ...tabs(), state: "default" };
    const error = { ...tabs(), id: "3039:9555", state: "error" };
    error.children[1].fills = [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }];
    const result = generate([initial, error], [], settings, new Warnings());
    const names = htmlClasses(result.sections[0].code, "div");
    expect(names[0]).toBe(names[2]);
    expect(names[1]).not.toBe(names[0]);
    expect(result.sections[1].code).toContain('[data-state="error"]');
  });

  it("uses identical class families across code, preview, MCP and static export", () => {
    const root = tabs();
    const result = output(root);
    const context = designContext([root], [], settings.target, new Warnings(), settings);
    const project = buildProject([root], [], settings.target, new Warnings(), settings);
    const expected = htmlClasses(result.sections[0].code, "div");
    expect(htmlClasses(result.previewHtml, "div")).toEqual(expected);
    expect(htmlClasses(context.sections[0].code, "div")).toEqual(expected);
    expect(htmlClasses(project.files.find((f) => f.path === "index.html")!.text!, "div")).toEqual(expected);
  });
});
