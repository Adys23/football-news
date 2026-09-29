import type { NextConfig } from "next";
import { articleImagePatterns } from "./lib/image-delivery";

const nextConfig: NextConfig = {
  // Przegladarka automatyzacji i niektore klienty wchodza przez 127.0.0.1,
  // podczas gdy `next dev` reklamuje localhost.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    // Wymagane od Next.js 16; jedna jakosc wystarcza i nie daje optymalizowac dowolnych wariantow.
    qualities: [75],
    // Tylko bucket article-images projektu. Obrazy z adresow lokalnych ida jako unoptimized
    // (lib/image-delivery.ts), wiec dangerouslyAllowLocalIP zostaje wylaczone.
    remotePatterns: articleImagePatterns(process.env.NEXT_PUBLIC_SUPABASE_URL),
  },
};

export default nextConfig;
