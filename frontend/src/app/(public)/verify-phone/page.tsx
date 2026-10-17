"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PhoneVerificationForm from "@/components/auth/phone-verification-form";
import { useAuth } from "@/lib/auth/context";
import { getSafePhoneVerificationRedirect } from "@/lib/phone-verification/redirect";
import { siteProfile } from "@/config/site-profile";

const legalReferences = [
  {
    title: "《中华人民共和国网络安全法》",
    description:
      "现行法律对提供信息发布、即时通讯等服务时的真实身份信息要求作出了规定。",
    href: "https://www.cac.gov.cn/2025-12/29/c_1768735112911946.htm",
  },
  {
    title: "《互联网用户账号信息管理规定》",
    description:
      "明确移动电话号码、身份证件号码或统一社会信用代码等可以作为真实身份信息认证方式。",
    href: "https://www.cac.gov.cn/2022-06/26/c_1657868775042841.htm",
  },
  {
    title: "《互联网跟帖评论服务管理规定》",
    description:
      "对评论、回复等跟帖评论服务中的真实身份信息认证和个人信息保护提出要求。",
    href: "https://www.cac.gov.cn/2022-11/16/c_1670253725725039.htm",
  },
  {
    title: "《中华人民共和国个人信息保护法》",
    description:
      "要求个人信息处理遵循合法、正当、必要原则，并以清晰易懂的方式告知处理目的、方式、种类和保存期限等事项。",
    href: "https://www.cac.gov.cn/2021-08/20/c_1631050028355286.htm",
  },
];

function VerifyPhoneContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();
  const redirect = getSafePhoneVerificationRedirect(params.get("redirect"));

  useEffect(() => {
    if (!siteProfile.features.phoneVerification) {
      router.replace("/");
      return;
    }
    if (!isLoading && !isAuthenticated) {
      router.replace(
        `/login?redirect=${encodeURIComponent(
          `/verify-phone?redirect=${redirect}`,
        )}`,
      );
    }
  }, [isLoading, isAuthenticated, redirect, router]);

  useEffect(() => {
    if (!isLoading && user?.phone_verified && params.get("redirect")) {
      router.replace(redirect);
    }
  }, [isLoading, user, params, redirect, router]);

  if (!siteProfile.features.phoneVerification || isLoading || !isAuthenticated) {
    return null;
  }

  if (user?.phone_verified) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-14 sm:py-20">
        <section className="border border-[var(--border)] bg-[var(--bg-card)] p-6 text-center sm:p-8">
          <p className="text-3xl text-[var(--success)]" aria-hidden="true">
            ✓
          </p>
          <h1 className="mt-3 text-2xl font-semibold">手机号已验证</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            你的账号已经完成手机号安全验证，无需再次操作。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
            <Link href="/" className="font-medium text-[var(--primary-text)]">
              返回首页
            </Link>
            <Link href="/settings" className="font-medium text-[var(--primary-text)]">
              账号设置
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-[var(--primary-text)]">
          MDTBBS · 账号安全
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          完成手机号安全验证
        </h1>
        <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
          为符合《中华人民共和国网络安全法》《互联网用户账号信息管理规定》
          《互联网跟帖评论服务管理规定》等相关要求，像素工厂中文论坛（MDTBBS）
          需要对使用内容发布和社区互动功能的账号进行必要的安全验证。
        </p>
        <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
          本站采用中国大陆手机号码 + 短信验证码的方式完成验证。验证后，你可以正常发布主题、
          回复帖子、上传资源以及使用其他需要验证的社区功能。
        </p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="space-y-8">
          <section aria-labelledby="why-phone-title">
            <h2 id="why-phone-title" className="text-xl font-semibold">
              为什么需要验证手机号？
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--text-secondary)]">
              <p>
                MDTBBS 提供主题发布、回复、资源提交等用户信息发布与互动服务。根据相关法律法规，
                此类服务需要对相关用户进行真实身份信息认证。
              </p>
              <p>
                手机号是相关规定允许使用的认证方式之一。为了尽量减少需要收集的信息，
                MDTBBS 当前采用手机号码短信验证完成安全校验，无需一般用户额外提交身份证件等信息。
              </p>
            </div>
          </section>

          <section aria-labelledby="privacy-phone-title">
            <h2 id="privacy-phone-title" className="text-xl font-semibold">
              我们如何处理你的手机号？
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--text-secondary)]">
              <p>
                手机号用于完成账号安全验证、安全风控以及必要的账号安全处理。
                手机号不会显示在个人主页、帖子、回复或其他社区公开页面。
              </p>
              <p>
                MDTBBS 不会将手机号用于与验证目的无关的广告营销。
                关于个人信息的保存、查询、更正、删除及账号注销等事项，请查看
                <Link
                  href="/privacy"
                  className="mx-1 font-medium text-[var(--primary-text)] underline underline-offset-2"
                >
                  《隐私政策》
                </Link>
                。
              </p>
            </div>
          </section>

          <details className="border-y border-[var(--border)] py-4">
            <summary className="cursor-pointer text-sm font-semibold">
              了解相关法规依据
            </summary>
            <div className="mt-4 space-y-5">
              {legalReferences.map((item) => (
                <div key={item.href}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-[var(--primary-text)] underline underline-offset-2"
                  >
                    {item.title}
                  </a>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </div>

        <aside className="border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold">验证手机号</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            仅支持中国大陆 +86 手机号码。验证码用于本次账号安全验证。
          </p>
          <div className="mt-6">
            <PhoneVerificationForm onSuccess={() => router.replace(redirect)} />
          </div>
        </aside>
      </div>

      <div className="mt-8 text-sm">
        <Link href={redirect} className="text-[var(--text-secondary)] hover:text-[var(--text)]">
          {redirect === "/" ? "返回首页" : "暂时返回刚才的页面"}
        </Link>
      </div>
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
