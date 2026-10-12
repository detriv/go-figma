import { imageFits } from "../core/imageFit";
import type { ImageAsset, IRNode } from "../core/ir";
import type { Warnings } from "../core/warnings";
import { PREVIEW_IMAGE_PREFIX, type CodeSection, type GenerateResult, type PreviewSize } from "../shared/messages";
import type { Settings } from "../shared/settings";
import type { StyleContext } from "./css";
import { googleFontLinks } from "./fonts";
import { generateHtmlCss } from "./htmlCss";
import { el, print, text } from "../core/markup";
import { breakpointLabel, pageGroups, pageName, previewWidth } from "./responsive";
import { generateTailwind } from "./tailwind";
import { buildTree } from "./tree";

export const IMAGE_DIR = "images";

export function generate(
  roots: IRNode[],
  images: ImageAsset[],
  settings: Pick<Settings, "target">,
  warnings: Warnings,
): GenerateResult {
  const byHash = new Map(images.map((i) => [i.hash, i]));
  const filePath = (hash: string) => `${IMAGE_DIR}/${byHash.get(hash)?.fileName ?? hash}`;

  const codeCtx: StyleContext = { warnings, imageUrl: filePath };
  const tree = buildTree(roots, codeCtx);
  // The preview always renders plain HTML + CSS; the plugin iframe has no
  // network access and can't read local files, so images are placeholders.
  const previewTree = images.length === 0 ? tree : buildTree(roots, { warnings, imageUrl: (hash) => PREVIEW_IMAGE_PREFIX + hash });
  const preview = generateHtmlCss(previewTree);

  let sections: CodeSection[];
  switch (settings.target) {
    case "html-css": {
      const code = previewTree === tree ? preview : generateHtmlCss(tree);
      sections = [
        { title: "HTML", language: "HTML", code: code.html },
        { title: "CSS", language: "CSS", code: code.css },
      ];
      break;
    }
    case "react-tailwind":
      sections = [{ title: "React", language: "JAVASCRIPT", code: generateTailwind(tree, "jsx") }];
      break;
    case "html-tailwind":
      sections = [{ title: "HTML", language: "HTML", code: generateTailwind(tree, "html") }];
      break;
  }

  const previewSizes = mergedPreviews(roots);
  const fits = imageFits(roots, images);
  return {
    sections,
    previewHtml: previewDocument(separatedPages(roots, preview.pages), preview.css, googleFontLinks(roots)),
    previewSize: previewSizes?.[previewSizes.length - 1] ?? {
      width: Math.max(0, ...roots.map((r) => r.box.width)),
      height: roots.reduce((sum, r) => sum + r.box.height, 0),
    },
    ...(previewSizes ? { previewSizes } : {}),
    warnings: warnings.list(),
    images: images.map((i) => ({ hash: i.hash, fileName: i.fileName, bytes: i.bytes, fit: fits.get(i.hash) })),
    previewImages: images.map((i) => i.hash),
  };
}

/**
 * One preview per tagged frame of a merged page: a responsive page at a width
 * inside each frame's breakpoint, a page with states in each state.
 */
function mergedPreviews(roots: IRNode[]): PreviewSize[] | undefined {
  const groups = pageGroups(roots);
  const merged = groups.find((g) => g.length > 1);
  if (!merged) return undefined;
  return merged.map((screen) => ({
    ...(screen.breakpoint
      ? { label: breakpointLabel(screen.breakpoint), width: previewWidth(screen) }
      : { label: screen.state!, width: Math.round(screen.box.width), state: screen.state }),
    height: groups.reduce((sum, g) => sum + (g === merged ? screen.box.height : g[0].box.height), 0),
  }));
}

/**
 * Several pages preview one below the other; each gets a band with its name so
 * they don't run into each other. Only the preview has it, not the code.
 */
function separatedPages(roots: IRNode[], pages: string[]): string {
  if (pages.length < 2) return pages.join("\n");
  const groups = pageGroups(roots);
  return pages
    .map((page, i) => {
      const label = print([el("div", [["class", PREVIEW_PAGE_LABEL]], [text(pageName(groups[i]))])], "html");
      return `<section class="${PREVIEW_PAGE}">\n${label}\n${page}\n</section>`;
    })
    .join("\n");
}

const PREVIEW_PAGE = "goapp-preview-page";
const PREVIEW_PAGE_LABEL = "goapp-preview-page-label";

/**
 * The plugin window sets `--goapp-ui` to how much it scales the preview down,
 * so the page bands keep a readable size at any zoom.
 */
const PREVIEW_PAGE_CSS = `.${PREVIEW_PAGE} { display: flow-root; }
.${PREVIEW_PAGE} + .${PREVIEW_PAGE} { margin-top: calc(24px * var(--goapp-ui, 1)); }
.${PREVIEW_PAGE_LABEL} {
  padding: calc(6px * var(--goapp-ui, 1)) calc(10px * var(--goapp-ui, 1));
  background: #2c2c2c;
  color: #fff;
  font: 600 calc(11px * var(--goapp-ui, 1)) / 1.4 system-ui, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}`;

function previewDocument(html: string, css: string, fontLinks: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${fontLinks}
<style>
body { margin: 0; font-family: sans-serif; }
${css}
${PREVIEW_PAGE_CSS}
</style>
</head>
<body>
${html}
</body>
</html>`;
}
