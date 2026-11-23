import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, ChartNoAxesColumnIncreasing,
  CircleAlert, Clock3, Download, Landmark, Plus, ShieldCheck, WalletCards } from "lucide-react";
import { portalContext } from "@/lib/portal";
import { checkedId, queryError, smallList } from "@/lib/queries";
import { dateLabel, human, money, numeric, one, queryString, todayIndia, value, type StoreRow } from "@/lib/model";
import { translate } from "@/lib/i18n";
import { Card, Empty, Heading, Status, Table, type Params } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { BalanceChart, DepartmentChart, IncomeChart } from "@/components/charts";
import { TransactionTable } from "@/components/finance-table";
import { DashboardActivity } from "@/components/dashboard-activity";
import { ActivityBars, PhoneSummary } from "@/components/dashboard-summary";

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
  const yearQuery=queryString({year_id:year});
  const createHref="/admin/transactions"+queryString({new:"1",year_id:d.year?.closed_at?undefined:year});
  const exportHref="/api/download/report/transaction-register"+queryString({format:"csv",year_id:year});
  const [currentYear,currentMonth]=todayIndia().split("-").map(Number);
  const [startYear,startMonth]=value(d.year??undefined,"start_date").split("-").map(Number);
  const elapsedMonths=Math.min(d.monthly.length,Math.max(1,(currentYear-startYear)*12+currentMonth-startMonth+1))||0;
  const monthRows=d.monthly.slice(0,elapsedMonths);

  return <div className="dashboard finance-dashboard">
    <Heading title="Dashboard" description="Track the union’s finances and review pending work." actions={<>
      <form className="period-picker" action="/admin">
        <CalendarDays size={16} aria-hidden="true"/>
        <select name="year_id" aria-label={t("Academic year")} defaultValue={year}>
          <option value="">{t("Active academic year")}</option>
          {years.map(row=><option value={value(row,"id")} key={value(row,"id")}>{value(row,"name")}</option>)}
        </select>
        <button aria-label={t("Apply academic year")} title={t("Apply academic year")}><ArrowRight size={15}/></button>
      </form>
      <Button asChild className="dashboard-export"><a href={exportHref} aria-label={t("Export transactions as CSV")} title={t("Export transactions as CSV")}><Download size={16}/><span>{t("Export CSV")}</span></a></Button>
      <Button asChild className="dashboard-create-mobile" variant="outline"><Link href={createHref} aria-label={t("New transaction")} title={t("New transaction")}><Plus size={18}/></Link></Button>
    </>}/>

    {!year&&<div className="notice"><CircleAlert size={17}/> Set an active academic year to view financial activity. <Link href="/admin/years">Manage academic years <ArrowRight size={15}/></Link></div>}

    <PhoneSummary key={year} monthly={d.monthly} elapsedMonths={elapsedMonths} total={total} income={d.totals.income} expenses={d.totals.expenses}/>

    <div className="finance-summary">
      <section className="balance-board" aria-labelledby="available-balance-title">
        <div className="balance-board-top">
          <span className="balance-board-icon"><WalletCards size={19} aria-hidden="true"/></span>
          <h2 id="available-balance-title">{t("Available balance")}</h2>
          <span className="balance-currency">INR</span>
        </div>
        <strong className="balance-board-value">{money(total)}</strong>
        <div className="balance-board-chart"><span>{t("Posted transactions by month")}</span><ActivityBars rows={monthRows.slice(-8)} compact/></div>
        <div className="balance-board-actions">
          <Link href={createHref} className="balance-primary-action">{t("New transaction")} <ArrowUpRight size={14} aria-hidden="true"/></Link>
          <Link href="/admin/accounts" className="balance-secondary-action">{t("Union Accounts")}</Link>
        </div>
      </section>

      <div className="finance-totals">
        <section className="card finance-total">
          <span className="metric-icon icon-green"><ArrowDownLeft size={19} aria-hidden="true"/></span>
          <div><h2>{t("Total income")}</h2><strong>{money(d.totals.income)}</strong></div>
        </section>
        <section className="card finance-total">
          <span className="metric-icon icon-purple"><ArrowUpRight size={19} aria-hidden="true"/></span>
          <div><h2>{t("Total expenses")}</h2><strong>{money(d.totals.expenses)}</strong></div>
        </section>
      </div>

      <section className="card finance-dues" aria-labelledby="outstanding-dues-title">
        <div className="finance-dues-heading">
          <span className="metric-icon icon-amber"><Clock3 size={18} aria-hidden="true"/></span>
          <h2 id="outstanding-dues-title">{t("Outstanding dues")}</h2>
          <Link href={"/admin/reports"+queryString({report:"member-dues",year_id:year})} className="icon-button" aria-label={t("View member dues")} title={t("View member dues")}><ArrowUpRight size={17}/></Link>
        </div>
        <strong className="finance-dues-value">{money(d.totals.dues)}</strong>
        <div className="finance-dues-links">
          <Link href={"/admin/verification"+yearQuery}><BadgeCheck size={15} aria-hidden="true"/><span>{t("Payment proofs to review")}</span><strong>{numeric(d.totals,"proofs")}</strong></Link>
          <Link href={"/admin/approvals"+yearQuery}><ShieldCheck size={15} aria-hidden="true"/><span>{t("Pending approvals")}</span><strong>{numeric(d.totals,"approvals")}</strong></Link>
        </div>
      </section>
    </div>

    <div className="finance-dashboard-grid">
      <Card title="Cash flow" description="Monthly income and expenses" className="finance-flow-card">
        {d.monthly.length?<IncomeChart rows={d.monthly}/>:<Empty text="An academic year is required to chart monthly activity."/>}
      </Card>

      <Card title="Account balances" description="Cash, bank, UPI and other accounts" className="finance-accounts-card" actions={<Link href="/admin/accounts" className="icon-button" aria-label={t("View union accounts")} title={t("View union accounts")}><ArrowUpRight size={17}/></Link>}>
        <BalanceChart accounts={d.accounts} total={total}/>
      </Card>

      <DashboardActivity rows={d.recent} href={"/admin/transactions"+yearQuery}/>

      <Link className="queue-tile card finance-budget-tile" href={"/admin/budgets"+yearQuery}>
        <span className="metric-icon icon-purple"><ChartNoAxesColumnIncreasing size={18}/></span><div><small>{t("Department budgets")}</small><strong>{money(d.totals.department_budgets)}</strong></div><ArrowRight size={16}/>
      </Link>
    </div>

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
