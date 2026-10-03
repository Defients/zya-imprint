const PASSWORD_HASH = "e7f3970e5a914a69e7f3409c39ae5e2842e301b5014446d7a16dc4920de45bc5";

const UNLOCK_KEY = "zya-imprint-unlocked";

export async function hashPassword(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPassword(plain: string): Promise<boolean> {
  const hashed = await hashPassword(plain);
  return hashed === PASSWORD_HASH;
}

export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}
