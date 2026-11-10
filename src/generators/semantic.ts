import type { FrameNode, TextNode } from "../core/ir";

export interface SemanticResult {
  tag: string;
  attrs?: [name: string, value: string][];
}

/**
 * Infers semantic HTML5 elements from layer names, roles, and hierarchy:
 * - Buttons / CTAs -> <button type="button">
 * - Navigation -> <nav>
 * - Headers, Footers, Asides, Sections, Main -> <header>, <footer>, <aside>, <section>, <main>
 * - Headings & Paragraphs -> <h1>, <h2>, <h3>, <h4>, <p>
 */
export function inferFrameTag(node: FrameNode, parent: FrameNode | null): SemanticResult {
  const name = node.name.trim();

  // 1. Buttons / Action elements (e.g. "Primary Button", "Submit Btn", "CTA", "Login Button")
  if (
    /\b(buttons?|btns?|cta)\b/i.test(name) ||
    /(submit|action|login|signup|buy|order|close|menu|cancel|next|prev|download|upload)[-_ ]?(button|btn)\b/i.test(name)
  ) {
    return { tag: "button", attrs: [["type", "button"]] };
  }

  // 2. Navigation bar / menu
  if (/\b(navbars?|navs?|navigation|nav[-_ ]menu)\b/i.test(name)) {
    return { tag: "nav" };
  }

  // 3. Header / Top bar
  if (/\b(headers?|top[-_ ]?bars?|app[-_ ]?bars?)\b/i.test(name)) {
    return { tag: "header" };
  }

  // 4. Footer / Bottom bar
  if (/\b(footers?|bottom[-_ ]?bars?)\b/i.test(name)) {
    return { tag: "footer" };
  }

  // 5. Sidebar / Aside drawer
  if (/\b(sidebars?|asides?|drawers?)\b/i.test(name)) {
    return { tag: "aside" };
  }

  // 6. Section
  if (/\b(sections?)\b/i.test(name)) {
    return { tag: "section" };
  }

  // 7. Main content (only top-level)
  if (/\b(mains?|hero[-_ ]?sections?|contents?)\b/i.test(name) && parent === null) {
    return { tag: "main" };
  }

  return { tag: "div" };
}

export function inferTextTag(node: TextNode): SemanticResult {
  const name = node.name.trim();
  const maxFontSize = Math.max(0, ...node.text.segments.map((s) => s.fontSize));
  const isBold = node.text.segments.some((s) => s.fontWeight >= 600);

  // Explicit heading names or large hero/page titles
  if (
    /\bh1\b/i.test(name) ||
    /\b(hero[-_ ]?titles?|page[-_ ]?titles?|main[-_ ]?headings?)\b/i.test(name) ||
    maxFontSize >= 36
  ) {
    return { tag: "h1" };
  }

  if (
    /\bh2\b/i.test(name) ||
    /\b(section[-_ ]?titles?|subheadings?)\b/i.test(name) ||
    maxFontSize >= 28
  ) {
    return { tag: "h2" };
  }

  if (
    /\bh3\b/i.test(name) ||
    /\b(card[-_ ]?titles?|item[-_ ]?titles?)\b/i.test(name) ||
    maxFontSize >= 22
  ) {
    return { tag: "h3" };
  }

  if (/\bh4\b/i.test(name) || (maxFontSize >= 18 && isBold)) {
    return { tag: "h4" };
  }

  if (
    /\b(paragraphs?|descriptions?|desc|subtitles?|captions?|body[-_ ]?texts?)\b/i.test(name) ||
    maxFontSize <= 16
  ) {
    return { tag: "p" };
  }

  return { tag: "p" };
}
