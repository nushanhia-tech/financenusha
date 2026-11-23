import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleCheck, Inbox, Search } from "lucide-react";
import { preferences } from "@/lib/preferences";
import { Button } from "./ui/button";
import { dateLabel, human, money, queryString, type StoreRow } from "@/lib/model";

export type Params = Record<string,string|string[]|undefined>;
export type Column = {key:string;label:string;type?:"money"|"date"|"status"|"percent";render?:(row:StoreRow)=>React.ReactNode};
export async function Heading({title,description,actions}:{title:string;description?:string;actions?:React.ReactNode}) {
  const {t}=await preferences();
  return <div className="page-heading"><div><h1>{t(title)}</h1>{description&&<p>{t(description)}</p>}</div>{actions&&<div className="heading-actions">{actions}</div>}</div>;
}
export async function Card({title,description,actions,children,className=""}:{title?:string;description?:string;actions?:React.ReactNode;children:React.ReactNode;className?:string}) {
  const {t}=await preferences();
  return <section className={"card "+className}>{(title||actions)&&<div className="card-heading"><div>{title&&<h2>{t(title)}</h2>}{description&&<p>{t(description)}</p>}</div>{actions}</div>}{children}</section>;
}
export async function Status({state}:{state:unknown}) {
  const {t}=await preferences();
  const status=String(state||"");
  const color=["posted","verified","approved","active","read","matched"].includes(status)?"green":(["rejected","closed","inactive","unmatched"].includes(status)?"red":(["pending","submitted","under_review","correction_requested"].includes(status)?"amber":"blue"));
  return status?<span className={"badge badge-"+color}><i/>{t(human(status))}</span>:<span className="muted">—</span>;
}
export async function Empty({title="No records found",text="Records will appear here when they’re available."}:{title?:string;text?:string}) {
  const {t}=await preferences();
  return <div className="empty"><span><Inbox size={22}/></span><strong>{t(title)}</strong><p>{t(text)}</p></div>;
}
export async function Table({rows,columns,empty,title}:{rows:StoreRow[];columns:Column[];empty?:string;title?:string}) {
  const {t}=await preferences();
  if (!rows.length) return <Empty text={empty}/>;
  return <div className="table-scroll"><table aria-label={title}><thead><tr>{columns.map(col=><th key={col.key} className={col.type==="money"?"right":""}>{t(col.label)}</th>)}</tr></thead><tbody>
    {rows.map((row,index)=><tr key={String(row.id??row.code??index)}>{columns.map(col=>{
      const cell=row[col.key];
      return <td key={col.key} className={col.type==="money"?"right numeric":""}>{col.render?col.render(row):col.type==="money"?money(cell):col.type==="date"?dateLabel(cell):col.type==="status"?<Status state={cell}/>:col.type==="percent"?String(cell??0)+"%":cell===undefined||cell===null||cell===""?"—":typeof cell==="object"?JSON.stringify(cell):String(cell)}</td>;
    })}</tr>)}
  </tbody></table></div>;
}
export async function Pagination({path,params,page,count,limit=12}:{path:string;params:Params;page:number;count:number;limit?:number}) {
  const {t}=await preferences();
  const last=Math.max(1,Math.ceil(count/limit));
  if(count===0&&page<=1)return null;
  return <div className="pagination"><span>{count===0?"0 records":page>last?count+" records":((page-1)*limit+1)+"–"+Math.min(page*limit,count)+" of "+count+" records"}</span><div>
    {page>1&&<Button asChild variant="outline" size="small"><Link href={path+queryString(params,{page:String(page-1)})}><ChevronLeft size={14}/> {t("Previous")}</Link></Button>}
    {page<last&&<Button asChild variant="outline" size="small"><Link href={path+queryString(params,{page:String(page+1)})}>{t("Next")} <ChevronRight size={14}/></Link></Button>}
  </div></div>;
}
export function Metric({label,amount,note,icon:Icon,color="blue",direction}:{label:string;amount:string;note:string;icon:LucideIcon;color?:string;direction?:"up"|"down"}) {
  return <div className="metric card"><div><span className={"metric-icon icon-"+color}><Icon size={19}/></span>{direction&&<span className={"metric-direction "+(direction==="up"?"green-text":"red-text")}>{direction==="up"?<ArrowUpRight size={15}/>:<ArrowDownRight size={15}/>}</span>}</div><p>{label}</p><strong>{amount}</strong><small>{note}</small></div>;
}
export function SearchBox({placeholder="Search records…",current=""}:{placeholder?:string;current?:string}) {
  return <label className="search-box"><Search size={15}/><input name="q" aria-label={placeholder} defaultValue={current} placeholder={placeholder}/></label>;
}
export function Notice({children}:{children:React.ReactNode}) {return <div className="notice"><CircleCheck size={16}/>{children}</div>;}
