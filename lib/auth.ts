import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export type Role = "family" | "admin";
const COOKIE = "casapards_session";
const MAX_AGE = 60 * 60 * 24 * 180;

// Used only when neither SESSION_SECRET nor any passcode is set: sessions
// then last until the server restarts, which is harmless with no gate.
const processSecret = randomBytes(32).toString("hex");

/**
 * SESSION_SECRET signs cookies. If it's missing, derive one from the
 * passcodes rather than crash: only someone who knows them could forge a
 * cookie, and changing a passcode signs everyone out.
 */
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  const codes = `${process.env.ADMIN_PASSCODE ?? ""}\n${process.env.FAMILY_PASSCODE ?? ""}`;
  if (codes.trim()) return createHash("sha256").update("casapards-session\n" + codes).digest("hex");
  return processSecret;
}

const sign = (role: Role) => createHmac("sha256", secret()).update(role).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const familyGateOn = () => Boolean(process.env.FAMILY_PASSCODE?.trim());

/** Which role a passcode unlocks, if any. */
export function roleForPasscode(code: string): Role | null {
  // Trim so a stray space or newline pasted into the host's settings
  // doesn't make the right passcode fail.
  const admin = process.env.ADMIN_PASSCODE?.trim();
  const family = process.env.FAMILY_PASSCODE?.trim();
  if (admin && safeEqual(code, admin)) return "admin";
  if (family && safeEqual(code, family)) return "family";
  return null;
}

export async function currentRole(): Promise<Role | null> {
  const value = (await cookies()).get(COOKIE)?.value ?? "";
  const [role, sig] = value.split(".");
  if ((role === "family" || role === "admin") && sig && safeEqual(sig, sign(role))) {
    return role;
  }
  return familyGateOn() ? null : "family";
}

export async function startSession(role: Role): Promise<void> {
  (await cookies()).set(COOKIE, `${role}.${sign(role)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
