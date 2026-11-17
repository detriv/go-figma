import { describe, expect, it } from "vitest";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { buildProject } from "../src/generators/project";
import { frame, segment, text } from "./fixtures";

const targets = ["html-css", "html-tailwind", "react-tailwind"] as const;
const buttonTree = () => frame({
  name: "Buttons",
  children: [frame({
    name: "Primary Button",
    children: [frame({
      name: "Nested Button",
      children: [frame({ name: "Section", children: [
        text([segment({ text: "  Buy  now  ", fontSize: 36 })], { name: "Hero Title" }),
      ] })],
    })],
  }), frame({ name: "Secondary Btn" })],
});

// Check source structure rather than a browser-repaired DOM: HTML parsers can
// silently close invalid nested buttons before an assertion ever sees them.
function assertSafeButtons(markup: string) {
  const stack: string[] = [];
  let buttons = 0;
  for (const match of markup.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/g)) {
    const [, closing, tag] = match;
    if (closing) { stack.pop(); continue; }
    if (stack.includes("button")) expect(["span", "img", "svg", "path"]).toContain(tag);
    if (tag === "button") buttons++;
    if (!/\/\s*>$/.test(match[0]) && !["img", "br", "meta", "link", "input"].includes(tag)) stack.push(tag);
  }
  expect(buttons).toBe(2);
}

describe("Output correctness through public generator seams", () => {
  it("neutralizes UA defaults locally without overriding designed button paint or spacing", () => {
    const root = frame({ name: "Page", children: [
      text([segment({ fontSize: 36, fontWeight: 400 })], { name: "Hero Title" }),
      frame({ name: "Plain Button", children: [text([segment()])] }),
      frame({ name: "Painted Button", fills: [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }],
        strokes: [{ align: "inside", weights: { top: 2, right: 2, bottom: 2, left: 2 }, color: { r: 0, g: 0, b: 0, a: 1 }, dashed: false }],
        layout: { direction: "row", gap: 0, crossGap: 0, wrap: false, justify: "start", align: "start", padding: { top: 10, right: 10, bottom: 10, left: 10 } },
      }),
    ] });
    const result = generate([root], [], { target: "html-css", semanticHtml: true }, new Warnings());
    const html = result.sections[0].code;
    const css = result.sections[1].code;
    const rule = (tag: string, name: string) => {
      const className = html.match(new RegExp(`<${tag} class="(${name}[^" ]*)"`))![1];
      return css.match(new RegExp(`\\.${className} \\{([^}]+)\\}`))![1];
    };
    expect(rule("h1", "hero-title")).toContain("font-weight: 400;");
    expect(rule("h1", "hero-title")).toContain("margin-top: 0;");
    const plain = rule("button", "plain-button");
    for (const declaration of ["margin-top: 0;", "padding: 0;", "border: 0 solid", "background-color: transparent;", "background-image: none;", "font: inherit;", "text-align: left;", "display: block;"]) {
      expect(plain).toContain(declaration);
    }
    const painted = rule("button", "painted-button");
    expect(painted).toContain("background-color: #ff0000;");
    expect(painted).toContain("border: 2px solid #000000;");
    expect(painted).toContain("padding: 8px;");
    expect(css).not.toMatch(/(?:^|\n)(?:body|button|p|h1)\s*\{/);
    const project = buildProject([root], [], "html-css", new Warnings(), { semanticHtml: true });
    expect(project.files.find((file) => file.path === "styles.css")!.text).toContain(css);
    expect(result.previewHtml).toContain(css);
    for (const target of ["html-tailwind", "react-tailwind"] as const) {
      const code = generate([root], [], { target, semanticHtml: true }, new Warnings()).sections[0].code;
      expect(code).toContain("font-normal");
      // Tailwind preflight supplies zero padding; appearance is explicit.
      expect(code).toContain("[appearance:none]");
      expect(code).toContain("border-0");
      expect(code).toContain("bg-[color:transparent]");
      expect(code).toContain("bg-[#ff0000]");
      expect(code).toContain("p-2");
    }
  });

  it.each(targets)("preserves spaces in wrapping, auto-width, truncated, and mixed-weight text in %s", (target) => {
    const wrapping = text([segment({ text: "  First  ", fontWeight: 700 }), segment({ text: " second  ", fontWeight: 400 })], { name: "Paragraph", sizing: { horizontal: "fixed", vertical: "hug" } });
    const truncated = text([segment({ text: "  Short  " })], { name: "Caption", text: { segments: [segment({ text: "  Short  " })], alignHorizontal: "left", alignVertical: "top", truncate: true } });
    const root = frame({ children: [wrapping, text([segment({ text: "  Auto  " })]), truncated] });
    const result = generate([root], [], { target, semanticHtml: true }, new Warnings());
    const css = result.previewHtml;
    expect(css).toContain("white-space: break-spaces;");
    expect(css).toContain("white-space: pre;");
    expect(css).toContain("font-weight: 400;");
    expect(result.sections[0].code).toContain("  First  ");
    expect(result.sections[0].code).toContain(" second  ");
    if (target !== "html-css") {
      expect(result.sections[0].code).toContain("[white-space:break-spaces]");
      expect(result.sections[0].code).toContain("[white-space:pre]");
      expect(result.sections[0].code).toContain("font-normal");
    }
  });

  it.each(targets)("keeps plural button groups and button descendants valid in %s", (target) => {
    const result = generate([buttonTree()], [], { target, semanticHtml: true }, new Warnings());
    const markup = result.sections[0].code;
    assertSafeButtons(markup);
    assertSafeButtons(result.previewHtml.slice(result.previewHtml.indexOf("<body>")));
    expect(markup).toContain("  Buy  now  ");
    const project = buildProject([buttonTree()], [], target, new Warnings(), { semanticHtml: true });
    const page = project.files.find((file) => file.path === (target === "react-tailwind" ? "app/page.jsx" : "index.html"))!.text!;
    assertSafeButtons(page.slice(target === "react-tailwind" ? 0 : page.indexOf("<body>")));
  });
});
