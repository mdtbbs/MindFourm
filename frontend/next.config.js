/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security: Hide technology stack
  poweredByHeader: false,

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
        destination: process.env.API_URL || 'http://localhost:4500/api/:path*',
      },
    ];
  },

  images: {
    remotePatterns: [
      // Development
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4500',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4501',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4500',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4501',
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

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  // Generate unique build ID for CDN cache invalidation
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
};

module.exports = nextConfig;
