import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, ChartNoAxesColumnIncreasing,
  CircleAlert, Clock3, Download, Landmark, Plus, ShieldCheck, WalletCards } from "lucide-react";
import { portalContext } from "@/lib/portal";
import { checkedId, queryError, smallList } from "@/lib/queries";
import { dateLabel, human, money, numeric, one, value, type StoreRow } from "@/lib/model";
import { translate } from "@/lib/i18n";
import { Card, Empty, Heading, Metric, Status, Table, type Params } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { BalanceChart, DepartmentChart, IncomeChart } from "@/components/charts";
import { TransactionTable } from "@/components/finance-table";

export default async function Dashboard({searchParams}:{searchParams:Promise<Params>}) {
  const {db,language}=await portalContext("admin");
  const yearId=checkedId(one(await searchParams,"year_id"));
  const [{data,error},years,settings]=await Promise.all([db.rpc("finance_dashboard",{yid:yearId||null}),
    smallList(db,"academic_years","start_date",{},50),smallList(db,"app_settings")]);
  queryError(error);
  const d=data as {year:StoreRow|null;totals:StoreRow;accounts:StoreRow[];monthly:StoreRow[];departments:StoreRow[];events:StoreRow[];budgets:StoreRow[];recent:StoreRow[];payments:StoreRow[];pending:StoreRow[];proofs:StoreRow[];due_dates:StoreRow[];activity:StoreRow[]};
  const t=(label:string)=>translate(language,label);
  const total=d.accounts.reduce((sum,entry)=>sum+numeric(entry,"balance"),0);
  const open=d.budgets.filter(row=>numeric(row,"utilization")>=numeric(settings[0],"budget_warning"));
  const year=value(d.year??undefined,"id");
  const yearQuery=year?"?year_id="+year:"";
  return <div className="dashboard">
    <Heading title={t("Dashboard")} description="An overview of NUSHA Students Union finances." actions={<>
      <form className="period-picker" action="/admin"><CalendarDays size={16}/><select name="year_id" aria-label="Academic year" defaultValue={year}><option value="">Active academic year</option>{years.map(row=><option value={value(row,"id")} key={value(row,"id")}>{value(row,"name")}</option>)}</select><button aria-label="Apply academic year"><ArrowRight size={15}/></button></form>
      <Button asChild variant="outline"><Link href={"/admin/reports?report=annual"+(year?"&year_id="+year:"")}><Download size={16}/>{t("Export report")}</Link></Button>
      <Button asChild><Link href="/admin/transactions?new=1"><Plus size={17}/>{t("New transaction")}</Link></Button></>}/>
    {!year&&<div className="notice"><CircleAlert size={17}/> Set an active academic year to view financial activity. <Link href="/admin/years">Manage academic years <ArrowRight size={15}/></Link></div>}
    <div className="metric-grid">
      <Metric label={t("Total income")} amount={money(d.totals.income)} note="Recognised income this period" icon={ArrowDownLeft} color="green" direction="up"/>
      <Metric label={t("Total expenses")} amount={money(d.totals.expenses)} note="Recognised expenses this period" icon={ArrowUpRight} color="purple" direction="down"/>
      <Metric label={t("Available balance")} amount={money(total)} note="Across all union accounts" icon={WalletCards}/>
      <Metric label={t("Outstanding dues")} amount={money(d.totals.dues)} note="Unpaid member dues" icon={Clock3} color="amber"/>
    </div>
    <div className="overview-grid">
      <Card title={t("Income & expenses")} description="Monthly activity for the selected academic year" className="chart-card">{d.monthly.length?<IncomeChart rows={d.monthly}/>:<Empty text="An academic year is required to chart monthly activity."/>}</Card>
      <Card title={t("Account balances")} description="Cash, bank, UPI and other accounts" className="chart-card" actions={<Link href="/admin/accounts" className="icon-button" aria-label="View union accounts"><ArrowUpRight size={17}/></Link>}>
        <BalanceChart accounts={d.accounts} total={total}/>
      </Card>
    </div>
    <div className="queue-grid">
      <Link className="queue-tile card" href={"/admin/verification"+yearQuery}><span className="metric-icon icon-amber"><BadgeCheck size={18}/></span><div><small>Payment proofs to review</small><strong>{numeric(d.totals,"proofs")}</strong></div><ArrowRight size={16}/></Link>
      <Link className="queue-tile card" href={"/admin/approvals"+yearQuery}><span className="metric-icon icon-blue"><ShieldCheck size={18}/></span><div><small>{t("Pending approvals")}</small><strong>{numeric(d.totals,"approvals")}</strong></div><ArrowRight size={16}/></Link>
      <Link className="queue-tile card" href={"/admin/budgets"+yearQuery}><span className="metric-icon icon-purple"><ChartNoAxesColumnIncreasing size={18}/></span><div><small>Department budgets</small><strong>{money(d.totals.department_budgets)}</strong></div><ArrowRight size={16}/></Link>
    </div>
    <Card title={t("Recent transactions")} description="The latest posted entries in the accounting journal" actions={<Button asChild variant="outline" size="small"><Link href={"/admin/transactions"+yearQuery}>{t("View all")} <ArrowRight size={15}/></Link></Button>}>
      <TransactionTable rows={d.recent} compact/>
    </Card>
    <div className="comparison-grid">
      <Card title="Department expenses" className="chart-card">{d.departments.length?<DepartmentChart rows={d.departments}/>:<Empty text="No posted department expenses in this period."/>}</Card>
      <Card title="Event finances" description={money(d.totals.event_expenses)+" total event expenses"}>
        <Table rows={d.events} columns={[{key:"name",label:"Event"},{key:"income",label:"Income",type:"money"},{key:"expenses",label:"Expenses",type:"money"},{key:"surplus",label:"Surplus",type:"money"}]}/>
      </Card>
      <Card title="Budget utilisation" actions={<Link className="inline-link" href={"/admin/budgets"+yearQuery}>Budgets <ArrowRight size={15}/></Link>}>
        {d.budgets.length?<div className="panel-list">{d.budgets.map(row=><div className="progress-row" key={value(row,"id")}><div><strong>{value(row,"name")}</strong><span>{value(row,"utilization")}%</span></div><progress max={100} value={Math.max(0,Math.min(100,numeric(row,"utilization")))} className={numeric(row,"utilization")>100?"over":""}/></div>)}</div>:<Empty text="Create a budget to monitor usage."/>}
      </Card>
      <Card title="Receivables & payables" className="chart-card"><div className="summary-list">{[
        ["Amount receivable",numeric(d.totals,"dues")+numeric(d.totals,"advances")],
        ["Outstanding sponsorship pledges",d.totals.pledges],["Amount payable",d.totals.payable],
        ...["cash","bank","upi"].map(kind=>[human(kind)+" balance",d.accounts.filter(row=>row.kind===kind).reduce((sum,row)=>sum+numeric(row,"balance"),0)]),
      ].map(([label,amount])=><div key={String(label)}><span><Landmark size={15}/>{String(label)}</span><strong>{money(amount)}</strong></div>)}</div></Card>
      <Card title="Payment verification" actions={<Link className="inline-link" href={"/admin/verification"+yearQuery}>Open queue <ArrowRight size={15}/></Link>}>
        <Table rows={d.proofs} columns={[{key:"purpose",label:"Payment",render:row=><Link className="text-link" href={"/admin/verification?id="+value(row,"id")}>{value(row,"purpose")}</Link>},{key:"member_name",label:"Member"},{key:"amount",label:"Amount",type:"money"},{key:"status",label:"Status",type:"status"}]}/>
      </Card>
      <Card title={t("Pending approvals")} actions={<Link className="inline-link" href={"/admin/approvals"+yearQuery}>Open queue <ArrowRight size={15}/></Link>}><TransactionTable rows={d.pending} compact/></Card>
      <Card title="Recent member payments"><TransactionTable rows={d.payments} compact/></Card>
      <Card title="Upcoming due dates"><Table rows={d.due_dates} columns={[{key:"description",label:"Due"},{key:"member_name",label:"Member"},{key:"due_date",label:"Date",type:"date"},{key:"amount",label:"Amount",type:"money"}]}/></Card>
      <Card title="Budget alerts"><Table rows={open} columns={[{key:"name",label:"Budget"},{key:"remaining",label:"Remaining",type:"money"},{key:"utilization",label:"Status",render:row=><Status state={numeric(row,"utilization")>100?"unmatched":"pending"}/>}]} empty="All listed budgets are below their alert threshold."/></Card>
      <Card title="Recent admin activity"><Table rows={d.activity} columns={[{key:"action",label:"Activity",render:row=>human(value(row,"action"))},{key:"actor_name",label:"Administrator"},{key:"created_at",label:"Date",render:row=>dateLabel(row.created_at)}]}/></Card>
    </div>
  </div>;
}
