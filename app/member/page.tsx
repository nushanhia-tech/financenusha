import Link from "next/link";
import { BadgeCheck, CircleAlert, FileUp, ReceiptIndianRupee, Wallet } from "lucide-react";
import { portalContext } from "@/lib/portal";
import { record, smallList } from "@/lib/queries";
import { money } from "@/lib/model";
import { translate } from "@/lib/i18n";
import { Heading, Metric } from "@/components/primitives";
import { LedgerCard } from "@/components/member-ledger";
import { Button } from "@/components/ui/button";
export default async function MemberHome() {
  const {db,member,profile,language}=await portalContext("member");
  const id=member!.id;
  const [summary,rows,pending]=await Promise.all([record(db,"member_summary",id),smallList(db,"ledger_detail","transaction_date",{member_id:id},8),
    db.from("payment_proofs").select("id",{count:"exact",head:true}).eq("member_id",id).in("status",["submitted","under_review"])]);
  const t=(label:string)=>translate(language,label);
  return <div className="dashboard"><Heading title={t("My Dashboard")} description={"Welcome, "+profile.name+"."} actions={<Button asChild><Link href="/member/proof"><FileUp size={17}/>{t("Submit Payment Proof")}</Link></Button>}/>
    <div className="metric-grid">
      <Metric label={t("Total paid")} amount={money(summary.total_paid)} note="Payments posted to your ledger" icon={ReceiptIndianRupee} color="green"/>
      <Metric label={t("Amount due")} amount={money(summary.amount_due)} note="Outstanding balance with the union" icon={CircleAlert} color="amber"/>
      <Metric label={t("Union owes me")} amount={money(summary.union_owes)} note="Outstanding union payables" icon={Wallet}/>
      <Metric label={t("Pending proofs")} amount={String(pending.count??0)} note="Submissions awaiting verification" icon={BadgeCheck} color="purple"/>
    </div><LedgerCard title={t("Recent transactions")} rows={rows}/></div>;
}
