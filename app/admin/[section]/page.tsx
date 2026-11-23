import { notFound } from "next/navigation";
import { requirePortal } from "@/lib/session";
import type { Params } from "@/components/primitives";
import { Approvals, Documents, Transactions, Verification } from "@/components/admin/transactions";
import { Accounts, Budgets, Departments, Events, Members, Sponsorship } from "@/components/admin/operations";
import { Audit, Reports, Settings, Years } from "@/components/admin/admin-tools";
import { Notifications } from "@/components/notifications";
const pages={transactions:Transactions,accounts:Accounts,members:Members,departments:Departments,events:Events,sponsorship:Sponsorship,
  verification:Verification,budgets:Budgets,documents:Documents,approvals:Approvals,reports:Reports,audit:Audit,years:Years,settings:Settings};

export default async function AdminSection({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<Params>}) {
  const {db}=await requirePortal("admin");
  const [{section},query]=await Promise.all([params,searchParams]);
  if(section==="notifications")return <Notifications db={db} portal="admin" params={query}/>;
  if(!Object.hasOwn(pages,section))notFound();
  const Screen=pages[section as keyof typeof pages];
  return <Screen db={db} params={query}/>;
}
