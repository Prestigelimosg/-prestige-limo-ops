import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f8fafc",
    description: "Prestige Limo operations dashboard.",
    display: "standalone",
    icons: [
      {
        src: "/window.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
    name: "Prestige Limo Ops",
    short_name: "Prestige Ops",
    start_url: "/",
    theme_color: "#020617",
  };
}
