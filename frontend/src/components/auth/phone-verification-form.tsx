"use client";
import { useEffect, useState } from "react";
import OtpInput from "./otp-input";
import {
  sendPhoneVerificationCode,
  verifyPhoneCode,
} from "@/lib/api/phone-verification";
import { useUserStore } from "@/store/user-store";
type Step = "phone" | "code" | "success";
const valid = (phone: string) => /^1[3-9]\d{9}$/.test(phone);
export default function PhoneVerificationForm({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const setUser = useUserStore((s) => s.setUser);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!cooldown) return;
    const id = window.setInterval(
      () => setCooldown((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [cooldown]);
  const send = async () => {
    setError("");
    if (!valid(phone)) {
      setError("请输入正确的手机号码");
      return;
    }
    setBusy(true);
    try {
      const r = await sendPhoneVerificationCode(phone);
      setStep("code");
      setCooldown(Number(r.retry_after) || 60);
    } catch (e) {
      setError(e instanceof Error ? e.message : "验证码发送失败，请稍后再试");
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
    } catch (e) {
      setCode("");
      setError(e instanceof Error ? e.message : "验证失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };
  if (step === "success")
    return (
      <div className="py-8 text-center">
        <p className="text-2xl text-[var(--success)]">✓</p>
        <h2 className="mt-3 text-lg font-semibold">手机号验证完成</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">正在返回……</p>
      </div>
    );
  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600"
        >
          {error}
        </p>
      )}
      {step === "phone" ? (
        <>
          <label className="block text-sm font-medium">
            手机号
            <div className="mt-2 flex h-11 rounded-[var(--radius)] border border-[var(--border)]">
              <span className="border-r border-[var(--border)] px-3 py-3 text-sm">
                +86
              </span>
              <input
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))
                }
                inputMode="numeric"
                autoComplete="tel"
                className="min-w-0 flex-1 bg-transparent px-3 outline-none"
                placeholder="请输入手机号"
              />
            </div>
          </label>
          <button
            onClick={send}
            disabled={busy}
            className="h-11 w-full rounded-[var(--radius)] bg-[var(--primary)] text-white disabled:opacity-50"
          >
            {busy ? "发送中…" : "获取验证码"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--text-secondary)]">
            验证码已发送至{" "}
            <b>{phone.replace(/(\d{3})\d{4}(\d{4})/, "$1 **** $2")}</b>
          </p>
          <OtpInput value={code} onChange={setCode} />
          <button
            onClick={verify}
            disabled={busy || code.length !== 6}
            className="h-11 w-full rounded-[var(--radius)] bg-[var(--primary)] text-white disabled:opacity-50"
          >
            {busy ? "验证中…" : "完成验证"}
          </button>
          <div className="flex justify-between text-sm">
            {cooldown ? (
              <span>{cooldown} 秒后可重新发送</span>
            ) : (
              <button onClick={send}>重新发送验证码</button>
            )}
            <button
              onClick={() => {
                setStep("phone");
                setCode("");
                setError("");
              }}
            >
              更换手机号
            </button>
          </div>
        </>
      )}
    </div>
  );
}
