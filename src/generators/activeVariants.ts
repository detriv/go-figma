// Recognized Figma active variants share component identity, not identical paint.
// Only factor CSS-only, structurally compatible sibling families. Unclassified
// differences and responsive/stateful subtrees retain ordinary class allocation.
import type { StyledChild, StyledElement } from "./tree";

export interface ActiveVariant {
  family: string;
  baseline: StyledElement;
  selected: StyledElement;
  active: boolean;
}

function identity(node: StyledElement): { family: string; active: boolean } | null {
  const component = node.component;
  if (!component) return null;
  const props = Object.entries(component.properties);
  const flags = props.filter(([key]) => key.trim().toLowerCase() === "active");
  if (flags.length !== 1) return null;
  const value = flags[0][1];
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  const active = normalized === true || normalized === "on" || normalized === "true";
  if (!active && normalized !== false && normalized !== "off" && normalized !== "false") return null;
  const rest = props.filter(([key]) => key !== flags[0][0]).sort(([a], [b]) => a.localeCompare(b));
  return { family: JSON.stringify([component.name, rest]), active };
}

function compatible(actual: StyledChild, base: StyledChild, root = true): boolean {
  if (actual.kind !== base.kind) return false;
  if (actual.kind === "text") return true;
  if (actual.kind === "raw") return base.kind === "raw" && actual.markup === base.markup;
  if (base.kind !== "element") return false;
  if (actual.tag !== base.tag || actual.role !== base.role || actual.textLayer !== base.textLayer ||
    actual.responsive?.length || base.responsive?.length || actual.states?.length || base.states?.length ||
    actual.stateNames || base.stateNames || actual.children.length !== base.children.length) return false;
  if (!root && !actual.textLayer && actual.name !== base.name) return false;
  return actual.children.every((child, index) => compatible(child, base.children[index], false));
}

function styleKey(node: StyledChild): unknown {
  return node.kind === "element"
    ? [node.tag, node.role, node.style, node.children.map(styleKey)]
    : node.kind === "raw" ? ["raw", node.markup] : ["text"];
}

export function activeVariants(children: StyledChild[]): Map<StyledElement, ActiveVariant> {
  const families = new Map<string, { node: StyledElement; active: boolean }[]>();
  for (const child of children) {
    if (child.kind !== "element") continue;
    const variant = identity(child);
    if (!variant) continue;
    const group = families.get(variant.family) ?? [];
    group.push({ node: child, active: variant.active });
    families.set(variant.family, group);
  }

  const result = new Map<StyledElement, ActiveVariant>();
  for (const [family, group] of families) {
    const baseline = group.find((item) => !item.active)?.node;
    const selected = group.find((item) => item.active)?.node;
    if (!baseline || !selected || group.some(({ node }) => !compatible(node, baseline))) continue;
    const inactiveKey = JSON.stringify(styleKey(baseline));
    const activeKey = JSON.stringify(styleKey(selected));
    if (group.some(({ node, active }) => JSON.stringify(styleKey(node)) !== (active ? activeKey : inactiveKey))) continue;
    for (const { node, active } of group) result.set(node, { family, baseline, selected, active });
  }
  return result;
}
