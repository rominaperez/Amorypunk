import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Amor & Punk",
    short_name: "A&P",
    description: "Gestión del showroom Amor & Punk",
    start_url: "/",
    scope: "/",
    orientation: "portrait",
    categories: ["business", "productivity"],
    display: "standalone",
    background_color: "#0E0B0C",
    theme_color: "#151012",
    lang: "es-AR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
