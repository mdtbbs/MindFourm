/**
 * Middleware - Route protection for authenticated and admin routes
 *
 * This middleware runs before page components and:
 * 1. Protects admin routes (/admin/*) - requires authentication
 * 2. Protects authenticated routes (/notifications, /messages, /bookmarks, /settings)
 * 3. Redirects unauthenticated users to /login
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const AUTH_REQUIRED_ROUTES = [
  '/notifications',
  '/messages',
  '/bookmarks',
  '/settings',
  '/apply-server',
];

// Routes that require admin role (checked at component level)
const ADMIN_ROUTES = ['/admin'];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const sessionToken = request.cookies.get('forum_session');

  // Check if route requires authentication
  const requiresAuth = AUTH_REQUIRED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  const isAdminRoute = ADMIN_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Redirect to login if no session token on protected routes
  if ((requiresAuth || isAdminRoute) && !sessionToken) {
    const loginUrl = new URL('/login', request.url);
    // Store the intended destination for redirect after login
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Continue to the requested page
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Admin routes
    '/admin/:path*',
    // Auth-required routes
    '/notifications/:path*',
    '/messages/:path*',
    '/bookmarks/:path*',
    '/settings/:path*',
    '/apply-server/:path*',
    // Specific routes without children
    '/notifications',
    '/messages',
    '/bookmarks',
    '/settings',
    '/apply-server',
  ],
};