/** @type {import('next').NextConfig} */
const nextConfig = {
  // CDN support: prefix for static assets
  assetPrefix: process.env.NEXT_PUBLIC_CDN_URL || '',

  // Transpile the shared package
  transpilePackages: ['@mindproject/shared'],

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_URL || 'http://localhost:4000/api/:path*',
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4001',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.yoursite.com',
        pathname: '/**',
      },
    ],
  },

  // Generate unique build ID for CDN cache invalidation
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
};

module.exports = nextConfig;
