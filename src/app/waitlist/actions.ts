"use server";

import { promises as fs } from "fs";
import path from "path";

export type WaitlistEntry = {
  name: string;
  email: string;
  institution: string;
  assetSize: string;
  charterType: string;
  submittedAt: string;
};

const DATA_PATH = path.join(process.cwd(), "data", "waitlist.json");

async function ensureDataDir() {
  const dir = path.dirname(DATA_PATH);
  await fs.mkdir(dir, { recursive: true });
}

async function readEntries(): Promise<WaitlistEntry[]> {
  try {
    const data = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export type WaitlistResult =
  | { success: true }
  | { success: false; error: string };

export async function joinWaitlist(
  _prev: WaitlistResult | null,
  formData: FormData
): Promise<WaitlistResult> {
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const institution = formData.get("institution")?.toString().trim();
  const assetSize = formData.get("assetSize")?.toString().trim();
  const charterType = formData.get("charterType")?.toString().trim();

  if (!name || !email || !institution || !assetSize || !charterType) {
    return { success: false, error: "All fields are required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Please enter a valid email address." };
  }

  await ensureDataDir();
  const entries = await readEntries();

  if (entries.some((e) => e.email.toLowerCase() === email.toLowerCase())) {
    return { success: false, error: "This email is already on the waitlist." };
  }

  entries.push({
    name,
    email,
    institution,
    assetSize,
    charterType,
    submittedAt: new Date().toISOString(),
  });

  await fs.writeFile(DATA_PATH, JSON.stringify(entries, null, 2));

  return { success: true };
}
