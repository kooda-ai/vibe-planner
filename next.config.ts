import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop build bundles the server: `next build` emits a self-contained
  // `.next/standalone` folder that Electron spawns as a child process, so every
  // API route (chat streaming, Codex OAuth callback) keeps working unchanged.
  output: "standalone",
  // Pin the trace root to the project so pnpm's workspace layout does not make
  // Next walk up outside the app.
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => {
    if (process.env.NODE_ENV === "development") {
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: "pre",
        use: "@dyad-sh/nextjs-webpack-component-tagger",
      });
    }
    return config;
  },
};

export default nextConfig;
