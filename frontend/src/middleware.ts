/**
 * Middleware - Route protection for authenticated and admin routes
 *
 * This middleware runs before page components and:
 * 1. Protects admin routes (/admin/*) - requires authentication
 * 2. Protects authenticated routes (/notifications, /messages, /bookmarks, /settings)
 * 3. Redirects unauthenticated users to /login
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { normalizeLocale } from '@/i18n';
import { siteProfile } from '@/config/site-profile';

// Routes that require authentication
const AUTH_REQUIRED_ROUTES = [
  "/notifications",
  "/messages",
  "/bookmarks",
  "/settings",
  "/apply-server",
];

// Routes that require admin role (checked at component level)
const ADMIN_ROUTES = ["/admin"];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const sessionToken = request.cookies.get("forum_session");

  const explicitLocale = request.nextUrl.searchParams.get('lang');
  const normalizedLocale = normalizeLocale(explicitLocale);
  if (explicitLocale && normalizedLocale) {
    const destination = request.nextUrl.clone();
    destination.searchParams.delete('lang');
    const response = NextResponse.redirect(destination);
    response.cookies.set('forum_locale', normalizedLocale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' });
    response.cookies.set('forum_locale_explicit', normalizedLocale, { path: '/', maxAge: 300, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:' });
    return response;
  }

  if ((!siteProfile.features.phoneVerification && pathname.startsWith('/verify-phone'))
    || (!siteProfile.features.lanlink && pathname.startsWith('/lanlink'))
    || (!siteProfile.features.serverApplications && (pathname === '/apply-server' || pathname.startsWith('/apply-server/') || pathname === '/servers/apply'))
    || (!siteProfile.features.developerFeed && pathname.startsWith('/developer-feed'))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // The legacy home-page category filter duplicates the canonical category
  // route. Preserve old links, but keep one indexable URL with a real 301.
  const legacyCategoryId =
    pathname === "/" ? request.nextUrl.searchParams.get("category_id") : null;
  if (legacyCategoryId && /^\d+$/.test(legacyCategoryId)) {
    const categoryUrl = request.nextUrl.clone();
    categoryUrl.pathname = `/categories/${legacyCategoryId}`;
    categoryUrl.searchParams.delete("category_id");
    return NextResponse.redirect(categoryUrl, 301);
  }

  // Check if route requires authentication
  const requiresAuth = AUTH_REQUIRED_ROUTES.some((route) =>
    pathname.startsWith(route),
  );

  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  // Redirect to login if no session token on protected routes
  if ((requiresAuth || isAdminRoute) && !sessionToken) {
    const loginUrl = new URL("/login", request.url);
    // Store the intended destination for redirect after login
    loginUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  // Continue to the requested page
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-mindforum-path', pathname);
  return NextResponse.next({ request: { headers: forwardedHeaders } });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|uploads|assets).*)",
  ],
};
