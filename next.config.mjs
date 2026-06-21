/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb"
    }
  },
  serverExternalPackages: ["pdfkit", "fontkit", "restructure", "linebreak"]
};

export default nextConfig;
