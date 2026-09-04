/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Security: Hide technology stack
  poweredByHeader: false,

  // CDN support: prefix for static assets
  assetPrefix: process.env.NEXT_PUBLIC_CDN_URL || '',

  // Production: standalone output (smaller deployment tree, only needed deps)
  output: 'standalone',

  // Pin file-tracing root to this package directory. Without this, Next.js
  // walks upward looking for a lockfile. When it finds multiple lockfiles
  // (monorepo root + frontend + a stray one on BT Panel at /www/wwwroot/),
  // it treats the project as a monorepo workspace and nests the standalone
  // output under `.next/standalone/frontend/server.js` instead of
  // `.next/standalone/server.js`. Forcing the root to the frontend
  // directory keeps the standalone layout flat regardless of lockfiles
  // above the project.
  outputFileTracingRoot: __dirname,

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
    // Report-only first: Next.js and a few editor/OAuth integrations currently
    // rely on inline bootstrap code. Reports let us tighten this without making
    // a production navigation fail closed during the transition.
    const cspReportOnly = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https: wss:",
      "media-src 'self' blob: https:",
      "worker-src 'self' blob:",
      "report-uri /api/security/csp-reports",
    ].join('; ');
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Expect-CT', value: 'max-age=86400, enforce' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
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
