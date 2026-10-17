"use client";

import { useEffect, useId, useState } from "react";
import OtpInput from "./otp-input";
import {
  sendPhoneVerificationCode,
  verifyPhoneCode,
} from "@/lib/api/phone-verification";
import {
  isValidMainlandPhone,
  maskMainlandPhone,
} from "@/lib/phone-verification/phone";
import { useUserStore } from "@/store/user-store";

type Step = "phone" | "code" | "success";

export default function PhoneVerificationForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const setUser = useUserStore((s) => s.setUser);
  const inputId = useId();
  const errorId = useId();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cooldown) return;
    const id = window.setInterval(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [cooldown]);

  const send = async () => {
    setError("");
    if (!isValidMainlandPhone(phone)) {
      setError("请输入正确的中国大陆手机号码");
      return;
    }

    setBusy(true);
    try {
      const response = await sendPhoneVerificationCode(phone);
      setStep("code");
      setCooldown(Number(response.retry_after) || 60);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "验证码发送失败，请稍后再试",
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("请输入 6 位数字验证码");
      return;
    }

    setBusy(true);
    try {
      setUser(await verifyPhoneCode(phone, code));
      setStep("success");
      window.setTimeout(onSuccess, 700);
    } catch (cause) {
      setCode("");
      setError(cause instanceof Error ? cause.message : "验证失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  if (step === "success") {
    return (
      <div className="py-8 text-center" role="status" aria-live="polite">
        <p className="text-3xl text-[var(--success)]" aria-hidden="true">
          ✓
        </p>
        <h2 className="mt-3 text-lg font-semibold">手机号验证完成</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          你的账号已完成安全验证。
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          正在返回刚才的页面……
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p
          id={errorId}
          role="alert"
          className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600"
        >
          {error}
        </p>
      )}

      {step === "phone" ? (
        <>
          <label htmlFor={inputId} className="block text-sm font-medium">
            中国大陆手机号
          </label>
          <div className="flex min-h-11 border border-[var(--border)] bg-[var(--bg-elevated)] focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]/20">
            <span className="border-r border-[var(--border)] px-3 py-3 text-sm text-[var(--text-secondary)]">
              +86
            </span>
            <input
              id={inputId}
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))
              }
              inputMode="numeric"
              autoComplete="tel"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className="min-w-0 flex-1 bg-transparent px-3 outline-none"
              placeholder="请输入手机号码"
            />
          </div>
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            我们会向该号码发送一次性短信验证码。
          </p>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="h-11 w-full bg-[var(--primary-button)] px-4 font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "发送中…" : "获取验证码"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            验证码已发送至{" "}
            <b className="text-[var(--text)]">{maskMainlandPhone(phone)}</b>
          </p>
          <OtpInput value={code} onChange={setCode} />
          <button
            type="button"
            onClick={verify}
            disabled={busy || code.length !== 6}
            className="h-11 w-full bg-[var(--primary-button)] px-4 font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "验证中…" : "完成验证"}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            {cooldown ? (
              <span className="text-[var(--text-secondary)]">
                {cooldown} 秒后可重新发送
              </span>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={busy}
                className="font-medium text-[var(--primary-text)] disabled:opacity-50"
              >
                重新发送验证码
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError("");
              }}
              disabled={busy}
              className="font-medium text-[var(--primary-text)] disabled:opacity-50"
            >
              更换手机号
            </button>
          </div>
        </>
      )}
    </div>
  );
}
