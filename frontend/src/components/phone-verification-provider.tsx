"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registerPhoneVerificationHandler } from "@/lib/phone-verification/coordinator";
import { useUserStore } from "@/store/user-store";
import { useToastStore } from "@/store/toast-store";
import { isSiteFeatureEnabled } from "@/config/site-profile";

const NOTICE_ID = "phone-verification-required";
const verifyUrl = (path: string) =>
  `/verify-phone?redirect=${encodeURIComponent(path)}`;

function currentPathWithSearch(pathname: string): string {
  if (typeof window === "undefined") return pathname;
  return `${window.location.pathname}${window.location.search}`;
}

export function PhoneVerificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const user = useUserStore((state) => state.user);
  const showPersistentToast = useToastStore(
    (state) => state.showPersistentToast,
  );
  const dismissToast = useToastStore((state) => state.dismissToast);

  useEffect(() => {
    if (!isSiteFeatureEnabled("phoneVerification")) return;
    const go = () => {
      window.location.assign(
        verifyUrl(currentPathWithSearch(window.location.pathname)),
      );
      return Promise.resolve(false);
    };
    registerPhoneVerificationHandler(go);
    return () => registerPhoneVerificationHandler(null);
  }, []);

  useEffect(() => {
    if (!isSiteFeatureEnabled("phoneVerification")) {
      dismissToast(NOTICE_ID);
      return;
    }

    if (user && !user.phone_verified && pathname !== "/verify-phone") {
      const returnTo = currentPathWithSearch(pathname);
      showPersistentToast(
        NOTICE_ID,
        "根据相关规定，发布内容和部分社区互动功能需要完成手机号安全验证。",
        "warning",
        {
          label: "去验证",
          href: verifyUrl(returnTo),
        },
      );
    } else {
      dismissToast(NOTICE_ID);
    }
  }, [dismissToast, pathname, showPersistentToast, user]);

  return <>{children}</>;
}
