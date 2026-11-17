import { describe, expect, it } from "vitest";
import { googleFontLinks, googleFontUrls } from "../src/generators/fonts";
import { frame, segment, text } from "./fixtures";

const urls = (...families: string[]) => googleFontUrls([text(families.map((fontFamily) => segment({ fontFamily })))]);

describe("Google font exclusions", () => {
  it("keeps custom families sharing a system-font prefix", () => {
    for (const family of ["Courier Prime", "Times Custom", "Arial Custom", "Apple Blossom", "SF Custom"]) {
      expect(urls(family)).toEqual([
        `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@0,400&display=swap`,
      ]);
    }
  });

  it("excludes only known system families, case-insensitively", () => {
    expect(urls("", "Arial", "ARIAL", "Helvetica Neue", "Times New Roman", "Courier New", "Segoe UI", "SF Pro Display", "system-ui")).toEqual([]);
  });

  it("deduplicates styles across nested frames and sorts upright before italic", () => {
    const roots = [frame({ children: [text([
      segment({ fontFamily: "Courier Prime", italic: true, fontWeight: 700 }),
      segment({ fontFamily: "Courier Prime", fontWeight: 700 }),
      segment({ fontFamily: "Courier Prime", fontWeight: 400 }),
      segment({ fontFamily: "Courier Prime", fontWeight: 400 }),
    ])] })];
    expect(googleFontUrls(roots).map((url) => url.match(/@(.*)&/)?.[1])).toEqual(["0,400", "0,700", "1,700"]);
    expect(googleFontLinks(roots)).toContain("&amp;display=swap");
  });
});
