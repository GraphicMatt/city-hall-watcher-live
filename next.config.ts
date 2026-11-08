import type { NextConfig } from "next";

// Extra hostnames allowed to reach the dev server (for example a tunnel used to
// test on a phone). Comma-separated, set in .env.local. Has no effect in production.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
