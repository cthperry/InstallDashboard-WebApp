export const PREMTEK_EMAIL_PATTERN = /^[^@]+@premtek\.com\.tw$/i;

export function isPremtekEmail(email?: string | null): boolean {
  return Boolean(email && PREMTEK_EMAIL_PATTERN.test(email));
}
