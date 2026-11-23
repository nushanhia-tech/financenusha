import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ReceiptText } from "lucide-react";
import { human, value, type StoreRow } from "@/lib/model";
import { Table, type Column } from "./primitives";

export function TransactionIdentity({row,portal="admin"}:{row:StoreRow;portal?:"admin"|"member"}) {
  const kind=value(row,"kind");
  const Icon=kind==="transfer"||kind==="reversal"?ArrowLeftRight:kind==="income"?ArrowDownLeft:ArrowUpRight;
  return <div className="transaction-identity"><span className={"transaction-icon icon-"+(kind==="income"?"green":kind==="transfer"||kind==="reversal"?"purple":"blue")}><Icon size={15}/></span><div>
    {portal==="admin"?<Link href={"/admin/transactions?id="+value(row,"id")}>{value(row,"description")}</Link>:<strong>{value(row,"description")}</strong>}
    <small>{value(row,"code")}</small>
  </div></div>;
}
export const receiptLink=(id:string,label="Receipt")=>id?<Link className="inline-link" href={"/api/download/receipt/"+id}><ReceiptText size={15}/>{label}</Link>:<span className="muted">—</span>;
export function TransactionTable({rows,compact=false}:{rows:StoreRow[];compact?:boolean}) {
  const columns:Column[]=[
    {key:"description",label:"Transaction",render:row=><TransactionIdentity row={row}/>},
    {key:"transaction_date",label:"Date",type:"date"},
    {key:"kind",label:"Type",render:row=><span className="type-tag">{human(value(row,"kind"))}</span>},
    {key:"account_name",label:"Account"},
    {key:"amount",label:"Amount",type:"money"},
    {key:"state",label:"Status",type:"status"},
  ];
  if(!compact)columns.push({key:"receipt_id",label:"Receipt",render:row=>receiptLink(value(row,"receipt_id"))});
  return <Table rows={rows} columns={columns} title="Transactions" empty="Transactions recorded for this period will appear here."/>;
}
