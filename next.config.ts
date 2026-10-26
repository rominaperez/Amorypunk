import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;

// Permite usar los bindings de Cloudflare en `next dev`
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
