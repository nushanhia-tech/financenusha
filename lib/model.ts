export type Role = "TREASURER" | "FINANCE_SECRETARY" | "MEMBER";
export type StoreRow = Record<string, unknown>;
export type Option = { value: string; label: string };
export const methods = ["cash", "bank", "upi", "other"] as const;
export const kinds = ["income", "expense", "transfer", "refund", "reimbursement", "advance", "adjustment", "reversal"] as const;
export const operations = [
  ["standard", "Standard entry"], ["due", "Raise member dues"], ["due_payment", "Collect member dues"],
  ["payable", "Recognise reimbursement payable"], ["payable_payment", "Pay reimbursement payable"],
  ["advance_settlement", "Receive advance settlement"], ["opening", "Record opening balance"],
] as const;
export const reportNames = {
  income: "Income Report", expense: "Expense Report", "cash-book": "Cash Book", "bank-book": "Bank Book",
  "upi-book": "UPI Book", "general-ledger": "General Ledger", "trial-balance": "Trial Balance",
  "balance-sheet": "Balance Sheet", "cash-flow": "Cash Flow Statement", "member-ledger": "Member Ledger Report",
  "member-dues": "Member Dues Report", reimbursements: "Reimbursement Report", department: "Department Report",
  event: "Event Finance Report", sponsorship: "Sponsorship Report", donation: "Donation Report",
  budget: "Budget vs Actual Report", "transaction-register": "Transaction Register", annual: "Annual Financial Report",
} as const;
export type Report = keyof typeof reportNames;
export const dimensions = ["year_id", "department_id", "event_id", "member_id", "account_id", "category_id", "from", "to"] as const;
export const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
export const money = (amount: unknown) => {
  const value = Number(amount || 0);
  return (Number.isInteger(value) ? inr : inrPaise).format(value);
};
export const value = (data: StoreRow | undefined, key: string) => String(data?.[key] ?? "");
export const numeric = (data: StoreRow | undefined, key: string) => Number(data?.[key] ?? 0);
export const human = (input: string) => input.replaceAll("_", " ").replace(/\b\w/g, s => s.toUpperCase()).replace(/\bUpi\b/g, "UPI");
export function dateLabel(input: unknown) {
  if (typeof input !== "string" || !input) return "—";
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? input : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}
export function todayIndia() {
  return new Intl.DateTimeFormat("en-CA", { year:"numeric", month:"2-digit", day:"2-digit", timeZone:"Asia/Kolkata" }).format(new Date());
}
export function options(rows: StoreRow[], key = "name"): Option[] {
  return rows.map(row => ({ value: value(row, "id"), label: value(row, key) }));
}
export function queryString(params: Record<string, string | string[] | undefined>, changes: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, entry] of Object.entries({ ...params, ...changes })) if (typeof entry === "string" && entry) query.set(key, entry);
  const text = query.toString();
  return text ? "?" + text : "";
}
export function one(params: Record<string, string | string[] | undefined>, key: string) {
  return typeof params[key] === "string" ? params[key] : "";
}
export function safeTextForSpreadsheet(text: string) {
  return /^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\r\t\n]/.test(text) ? "'" + text : text;
}
