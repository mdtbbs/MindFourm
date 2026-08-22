import { authApi, smsApi } from "@/lib/api/client";
import type { User } from "@/types";

function message(error: unknown, fallback: string) {
  const value = error instanceof Error ? error.message : "";
  if (/频繁|rate/i.test(value)) return "请求过于频繁，请稍后再试";
  if (/过期|expired/i.test(value)) return "验证码已过期，请重新获取";
  if (/错误|不正确|invalid/i.test(value)) return "验证码不正确，请重新输入";
  return fallback;
}
export async function sendPhoneVerificationCode(phone: string) {
  try {
    return (await smsApi.send(phone)) as {
      phone_verified?: boolean;
      retry_after?: number;
    };
  } catch (error) {
    throw new Error(message(error, "验证码发送失败，请稍后再试"));
  }
}
export async function verifyPhoneCode(
  phone: string,
  code: string,
): Promise<User> {
  try {
    await smsApi.verify(phone, code);
    return (await authApi.syncPhoneStatus()).user;
  } catch (error) {
    throw new Error(message(error, "验证失败，请稍后再试"));
  }
}
