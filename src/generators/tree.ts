// IR → styled element tree. Target-agnostic: each element carries its CSS
// declarations; the HTML+CSS and Tailwind generators decide how to attach them.
import type { FrameNode, IRNode, TextNode } from "../core/ir";
import { inferResponsiveLayout } from "../core/inferLayout";
import { commonDecls, nodeStyle, segmentStyle, withoutDecls, type Decl, type StyleContext } from "./css";
import { alignColumnSlots } from "./columnSlots";
import { inferFrameTag, inferTextTag } from "./semantic";
import { makeFluidTree, mergeScreens, mergeStates, pageGroups, pageName } from "./responsive";

export interface StyledElement {
  kind: "element";
  tag: string;
  /** Layer name, used for class / component names. */
  name: string;
  /** Fallback name when the layer name is Figma's default ("Frame 12"). */
  role: string;
  style: Decl[];
  /** Overrides from larger breakpoints, smallest first (responsive pages only). */
  responsive?: ResponsiveStyle[];
  /** Overrides while the page is in another state (pages with states only). */
  states?: StateStyle[];
  /** Root of a page with states: every state, the default first. Printed as `data-state` on the root. */
  stateNames?: string[];
  /** Attributes other than the class, printed after it. */
  attrs?: [name: string, value: string][];
  children: StyledChild[];
}

export interface ResponsiveStyle {
  /** Applies from this viewport width up: `@media (min-width: …)`. */
  minWidth: number;
  /** Tailwind variant for the same width ("md", "lg"). */
  prefix: string;
  style: Decl[];
}

export interface StateStyle {
  /** Applies while the page root has `data-state="…"`. */
  state: string;
  style: Decl[];
}

export type StyledChild = StyledElement | { kind: "text"; text: string } | { kind: "raw"; markup: string };

/** One element per page (see `pageGroups`): frames tagged with breakpoints, or with states, merge into one. */
export function buildTree(roots: IRNode[], ctx: StyleContext): StyledElement[] {
  return pageGroups(roots, ctx.warnings).map((group) => {
    if (group.length === 1) {
      const root = ctx.fluidSingleFrame && !group[0].state && !group[0].breakpoint
        ? inferResponsiveLayout(group[0], ctx.warnings)
        : group[0];
      const node = buildNode(root, null, ctx);
      if (!ctx.fluidSingleFrame) return node;
      const fluid = makeFluidTree(node, root.box.width);
      return root.state ? fluid : alignColumnSlots(root, fluid, true);
    }
    const screens = group.map((root) => {
      const node = buildNode(root, null, ctx);
      return root.breakpoint ? alignColumnSlots(root, node, false) : node;
    });
    return group[0].breakpoint
      ? mergeScreens(
          screens,
          group.map((root) => root.breakpoint!),
          pageName(group),
          ctx.warnings,
        )
      : mergeStates(
          screens,
          group.map((root) => root.state!),
          pageName(group),
          ctx.warnings,
        );
  });
}

function buildNode(node: IRNode, parent: FrameNode | null, ctx: StyleContext, inButton = false): StyledElement {
  const style = nodeStyle(node, parent, ctx);
  const attrs = ctx.annotate ? sourceAttrs(node) : [];

  // A button accepts phrasing content only. Carry this through every wrapper,
  // not just the direct parent, so nested action-like layers stay presentational.
  let tag = inButton ? "span" : "div";
  let semanticAttrs: [string, string][] = [];
  const extraDecls: Decl[] = [];

  if (ctx.semanticHtml && node.kind === "frame" && !inButton) {
    const semantic = inferFrameTag(node, parent);
    tag = semantic.tag;
    if (semantic.attrs) semanticAttrs = semantic.attrs;
    if (tag === "button" && !style.some(([p]) => p === "cursor")) {
      extraDecls.push(["cursor", "pointer"]);
    }
  }

  const allAttrs = [...semanticAttrs, ...attrs];
  const element = (role: string, children: StyledChild[], extra: Decl[] = []): StyledElement => ({
    kind: "element",
    tag,
    name: node.name,
    role: tag !== "div" ? tag : role,
    style: withBaseline(tag, [...style, ...extraDecls, ...extra]),
    ...(allAttrs.length > 0 ? { attrs: allAttrs } : {}),
    children,
  });

  switch (node.kind) {
    case "frame":
      return element(
        "frame",
        node.children.map((child) => buildNode(child, node, ctx, inButton || tag === "button")),
      );
    case "shape":
      return element("shape", []);
    case "svg":
      if (ctx.svgUrl) {
        return { ...element("icon", []), tag: "img", attrs: [["src", ctx.svgUrl(node)], ["alt", node.name], ...attrs] };
      }
      return element("icon", [{ kind: "raw", markup: node.svg }]);
    case "text":
      return { ...buildText(node, style, ctx, inButton), ...(attrs.length > 0 ? { attrs } : {}) };
  }
}

/** Where an element came from in Figma, so an agent can map it back to layers and components. */
function sourceAttrs(node: IRNode): [string, string][] {
  const attrs: [string, string][] = [
    ["data-node-id", node.id],
    ["data-name", node.name],
  ];
  if (node.component) {
    attrs.push([node.component.definition ? "data-component-definition" : "data-component", node.component.name]);
    const props = Object.entries(node.component.properties).map(([key, value]) => `${key}=${value}`);
    if (props.length > 0) attrs.push(["data-props", props.join(", ")]);
  }
  if (node.annotations) attrs.push(["data-annotation", node.annotations.join(" | ")]);
  return attrs;
}

function buildText(node: TextNode, style: Decl[], ctx: StyleContext, inButton: boolean): StyledElement {
  const { segments } = node.text;
  const segmentDecls = segments.map((s) => segmentStyle(s, ctx.warnings));
  // Hoist typography shared by every segment onto the element itself.
  const shared = commonDecls(segmentDecls);

  let children: StyledChild[] = segments.map((segment, i) => {
    const own = withoutDecls(segmentDecls[i], shared);
    const content: StyledChild = { kind: "text", text: segment.text };
    return own.length === 0
      ? content
      : { kind: "element", tag: "span", name: `${node.name} span`, role: "span", style: own, children: [content] };
  });

  // A flex column (vertical alignment) would split runs into separate flex items.
  const isFlex = style.some(([p, v]) => p === "display" && v === "flex");
  if (isFlex) {
    children = [{ kind: "element", tag: "span", name: "", role: "span", style: [], children }];
  }

  const tag = inButton ? "span" : ctx.semanticHtml ? inferTextTag(node).tag : "div";
  return { kind: "element", tag, name: node.name, role: tag !== "div" ? tag : "text", style: withBaseline(tag, [...style, ...shared]), children };
}

/** Reset only emitted semantic elements, with design declarations winning.
 * Keeping these in the shared tree gives HTML and Tailwind the same intent,
 * without resetting the host document's body or unrelated headings/buttons.
 */
function withBaseline(tag: string, style: Decl[]): Decl[] {
  const defaults: Decl[] = [];
  if (tag === "button" || /^(p|h[1-6])$/.test(tag)) {
    for (const side of ["top", "right", "bottom", "left"]) defaults.push([`margin-${side}`, "0"]);
  }
  if (tag === "button") {
    defaults.push(
      ["display", "block"], ["font", "inherit"], ["color", "inherit"],
      ["text-align", "left"], ["appearance", "none"],
      ["background-color", "transparent"], ["background-image", "none"],
      ["border-width", "0"], ["border-style", "solid"], ["border-color", "currentColor"],
    );
    for (const side of ["top", "right", "bottom", "left"]) defaults.push([`padding-${side}`, "0"]);
  }
  // Phrasing wrappers still represent design boxes, not inline text runs.
  // Styled run spans never pass through this helper.
  if (tag === "span") defaults.push(["display", "block"]);
  return [...new Map([...defaults, ...style]).entries()];
}
