import type { IRNode } from "../core/ir";

// Fonts that ship with operating systems and aren't on Google Fonts.
const SYSTEM_FONTS = new Set([
  "arial", "arial black", "arial narrow", "helvetica", "helvetica neue",
  "times", "times new roman", "georgia", "verdana", "tahoma", "trebuchet ms",
  "courier", "courier new", "segoe ui", "segoe ui variable", "segoe ui symbol", "segoe ui emoji",
  "sf pro", "sf pro display", "sf pro text", "sf compact", "sf compact display", "sf compact text", "sf mono",
  "san francisco", "apple color emoji", "apple symbols", "system-ui", "menlo", "consolas", "calibri", "cambria",
]);

/**
 * Google Fonts stylesheet URLs for the fonts used in the design. One URL per
 * family and style: the API rejects the whole request if any family or weight
 * is unknown (Lato has no 500 or 800), so a missing style only fails on its
 * own and the browser falls back to the nearest weight that did load.
 */
export function googleFontUrls(roots: IRNode[]): string[] {
  const usage = new Map<string, Set<string>>();
  const walk = (node: IRNode) => {
    if (node.kind === "text") {
      for (const s of node.text.segments) {
        if (s.fontFamily === "" || SYSTEM_FONTS.has(s.fontFamily.toLowerCase())) continue;
        const styles = usage.get(s.fontFamily) ?? new Set<string>();
        styles.add(`${s.italic ? 1 : 0},${Math.round(s.fontWeight)}`);
        usage.set(s.fontFamily, styles);
      }
    }
    if (node.kind === "frame") node.children.forEach(walk);
  };
  roots.forEach(walk);

  return [...usage].flatMap(([family, styles]) => {
    const name = encodeURIComponent(family).replace(/%20/g, "+");
    const sorted = [...styles].sort((a, b) => {
      const [ia, wa] = a.split(",").map(Number);
      const [ib, wb] = b.split(",").map(Number);
      return ia - ib || wa - wb;
    });
    return sorted.map((tuple) => `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${tuple}&display=swap`);
  });
}

export function googleFontLinks(roots: IRNode[]): string {
  return googleFontUrls(roots)
    .map((url) => `<link rel="stylesheet" href="${url.replace(/&/g, "&amp;")}">`)
    .join("\n");
}
