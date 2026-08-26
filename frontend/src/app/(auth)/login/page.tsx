"use client";

import { useCallback, useEffect } from "react";

export default function LoginPage() {
  const startLogin = useCallback(() => {
    const mindauthUrl =
      process.env.NEXT_PUBLIC_MINDAUTH_URL || "http://localhost:4001";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || "forum";
    const query = new URLSearchParams(window.location.search);
    const returnUrl = query.get("redirect") || query.get("returnUrl") || "/";

    window.location.href = `${mindauthUrl}/authorize?redirect=${redirectUrl}&client_id=${clientId}&response_type=code&state=${encodeURIComponent(returnUrl)}`;
  }, []);

  useEffect(() => {
    startLogin();
  }, [startLogin]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 text-4xl">🔄</div>
        <p className="text-lg text-[var(--text)]">正在跳转到登录页面...</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          如果没有自动跳转，
          <a
            href="#"
            onClick={startLogin}
            className="text-[var(--primary)] hover:underline"
          >
            点击这里
          </a>
        </p>
      </div>
    </div>
  );
}
