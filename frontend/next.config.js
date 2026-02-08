/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://moltiverse-hackathon.vercel.app/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
