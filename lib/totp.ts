import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { configuration } from "./finance-auth";

const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function newTotpSecret() {
  const bits=Array.from(randomBytes(20),byte=>byte.toString(2).padStart(8,"0")).join("");
  return bits.match(/.{5}/g)!.map(chunk=>alphabet[Number.parseInt(chunk,2)]).join("");
}

export function validTotpCounter(secret:string,code:string) {
  if(!/^\d{6}$/.test(code)||!(/^[A-Z2-7]{32}$/).test(secret))return null;
  const bits=Array.from(secret,letter=>alphabet.indexOf(letter).toString(2).padStart(5,"0")).join("");
  const key=Buffer.from(bits.match(/.{8}/g)!.map(chunk=>Number.parseInt(chunk,2)));
  const now=Math.floor(Date.now()/30000);
  for(const counter of [now,now-1,now+1]) {
    const counterBytes=Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(BigInt(counter));
    const hash=createHmac("sha1",key).update(counterBytes).digest();
    const offset=hash[hash.length-1]&15;
    const expected=String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0");
    if(timingSafeEqual(Buffer.from(expected),Buffer.from(code)))return counter;
  }
  return null;
}

function encryptionKey() {
  const config=configuration();
  if(!config)throw new Error("Authentication is unavailable.");
  return Buffer.from(hkdfSync("sha256",config.signingKey,"nusha-finance","authenticator-secrets",32));
}

export function encryptTotp(secret:string) {
  const nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",encryptionKey(),nonce);
  const ciphertext=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString("base64url");
}

export function decryptTotp(secret:string) {
  const bytes=Buffer.from(secret,"base64url");
  const cipher=createDecipheriv("aes-256-gcm",encryptionKey(),bytes.subarray(0,12));
  cipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString("utf8");
}
