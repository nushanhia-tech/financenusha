import { compare } from "bcryptjs";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const dummyHash = "scrypt:"+"0".repeat(32)+":"+"0".repeat(64);

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 32) as Buffer;
  return "scrypt:"+salt.toString("hex")+":"+hash.toString("hex");
}

export async function checkPassword(password: string, stored: string | null | undefined) {
  if (stored && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(stored)) {
    return Buffer.byteLength(password)<=72 && await compare(password, stored);
  }
  const valid = typeof stored==="string" && /^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored);
  const [,salt,hash] = (valid?stored:dummyHash).split(":");
  const attempt = await derive(password, Buffer.from(salt,"hex"), 32) as Buffer;
  return timingSafeEqual(attempt,Buffer.from(hash,"hex")) && valid;
}
