"use client";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PhoneVerificationForm from "@/components/auth/phone-verification-form";
import { useAuth } from "@/lib/auth/context";
import { getSafePhoneVerificationRedirect } from "@/lib/phone-verification/redirect";
function VerifyPhoneContent() {
  const router = useRouter(),
    params = useSearchParams(),
    { user, isAuthenticated, isLoading } = useAuth();
  const redirect = getSafePhoneVerificationRedirect(params.get("redirect"));
  useEffect(() => {
    if (!isLoading && !isAuthenticated)
      router.replace(
        `/login?redirect=${encodeURIComponent(`/verify-phone?redirect=${redirect}`)}`,
      );
  }, [isLoading, isAuthenticated, redirect, router]);
  useEffect(() => {
    if (!isLoading && user?.phone_verified && params.get("redirect"))
      router.replace(redirect);
  }, [isLoading, user, params, redirect, router]);
  if (isLoading || !isAuthenticated) return null;
  if (user?.phone_verified)
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-2xl text-[var(--success)]">✓</p>
        <h1 className="mt-3 text-xl font-semibold">手机号已验证</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          你的账号已完成社区手机号验证。
        </p>
        <Link href="/" className="mt-6 inline-block text-[var(--primary)]">
          返回首页
        </Link>
      </main>
    );
  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <section className="border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
        <p className="text-sm font-semibold text-[var(--primary)]">MDTBBS</p>
        <h1 className="mt-3 text-2xl font-semibold">验证手机号码</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          完成验证后即可发布主题、回复和提交社区资源。
        </p>
        <div className="mt-6">
          <PhoneVerificationForm onSuccess={() => router.replace(redirect)} />
        </div>
      </section>
    </main>
  );
}

export default function VerifyPhonePage() {
  return (
    <Suspense fallback={null}>
      <VerifyPhoneContent />
    </Suspense>
  );
}
