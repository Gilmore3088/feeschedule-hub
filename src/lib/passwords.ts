import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

type HashFormat = "bcrypt" | "legacy-sha256";

function detectHashFormat(stored: string): HashFormat {
  if (stored.startsWith("$2b$") || stored.startsWith("$2a$")) return "bcrypt";
  return "legacy-sha256";
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (detectHashFormat(stored) === "legacy-sha256") {
    const [salt, hashVal] = stored.split(":", 2);
    if (!salt || !hashVal) return { valid: false, needsRehash: false };
    // Must match existing auth.ts format: sha256("${salt}:${password}")
    const check = createHash("sha256")
      .update(`${salt}:${password}`)
      .digest("hex");
    const valid = timingSafeEqual(
      Buffer.from(check, "hex"),
      Buffer.from(hashVal, "hex")
    );
    return { valid, needsRehash: true };
  }

  const bcrypt = await import("bcryptjs");
  return { valid: await bcrypt.compare(password, stored), needsRehash: false };
}

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}
