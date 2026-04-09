/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb"
    },
    serverComponentsExternalPackages: ["pdfkit", "fontkit", "restructure", "linebreak"]
  }
};

export default nextConfig;
