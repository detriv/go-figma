import { el, print, type Child } from "../core/markup";
import { ClassNamer, classBaseName, toKebab } from "../core/naming";
import { activeVariants, type ActiveVariant } from "./activeVariants";
import type { Decl } from "./css";
import { diffStyles } from "./responsive";
import type { StyledChild, StyledElement } from "./tree";

export const BASE_CSS = "*,\n*::before,\n*::after {\n  box-sizing: border-box;\n}";

interface ActiveContext extends ActiveVariant {
  root: boolean;
  selector?: string;
}

/**
 * Styled tree → semantic class names plus one CSS rule per element.
 * `pages` holds each root's markup separately; class names are unique across all of them.
 */
export function generateHtmlCss(
  tree: StyledElement[],
  { scopedClassNames = false }: { scopedClassNames?: boolean } = {},
): { html: string; css: string; pages: string[] } {
  const namer = new ClassNamer();
  const rules: string[] = [];
  /** min-width → rules; printed after the base rules so they win the cascade. */
  const media = new Map<number, string[]>();
  /** State → rules, scoped to the page root's `data-state`; more specific than the base rules. */
  const states = new Map<string, string[]>();
  /** Same contextual position + complete style signature can reuse one rule. */
  const sharedClasses = new Map<string, string>();
  const modifierRules: string[] = [];
  const emittedModifiers = new Set<string>();

  /** `scope`: class of the enclosing page root with states. */
  const convert = (
    node: StyledChild, scope: string | null, namespace: string,
    context = "", root = false, parentScope = namespace,
    variant?: ActiveContext,
  ): Child => {
    if (node.kind !== "element") return node.kind === "text" ? { kind: "text", text: node.text } : node;
    const cssNode = variant?.baseline ?? node;
    const attrs: [string, string][] = [];
    const base = classBaseName(cssNode.name, cssNode.role);
    let childScope = `${parentScope}/${base}`;
    let modifierSelector = variant?.selector;
    if (cssNode.style.length > 0 || node.style.length > 0 || cssNode.responsive || cssNode.states || cssNode.stateNames || variant?.root) {
      const specific = root ? namespace : [base, context, namespace].filter(Boolean).join("-");
      // A reused parent class represents an equivalent component position, so
      // corresponding children can also reuse classes despite different text.
      // Stateful roots keep their own scope; style/state differences never merge.
      const key = scopedClassNames && !root && !cssNode.stateNames
        ? JSON.stringify([parentScope, scope, cssNode.textLayer ? "text-layer" : specific, cssNode.tag, cssNode.role, cssNode.style, cssNode.responsive ?? [], cssNode.states ?? [], variant?.root ? variant.family : null, variant?.selected.style ?? null])
        : null;
      const reused = key === null ? undefined : sharedClasses.get(key);
      const className = reused ?? namer.name(scopedClassNames ? specific : node.name, node.role);
      if (key !== null && !reused) sharedClasses.set(key, className);
      childScope = className;
      if (variant?.root) modifierSelector = `.${className}--active`;
      attrs.push(["class", variant?.root && variant.active ? `${className} ${className}--active` : className]);
      if (node.stateNames) {
        scope = className;
        attrs.push(["data-state", node.stateNames[0]]);
        node.stateNames.forEach((s) => states.set(s, states.get(s) ?? []));
      }
      if (!reused) {
        if (cssNode.style.length > 0) rules.push(printRule(`.${className}`, cssNode.style));
        for (const { minWidth, style } of cssNode.responsive ?? []) {
          if (!media.has(minWidth)) media.set(minWidth, []);
          media.get(minWidth)!.push(printRule(`.${className}`, style));
        }
        for (const { state, style } of cssNode.states ?? []) {
          const root = `.${scope}[data-state="${state}"]`;
          states.get(state)?.push(printRule(scope === className ? root : `${root} .${className}`, style));
        }
      }
      if (variant?.active && modifierSelector) {
        const selector = variant.root ? modifierSelector : `${modifierSelector} .${className}`;
        const delta = diffStyles(cssNode.style, node.style);
        const modifierKey = JSON.stringify([selector, delta]);
        if (delta.length > 0 && !emittedModifiers.has(modifierKey)) {
          modifierRules.push(printRule(selector, delta));
          emittedModifiers.add(modifierKey);
        }
      }
    }
    const families = scopedClassNames && !variant ? activeVariants(node.children) : undefined;
    return el(
      node.tag,
      [...attrs, ...(node.attrs ?? [])],
      node.children.map((child, index) => {
        let childVariant: ActiveContext | undefined;
        if (variant) {
          const baseline = variant.baseline.children[index];
          const selected = variant.selected.children[index];
          if (baseline.kind === "element" && selected.kind === "element") {
            childVariant = { ...variant, baseline, selected, root: false, selector: modifierSelector };
          }
        } else if (child.kind === "element") {
          const family = families?.get(child);
          if (family) childVariant = { ...family, root: true };
        }
        return convert(child, scope, namespace, !root && base !== node.role ? base : context, false, childScope, childVariant);
      }),
    );
  };

  const pages = tree.map((root) => {
    const namespace = `${classBaseName(root.name, root.role)}-${toKebab(root.sourceId ?? "") || "frame"}`;
    return print([convert(root, null, namespace, "", true)], "html");
  });
  const mediaBlocks = [...media]
    .sort(([a], [b]) => a - b)
    .map(([minWidth, rs]) => `@media (min-width: ${minWidth}px) {\n${indent(rs.join("\n\n"))}\n}`);
  const stateBlocks = [...states]
    .filter(([, rs]) => rs.length > 0)
    .map(([state, rs]) => [`/* State: ${state} */`, ...rs].join("\n\n"));
  return { html: pages.join("\n"), css: [BASE_CSS, ...rules, ...modifierRules, ...mediaBlocks, ...stateBlocks].join("\n\n"), pages };
}

const indent = (text: string) =>
  text
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");

export function printRule(selector: string, decls: Decl[]): string {
  const body = compact(decls)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

const SIDES = ["top", "right", "bottom", "left"] as const;
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

/** Fold longhands back into shorthands where that's lossless and more readable. */
export function compact(decls: Decl[]): Decl[] {
  const map = new Map(decls);
  const result: Decl[] = [];
  const consumed = new Set<string>();

  const shorthand = (name: string, longhands: string[], values: string[]) => {
    const [t, r, b, l] = values;
    let value: string;
    if (t === r && r === b && b === l) value = t;
    else if (t === b && r === l) value = `${t} ${r}`;
    else if (r === l) value = `${t} ${r} ${b}`;
    else value = `${t} ${r} ${b} ${l}`;
    longhands.forEach((p) => consumed.add(p));
    return [name, value] as Decl;
  };

  for (const [prop, value] of decls) {
    if (consumed.has(prop)) continue;

    if (prop.startsWith("padding-")) {
      const longhands = SIDES.map((s) => `padding-${s}`);
      result.push(shorthand("padding", longhands, longhands.map((p) => map.get(p) ?? "0")));
      continue;
    }

    if (prop.startsWith("border-") && prop.endsWith("-radius")) {
      const longhands = CORNERS.map((c) => `border-${c}-radius`);
      if (longhands.every((p) => map.has(p))) {
        result.push(shorthand("border-radius", longhands, longhands.map((p) => map.get(p)!)));
        continue;
      }
    }

    if (prop === "border-width" && map.has("border-style") && map.has("border-color")) {
      result.push(["border", `${value} ${map.get("border-style")} ${map.get("border-color")}`]);
      ["border-style", "border-color"].forEach((p) => consumed.add(p));
      continue;
    }

    if (prop === "outline-width" && map.has("outline-style") && map.has("outline-color")) {
      result.push(["outline", `${value} ${map.get("outline-style")} ${map.get("outline-color")}`]);
      ["outline-style", "outline-color"].forEach((p) => consumed.add(p));
      continue;
    }

    result.push([prop, value]);
  }
  return result;
}
