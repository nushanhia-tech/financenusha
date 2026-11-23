import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Card, Pagination, Table, type Column, type Params } from "./primitives";
import { receiptLink } from "./finance-table";
import { money, numeric, value, type StoreRow } from "@/lib/model";

export const ledgerColumns:Column[]=[
  {key:"description",label:"Transaction",render:row=><div className="transaction-identity"><span className={"transaction-icon icon-"+(numeric(row,"cash_delta")>0?"green":"blue")}>{numeric(row,"cash_delta")>0?<ArrowDownLeft size={15}/>:<ArrowUpRight size={15}/>}</span><div><strong>{value(row,"description")}</strong><small>{value(row,"code")} {row.category?" · "+value(row,"category"):""}</small></div></div>},
  {key:"transaction_date",label:"Date",type:"date"},
  {key:"cash_delta",label:"Direction",render:row=>numeric(row,"cash_delta")>0?<span className="type-tag">Member to Union</span>:numeric(row,"cash_delta")<0?<span className="type-tag">Union to Member</span>:<span className="muted">Non-cash entry</span>},
  {key:"amount",label:"Amount",type:"money"},
  {key:"due_delta",label:"Dues change",render:row=>numeric(row,"due_delta")?money(row.due_delta):"—"},
  {key:"payable_delta",label:"Payable change",render:row=>numeric(row,"payable_delta")?money(row.payable_delta):"—"},
  {key:"advance_delta",label:"Advance change",render:row=>numeric(row,"advance_delta")?money(row.advance_delta):"—"},
  {key:"receipt_id",label:"Receipt",render:row=>receiptLink(value(row,"receipt_id"))},
];
export function LedgerCard({title,rows,path,params,page,count,limit}:{title:string;rows:StoreRow[];path?:string;params?:Params;page?:number;count?:number;limit?:number}) {
  return <Card title={title} actions={!path&&<Link href="/member/ledger" className="text-link">View full ledger</Link>}><Table rows={rows} columns={ledgerColumns} empty="Your posted activity will appear here."/>
    {path&&params&&page&&count!==undefined&&<Pagination path={path} params={params} page={page} count={count} limit={limit}/>}</Card>;
}
