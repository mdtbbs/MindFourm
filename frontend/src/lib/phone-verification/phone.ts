export const MAINLAND_PHONE_PATTERN = /^1[3-9]\d{9}$/;

export function isValidMainlandPhone(phone: string): boolean {
  return MAINLAND_PHONE_PATTERN.test(phone);
}

export function maskMainlandPhone(phone: string): string {
  if (!/^\d{11}$/.test(phone)) return phone;
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1 **** $2");
}
