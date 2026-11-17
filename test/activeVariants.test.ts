import { describe, expect, it } from "vitest";
import type { FrameNode } from "../src/core/ir";
import { Warnings } from "../src/core/warnings";
import { generate } from "../src/generators";
import { designContext } from "../src/generators/designContext";
import { buildProject } from "../src/generators/project";
import {
  ACTIVE_TAB_BASE as BASE, ACTIVE_TAB_MODIFIER as ACTIVE, ACTIVE_TAB_SETTINGS as settings,
  activeFallbackFixture, activeVariantFixture, activeVariantMultiLabelFixture, FALLBACK_CASES, tabLabel, tabPeers,
} from "./activeVariantFixture";

const output = (roots = [activeVariantFixture()]) => generate(roots, [], settings, new Warnings());
const classes = (html: string) => [...html.matchAll(/class="([^"]+)"/g)].map((match) => match[1]);
const labels = (html: string) => [...html.matchAll(/<p\b[^>]*class="([^"]+)"/g)].map((match) => match[1]);
const peers = (html: string) => classes(html).filter((value) => value.split(/\s+/).some((name) => name.startsWith(BASE)));
const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1].trim(),
  declarations: Object.fromEntries([...match[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map((decl) => [decl[1], decl[2].trim()])),
}));
const rule = (css: string, selector: string) => rules(css).find((entry) => entry.selector === selector)?.declarations;

function expectFactored(html: string, activeIndex = 2) {
  expect(peers(html)).toEqual([0, 1, 2].map((index) => index === activeIndex ? `${BASE} ${ACTIVE}` : BASE));
  expect(labels(html)).toHaveLength(3);
  expect(new Set(labels(html)).size).toBe(1);
  expect(labels(html)[0]).toContain("-tab-");
  expect(labels(html)[0]).not.toContain("--active");
  for (const label of ["Lite", "Basic", "Pro"]) expect(html).toContain(`>${label}</p>`);
}

function withoutMetadata(root: FrameNode): FrameNode {
  const copy = structuredClone(root);
  for (const tab of tabPeers(copy)) delete tab.component;
  return copy;
}

describe("active component modifier naming through public export seams", () => {
  it("factors off/off/on into one contextual root class and one corresponding label class", () => {
    expect(settings.scopedClassNames).toBe(true);
    const result = output();
    expectFactored(result.sections[0].code);
    expect(classes(result.previewHtml)).toEqual(classes(result.sections[0].code));
    expect(result.sections[0].code).not.toContain("data-node-id=");
    expect(result.sections[0].code).not.toContain("data-props=");
    expect(result.sections[0].code).not.toMatch(new RegExp(`${BASE}-[23](?:[\\s\"]|$)`));
  });

  it.each([false, true])("emits the full inactive base plus actual active differences (shadow=%s)", (shadow) => {
    const result = output([activeVariantFixture({ shadow })]);
    const html = result.sections[0].code;
    const css = result.sections[1].code;
    expectFactored(html);
    expect(rule(css, `.${BASE}`)).toMatchObject({ width: "173px", padding: "10px 16px", "align-self": "stretch" });
    expect(rules(css).filter((entry) => entry.selector === `.${BASE}`)).toHaveLength(1);
    const activeRoot = rules(css).find((entry) => entry.selector.includes(`.${ACTIVE}`) && !entry.selector.includes(" "));
    expect(activeRoot?.declarations).toMatchObject({ width: "143px", height: "40px", padding: "10px", "align-self": "auto", "background-color": "#ffffff" });
    expect(activeRoot?.declarations).not.toHaveProperty("display");
    if (shadow) expect(activeRoot?.declarations["box-shadow"]).toBeTruthy();
    const labelClass = labels(html)[0];
    expect(rule(css, `.${labelClass}`)).toMatchObject({ "font-size": "14px", "font-weight": "400", "line-height": "20px", color: "#404040" });
    const activeLabel = rules(css).find((entry) => entry.selector.includes(`.${ACTIVE}`) && entry.selector.endsWith(` .${labelClass}`));
    expect(activeLabel?.declarations).toMatchObject({ "font-weight": "500", color: "#6098ff" });
    expect(activeLabel?.declarations).not.toHaveProperty("font-size");
    expect(activeLabel?.declarations).not.toHaveProperty("line-height");
  });

  it("uses the inactive baseline even when the active sibling appears first", () => {
    const result = output([activeVariantFixture({ activeFirst: true })]);
    expectFactored(result.sections[0].code, 0);
    expect(rule(result.sections[1].code, `.${BASE}`)).toMatchObject({ width: "173px", "align-self": "stretch" });
    const activeLabel = rules(result.sections[1].code).find((entry) => entry.selector.includes(`.${ACTIVE}`) && entry.selector.includes(" "));
    expect(activeLabel?.declarations).toMatchObject({ color: "#6098ff", "font-weight": "500" });
  });

  it("keeps independent descendant classes when their active styles differ despite identical inactive styles", () => {
    const result = output([activeVariantMultiLabelFixture()]);
    const labelClasses = labels(result.sections[0].code);
    expect(labelClasses).toHaveLength(6);
    expect(labelClasses[0]).not.toBe(labelClasses[1]);
    expect(labelClasses).toEqual(Array.from({ length: 3 }, () => labelClasses.slice(0, 2)).flat());
    const css = result.sections[1].code;
    expect(rule(css, `.${labelClasses[0]}`)).toEqual(rule(css, `.${labelClasses[1]}`));
    expect(rule(css, `.${ACTIVE} .${labelClasses[0]}`)).toMatchObject({ color: "#6098ff", "font-weight": "500" });
    expect(rule(css, `.${ACTIVE} .${labelClasses[1]}`)).toMatchObject({ color: "#ff0000", "font-weight": "500" });
  });

  it("preserves naming, CSS, source attributes and component properties in MCP and static exports", () => {
    const root = activeVariantFixture();
    const result = output([root]);
    const context = designContext([root], [], settings.target, new Warnings(), settings);
    const project = buildProject([root], [], settings.target, new Warnings(), settings);
    const index = project.files.find((file) => file.path === "index.html")!.text!;
    for (const html of [result.previewHtml, context.sections[0].code, index]) {
      expectFactored(html);
      expect(classes(html)).toEqual(classes(result.sections[0].code));
    }
    expect(context.sections[1].code).toBe(result.sections[1].code);
    expect(project.files.find((file) => file.path === "styles.css")!.text).toContain(result.sections[1].code);
    for (const tab of tabPeers(root)) {
      expect(context.sections[0].code).toContain(`data-node-id="${tab.id}"`);
      expect(context.sections[0].code).toContain(`data-props="type=capsule, active=${tab.component!.properties.active}"`);
      expect(context.sections[0].code).toContain(`data-node-id="${tabLabel(tab).id}"`);
      expect(context.sections[0].code).toContain(`data-name="${tabLabel(tab).name}"`);
    }
    expect(context.sections[0].code.match(/data-component="tab"/g)).toHaveLength(3);
    expect(context.components).toContainEqual(expect.objectContaining({ name: "tab", instances: 3, variants: ["type=capsule, active=off", "type=capsule, active=on"] }));
  });

  it.each(FALLBACK_CASES)("conservatively preserves distinct classes/styles for %s", (kind) => {
    const roots = activeFallbackFixture(kind);
    const result = output(roots);
    const html = result.sections[0].code;
    const css = result.sections[1].code;
    expect(html).not.toContain("--active");
    expect(peers(html)).toHaveLength(3);
    expect(peers(html)[2]).not.toBe(peers(html)[0]);
    expect(rule(css, `.${peers(html)[0]}`)).toMatchObject({ width: "173px", padding: "10px 16px", "align-self": "stretch" });
    expect(rule(css, `.${peers(html)[2]}`)).toMatchObject({ width: "143px", height: "40px", padding: "10px", "background-color": "#ffffff" });
    expect(labels(html)[2]).not.toBe(labels(html)[0]);
    expect(rule(css, `.${labels(html)[2]}`)).toMatchObject({ color: "#6098ff", "font-weight": "500" });
    if (kind === "responsive-descendant") expect(css).toContain("@media (min-width: 1024px)");
    if (kind === "state-descendant") expect(css).toContain('[data-state="error"]');
    expect(html).toContain("Lite");
    expect(html).toContain("Basic");
    expect(html).toContain("Pro");
  });

  it("does not infer an active pair from unsupported property values", () => {
    const root = activeVariantFixture();
    tabPeers(root)[2].component!.properties.active = "selected";
    expect(output([root]).sections[0].code).not.toContain("--active");
  });

  it("leaves explicit legacy classes unchanged", () => {
    const root = activeVariantFixture();
    const legacy = { ...settings, scopedClassNames: false };
    const actual = generate([root], [], legacy, new Warnings());
    const previous = generate([withoutMetadata(root)], [], legacy, new Warnings());
    expect(actual.sections).toEqual(previous.sections);
    expect(actual.sections[0].code).not.toContain("--active");
    expect(classes(actual.sections[0].code)).toContain("tab-2");
  });

  it.each(["html-tailwind", "react-tailwind"] as const)("leaves %s utility output unchanged", (target) => {
    const root = activeVariantFixture();
    const scoped = generate([root], [], { ...settings, target }, new Warnings());
    const legacy = generate([root], [], { ...settings, target, scopedClassNames: false }, new Warnings());
    const previous = generate([withoutMetadata(root)], [], { ...settings, target }, new Warnings());
    expect(scoped.sections).toEqual(legacy.sections);
    expect(scoped.sections).toEqual(previous.sections);
    expect(scoped.sections[0].code).not.toContain("--active");
    expect(scoped.sections[0].code).toContain("w-[173px]");
    expect(scoped.sections[0].code).toContain("w-[143px]");
    expect(scoped.sections[0].code).toContain("text-[#6098ff]");
  });
});
