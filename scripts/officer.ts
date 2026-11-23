import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { authOperation, serviceDatabase } from "../lib/finance-auth";
import { hashPassword } from "../lib/passwords";
import { newPassword, usernameInput } from "../lib/validation";

const [command,rawUsername,role,name]=process.argv.slice(2);
if(command!=="create"&&command!=="reset") {
  throw new Error('Use auth:officer -- create USERNAME TREASURER "Display name" or auth:officer -- reset USERNAME.');
}
const username=usernameInput.parse(rawUsername);
if(command==="create"&&((role!=="TREASURER"&&role!=="FINANCE_SECRETARY")||!name?.trim())) {
  throw new Error("Choose TREASURER or FINANCE_SECRETARY and provide a display name.");
}

async function readPassword() {
  if(!process.stdin.isTTY)throw new Error("Open an interactive terminal to enter the officer password.");
  const muted=new Writable({write(_chunk,_encoding,callback){callback();}});
  const reader=createInterface({input:process.stdin,output:muted,terminal:true});
  process.stdout.write("New officer password (hidden) · ");
  try {
    return await reader.question("",{signal:AbortSignal.timeout(120000)});
  } finally {
    reader.close();
    process.stdout.write("\n");
  }
}

const password=newPassword.parse(await readPassword());
await authOperation(serviceDatabase(),command==="create"?"officer_create":"officer_reset",{
  username,role,name:name?.trim(),password_hash:await hashPassword(password),
});
console.log("Officer username ready · "+username);
