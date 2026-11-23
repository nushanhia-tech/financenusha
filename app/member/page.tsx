import Link from "next/link";
import { BadgeCheck, CircleAlert, FileUp, ReceiptIndianRupee, Wallet } from "lucide-react";
import { portalContext } from "@/lib/portal";
import { record, smallList } from "@/lib/queries";
import { money } from "@/lib/model";
import { translate } from "@/lib/i18n";
import { Heading } from "@/components/primitives";
import { DashboardActivity } from "@/components/dashboard-activity";
import { Button } from "@/components/ui/button";
export default async function MemberHome() {
  const {db,member,profile,language}=await portalContext("member");
  const id=member!.id;
  const [summary,rows,pending]=await Promise.all([record(db,"member_summary",id),smallList(db,"ledger_detail","transaction_date",{member_id:id},8),
    db.from("payment_proofs").select("id",{count:"exact",head:true}).eq("member_id",id).in("status",["submitted","under_review"])]);
  const t=(label:string)=>translate(language,label);
  return <div className="dashboard finance-dashboard member-dashboard">
    <Heading title="My Dashboard" description={"Welcome, "+profile.name+"."} actions={<Button asChild className="member-proof-action"><Link href="/member/proof" aria-label={t("Submit Payment Proof")} title={t("Submit Payment Proof")}><FileUp size={17}/><span>{t("Submit Payment Proof")}</span></Link></Button>}/>
    <div className="member-dashboard-summary">
      <section className="balance-board member-balance" aria-labelledby="member-paid-title">
        <div className="balance-board-top"><span className="balance-board-icon"><ReceiptIndianRupee size={19} aria-hidden="true"/></span><h2 id="member-paid-title">{t("Total paid")}</h2><span className="balance-currency">INR</span></div>
        <strong className="balance-board-value">{money(summary.total_paid)}</strong>
        <p>{t("Payments posted to your ledger")}</p>
        <Link href="/member/ledger" className="balance-primary-action">{t("View full ledger")}</Link>
      </section>
      <section className="card member-dashboard-totals" aria-label={t("Member account")}>
        <div><span className="metric-icon icon-amber"><CircleAlert size={18} aria-hidden="true"/></span><div><h2>{t("Amount due")}</h2><strong>{money(summary.amount_due)}</strong></div></div>
        <div><span className="metric-icon icon-blue"><Wallet size={18} aria-hidden="true"/></span><div><h2>{t("Union owes me")}</h2><strong>{money(summary.union_owes)}</strong></div></div>
        <Link href="/member/payments" className="member-pending"><span className="metric-icon icon-purple"><BadgeCheck size={18} aria-hidden="true"/></span><div><h2>{t("Pending proofs")}</h2><strong>{String(pending.count??0)}</strong></div></Link>
      </section>
    </div>
    <DashboardActivity rows={rows} href="/member/ledger" portal="member"/>
  </div>;
}
