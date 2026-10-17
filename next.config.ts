import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${apiUrl}/api/auth/:path*`,
      },
      {
        source: "/api/projects/:path*",
        destination: `${apiUrl}/api/projects/:path*`,
      },
      {
        source: "/api/projects",
        destination: `${apiUrl}/api/projects`,
      },
    ];
  },
};

export default nextConfig;
