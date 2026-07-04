import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f8fafc",
    description: "Prestige Limo operations dashboard.",
    display: "standalone",
    icons: [
      {
        src: "/icons/prestige-ops-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        purpose: "maskable",
        src: "/icons/prestige-ops-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    id: "/",
    name: "Prestige Limo Ops",
    short_name: "Prestige Ops",
    start_url: "/",
    theme_color: "#020617",
  };
}
