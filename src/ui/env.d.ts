// esbuild bundles CSS imports into dist/ui.html.
declare module "*.css";

// Raster UI assets are embedded as data URLs so the Figma plugin remains a
// self-contained HTML file.
declare module "*.png" {
  const url: string;
  export default url;
}
