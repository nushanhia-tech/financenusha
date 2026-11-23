import Link from "next/link";
import { ArrowRight, Download, FilePlus2 } from "lucide-react";
import { ActionForm, Field, Hidden } from "../forms";
import { Card, Heading, Pagination, Status, Table } from "../primitives";
import { TransactionTable, receiptLink } from "../finance-table";
import { Filters } from "../filters";
import { Button } from "../ui/button";
import { Add, Back, DetailLink, DocumentLink, Info, ShowForm, dimensionFields, idFilters, proofColumns, type Screen } from "./shared";
import { choices, enumOptions, list, record, smallList, type Choices } from "@/lib/queries";
import { dateLabel, human, kinds, methods, money, one, operations, queryString, todayIndia, value, type StoreRow } from "@/lib/model";

const path="/admin/transactions";
const accept="application/pdf,image/png,image/jpeg,image/webp";
export function TransactionForm({c,row,initial={}}:{c:Choices;row?:StoreRow;initial?:StoreRow}) {
  const data={...initial,...row};
  const val=(key:string)=>value(data,key);
  return <ActionForm command="transaction_save" successPath={row?undefined:path+"?id="} submit={row?"Save draft changes":"Save draft"}>
    <Hidden name="id" value={value(row,"id")}/><Hidden name="request_id" value={value(row,"request_id")||crypto.randomUUID()}/>
    <div className="form-grid">
      <Field name="kind" label="Transaction type" options={enumOptions(kinds.filter(k=>k!=="reversal"))} value={val("kind")||"income"} required/>
      <Field name="operation" label="Accounting operation" options={operations.map(([value,label])=>({value,label}))} value={val("operation")||"standard"} required/>
      <Field name="amount" label="Amount (INR)" type="number" min="0.01" step="0.01" value={val("amount")} required/>
      <Field name="transaction_date" label="Transaction date" type="date" value={val("transaction_date")||todayIndia()} required/>
      <Field name="year_id" label="Academic year" options={c.openYears} value={val("year_id")||c.activeYear} required/>
      <Field name="category_id" label="Category" options={c.categories} value={val("category_id")}/>
      <Field name="account_id" label="Financial account" options={c.openAccounts} value={val("account_id")}/>
      <Field name="destination_id" label="Transfer destination" options={c.openAccounts} value={val("destination_id")}/>
      <Field name="member_id" label="Related member" options={c.members} value={val("member_id")}/>
      <Field name="department_id" label="Department" options={c.departments} value={val("department_id")}/>
      <Field name="event_id" label="Event" options={c.events} value={val("event_id")}/>
      <Field name="pledge_id" label="Sponsorship or donation pledge" options={c.pledges} value={val("pledge_id")}/>
      <Field name="method" label="Payment method" options={enumOptions(methods)} value={val("method")}/>
      <Field name="reference" label="Payment reference" value={val("reference")}/>
      <Field name="debit_id" label="Adjustment debit account" options={c.chart} value={val("debit_id")}/>
      <Field name="credit_id" label="Adjustment credit account" options={c.chart} value={val("credit_id")}/>
      <Field name="due_date" label="Member due date" type="date" value={val("due_date")}/>
      <Field name="description" label="Description" type="textarea" value={val("description")} required wide/>
    </div><p className="form-help">Find your draft in Transactions to attach a bill, submit for approval, or post after approval.</p>
  </ActionForm>;
}
export function DocumentForm({c,row,pledge}:{c:Choices;row?:StoreRow;pledge?:StoreRow}) {
  return <ActionForm command="document_add" submit="Upload document"><div className="form-grid">
    {row?<Hidden name="transaction_id" value={value(row,"id")}/>:<Field name="transaction_id" label="Transaction ID" hint="Find the full ID on a transaction’s details page."/>}
    {pledge?<Hidden name="pledge_id" value={value(pledge,"id")}/>:<Field name="pledge_id" label="Pledge" options={c.pledges}/>}
    <Field name="kind" label="Document type" options={enumOptions(["bill","voucher","receipt","sponsorship"])} value={pledge?"sponsorship":"bill"} required/>
    <Field name="file" label="Attachment" type="file" accept={accept} required/>
  </div></ActionForm>;
}

export async function Transactions({db,params}:{db:Screen["db"];params:Screen["params"]}) {
  const selected=one(params,"id");
  const c=await choices(db);
  if(one(params,"new")) {
    const kind=one(params,"kind");
    const initial={...idFilters(params,"year_id","category_id","account_id","member_id","department_id","event_id","pledge_id"),
      kind:kinds.includes(kind as typeof kinds[number])&&kind!=="reversal"?kind:"income",
      operation:operations.some(([v])=>v===one(params,"operation"))?one(params,"operation"):"standard"};
    return <ShowForm path={path} title="New transaction"><TransactionForm c={c} initial={initial}/></ShowForm>;
  }
  if(selected) {
    const [row,journal,approvals,documents,creatorAndVerifier]=await Promise.all([
      record(db,"transaction_detail",selected),smallList(db,"journal_detail","account_code",{transaction_id: selected},100),
      smallList(db,"approvals","created_at",{transaction_id:selected},100),smallList(db,"documents","created_at",{transaction_id:selected},100),
      smallList(db,"users","created_at",{},100),
    ]);
    const state=value(row,"state");
    const yearOpen=c.openYears.some(year=>year.value===row.year_id);
    const isReversal=row.kind==="reversal";
    const userName=(id:unknown)=>creatorAndVerifier.find(user=>user.id===id)?.name as string|undefined;
    return <div className="detail-stack"><Back path={path}/><Heading title={value(row,"description")} description={value(row,"code")} actions={<Status state={state}/>}/>
      <Card title="Transaction details"><Info fields={[
        ["Transaction ID",value(row,"id")],["Date",dateLabel(row.transaction_date)],["Type",human(value(row,"kind"))],["Amount",money(row.amount)],
        ["Category",value(row,"category")],["Account",value(row,"account_name")],["Member",value(row,"member_name")],["Department",value(row,"department_name")],
        ["Event",value(row,"event_name")],["Academic year",c.years.find(y=>y.value===row.year_id)?.label],["Payment method",human(value(row,"method"))],
        ["Reference",value(row,"reference")],["Creator",userName(row.created_by)],["Verified by",userName(row.verified_by)],
        ["Created",dateLabel(row.created_at)],["Posted",dateLabel(row.posted_at)],["Approvals required",String(row.required_approvals)],
        ["Receipt",receiptLink(value(row,"receipt_id"),value(row,"receipt_number"))],
        ...(row.reversal_id?[["Reversed by",<Link key="reversal" className="text-link" href={path+"?id="+value(row,"reversal_id")}>Open reversal</Link>] as [string,React.ReactNode]]:[]),
      ]}/></Card>
      {state==="draft"||state==="rejected"?yearOpen&&!isReversal&&<Card title="Edit draft" className="form-card"><TransactionForm c={c} row={row}/></Card>:null}
      {yearOpen&&(!isReversal&&["draft","rejected"].includes(state)||state==="approved")&&<Card title="Posting workflow" className="form-card"><ActionForm command={state==="approved"?"transaction_post":"transaction_submit"} submit={state==="approved"?"Post transaction":"Submit for approval"}><Hidden name="id" value={selected}/><p className="form-help">{state==="approved"?"Posting updates the journal and account balances.":"Approval requirements are determined by the configured threshold."}</p></ActionForm></Card>}
      {state==="pending"&&<Card title="Approval decision" className="form-card"><DecisionForms id={selected}/></Card>}
      {state==="posted"&&row.kind!=="reversal"&&row.operation!=="closing"&&!row.reversal_id&&c.openYears.length>0&&<Card title="Reverse posted transaction" className="form-card">
        <ActionForm command="transaction_reverse" submit="Create reversal" variant="outline"><Hidden name="id" value={selected}/><div className="form-grid">
          <Field name="year_id" label="Reversal year" options={c.openYears} value={c.activeYear} required/><Field name="transaction_date" label="Reversal date" type="date" value={todayIndia()} required/>
          <Field name="reason" label="Reversal reason" type="textarea" wide required/>
        </div></ActionForm></Card>}
      {!!journal.length&&<Card title="Posted journal"><Table rows={journal} columns={[{key:"account",label:"Ledger account"},{key:"debit",label:"Debit",type:"money"},{key:"credit",label:"Credit",type:"money"}]}/></Card>}
      <Card title="Approval history"><Table rows={approvals} columns={[{key:"round",label:"Round"},{key:"actor_id",label:"Administrator",render:entry=>userName(entry.actor_id)||"—"},
        {key:"decision",label:"Decision",type:"status"},{key:"comment",label:"Comment"},{key:"created_at",label:"Date",type:"date"}]}/></Card>
      <Card title="Attachments"><Table rows={documents} columns={[{key:"file_name",label:"Document"},{key:"kind",label:"Type"},{key:"open",label:"Action",render:doc=><DocumentLink id={value(doc,"id")}/>}]}/></Card>
      {yearOpen&&<Card title="Attach a document" className="form-card"><DocumentForm c={c} row={row}/></Card>}
    </div>;
  }
  const state=one(params,"state"),kind=one(params,"kind");
  const filter={...idFilters(params,"year_id","category_id","account_id","member_id","department_id","event_id"),
    state:["draft","pending","approved","rejected","posted"].includes(state)?state:"",kind:kinds.some(k=>k===kind)?kind:""};
  const result=await list(db,"transaction_detail",params,{order:"transaction_date",date:"transaction_date",filter,relatedAccount:true,searchable:["code","description","reference","member_name","category"]});
  return <div className="detail-stack"><Heading title="Transactions" description="Review and manage the union’s financial entries." actions={<>
    <Button asChild variant="outline"><Link href={"/admin/reports"+queryString({report:"transaction-register",...idFilters(params,"year_id","department_id","event_id","member_id","account_id","category_id"),from:one(params,"from"),to:one(params,"to")})}><Download size={16}/> Export</Link></Button>
    <Add path={path} label="New transaction"/></>}/>
    <Filters path={path} params={params} search="Search transactions…" fields={[...dimensionFields(c),{name:"kind",label:"Type",options:enumOptions(kinds)},{name:"state",label:"Status",options:enumOptions(["draft","pending","approved","rejected","posted"])}]}/>
    <Card><TransactionTable rows={result.rows}/><Pagination {...result} path={path} params={params}/></Card></div>;
}
function DecisionForms({id}:{id:string}) {
  return <div className="split-forms">
    <ActionForm command="transaction_decide" submit="Approve" title="Approve this transaction"><Hidden name="id" value={id}/><Hidden name="decision" value="approved"/><Field name="reason" label="Approval comment" type="textarea"/></ActionForm>
    <ActionForm command="transaction_decide" submit="Reject" title="Reject this transaction" variant="danger"><Hidden name="id" value={id}/><Hidden name="decision" value="rejected"/><Field name="reason" label="Rejection reason" type="textarea" required/></ActionForm>
  </div>;
}
export async function Approvals({db,params}:Screen) {
  const c=await choices(db);
  const filter={...idFilters(params,"year_id")};
  const result=await list(db,"transaction_detail",params,{filter,statuses:["state",["pending","approved","rejected"]],searchable:["code","description","reference"]});
  return <div className="detail-stack"><Heading title="Approvals" description="Review maker-checker decisions and post approved transactions."/>
    <Filters path="/admin/approvals" params={params} search="Search approval queue…" fields={[{name:"year_id",label:"Academic year",options:c.years}]}/>
    <Card><TransactionTable rows={result.rows} compact/><Pagination {...result} path="/admin/approvals" params={params}/></Card>
    <Card title="Approval settings" className="form-card"><Link className="inline-link" href="/admin/settings">Manage thresholds and maker-checker rules <ArrowRight size={16}/></Link></Card></div>;
}

export async function Verification({db,params}:Screen) {
  const url="/admin/verification";
  const c=await choices(db);
  const selected=one(params,"id");
  if(selected) {
    const proof=await record(db,"payment_proofs",selected);
    const member=await record(db,"members",value(proof,"member_id"));
    const status=value(proof,"status");
    const reviewable=["submitted","under_review"].includes(status)&&!proof.transaction_id;
    const doc=value(proof,"document_id");
    return <div className="detail-stack"><Back path={url}/><Heading title={value(proof,"purpose")} description={value(member,"name")+" · "+value(proof,"reference")} actions={<Status state={status}/>}/>
      <Card title="Payment proof"><Info fields={[["Member",value(member,"name")],["Amount",money(proof.amount)],["Payment date",dateLabel(proof.payment_date)],["Method",human(value(proof,"method"))],
        ["Reference",value(proof,"reference")],["Notes",value(proof,"notes")],["Review note",value(proof,"review_note")],["Attachment",<DocumentLink key="attachment" id={doc}/>],
        ["Linked transaction",proof.transaction_id?<Link key="linked-transaction" className="text-link" href={path+"?id="+value(proof,"transaction_id")}>Open transaction</Link>:null]]}/></Card>
      {reviewable&&<>
        <Card title="Verify funds received" description="Confirm the payment in the receiving account before verifying." className="form-card">
          <ActionForm command="proof_review" submit="Verify payment"><Hidden name="id" value={selected}/><Hidden name="decision" value="verify"/><div className="form-grid">
            <Field name="account_id" label="Receiving account" options={c.openAccounts}/><Field name="category_id" label="Income category" options={c.categories}/>
            <Field name="operation" label="Accounting operation" options={[{value:"standard",label:"Recognise income"},{value:"due_payment",label:"Collect member dues"}]} value="standard" required/>
            <Field name="transaction_id" label="Existing posted transaction ID" hint="Leave blank to create a transaction. An existing transaction must match this proof."/>
            <Field name="reason" label="Verification note" type="textarea" wide/>
          </div></ActionForm>
        </Card>
        <Card title="Review or request a correction" className="form-card"><ActionForm command="proof_review" submit="Save review" variant="outline"><Hidden name="id" value={selected}/>
          <div className="form-grid"><Field name="decision" label="Decision" options={[{value:"review",label:"Mark under review"},{value:"correct",label:"Request resubmission"},{value:"reject",label:"Reject payment"}]} required/>
            <Field name="reason" label="Reason or resubmission instructions" type="textarea"/></div>
        </ActionForm></Card>
      </>}
    </div>;
  }
  const state=one(params,"status");
  const result=await list(db,"payment_proofs",params,{filter:{...idFilters(params,"year_id","member_id","event_id"),status:["submitted","under_review","verified","rejected"].includes(state)?state:""},searchable:["reference","purpose"],date:"payment_date"});
  return <div className="detail-stack"><Heading title="Payment Verification" description="Review member submissions and reconcile payments against funds received."/>
    <Filters path={url} params={params} search="Search reference or purpose…" fields={[
      {name:"status",label:"Status",options:enumOptions(["submitted","under_review","verified","rejected"])},{name:"year_id",label:"Academic year",options:c.years},
      {name:"member_id",label:"Member",options:c.members},{name:"event_id",label:"Event",options:c.events}]}/>
    <Card><Table rows={result.rows} columns={proofColumns}/><Pagination {...result} path={url} params={params}/></Card></div>;
}
export async function Documents({db,params}:Screen) {
  const url="/admin/documents",c=await choices(db);
  if(one(params,"new"))return <ShowForm path={url} title="Upload a financial document"><DocumentForm c={c}/></ShowForm>;
  const selected=one(params,"id");
  if(selected) {
    const d=await record(db,"documents",selected);
    return <div className="detail-stack"><Back path={url}/><Heading title={value(d,"file_name")} description={human(value(d,"kind"))} actions={<DocumentLink id={selected} label="Download" inline={false}/>}/>
      <Card className="form-card"><DocumentLink id={selected} label="Open private document"/><Info fields={[["Uploaded",dateLabel(d.created_at)],["Content type",value(d,"mime_type")],["Document ID",selected]]}/></Card></div>;
  }
  const kind=one(params,"kind");
  const [result,recent]=await Promise.all([list(db,"documents",params,{filter:{kind:["bill","voucher","receipt","proof","sponsorship"].includes(kind)?kind:""},searchable:["file_name"]}),smallList(db,"transaction_detail","posted_at",{state:"posted"},20)]);
  return <div className="detail-stack"><Heading title="Bills & Receipts" description="Store supporting documents and download official financial records." actions={<Add path={url} label="Upload document"/>}/>
    <Filters path={url} params={params} search="Search file name…" fields={[{name:"kind",label:"Type",options:enumOptions(["bill","voucher","receipt","proof","sponsorship"])}]}/>
    <Card title="Private documents"><Table rows={result.rows} columns={[{key:"file_name",label:"Document",render:row=><DetailLink path={url} row={row} field="file_name"/>},{key:"kind",label:"Type"},{key:"created_at",label:"Uploaded",type:"date"},{key:"open",label:"Actions",render:row=><DocumentLink id={value(row,"id")}/>}]}/><Pagination {...result} path={url} params={params}/></Card>
    <Card title="Recent receipts and vouchers" actions={<Link href={path} className="inline-link"><FilePlus2 size={16}/> All transactions</Link>}><TransactionTable rows={recent.filter(r=>r.receipt_id)}/></Card>
  </div>;
}
