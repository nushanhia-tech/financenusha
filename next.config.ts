import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes:{"/api/download/**/*":["./assets/fonts/NotoSansMalayalam.ttf"]},
  serverExternalPackages: ["pdfkit","exceljs"],
  experimental: { serverActions: { bodySizeLimit: "4.25mb" } },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  }
};
export default config;
