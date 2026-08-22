"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registerPhoneVerificationHandler } from "@/lib/phone-verification/coordinator";
import { useUserStore } from "@/store/user-store";
import { useToastStore } from "@/store/toast-store";

const NOTICE_ID = "phone-verification-required";
const verifyUrl = (path: string) =>
  `/verify-phone?redirect=${encodeURIComponent(path)}`;

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
    const go = () => {
      window.location.assign(
        verifyUrl(`${window.location.pathname}${window.location.search}`),
      );
      return Promise.resolve(false);
    };
    registerPhoneVerificationHandler(go);
    return () => registerPhoneVerificationHandler(null);
  }, []);
  useEffect(() => {
    if (user && !user.phone_verified && pathname !== "/verify-phone")
      showPersistentToast(
        NOTICE_ID,
        "请先验证手机号后再发布内容或使用互动功能。",
        "warning",
      );
    else dismissToast(NOTICE_ID);
  }, [dismissToast, pathname, showPersistentToast, user]);
  useEffect(() => {
    const click = (event: Event) => {
      if (
        (event.target as HTMLElement | null)?.closest(
          `[data-toast-id="${NOTICE_ID}"]`,
        )
      )
        window.location.assign(
          verifyUrl(`${window.location.pathname}${window.location.search}`),
        );
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  return <>{children}</>;
}
