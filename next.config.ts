import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating dev-mode indicator; it overlaps the Sources trash row.
  devIndicators: false,
};

export default nextConfig;
