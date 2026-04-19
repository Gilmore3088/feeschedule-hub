// Twitter uses the same image as OpenGraph. Re-export from opengraph-image so
// we maintain one visual source of truth and Next picks it up via the
// file-routing convention (summary_large_image card set in layout.tsx).
export { default, alt, size, contentType } from "./opengraph-image";
