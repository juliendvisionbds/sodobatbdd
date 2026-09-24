import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres"],
  experimental: {
    serverActions: {
      // dépôt de devis PDF (jusqu'à ~9 Mo constatés dans le lot initial)
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
