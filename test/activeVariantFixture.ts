import type { AutoLayout, FrameNode, TextNode } from "../src/core/ir";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import { frame, segment, shape, text, WHITE } from "./fixtures";

export const ACTIVE_TAB_BASE = "tab-tab-3250-81567";
export const ACTIVE_TAB_MODIFIER = `${ACTIVE_TAB_BASE}--active`;
// Deliberately retain the public defaults (including fluid fitting and semantic HTML).
export const ACTIVE_TAB_SETTINGS = { ...DEFAULT_SETTINGS, target: "html-css" as const, scopedClassNames: true };

const row = (sidePadding = 0): AutoLayout => ({
  direction: "row", gap: 0, crossGap: 0, wrap: false, justify: "center", align: "center",
  padding: { top: sidePadding ? 10 : 0, right: sidePadding, bottom: sidePadding ? 10 : 0, left: sidePadding },
});

/** Real tab differences are intentional: only naming/factoring should change them. */
export function activeVariantFixture(options: { activeFirst?: boolean; shadow?: boolean } = {}): FrameNode {
  const children = ["Lite", "Basic", "Pro"].map((label, index) => {
    const active = label === "Pro";
    return frame({
      id: `3250:${81568 + index}`, name: "tab",
      component: { name: "tab", properties: { type: "capsule", active: active ? "on" : "off" } },
      box: { x: index * 173, y: 0, width: active ? 143 : 173, height: 40, rotation: 0 },
      sizing: { horizontal: "fixed", vertical: active ? "fixed" : "fill" },
      layout: row(active ? 10 : 16),
      fills: active ? [{ type: "solid", color: { ...WHITE } }] : [],
      effects: active && options.shadow ? [{ type: "shadow", inset: false, x: 0, y: 2, blur: 4, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.15 } }] : [],
      children: [text([segment({
        text: label, fontFamily: "Arial", fontSize: 14, fontWeight: active ? 500 : 400,
        color: active ? { r: 96 / 255, g: 152 / 255, b: 1, a: 1 } : { r: 64 / 255, g: 64 / 255, b: 64 / 255, a: 1 },
        lineHeight: { value: 20, unit: "px" },
      })], {
        id: `3250:${81571 + index}`, name: label,
        box: { x: 0, y: 0, width: 100, height: 20, rotation: 0 },
      })],
    });
  });
  if (options.activeFirst) children.unshift(children.pop()!);
  return frame({
    id: "3250:81567", name: "Tab", layout: row(),
    box: { x: 0, y: 0, width: 600, height: 60, rotation: 0 }, children,
  });
}

export function tabPeers(root: FrameNode): FrameNode[] {
  return root.children as FrameNode[];
}
export function tabLabel(tab: FrameNode): TextNode {
  return tab.children[0] as TextNode;
}

/** Equal inactive slots may still need different active descendant selectors. */
export function activeVariantMultiLabelFixture(): FrameNode {
  const root = activeVariantFixture();
  for (const tab of tabPeers(root)) {
    const secondary = structuredClone(tabLabel(tab));
    secondary.id += "-secondary";
    secondary.name = "Secondary label";
    secondary.text.segments[0].text += " details";
    if (tab.component!.properties.active === "on") {
      secondary.text.segments[0].color = { r: 1, g: 0, b: 0, a: 1 };
    }
    tab.children.push(secondary);
  }
  return root;
}

export const FALLBACK_CASES = ["missing-off", "different-properties", "different-component", "incompatible-subtree", "responsive-descendant", "state-descendant"] as const;
export type ActiveFallbackCase = typeof FALLBACK_CASES[number];

/** Each unsafe family must preserve the previous distinct-class rendering. */
export function activeFallbackFixture(kind: ActiveFallbackCase): FrameNode[] {
  const root = activeVariantFixture();
  const peers = tabPeers(root);
  const active = peers[2];
  switch (kind) {
    case "missing-off":
      for (const peer of peers.slice(0, 2)) delete peer.component;
      break;
    case "different-properties":
      active.component!.properties.type = "square";
      break;
    case "different-component":
      active.component!.name = "unrelated-tab";
      break;
    case "incompatible-subtree":
      active.children.push(shape({ id: "3250:81599", name: "Status dot" }));
      break;
    case "responsive-descendant":
    case "state-descendant": {
      const alternate = structuredClone(root);
      alternate.id = "3250:81600";
      // Only a descendant differs: shallow root-only safety checks are insufficient.
      tabLabel(tabPeers(alternate)[0]).text.segments[0].fontSize = 18;
      if (kind === "responsive-descendant") {
        root.breakpoint = "mobile";
        alternate.breakpoint = "desktop";
      } else {
        root.state = "default";
        alternate.state = "error";
      }
      return [root, alternate];
    }
  }
  return [root];
}
