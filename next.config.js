/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow requests from the Chrome extension
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, X-Extension-Version",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
