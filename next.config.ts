import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Przegladarka automatyzacji i niektore klienty wchodza przez 127.0.0.1,
  // podczas gdy `next dev` reklamuje localhost.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
