/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security: Hide technology stack
  poweredByHeader: false,

  // CDN support: prefix for static assets
  assetPrefix: process.env.NEXT_PUBLIC_CDN_URL || '',

  // Production: standalone output for PM2 (no full node_modules needed)
  output: 'standalone',

  // Production: strip console.log/warn/info, keep error
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Tree-shake icon libraries — avoid bundling entire lucide-react
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },

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

  // Derived from the commit, not the clock. A timestamp changed the build id on every
  // build, invalidating every static asset — including unchanged chunks — which threw
  // away returning visitors' caches, hurt Core Web Vitals field data, and broke CDN
  // and multi-instance cache coherence during a rolling deploy.
  generateBuildId: async () => {
    const fromEnv =
      process.env.NEXT_BUILD_ID ||
      process.env.GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA;
    if (fromEnv) return fromEnv.slice(0, 12);

    try {
      const { execSync } = require('child_process');
      return execSync('git rev-parse --short=12 HEAD', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {
      // Outside a git checkout (a source tarball, say) fall back to Next's default.
      return null;
    }
  },
};

module.exports = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})(nextConfig);
