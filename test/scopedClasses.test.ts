import { describe, expect, it } from "vitest";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { designContext } from "../src/generators/designContext";
import { buildProject } from "../src/generators/project";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/shared/settings";
import { frame, shape } from "./fixtures";

const settings = { ...DEFAULT_SETTINGS, target: "html-css" as const, scopedClassNames: true };
const login = (id = "12:34") => frame({ id, name: "Login", children: [
  frame({ id: "12:35", name: "Dropdown", children: [shape({ name: "Icon" })] }),
  frame({ id: "12:36", name: "Kota", children: [frame({ id: "12:37", name: "Dropdown" })] }),
] });
const generatePage = (id = "12:34") => generate([login(id)], [], settings, new Warnings());
const classes = (html: string) => [...html.matchAll(/class="([^"]+)"/g)].map((match) => match[1]);

describe("frame-specific CSS class names", () => {
  it("uses frame identity and nearest named container instead of generic classes", () => {
    const result = generatePage();
    expect(classes(result.sections[0].code)).toContain("dropdown-login-12-34");
    expect(classes(result.sections[0].code)).toContain("dropdown-kota-login-12-34");
    expect(classes(result.sections[0].code)).not.toContain("dropdown");
    expect(result.sections[1].code).toContain(".dropdown-login-12-34 {");
    expect(result.sections[1].code).not.toMatch(/\.dropdown\s*\{/);
  });

  it("does not reuse classes between separately generated same-named frames", () => {
    const first = new Set(classes(generatePage("12:34").sections[0].code));
    const second = classes(generatePage("56:78").sections[0].code);
    expect(second.every((name) => !first.has(name))).toBe(true);
  });

  it("is stable when unrelated frames are selected alongside it", () => {
    const alone = generatePage().sections[0].code;
    const together = generate([frame({ id: "99:1", name: "Other" }), login()], [], settings, new Warnings());
    for (const name of classes(alone)) expect(classes(together.sections[0].code)).toContain(name);
  });

  it("keeps preview, image-backed code, MCP design context and static export consistent", () => {
    const root = login();
    const image = { hash: "photo", fileName: "photo.png", mimeType: "image/png", bytes: new Uint8Array([1]), width: 1, height: 1 };
    root.fills = [{ type: "image", hash: "photo", scaleMode: "fill" }];
    const result = generate([root], [image], settings, new Warnings());
    const context = designContext([root], [image], settings.target, new Warnings(), settings);
    const project = buildProject([root], [image], settings.target, new Warnings(), settings);
    const index = project.files.find((file) => file.path === "index.html")!.text!;
    expect(classes(result.previewHtml)).toEqual(classes(result.sections[0].code));
    expect(classes(context.sections[0].code)).toEqual(classes(result.sections[0].code));
    expect(classes(index)).toEqual(classes(result.sections[0].code));
  });

  it("defaults the plugin and migrated stored settings to specific class names", () => {
    expect(DEFAULT_SETTINGS.scopedClassNames).toBe(true);
    expect(sanitizeSettings({ target: "html-css" }).scopedClassNames).toBe(true);
    expect(sanitizeSettings({ scopedClassNames: false }).scopedClassNames).toBe(false);
    expect(sanitizeSettings({ scopedClassNames: "false" }).scopedClassNames).toBe(true);
  });

  it("keeps named wrapper context even if that wrapper has no CSS declarations", () => {
    const root = login();
    root.children[1].sizing = { horizontal: "hug", vertical: "hug" };
    const result = generate([root], [], { ...settings, fluidSingleFrame: false }, new Warnings());
    expect(classes(result.sections[0].code)).toContain("dropdown-kota-login-12-34");
  });

  it("sanitizes class identifiers and deduplicates repeated elements inside a frame", () => {
    const root = login("I12:34;56:78");
    root.name = "123 Login / Đăng nhập";
    root.children.push(frame({ name: "Dropdown" }), frame({ name: "Frame 99" }));
    const result = generate([root], [], settings, new Warnings());
    const names = classes(result.sections[0].code);
    for (const name of new Set(names)) {
      expect(result.sections[1].code.split(`.${name} {`).length - 1).toBe(1);
    }
    expect(names.every((name) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name))).toBe(true);
    expect(result.sections[0].code).not.toContain("sourceId=");
    expect(result.sections[0].code).not.toContain("data-node-id=");
  });

  it("supports explicit legacy naming without changing Tailwind utilities", () => {
    const legacy = generate([login()], [], { ...settings, scopedClassNames: false }, new Warnings());
    expect(classes(legacy.sections[0].code)).toContain("dropdown");
    for (const target of ["html-tailwind", "react-tailwind"] as const) {
      const plain = generate([login()], [], { ...settings, target, scopedClassNames: false }, new Warnings());
      const scoped = generate([login()], [], { ...settings, target }, new Warnings());
      expect(scoped.sections).toEqual(plain.sections);
    }
  });
});
