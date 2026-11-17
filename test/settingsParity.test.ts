import { describe, expect, it } from "vitest";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { designContext } from "../src/generators/designContext";
import { buildProject } from "../src/generators/project";
import { frame, segment, text } from "./fixtures";

const page = frame({
  name: "Page",
  box: { x: 0, y: 0, width: 1440, height: 900, rotation: 0 },
  children: [frame({ name: "Primary Button", children: [text([segment({ text: "Save" })])] })],
});

describe("generation settings parity", () => {
  it("applies the same semantic and fluid settings to UI, design context and export", () => {
    const settings = { target: "html-css" as const, semanticHtml: true, fluidSingleFrame: true };
    const ui = generate([page], [], settings, new Warnings());
    const context = designContext([page], [], settings.target, new Warnings(), settings);
    const project = buildProject([page], [], settings.target, new Warnings(), settings);
    for (const html of [ui.sections[0].code, context.sections[0].code, project.files.find((f) => f.path === "index.html")!.text!]) {
      expect(html).toContain("<button");
      expect(html).toContain("Save");
    }
    for (const css of [ui.sections[1].code, context.sections[1].code, project.files.find((f) => f.path === "styles.css")!.text!]) {
      expect(css).toMatch(/\.page \{[^}]*width: 100%/);
      expect(css).toMatch(/\.page \{[^}]*min-height: 900px/);
    }
  });

  it("respects explicit opt-out in design context", () => {
    const context = designContext([page], [], "html-css", new Warnings(), { semanticHtml: false, fluidSingleFrame: false });
    expect(context.sections[0].code).not.toContain("<button");
    expect(context.sections[1].code).toMatch(/\.page \{[^}]*width: 1440px/);
  });
});
