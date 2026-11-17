import { describe, expect, it } from "vitest";
import type { FrameNode } from "../src/core/ir";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { designContext } from "../src/generators/designContext";
import { buildProject } from "../src/generators/project";
import { frame } from "./fixtures";
import { landmarkSettings as settings, nestedLandmarkFixture, tableHeaderFixture } from "./landmarkFixture";

const generateHtml = (root: FrameNode) => generate([root], [], settings, new Warnings()).sections[0].code;
const landmarks = (html: string) => [...html.matchAll(/<(header|footer)\b/g)].map((match) => match[1]);

function documents(root: FrameNode) {
  const result = generate([root], [], settings, new Warnings());
  const context = designContext([root], [], settings.target, new Warnings(), settings);
  const project = buildProject([root], [], settings.target, new Warnings(), settings);
  return [result.sections[0].code, result.previewHtml, context.sections[0].code,
    project.files.find((file) => file.path === "index.html")!.text!];
}

describe("ancestry-aware header/footer inference at public generation seams", () => {
  it("keeps table header rows and cells as containers rather than page/section headers", () => {
    for (const html of documents(tableHeaderFixture())) {
      expect(landmarks(html)).toEqual([]);
      expect(html).not.toMatch(/<(?:table|thead|tr|th)\b/);
      expect(html).toContain("Nama Toko");
      expect(html).toContain("Lokasi");
      // MCP/project seams may reference SVG assets through <img> instead.
      expect(html.match(/<(?:svg|img)\b/g)).toHaveLength(2);
    }
  });

  for (const outer of ["Header", "Footer"]) {
    for (const inner of ["Header", "Footer"]) {
      it.each([0, 1, 3])(`${outer} cannot contain another ${inner} through %i wrapper(s)`, (depth) => {
        for (const html of documents(nestedLandmarkFixture(outer, inner, depth))) {
          expect(landmarks(html)).toEqual([outer.toLowerCase()]);
          expect(html).toContain("Nested content");
        }
      });
    }
  }

  it.each(["Table Header", "Table_Header", "TableHeader", "table-header", "Table Footer"])(
    "does not reinterpret an independently selected %s as a page landmark", (name) => {
      expect(landmarks(generateHtml(frame({ name })))).toEqual([]);
    },
  );

  it("recognizes table component identity when the instance is only named Header", () => {
    const node = frame({ name: "Header", component: { name: "Table Header", properties: {} } });
    expect(landmarks(generateHtml(node))).toEqual([]);
  });

  it("keeps table context through unnamed wrappers", () => {
    const node = frame({ name: "DataTable", children: [frame({ name: "Frame 1", children: [frame({ name: "Header" })] })] });
    expect(landmarks(generateHtml(node))).toEqual([]);
  });

  it("preserves genuine sibling page and section headers/footers without poisoning later siblings", () => {
    const root = frame({ name: "Page", children: [
      frame({ name: "Header" }),
      frame({ name: "Section", children: [frame({ name: "Header" }), frame({ name: "Footer" })] }),
      frame({ name: "Footer" }),
      frame({ name: "Tablet layout", children: [frame({ name: "Header" })] }),
    ] });
    expect(landmarks(generateHtml(root))).toEqual(["header", "header", "footer", "footer", "header"]);
  });

  it.each(["html-tailwind", "react-tailwind"] as const)("applies the same ancestry rules to %s", (target) => {
    const result = generate([tableHeaderFixture()], [], { ...settings, target }, new Warnings());
    expect(landmarks(result.sections[0].code)).toEqual([]);
    expect(result.sections[0].code).toContain("Nama Toko");
    const nested = generate([nestedLandmarkFixture("Header", "Footer", 3)], [], { ...settings, target }, new Warnings());
    expect(landmarks(nested.sections[0].code)).toEqual(["header"]);
  });

  it("retains semanticHtml=false opt-out", () => {
    const result = generate([nestedLandmarkFixture("Header", "Footer", 3)], [], { ...settings, semanticHtml: false }, new Warnings());
    expect(landmarks(result.sections[0].code)).toEqual([]);
  });
});
