import type { NextConfig } from "next";
import {
  resolveSafeAnesDistDir,
  resolveSafeAnesTsconfigPath,
} from "./next-dist-dir";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  distDir: resolveSafeAnesDistDir(process.env.SAFEANES_NEXT_DIST_DIR),
  typescript: {
    tsconfigPath: resolveSafeAnesTsconfigPath(process.env.SAFEANES_TSCONFIG_PATH),
  },
};

export default nextConfig;
