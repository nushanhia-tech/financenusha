import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileUp } from "lucide-react";
import { ActionForm, Field } from "@/components/forms";
import { Card, Heading, Pagination, Status, Table, type Params } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Filters } from "@/components/filters";
import { LedgerCard } from "@/components/member-ledger";
import { Notifications } from "@/components/notifications";
import { DocumentLink, Info, idFilters } from "@/components/admin/shared";
import { receiptLink } from "@/components/finance-table";
import { portalContext } from "@/lib/portal";
import { choices, enumOptions, list, record } from "@/lib/queries";
import { methods, money, todayIndia, value } from "@/lib/model";
import { translate } from "@/lib/i18n";
const labels={ledger:"My Financial Ledger",payments:"My Payments",contributions:"My Contributions",dues:"My Dues",proof:"Submit Payment Proof",
  refunds:"My Refunds",reimbursements:"My Reimbursements",receipts:"My Receipts",statements:"My Statements",profile:"My Profile"};

export default async function MemberSection({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<Params>}) {
  const {db,member,language}=await portalContext("member");
  const [{section},query]=await Promise.all([params,searchParams]);
  const memberId=member!.id;
  const path="/member/"+section;
  if(section==="notifications")return <Notifications db={db} portal="member" params={query}/>;
  if(!Object.hasOwn(labels,section))notFound();
  const title=translate(language,labels[section as keyof typeof labels]);
  if(section==="profile") {
    const row=await record(db,"members",memberId);
    return <div className="detail-stack"><Heading title={title} description="View your membership and update your phone number."/>
      <Card title="Membership"><Info fields={[["Name",value(row,"name")],["Email",value(row,"email")],["Member ID",value(row,"member_number")],["Payment profile",value(row,"payment_profile")]]}/></Card>
      <Card title="Contact details" className="form-card"><ActionForm command="profile_update" submit="Save changes"><Field name="phone" label="Phone" type="tel" value={value(row,"phone")}/></ActionForm></Card></div>;
  }
  if(section==="proof") {
    const c=await choices(db,{member:true});
    return <div className="detail-stack"><Heading title={title} description="Send a payment screenshot or receipt for the union’s verification."/>
      <Card title="Payment details" className="form-card"><ActionForm command="proof_submit" submit="Submit proof"><div className="form-grid">
        <Field name="year_id" label="Academic year" options={c.openYears} value={c.activeYear} required/>
        <Field name="payment_date" label="Payment date" type="date" value={todayIndia()} required/>
        <Field name="amount" label="Amount (INR)" type="number" min="0.01" step="0.01" required/>
        <Field name="method" label="Payment method" options={enumOptions(methods)} required/>
        <Field name="reference" label="UPI or bank reference" required/><Field name="purpose" label="Purpose" placeholder="Membership dues or event registration" required/>
        <Field name="event_id" label="Related event" options={c.events}/>
        <Field name="file" label="Payment screenshot or PDF" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hint="PDF, PNG, JPEG, or WebP. Up to 4 MB." required/>
        <Field name="notes" label="Notes" type="textarea" wide/></div></ActionForm></Card></div>;
  }
  if(section==="receipts") {
    const receipts=await list(db,"receipt_detail",query,{filter:{member_id:memberId},searchable:["number","description","code"],date:"transaction_date",order:"transaction_date"});
    return <div className="detail-stack"><Heading title={title} description="Download official receipts for your posted transactions."/><Filters path={path} params={query} search="Search receipts…"/>
      <Card><Table rows={receipts.rows} columns={[{key:"number",label:"Receipt number"},{key:"description",label:"Description"},{key:"transaction_date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"money"},{key:"download",label:"Download",render:r=>receiptLink(value(r,"id"),"PDF")}]}/>
        <Pagination {...receipts} path={path} params={query}/></Card></div>;
  }
  if(section==="statements") {
    const c=await choices(db,{member:true});
    return <div className="detail-stack"><Heading title={title} description="Export your personal financial ledger for a period."/><Card title="Download statement" className="form-card">
      <form className="action-form" action="/api/download/statement/current"><div className="form-grid">
        <Field name="year_id" label="Academic year" options={c.years} placeholder="All academic years"/><Field name="format" label="File format" options={enumOptions(["pdf","xlsx","csv"])} value="pdf" required/>
        <Field name="from" label="From" type="date"/><Field name="to" label="To" type="date"/></div><Button type="submit"><Download size={16}/> Download statement</Button></form></Card></div>;
  }
  const c=await choices(db,{member:true});
  const proof=section==="payments"?await list(db,"payment_proofs",query,{filter:{member_id:memberId},searchable:["purpose","reference"],date:"payment_date"}):null;
  const [summary,dues]=section==="dues"?await Promise.all([record(db,"member_summary",memberId),list(db,"member_due_schedule",query,{filter:{member_id:memberId,...idFilters(query,"year_id")},searchable:["description","code"],date:"due_date",order:"due_date"})]):[null,null];
  const source=({payments:"member_payment_detail",contributions:"member_contribution_detail",dues:"member_due_detail",refunds:"member_refund_detail",reimbursements:"member_reimbursement_detail"} as Record<string,string>)[section]??"ledger_detail";
  const result=await list(db,source,query,{filter:{member_id:memberId,...idFilters(query,"year_id")},searchable:["code","description","reference"],date:"transaction_date",order:"transaction_date"});
  return <div className="detail-stack"><Heading title={title} description={summary?"Outstanding balance "+money(summary.amount_due):"Review posted transactions in your individual account."}
    actions={section==="payments"||section==="dues"?<Button asChild><Link href="/member/proof"><FileUp size={17}/> Submit payment proof</Link></Button>:undefined}/>
    <Filters path={path} params={query} search="Search transaction or reference…" fields={[{name:"year_id",label:"Academic year",options:c.years},{name:"from",label:"From",type:"date"},{name:"to",label:"To",type:"date"}]}/>
    {dues&&<Card title="Dues schedule"><Table rows={dues.rows} columns={[{key:"description",label:"Due"},{key:"due_date",label:"Due date",type:"date"},{key:"amount",label:"Raised",type:"money"},{key:"remaining",label:"Remaining",type:"money"}]}/><Pagination {...dues} path={path} params={query}/></Card>}
    {<LedgerCard title={title} {...result} path={path} params={query}/>}
    {proof&&<Card title="Submitted payment proofs"><Table rows={proof.rows} columns={[{key:"purpose",label:"Purpose"},{key:"reference",label:"Reference"},{key:"payment_date",label:"Payment date",type:"date"},{key:"amount",label:"Amount",type:"money"},{key:"status",label:"Status",render:r=><Status state={r.correction_requested?"correction_requested":r.status}/>},
      {key:"review_note",label:"Review note"},{key:"document_id",label:"Attachment",render:r=><DocumentLink id={value(r,"document_id")}/>} ]}/></Card>}
  </div>;
}
