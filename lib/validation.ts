import { z } from "zod";
import { kinds, methods, operations } from "./model";

const id = z.uuid();
const optionalId = z.union([id, z.literal("")]).optional();
const optionalDate = z.union([z.iso.date(),z.literal("")]).optional();
const name = z.string().trim().min(1).max(160);
const description = z.string().trim().max(2000).optional();
const optionalMethod = z.union([z.enum(methods), z.literal("")]).optional();
const decimal = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, "Enter an amount with up to two decimal places.");
const positive = decimal.refine(amount => Number(amount)>0,"Amount must be greater than zero.");
const signed = z.string().regex(/^-?(0|[1-9]\d{0,11})(\.\d{1,2})?$/, "Enter a valid signed amount.");
const email = z.email().max(254).transform(value => value.toLowerCase());
const optionalEmail = z.union([email,z.literal("")]).optional();
const phone = z.string().trim().max(32).optional();
const year_id = id;
const base = { id: optionalId };
const ids = { id };
const reason = z.string().trim().min(1).max(2000);
const decision = z.enum(["approved","rejected"]);
const bool = z.enum(["true","false"]).transform(value => value === "true");
const document = { object_path: z.string().min(1).max(512), file_name: z.string().trim().min(1).max(255) };
const memberRow = z.object({ name, email, phone });
export const authInput = z.object({ email, password: z.string().min(1).max(100) });
export const resetEmail = z.object({ email });
export const newPassword = z.string().min(12,"Use at least 12 characters.").max(100);
export const commands = {
  transaction_save: z.object({ ...base, request_id: id, year_id, transaction_date: z.iso.date(), kind: z.enum(kinds).exclude(["reversal"]), operation: z.enum(operations.map(item=>item[0])), amount: positive, description: reason,
    category_id: optionalId, member_id: optionalId, department_id: optionalId, event_id: optionalId, account_id: optionalId, destination_id: optionalId, debit_id: optionalId, credit_id: optionalId, pledge_id: optionalId, method: optionalMethod, reference: z.string().trim().max(120).optional(), due_date: optionalDate }),
  transaction_submit: z.object(ids), transaction_post: z.object(ids), transaction_decide: z.object({...ids,decision,reason:description}),
  transaction_reverse: z.object({...ids,year_id,transaction_date:z.iso.date(),reason}),
  proof_submit: z.object({...document,year_id,event_id:optionalId,payment_date:z.iso.date(),method:z.enum(methods),amount:positive,reference:z.string().trim().min(1).max(120),purpose:name,notes:description}),
  proof_review: z.object({...ids,decision:z.enum(["review","verify","reject","correct"]),reason:description,transaction_id:optionalId,account_id:optionalId,category_id:optionalId,operation:z.enum(["standard","due_payment"]).optional()}),
  year_save: z.object({name,start_date:z.iso.date(),end_date:z.iso.date()}).refine(p=>p.start_date<=p.end_date,"End date must follow the start date."),
  year_activate:z.object(ids), year_close:z.object(ids),year_notice:z.object(ids),
  department_save:z.object({...base,name,description}),
  event_save:z.object({...base,name,description,year_id,event_date:z.iso.date(),department_id:optionalId}),
  member_save:z.object({...base,...memberRow.shape,year_id,department_id:optionalId,payment_profile:description}),
  member_import:z.object({year_id,department_id:optionalId,rows:z.array(memberRow).min(1).max(500)}),
  member_status:z.object({...ids,active:bool}),member_invite:z.object(ids),member_reminder:z.object(ids),
  account_save:z.object({...base,name,kind:z.enum(["cash","bank","upi","other"]),active:bool.optional()}),
  reconcile:z.object({account_id:id,year_id,statement_date:z.iso.date(),actual_balance:signed,lines:z.array(z.object({reference:z.string().trim().min(1).max(120),amount:signed})).max(1000)}),
  sponsor_save:z.object({...base,name,kind:z.enum(["sponsor","donor"]),email:optionalEmail,description}),
  pledge_save:z.object({sponsor_id:id,year_id,event_id:optionalId,amount:positive,due_date:optionalDate}),
  budget_save:z.object({year_id,name,scope:z.enum(["annual","department","event","project"]),amount:positive,department_id:optionalId,event_id:optionalId,category_id:optionalId}),
  budget_revise:z.object({...ids,amount:positive,reason}),budget_decide:z.object({...ids,decision}),
  document_add:z.object({...document,transaction_id:optionalId,pledge_id:optionalId,kind:z.enum(["bill","voucher","receipt","sponsorship"])}),
  profile_update:z.object({phone}), notification_read:z.object(base),
  settings_save:z.object({approval_threshold:decimal,high_threshold:decimal,maker_checker:bool,mfa_required:bool,budget_warning:positive})
    .refine(p=>Number(p.high_threshold)>=Number(p.approval_threshold) && Number(p.budget_warning)<=100,"Check the approval thresholds and budget warning percentage."),
};
export type Command = keyof typeof commands;
export const reportFilters = z.object({year_id:optionalId,department_id:optionalId,event_id:optionalId,member_id:optionalId,account_id:optionalId,category_id:optionalId,from:optionalDate,to:optionalDate});

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const normalized = text.replace(/^\uFEFF/,"").replaceAll("\r\n","\n");
  for (let i = 0;i < normalized.length;i++) {
    const char = normalized[i];
    if (char === '"' && quoted && normalized[i+1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if (char === "\n" && !quoted) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("Close the quoted CSV field.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function trustedFileType(bytes: Uint8Array) {
  if (bytes[0]===0x25 && bytes[1]===0x50 && bytes[2]===0x44 && bytes[3]===0x46 && bytes[4]===0x2d) return "application/pdf";
  if ([137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte)) return "image/png";
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP") return "image/webp";
  return null;
}
