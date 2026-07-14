/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security: Hide technology stack
  poweredByHeader: false,

  // CDN support: prefix for static assets
  assetPrefix: process.env.NEXT_PUBLIC_CDN_URL || '',

  // Production: standalone output for PM2 (no full node_modules needed)
  output: 'standalone',

  async rewrites() {
    // 生产和开发环境都使用 rewrites
    // 浏览器请求 /api/* 和 /uploads/* 时，由 Next.js 代理到后端
    const apiUrl = process.env.API_URL || 'http://127.0.0.1:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`,
      },
    ];
  },

  images: {
    remotePatterns: [
      // Development — 后端和 MindAuth
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4000',
        pathname: '/uploads/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4001',
        pathname: '/uploads/**',
      },
      // Production — 部署时替换为真实域名
      // 如果使用 CDN 托管静态资源
      // {
      //   protocol: 'https',
      //   hostname: 'cdn.example.com',
      //   pathname: '/**',
      // },
      // MindAuth 托管的头像
      // {
      //   protocol: 'https',
      //   hostname: 'auth.example.com',
      //   pathname: '/uploads/**',
      // },
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
