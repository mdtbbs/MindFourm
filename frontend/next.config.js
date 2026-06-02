/** @type {import('next').NextConfig} */
const nextConfig = {
  // CDN support: prefix for static assets
  assetPrefix: process.env.NEXT_PUBLIC_CDN_URL || '',

  async rewrites() {
    // Only use rewrites in development (production uses direct API domain)
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_URL || 'http://localhost:4000/api/:path*',
      },
    ];
  },

  images: {
    remotePatterns: [
      // Development
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4000',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4001',
        pathname: '/**',
      },
      // Production - CDN (optional)
      {
        protocol: 'https',
        hostname: 'cdn.yoursite.com',
        pathname: '/**',
      },
      // Production - API domain uploads (avatars, attachments, resources)
      {
        protocol: 'https',
        hostname: 'api.forum.example.com',
        pathname: '/uploads/**',
      },
    ],
  },

  // Generate unique build ID for CDN cache invalidation
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
};

module.exports = nextConfig;
