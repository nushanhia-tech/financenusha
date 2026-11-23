import Link from "next/link";
import { ArrowRight, Download, Landmark } from "lucide-react";
import { ActionForm, Field, Hidden } from "../forms";
import { Card, Heading, Metric, Status, Table, type Column } from "../primitives";
import { Button } from "../ui/button";
import { receiptLink } from "../finance-table";
import { Add, Back, DetailLink, DocumentLink, Info, ListSection, ShowForm, idFilters, type Screen } from "./shared";
import { DocumentForm } from "./transactions";
import { choices, enumOptions, list, record, smallList, type Choices } from "@/lib/queries";
import { dateLabel, human, money, numeric, one, queryString, todayIndia, value, type StoreRow } from "@/lib/model";

const transaction="/admin/transactions";
const report="/admin/reports";
const txLink=(query:Record<string,string>)=>transaction+queryString({new:"1",...query});
const reportLink=(kind:string,key:string,id:string)=>report+queryString({report:kind,[key]:id});
const exportLink=(kind:string,key:string,id:string)=>"/api/download/report/"+kind+queryString({format:"pdf",[key]:id});
const yearField=(c:Choices,current="")=><Field name="year_id" label="Academic year" options={c.openYears} value={current||c.activeYear} required/>;
const amountField=(current="")=><Field name="amount" label="Amount (INR)" type="number" step="0.01" min="0.01" value={current} required/>;
const nameField=(current="")=><Field name="name" label="Name" value={current} required/>;
const optional=(row:StoreRow|undefined,key:string)=>value(row,key);

export async function Accounts({db,params}:Screen) {
  const path="/admin/accounts",c=await choices(db),selected=one(params,"id");
  const accountTypes=enumOptions(["cash","bank","upi","other"]);
  function accountForm(row?:StoreRow) {
    return <ActionForm command="account_save" submit={row?"Save account":"Create account"}><Hidden name="id" value={value(row,"id")}/><div className="form-grid">
      {nameField(value(row,"name"))}{row?<Hidden name="kind" value={value(row,"kind")}/>:<Field name="kind" label="Account type" options={accountTypes} required/>}
      {row&&<Field name="active" label="Account status" options={[{value:"true",label:"Active"},{value:"false",label:"Inactive"}]} value={String(row.active)} required/>}</div></ActionForm>;
  }
  if(one(params,"new"))return <ShowForm path={path} title="Create a union account">{accountForm()}</ShowForm>;
  if(selected) {
    const account=await record(db,"account_balances",selected);
    const [book,recons]=await Promise.all([smallList(db,"journal_detail","transaction_date",{financial_account_id:selected},24),smallList(db,"account_reconciliations","statement_date",{account_id:selected},24)]);
    const bookType=["cash","bank","upi"].includes(value(account,"kind"))?value(account,"kind")+"-book":"general-ledger";
    return <div className="detail-stack"><Back path={path}/><Heading title={value(account,"name")} description={human(value(account,"kind"))+" account"} actions={<Button asChild variant="outline"><Link href={reportLink(bookType,"account_id",selected)}><Download size={16}/> Account book</Link></Button>}/>
      <div className="metric-grid single-metric"><Metric label="Account balance" amount={money(account.balance)} note="Posted account movements" icon={Landmark}/></div>
      {Boolean(account.active)&&<div className="heading-actions">
        <Button asChild><Link href={txLink({account_id:selected,kind:"income"})}>Record deposit</Link></Button>
        <Button asChild variant="outline"><Link href={txLink({account_id:selected,kind:"expense"})}>Record withdrawal</Link></Button>
        <Button asChild variant="outline"><Link href={txLink({account_id:selected,kind:"transfer"})}>Transfer funds</Link></Button>
        <Button asChild variant="outline"><Link href={txLink({account_id:selected,kind:"adjustment",operation:"opening"})}>Record opening balance</Link></Button>
      </div>}
      <Card title="Recent account ledger" actions={<Link className="inline-link" href={reportLink(bookType,"account_id",selected)}>Full account book <ArrowRight size={15}/></Link>}>
        <Table rows={book} columns={[{key:"transaction_date",label:"Date",type:"date"},{key:"code",label:"Transaction",render:r=><Link className="text-link" href={transaction+"?id="+value(r,"transaction_id")}>{value(r,"code")}</Link>},{key:"description",label:"Description"},{key:"debit",label:"Inflow",type:"money"},{key:"credit",label:"Outflow",type:"money"}]}/>
      </Card>
      <Card title="Reconcile a statement" className="form-card"><ActionForm command="reconcile" submit="Reconcile account"><Hidden name="account_id" value={selected}/><div className="form-grid">
        {yearField(c)}<Field name="statement_date" label="Statement date" type="date" value={todayIndia()} required/><Field name="actual_balance" label="Actual balance (INR)" type="number" step="0.01" required/>
        <Field name="csv" label="Statement CSV (optional)" type="file" accept=".csv,text/csv" hint="Header reference,amount. Use positive deposits and negative withdrawals. Include all posted movements for the period to match statement lines."/>
      </div></ActionForm></Card>
      <Card title="Reconciliation history"><Table rows={recons} columns={[
        {key:"statement_date",label:"Date",type:"date"},{key:"system_balance",label:"System",type:"money"},{key:"actual_balance",label:"Actual",type:"money"},
        {key:"unmatched",label:"Differences",render:row=>{const unmatched=Array.isArray(row.unmatched)?row.unmatched:[];return <details className="row-details"><summary><Status state={unmatched.length||numeric(row,"system_balance")!==numeric(row,"actual_balance")?"unmatched":"matched"}/></summary><p>Balance difference {money(numeric(row,"actual_balance")-numeric(row,"system_balance"))}</p>{unmatched.map((line,i)=><p key={i}>{human(line.system_only?"system only":"statement only")} · {line.reference??line.code??"No reference"} · {money(line.amount)}</p>)}</details>;
        }}]}/></Card>
      <Card title="Account details" className="form-card">{accountForm(account)}</Card>
    </div>;
  }
  const kind=one(params,"kind");
  const result=await list(db,"account_balances",params,{searchable:["name"],filter:{kind:["cash","bank","upi","other"].includes(kind)?kind:""}});
  return <ListSection path={path} params={params} result={result} title="Union Accounts" description="Manage financial accounts, balances, and reconciliation." search="Search accounts…" fields={[{name:"kind",label:"Account type",options:accountTypes}]} actions={<Add path={path} label="New account"/>} columns={[
    {key:"name",label:"Account",render:row=><DetailLink path={path} row={row}/>},{key:"kind",label:"Type",render:row=>human(value(row,"kind"))},{key:"balance",label:"Balance",type:"money"},
    {key:"active",label:"Status",render:row=><Status state={row.active?"active":"inactive"}/>},
  ]}/>;
}
export async function Members({db,params}:Screen) {
  const path="/admin/members",c=await choices(db),selected=one(params,"id");
  function memberForm(row?:StoreRow) {
    return <ActionForm command="member_save" submit={row?"Save member":"Create member"}><Hidden name="id" value={value(row,"id")}/><div className="form-grid">
      {nameField(value(row,"name"))}
      {row?.user_id?<Hidden name="email" value={value(row,"email")}/>:<Field name="email" label="Email" type="email" value={value(row,"email")} required/>}
      <Field name="phone" label="Phone" type="tel" value={value(row,"phone")}/><Field name="department_id" label="Department" options={c.departments} value={value(row,"department_id")}/>
      {row?<Hidden name="year_id" value={value(row,"year_id")}/>:yearField(c)}<Field name="payment_profile" label="Payment profile" value={value(row,"payment_profile")} type="textarea" wide/>
    </div></ActionForm>;
  }
  if(one(params,"new"))return <ShowForm path={path} title="Add member">{memberForm()}</ShowForm>;
  if(one(params,"import"))return <ShowForm path={path} title="Import members"><ActionForm command="member_import" submit="Import members"><div className="form-grid">
    {yearField(c)}<Field name="department_id" label="Department" options={c.departments}/><Field name="csv" label="Member CSV" type="file" accept=".csv,text/csv" hint="Use name,email,phone. Duplicate emails reject the whole batch." required wide/>
  </div></ActionForm></ShowForm>;
  if(selected) {
    const row=await record(db,"member_summary",selected);
    const [ledger,proofs]=await Promise.all([smallList(db,"ledger_detail","transaction_date",{member_id:selected},20),smallList(db,"payment_proofs","created_at",{member_id:selected},15)]);
    return <div className="detail-stack"><Back path={path}/><Heading title={value(row,"name")} description={value(row,"member_number")} actions={<Button asChild variant="outline"><Link href={exportLink("member-ledger","member_id",selected)}><Download size={16}/> Member statement</Link></Button>}/>
      <Card title="Member account"><Info fields={[
        ["Email",value(row,"email")],["Phone",value(row,"phone")],["Department",c.departments.find(d=>d.value===row.department_id)?.label],
        ["Login status",row.user_id?"Username assigned":"Needs a login"],["Username",row.user_id?value(row,"member_number").toLowerCase():"—"],["Membership",<Status key="member-status" state={row.active?"active":"inactive"}/>],
        ["Total paid",money(row.total_paid)],["Contributions",money(row.contributions)],["Amount due",money(row.amount_due)],["Union owes",money(row.union_owes)],
        ["Refunds",money(row.refunds)],["Reimbursements",money(row.reimbursements)],["Outstanding advances",money(row.advances)],
      ]}/></Card>
      <div className="heading-actions">
        {Boolean(row.active)&&<ActionForm compact command={row.user_id?"member_login_reset":"member_login_create"} submit={row.user_id?"Reset member password":"Create member login"}><Hidden name="id" value={selected}/></ActionForm>}
        <ActionForm compact command="member_status" variant="outline" submit={row.active?"Deactivate member":"Activate member"}><Hidden name="id" value={selected}/><Hidden name="active" value={String(!row.active)}/></ActionForm>
        {numeric(row,"amount_due")>0&&<ActionForm compact command="member_reminder" variant="outline" submit="Send dues reminder"><Hidden name="id" value={selected}/></ActionForm>}
        <Button asChild size="small"><Link href={txLink({member_id:selected,kind:"income",operation:"due"})}>Raise dues</Link></Button>
        <Button asChild variant="outline" size="small"><Link href={txLink({member_id:selected,kind:"reimbursement",operation:"payable"})}>Record payable</Link></Button>
      </div>
      <Card title="Recent member ledger" actions={<Link className="inline-link" href={reportLink("member-ledger","member_id",selected)}>Full member ledger <ArrowRight size={15}/></Link>}><Table rows={ledger} columns={[
        {key:"code",label:"Transaction",render:l=><Link className="text-link" href={transaction+"?id="+value(l,"transaction_id")}>{value(l,"description")}</Link>},
        {key:"transaction_date",label:"Date",type:"date"},{key:"cash_delta",label:"Member movement",type:"money"},{key:"due_delta",label:"Dues change",type:"money"},
        {key:"payable_delta",label:"Payable change",type:"money"},{key:"receipt_id",label:"Receipt",render:l=>receiptLink(value(l,"receipt_id"))},
      ]}/></Card>
      <Card title="Payment proof history" actions={<Link className="inline-link" href={"/admin/verification?member_id="+selected}>All submissions <ArrowRight size={15}/></Link>}><Table rows={proofs} columns={[
        {key:"purpose",label:"Purpose",render:p=><DetailLink path="/admin/verification" row={p} field="purpose"/>},{key:"reference",label:"Reference"},
        {key:"amount",label:"Amount",type:"money"},{key:"status",label:"Status",type:"status"},
      ]}/></Card>
      <Card title="Edit member" className="form-card">{memberForm(row)}</Card></div>;
  }
  const active=one(params,"active");
  const result=await list(db,"member_summary",params,{searchable:["name","email","member_number","phone"],filter:{...idFilters(params,"department_id","year_id"),active:["true","false"].includes(active)?active:""}});
  return <ListSection path={path} params={params} result={result} title="Members" description="Manage membership, portal access, and individual financial records." search="Search name, email or member ID…" fields={[
    {name:"department_id",label:"Department",options:c.departments},{name:"year_id",label:"Academic year",options:c.years},{name:"active",label:"Status",options:[{value:"true",label:"Active"},{value:"false",label:"Inactive"}]},
  ]} actions={<><Button asChild variant="outline"><Link href={path+"?import=1"}>Import CSV</Link></Button><Add path={path} label="Add member"/></>} columns={[
    {key:"name",label:"Member",render:row=><DetailLink path={path} row={row}/>},{key:"member_number",label:"Member ID"},{key:"email",label:"Email"},{key:"amount_due",label:"Amount due",type:"money"},
    {key:"active",label:"Status",render:row=><Status state={row.active?"active":"inactive"}/>},{key:"user_id",label:"Login",render:row=>row.user_id?"Username assigned":"Needs a login"},
  ]}/>;
}
export async function Departments({db,params}:Screen) {
  const path="/admin/departments",selected=one(params,"id");
  const form=(row?:StoreRow)=><ActionForm command="department_save" submit={row?"Save department":"Create department"}><Hidden name="id" value={value(row,"id")}/><div className="form-grid">{nameField(value(row,"name"))}<Field name="description" label="Description" value={value(row,"description")} type="textarea" wide/></div></ActionForm>;
  if(one(params,"new"))return <ShowForm path={path} title="Create department">{form()}</ShowForm>;
  if(selected) {
    const [row,events,budgets,recent]=await Promise.all([record(db,"departments",selected),smallList(db,"event_summary","event_date",{department_id:selected}),smallList(db,"budget_summary","created_at",{department_id:selected}),smallList(db,"transaction_detail","transaction_date",{department_id:selected,state:"posted"},15)]);
    return <div className="detail-stack"><Back path={path}/><Heading title={value(row,"name")} description={value(row,"description")} actions={<>
      <Button asChild variant="outline"><Link href={reportLink("department","department_id",selected)}><Download size={16}/> Department report</Link></Button>
      <Button asChild><Link href={"/admin/budgets?new=1&scope=department&department_id="+selected}>Allocate budget</Link></Button></>}/>
      <Card title="Budgets"><Table rows={budgets} columns={budgetColumns}/></Card>
      <Card title="Department events"><Table rows={events} columns={eventColumns}/></Card>
      <Card title="Recent transactions" actions={<Link className="inline-link" href={transaction+"?department_id="+selected}>All transactions <ArrowRight size={15}/></Link>}><Table rows={recent} columns={summaryTransactions}/></Card>
      <Card title="Edit department" className="form-card">{form(row)}</Card></div>;
  }
  const result=await list(db,"departments",params,{searchable:["name","description"]});
  return <ListSection path={path} params={params} result={result} title="Departments" description="Manage union departments and review their budgets and financial activity." search="Search departments…" actions={<Add path={path} label="New department"/>} columns={[{key:"name",label:"Department",render:row=><DetailLink path={path} row={row}/>},{key:"description",label:"Description"},{key:"created_at",label:"Created",type:"date"}]}/>;
}
const eventColumns:Column[]=[{key:"name",label:"Event",render:row=><DetailLink path="/admin/events" row={row}/>},{key:"event_date",label:"Date",type:"date"},{key:"budget",label:"Budget",type:"money"},{key:"income",label:"Income",type:"money"},{key:"expenses",label:"Expenses",type:"money"},{key:"remaining",label:"Remaining",type:"money"},{key:"surplus",label:"Surplus / deficit",type:"money"}];
const summaryTransactions:Column[]=[{key:"description",label:"Transaction",render:row=><DetailLink path={transaction} row={row} field="description"/>},{key:"transaction_date",label:"Date",type:"date"},{key:"kind",label:"Type"},{key:"amount",label:"Amount",type:"money"}];
export async function Events({db,params}:Screen) {
  const path="/admin/events",c=await choices(db),selected=one(params,"id");
  const form=(row?:StoreRow)=><ActionForm command="event_save" submit={row?"Save event":"Create event"}><Hidden name="id" value={value(row,"id")}/><div className="form-grid">
    {nameField(value(row,"name"))}{row?<Hidden name="year_id" value={value(row,"year_id")}/>:yearField(c)}
    <Field name="event_date" label="Event date" type="date" value={optional(row,"event_date")||todayIndia()} required/><Field name="department_id" label="Department" options={c.departments} value={optional(row,"department_id")}/>
    <Field name="description" label="Description" value={optional(row,"description")} type="textarea" wide/></div></ActionForm>;
  if(one(params,"new"))return <ShowForm path={path} title="Create event">{form()}</ShowForm>;
  if(selected) {
    const [row,recent,pledges]=await Promise.all([record(db,"event_summary",selected),smallList(db,"transaction_detail","transaction_date",{event_id:selected,state:"posted"},15),smallList(db,"pledge_summary","created_at",{event_id:selected},12)]);
    const open=c.openYears.some(y=>y.value===row.year_id),query={event_id:selected,year_id:value(row,"year_id")};
    return <div className="detail-stack"><Back path={path}/><Heading title={value(row,"name")} description={dateLabel(row.event_date)} actions={<Button asChild variant="outline"><Link href={reportLink("event","event_id",selected)}><Download size={16}/> Event settlement report</Link></Button>}/>
      <Card title="Event finances"><Info fields={[["Income",money(row.income)],["Expenses",money(row.expenses)],["Budget",money(row.budget)],["Remaining",money(row.remaining)],["Surplus / deficit",money(row.surplus)],["Description",value(row,"description")]]}/></Card>
      {open&&<div className="heading-actions"><Button asChild><Link href={txLink({...query,kind:"income"})}>Record event income</Link></Button><Button asChild variant="outline"><Link href={txLink({...query,kind:"expense"})}>Record event expense</Link></Button>
        <Button asChild variant="outline"><Link href={"/admin/budgets"+queryString({new:"1",scope:"event",...query})}>Allocate event budget</Link></Button><Button asChild variant="outline"><Link href={"/admin/sponsorship"+queryString({pledge:"1",...query})}>Link sponsor</Link></Button></div>}
      <Card title="Recent event transactions" actions={<Link className="inline-link" href={transaction+"?event_id="+selected}>All transactions <ArrowRight size={15}/></Link>}><Table rows={recent} columns={summaryTransactions}/></Card>
      <Card title="Event pledges"><Table rows={pledges} columns={pledgeColumns}/></Card>
      {open&&<Card title="Edit event" className="form-card">{form(row)}</Card>}</div>;
  }
  const result=await list(db,"event_summary",params,{filter:idFilters(params,"year_id","department_id"),order:"event_date",searchable:["name","description"]});
  return <ListSection path={path} params={params} result={result} title="Events & Programs" description="Monitor event income, expenses, and settlements." search="Search events…" fields={[{name:"year_id",label:"Academic year",options:c.years},{name:"department_id",label:"Department",options:c.departments}]} actions={<Add path={path} label="New event"/>} columns={eventColumns}/>;
}
const pledgeColumns:Column[]=[{key:"sponsor",label:"Sponsor / donor",render:r=><Link className="text-link" href={"/admin/sponsorship?pledge_id="+value(r,"id")}>{value(r,"sponsor")}</Link>},{key:"kind",label:"Type"},{key:"amount",label:"Promised",type:"money"},{key:"received",label:"Received",type:"money"},{key:"outstanding",label:"Outstanding",type:"money"},{key:"due_date",label:"Due",type:"date"}];
export async function Sponsorship({db,params}:Screen) {
  const path="/admin/sponsorship",c=await choices(db),selected=one(params,"id"),pledge=one(params,"pledge_id");
  const form=(row?:StoreRow)=><ActionForm command="sponsor_save" submit={row?"Save contact":"Create contact"}><Hidden name="id" value={value(row,"id")}/><div className="form-grid">
    {nameField(value(row,"name"))}{row?<Hidden name="kind" value={value(row,"kind")}/>:<Field name="kind" label="Contact type" options={enumOptions(["sponsor","donor"])} required/>}
    <Field name="email" label="Email" type="email" value={value(row,"email")}/><Field name="description" label="Notes" type="textarea" value={value(row,"notes")} wide/>
  </div></ActionForm>;
  if(one(params,"new"))return <ShowForm path={path} title="Add sponsor or donor">{form()}</ShowForm>;
  if(one(params,"pledge")) return <ShowForm path={path} title="Record a pledge"><ActionForm command="pledge_save" submit="Record pledge"><div className="form-grid">
    <Field name="sponsor_id" label="Sponsor or donor" options={c.sponsors} value={one(params,"sponsor_id")} required/>{yearField(c,one(params,"year_id"))}
    <Field name="event_id" label="Event" options={c.events} value={one(params,"event_id")}/>{amountField()}<Field name="due_date" label="Expected payment date" type="date"/>
  </div></ActionForm></ShowForm>;
  if(pledge) {
    const [row,payments,docs]=await Promise.all([record(db,"pledge_summary",pledge),smallList(db,"transaction_detail","transaction_date",{pledge_id:pledge,state:"posted"},15),smallList(db,"documents","created_at",{pledge_id:pledge},20)]);
    const open=c.openYears.some(y=>y.value===row.year_id);
    const cat=c.categories.find(x=>x.label===(row.kind==="donor"?"Donations":"Sponsorship"))?.value??"";
    return <div className="detail-stack"><Back path={path}/><Heading title={value(row,"sponsor")+" pledge"} actions={open&&<Button asChild><Link href={txLink({kind:"income",year_id:value(row,"year_id"),event_id:value(row,"event_id"),pledge_id:pledge,category_id:cat})}>Record payment</Link></Button>}/>
      <Card title="Pledge details"><Info fields={[["Promised",money(row.amount)],["Received",money(row.received)],["Outstanding",money(row.outstanding)],["Expected",dateLabel(row.due_date)]]}/></Card>
      <Card title="Payment history"><Table rows={payments} columns={[...summaryTransactions,{key:"receipt_id",label:"Receipt",render:r=>receiptLink(value(r,"receipt_id"))}]}/></Card>
      <Card title="Supporting documents"><Table rows={docs} columns={[{key:"file_name",label:"Document"},{key:"id",label:"Action",render:r=><DocumentLink id={value(r,"id")}/>} ]}/></Card>
      {open&&<Card title="Attach pledge document" className="form-card"><DocumentForm c={c} pledge={row}/></Card>}</div>;
  }
  if(selected) {
    const [row,pledges]=await Promise.all([record(db,"sponsors",selected),smallList(db,"pledge_summary","created_at",{sponsor_id:selected},25)]);
    return <div className="detail-stack"><Back path={path}/><Heading title={value(row,"name")} description={human(value(row,"kind"))} actions={<Button asChild><Link href={path+"?pledge=1&sponsor_id="+selected}>New pledge</Link></Button>}/>
      <Card title="Pledge history"><Table rows={pledges} columns={pledgeColumns}/></Card><Card title="Edit contact" className="form-card">{form(row)}</Card></div>;
  }
  const kind=one(params,"kind"),filter={kind:["sponsor","donor"].includes(kind)?kind:""};
  const [result,pledges]=await Promise.all([list(db,"sponsors",params,{filter,searchable:["name","email","notes"]}),smallList(db,"pledge_summary","created_at",filter,30)]);
  return <ListSection path={path} params={params} result={result} title="Sponsorship & Donations" description="Track commitments, receipts, and outstanding amounts." search="Search sponsors and donors…" fields={[{name:"kind",label:"Contact type",options:enumOptions(["sponsor","donor"])}]} actions={<>
    <Button asChild variant="outline"><Link href={path+"?pledge=1"}>Record pledge</Link></Button><Add path={path} label="Add sponsor or donor"/></>} columns={[{key:"name",label:"Contact",render:r=><DetailLink path={path} row={r}/>},{key:"kind",label:"Type"},{key:"email",label:"Email"},{key:"notes",label:"Notes"}]}>
    <Card title="Recent pledges" actions={<div className="heading-actions"><Link className="inline-link" href={report+"?report=sponsorship"}>Sponsorship report</Link><Link className="inline-link" href={report+"?report=donation"}>Donation report</Link></div>}><Table rows={pledges} columns={pledgeColumns}/></Card>
  </ListSection>;
}
const budgetColumns:Column[]=[{key:"name",label:"Budget",render:r=><DetailLink path="/admin/budgets" row={r}/>},{key:"scope",label:"Scope"},{key:"amount",label:"Allocated",type:"money"},{key:"spent",label:"Spent",type:"money"},{key:"remaining",label:"Remaining",type:"money"},{key:"utilization",label:"Utilisation",type:"percent"}];
export async function Budgets({db,params}:Screen) {
  const path="/admin/budgets",c=await choices(db),selected=one(params,"id");
  const scopes=["annual","department","event","project"];
  if(one(params,"new"))return <ShowForm path={path} title="Allocate budget"><ActionForm command="budget_save" submit="Allocate budget"><div className="form-grid">
    {nameField()}{yearField(c,one(params,"year_id"))}<Field name="scope" label="Budget scope" options={enumOptions(scopes)} value={one(params,"scope")||"annual"} required/>{amountField()}
    <Field name="department_id" label="Department" options={c.departments} value={one(params,"department_id")}/><Field name="event_id" label="Event" options={c.events} value={one(params,"event_id")}/>
    <Field name="category_id" label="Project expense category" options={c.categories} hint="Required for project budgets."/>
  </div></ActionForm></ShowForm>;
  if(selected) {
    const [row,revs]=await Promise.all([record(db,"budget_summary",selected),smallList(db,"budget_revisions","created_at",{budget_id:selected},40)]);
    const open=c.openYears.some(y=>y.value===row.year_id);
    return <div className="detail-stack"><Back path={path}/><Heading title={value(row,"name")} description={human(value(row,"scope"))+" budget"}/>
      <Card title="Budget utilisation"><Info fields={[["Allocated",money(row.amount)],["Spent",money(row.spent)],["Remaining",money(row.remaining)],["Utilisation",value(row,"utilization")+"%"]]}/></Card>
      {open&&!revs.some(r=>r.status==="pending")&&<Card title="Propose budget revision" className="form-card"><ActionForm command="budget_revise" submit="Submit revision"><Hidden name="id" value={selected}/><div className="form-grid">{amountField()}<Field name="reason" label="Reason" type="textarea" required/></div></ActionForm></Card>}
      <Card title="Revision history"><Table rows={revs} columns={[{key:"amount",label:"New allocation",type:"money"},{key:"reason",label:"Reason"},{key:"status",label:"Status",type:"status"},{key:"created_at",label:"Date",type:"date"},{key:"decision",label:"Decision",render:r=>r.status==="pending"?<div className="heading-actions">
        {["approved","rejected"].map(v=><ActionForm key={v} command="budget_decide" submit={v==="approved"?"Approve":"Reject"} compact variant={v==="approved"?"outline":"danger"}><Hidden name="id" value={value(r,"id")}/><Hidden name="decision" value={v}/></ActionForm>)}</div>:"—"}]}/></Card></div>;
  }
  const scope=one(params,"scope");
  const result=await list(db,"budget_summary",params,{filter:{...idFilters(params,"year_id","department_id","event_id"),scope:scopes.includes(scope)?scope:""},searchable:["name"]});
  return <ListSection path={path} params={params} result={result} title="Budget Management" description="Allocate funds and compare approved budgets with actual expenses." search="Search budgets…" fields={[{name:"year_id",label:"Academic year",options:c.years},{name:"scope",label:"Scope",options:enumOptions(scopes)}]} actions={<>
    <Button asChild variant="outline"><Link href={report+"?report=budget"}><Download size={16}/> Budget report</Link></Button><Add path={path} label="Allocate budget"/></>} columns={budgetColumns}/>;
}
