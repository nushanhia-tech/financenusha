import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, ReceiptText } from "lucide-react";
import { dateLabel, human, money, numeric, value, type StoreRow } from "@/lib/model";
import { preferences } from "@/lib/preferences";
import { Card, Empty, Table } from "./primitives";
import { TransactionTable } from "./finance-table";
import { ledgerColumns } from "./member-ledger";

export async function DashboardActivity({rows,href,portal="admin"}:{rows:StoreRow[];href:string;portal?:"admin"|"member"}) {
  const {t}=await preferences();
  return <Card title="Recent transactions" className="dashboard-recent" actions={<Link className="inline-link dashboard-see-all" href={href}>{t("View all")}<ArrowRight size={15} aria-hidden="true"/></Link>}>
    {rows.length?<>
      <div className="dashboard-recent-table">{portal==="admin" ? <TransactionTable rows={rows} compact/> : <Table rows={rows} columns={ledgerColumns}/>}</div>
      <ul className="dashboard-recent-list">
        {rows.map(row=>{
          const kind=value(row,"kind");
          const neutral=kind==="transfer"||kind==="reversal"||kind==="adjustment";
          const incoming=portal==="admin"?kind==="income":numeric(row,"cash_delta")<0;
          const Icon=neutral?ArrowLeftRight:incoming?ArrowDownLeft:ArrowUpRight;
          const receipt=value(row,"receipt_id");
          const details=portal==="admin"?"/admin/transactions?id="+value(row,"id"):receipt?"/api/download/receipt/"+receipt:"";
          const name=value(row,"description")||value(row,"code");
          return <li key={value(row,"id")}>
            <span className={"transaction-icon icon-"+(neutral?"purple":incoming?"green":"blue")}><Icon size={17} aria-hidden="true"/></span>
            <div className="dashboard-entry-copy">
              {details&&portal==="admin"?<Link href={details}>{name}</Link>:<strong>{name}</strong>}
              <small>{t(human(kind))} · {dateLabel(row.transaction_date)}</small>
            </div>
            <strong className="dashboard-entry-amount">{money(row.amount)}</strong>
            {details&&portal==="member"&&<a className="icon-button" href={details} aria-label={t("Receipt")+" · "+name}><ReceiptText size={17}/></a>}
          </li>;
        })}
      </ul>
    </>:<Empty text="Your posted activity will appear here."/>}
  </Card>;
}
