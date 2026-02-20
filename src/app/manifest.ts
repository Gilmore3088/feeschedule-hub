import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bank Fee Index",
    short_name: "BFI",
    description:
      "The national benchmark for retail banking fees across U.S. banks and credit unions.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
  };
}
