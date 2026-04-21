import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@livepeer/creative-kit", "@livepeer/scope-player"],
};

export default nextConfig;
