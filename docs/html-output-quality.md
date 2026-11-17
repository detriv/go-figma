# HTML output correctness

The generator prioritizes deterministic design translation over inventing missing UI behavior. These safeguards are shared by HTML/CSS, HTML/Tailwind, React/Tailwind and the plain-CSS preview.

## Layout safeguards

- Fluid single-frame output applies fitting rules to the root and descendants. Content groups can wrap; icon/label controls and navigation retain their internal arrangement while their outer boxes are width-constrained. Navigation can scroll locally if its authored contents are too wide. Explicit overlays and table internals keep authored geometry.
- A nested content row made wrapping uses content-driven height with the original height as a minimum, unless explicit height bounds prevent reflow.
- Width inference compares an element with its immediate parent's measured content box, not the entire page. Explicit min/max width constraints remain authoritative.
- Repeated card collections with matching consecutive row wrappers share proportional column slots. An incomplete Fixed-width row can inherit the column count from a full equal-width Fill row when names/components, paint, measured geometry, padding, and gaps agree. Corrected cards use container-relative `calc((100% - totalGap) / columns)`, never a locked card width. In single-frame fluid output the collection is one column below the existing `md` tier and uses its measured column count above it; authored responsive frames retain their own mobile/desktop choices. Full-span, bounded, differently styled/named, wrapped, height-capped, Hug-row and control collections are not reinterpreted. Single tagged frames retain the same mobile fallback as untagged fluid frames. Exact-layout opt-out remains unchanged.
- Merged responsive frames fit their inner containers without inventing additional wrapping or breakpoint behavior. The authored mobile/tablet/desktop layout choices remain the source of truth.
- Data tables scroll in their own container instead of stretching the document.
- Single-frame fluid generation attempts conservative layout inference for simple, contained freeform content. It does not infer state or tagged responsive frames. Rotated, specially constrained, ambiguous/overlapping, or large-whitespace compositions keep authored placement and emit an actionable warning rather than a guessed layout.

## Markup and visual safeguards

- **Frame-specific CSS classes** is enabled by default in plugin Code options, including migrated settings. Generated custom classes include the element name, nearest named container, frame name and stable source-frame id: for example `dropdown-login-12-34` or `dropdown-kota-login-12-34`, not bare `.dropdown`. Separately exported same-named frames within a Figma file do not reuse selectors. Names remain synchronized across HTML, CSS, image-backed preview, MCP design context, responsive/state rules and static export.
- Equivalent repeated peers share one contextual class and one emitted CSS rule, rather than receiving `-2`, `-3` for every sibling. Corresponding descendants of an equivalent reused parent class can share their class too; different label text does not force duplicate styles. Reuse requires the same element role/tag, parent style context, declarations, media overrides and state overrides. Real style or context differences keep separate classes. Runtime modifier classes such as `tab-store-active` can be applied independently to each element.
- Matching sibling component variants with an explicit Figma `active=off/on` (or boolean/true/false) property use one inactive base class plus `--active` on the active component. Only actual differences are emitted in the modifier, including descendant typography and resets for removed declarations. Moving that root modifier also moves the active styling without changing label content. Other component properties must match; all inactive peers and all active peers must each have consistent CSS and compatible subtree structure. Families with responsive/state overrides, missing counterparts, changed structure/assets, or per-instance style conflicts retain separate classes rather than inventing a shared state. This factors authored CSS; it does not add click handlers or application state management.
- Tailwind utility classes are intentionally unchanged. Turning the option off restores legacy names; low-level generator calls omitting the flag retain their legacy behavior for compatibility. The UI/MCP pass the complete sanitized settings. Replace generated HTML **and** CSS together after enabling or changing this option.

- Plural `Buttons` / `Btns` containers are not native buttons. Descendants of a real button use phrasing elements and cannot become nested buttons/headings/paragraphs.
- Resets are attached to generated semantic elements, not unrelated host-page elements: native margins, button padding/borders/background and appearance cannot override the design. Explicit design declarations win over the baseline.
- Regular font weight is emitted explicitly. Intentional text spaces are preserved; fixed-width text can still wrap.
- Known system fonts are matched by exact family name, so custom families such as Courier Prime are not suppressed by a shared prefix. This does not guarantee that every custom font exists on Google Fonts.
- Masked content is exported as an SVG at the immediate containing frame/group when inline SVG is enabled. Its ancestors remain editable. If export is unavailable/disabled, an explicit warning is returned rather than exposing an incorrectly unmasked composition. Such content is no longer editable HTML at the composited scope.
- Groups with opacity/effects or compositing behavior retain a wrapper instead of being flattened.
- MCP design context honors the semantic/fluid settings stored in the plugin, as do normal generation and project export. Annotation attributes and asset paths intentionally differ by output purpose.

## Repeatable checks

```bash
npm install
npm test
npm run typecheck
npm run test:browser
npm run build
```

Browser checks run through Playwright. On Windows the config uses installed Google Chrome when available. Else install the matching Chromium build with `npx playwright install chromium`. `PLAYWRIGHT_CHANNEL` can select another installed channel.

The browser suite checks document overflow, flow-element geometry, DOM structure, computed typography/control defaults, whitespace preservation, local table scrolling, and exported HTML. It tests intermediate and breakpoint-edge viewport widths, not only the design's original width. Network requests are blocked and a local font is used for reproducible geometry; this is **not** a test of remote font availability or image downloads.

Failures retain screenshots/traces under `test-results/` (git-ignored). Unit fixtures cover generator settings, normalization fallbacks, and styles for each output target. Generated HTML/CSS should not be approved solely because its string snapshots pass.

## Limits and next acceptance step

An arbitrary desktop artwork cannot always become a usable mobile UI without authored layout intent. Explicit minimum sizes, absolute overlays, navigation, and unsupported effects may still require design input. Warnings are not a guarantee of zero visual differences. Avoid hiding the document's horizontal overflow as a substitute for fixing its geometry.

For pixel-fidelity acceptance, provide representative real Figma frames (including mobile variants), fonts, and screenshots. Compare those exact frames with browser renders and approve visual baselines before enabling screenshot-diff gates. The current browser tests establish structural/geometric correctness on controlled fixtures; they do not claim pixel-perfect parity with an unseen design.
