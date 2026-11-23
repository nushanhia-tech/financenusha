import Link from "next/link";
import { ArrowRight, Download, Shield } from "lucide-react";
import { ActionForm, Field, Hidden } from "../forms";
import { Card, Heading, Pagination, Status, Table, type Column } from "../primitives";
import { Filters } from "../filters";
import { Button } from "../ui/button";
import { Add, Back, DetailLink, Info, ListSection, ShowForm, dimensionFields, type Screen } from "./shared";
import { choices, enumOptions, list, queryError, record, smallList } from "@/lib/queries";
import { dateLabel, dimensions, human, one, queryString, reportNames, value, type Report, type StoreRow } from "@/lib/model";
import { reportFilters } from "@/lib/validation";

export async function Years({db,params}:Screen) {
  const path="/admin/years",selected=one(params,"id");
  if(one(params,"new"))return <ShowForm path={path} title="Create academic year"><ActionForm command="year_save" submit="Create year"><div className="form-grid">
    <Field name="name" label="Academic year name" placeholder="2026–27" required/><Field name="start_date" label="Start date" type="date" required/><Field name="end_date" label="End date" type="date" required/>
  </div></ActionForm></ShowForm>;
  if(selected) {
    const row=await record(db,"academic_years",selected);
    return <div className="detail-stack"><Back path={path}/><Heading title={value(row,"name")} description={dateLabel(row.start_date)+" – "+dateLabel(row.end_date)} actions={<Status state={row.closed_at?"closed":row.active?"active":"open"}/>}/>
      <Card title="Year-end checklist" className="form-card"><div className="summary-list">
        <div><Link className="text-link" href={"/admin/transactions?year_id="+selected}>Review all transactions and pending postings</Link><ArrowRight size={16}/></div>
        <div><Link className="text-link" href="/admin/accounts">Reconcile accounts or record opening balances</Link><ArrowRight size={16}/></div>
        <div><Link className="text-link" href={"/admin/reports?report=annual&year_id="+selected}>Generate annual financial report</Link><ArrowRight size={16}/></div>
        <div><Link className="text-link" href={"/admin/reports?report=balance-sheet&year_id="+selected}>Review year-end balances</Link><ArrowRight size={16}/></div>
      </div></Card>
      {row.closed_at?<Card title="Period status"><Info fields={[["Closed on",dateLabel(row.closed_at)],["Carry forward","Asset, liability and equity balances flow into later periods through the cumulative journal."]]}/></Card>:<Card title="Manage academic year" className="form-card"><div className="split-forms">
        {!row.active&&<ActionForm command="year_activate" submit="Set active year"><Hidden name="id" value={selected}/></ActionForm>}
        <ActionForm command="year_notice" submit="Notify administrators" variant="outline"><Hidden name="id" value={selected}/></ActionForm>
        <ActionForm command="year_close" submit="Close and lock year" variant="danger"><Hidden name="id" value={selected}/><label className="confirmation"><input type="checkbox" required/> I have reviewed the year-end reports and reconciliations.</label></ActionForm>
      </div><p className="form-help">Closing locks the period and transfers net income and expenses to retained surplus.</p></Card>}</div>;
  }
  const result=await list(db,"academic_years",params,{order:"start_date",searchable:["name"]});
  return <ListSection path={path} params={params} result={result} title="Academic Year" description="Set operating periods, review closing requirements, and lock completed years." search="Search academic years…" actions={<Add path={path} label="New academic year"/>} columns={[
    {key:"name",label:"Academic year",render:r=><DetailLink path={path} row={r}/>},{key:"start_date",label:"Start",type:"date"},{key:"end_date",label:"End",type:"date"},
    {key:"active",label:"Status",render:r=><Status state={r.closed_at?"closed":r.active?"active":"open"}/>},
  ]}/>;
}
const moneyKeys=new Set(["Amount","Debit","Credit","Debits","Credits","Balance","Net","Member payment","Union payment","Dues change","Payable change","Advance change","Amount due","Income","Expenses","Surplus","Promised","Received","Outstanding","Allocated","Spent","Remaining"]);
export const isReport=(name:string):name is Report=>Object.hasOwn(reportNames,name);
export async function Reports({db,params}:Screen) {
  const path="/admin/reports",c=await choices(db),selected=one(params,"report");
  const report=isReport(selected)?selected:"transaction-register";
  const input=reportFilters.safeParse(Object.fromEntries(dimensions.map(key=>[key,one(params,key)])));
  const p=input.success?input.data:{};
  const {data,error}=await db.rpc("finance_report",{report,p,max_rows:5001});
  queryError(error);
  const rows=(Array.isArray(data)?data:[]) as StoreRow[];
  const page=Math.max(1,Math.min(500,Math.floor(Number(one(params,"page"))||1)));
  const columns:Column[]=Object.keys(rows[0]??{}).sort((a,b)=>{
    const order=["Date","Transaction","Name","Member","Account","Class","Budget","Scope","Description","Type","Category"];
    const index=(s:string)=>order.includes(s)?order.indexOf(s):order.length;
    return index(a)-index(b);
  }).map(key=>({key,label:key,type:moneyKeys.has(key)?"money":key==="Date"||key==="Due date"?"date":undefined}));
  const download=(format:string)=>"/api/download/report/"+report+queryString({...p,format});
  return <div className="detail-stack"><Heading title="Financial Reports" description="Generate reports from posted transactions and journal entries."/>
    <Filters path={path} params={{...params,report}} fields={[{name:"report",label:"Report",options:Object.entries(reportNames).map(([value,label])=>({value,label}))},...dimensionFields(c)]} sort={false}/>
    <Card title={reportNames[report]} description={rows.length>5000?"Preview limited to the first 5,000 rows. Use a narrower date range for export.":undefined}
      actions={<div className="heading-actions">{["pdf","xlsx","csv"].map(format=><Button key={format} asChild size="small" variant="outline"><a href={download(format)}><Download size={14}/>{format.toUpperCase()}</a></Button>)}</div>}>
      <Table rows={rows.slice((page-1)*20,page*20)} columns={columns} empty="No posted records matched this report."/>
      <Pagination path={path} params={{...params,report}} page={page} count={Math.min(rows.length,5000)} limit={20}/>
    </Card></div>;
}
export async function Audit({db,params}:Screen) {
  const path="/admin/audit",id=one(params,"id"),entity=one(params,"entity");
  const entities=["transactions","payment_proofs","members","financial_accounts","academic_years","reports","users","documents","budgets","budget_revisions","app_settings","account_reconciliations","events","departments","sponsors","sponsorship_pledges"];
  if(id) {
    const row=await record(db,"audit_logs",id);
    return <div className="detail-stack"><Back path={path}/><Heading title={human(value(row,"action"))} description={new Date(value(row,"created_at")).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}/>
      <Card title="Audit event"><Info fields={[["Actor ID",value(row,"actor_id")],["Entity",human(value(row,"entity"))],["Entity ID",value(row,"entity_id")]]}/></Card>
      <div className="comparison-grid"><Card title="Before"><pre className="json-view">{JSON.stringify(row.before_values,null,2)}</pre></Card><Card title="After"><pre className="json-view">{JSON.stringify(row.after_values,null,2)}</pre></Card></div></div>;
  }
  const [result,users]=await Promise.all([list(db,"audit_logs",params,{filter:{entity:entities.includes(entity)?entity:""},searchable:["action","entity"],date:"created_at"}),
    smallList(db,"users","created_at",{},500)]);
  return <ListSection title="Audit Logs" description="Review the append-only history of financial and administrative actions." path={path} params={params} result={result} search="Search action or entity…"
    fields={[{name:"entity",label:"Entity",options:enumOptions(entities)},{name:"from",label:"From",type:"date"},{name:"to",label:"To",type:"date"}]} columns={[
      {key:"action",label:"Action",render:row=><Link className="text-link" href={path+"?id="+value(row,"id")}>{human(value(row,"action"))}</Link>},
      {key:"actor_id",label:"Actor",render:row=>value(users.find(user=>user.id===row.actor_id),"name")||"System"},
      {key:"entity",label:"Entity",render:row=>human(value(row,"entity"))},{key:"created_at",label:"Date and time",render:row=>new Date(value(row,"created_at")).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})},
  ]}/>;
}
export async function Settings({db}:Screen) {
  const [row]=await smallList(db,"app_settings");
  const boolean=[{value:"true",label:"Enabled"},{value:"false",label:"Disabled"}];
  return <div className="detail-stack"><Heading title="Settings" description="Configure approval thresholds, MFA requirements, and budget alerts."/>
    <Card title="Financial controls" className="form-card"><ActionForm command="settings_save" submit="Save settings"><div className="form-grid">
      <Field name="approval_threshold" label="Single approval from (INR)" type="number" step="0.01" min="0" value={value(row,"approval_threshold")} required/>
      <Field name="high_threshold" label="Two approvals from (INR)" type="number" step="0.01" min="0" value={value(row,"high_threshold")} required/>
      <Field name="maker_checker" label="Maker-checker" options={boolean} value={String(row.maker_checker)} required/>
      <Field name="mfa_required" label="Require administrator MFA" options={boolean} value={String(row.mfa_required)} required/>
      <Field name="budget_warning" label="Budget warning threshold (%)" type="number" min="1" max="100" step="0.01" value={value(row,"budget_warning")} required/>
    </div><p className="form-help">With maker-checker enabled, two approvals require two different administrators in addition to the transaction creator.</p></ActionForm></Card>
    <Card title="Account security" className="form-card"><Button asChild variant="outline"><Link href="/mfa"><Shield size={16}/> Manage two-factor authentication</Link></Button></Card>
  </div>;
}
