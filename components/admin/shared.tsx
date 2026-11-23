import Link from "next/link";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, Heading, Pagination, Table, type Column, type Params } from "../primitives";
import { Filters, type FilterField } from "../filters";
import { Button } from "../ui/button";
import { checkedId, list, type Choices } from "@/lib/queries";
import { dimensions, one, value, type StoreRow } from "@/lib/model";

export type Screen = { db:SupabaseClient;params:Params };
export function Add({path,label}:{path:string;label:string}) {return <Button asChild><Link href={path+"?new=1"}><Plus size={17}/>{label}</Link></Button>;}
export function Back({path}:{path:string}) {return <Link href={path} className="back-link"><ArrowLeft size={16}/> Back</Link>;}
export function DetailLink({path,row,field="name"}:{path:string;row:StoreRow;field?:string}) {return <Link className="text-link" href={path+"?id="+value(row,"id")}>{value(row,field)}</Link>;}
export function ShowForm({path,title,children}:{path:string;title:string;children:React.ReactNode}) {
  return <div className="detail-stack"><Back path={path}/><Heading title={title}/><Card className="form-card">{children}</Card></div>;
}
export function Info({fields}:{fields:[string,React.ReactNode][]}) {
  return <dl className="detail-grid">{fields.map(([label,text])=><div key={label}><dt>{label}</dt><dd>{text||"—"}</dd></div>)}</dl>;
}
export function DocumentLink({id,label="Preview",inline=true}:{id:string;label?:string;inline?:boolean}) {
  return <a className="inline-link" href={"/api/download/document/"+id+(inline?"?inline=1":"")} target={inline?"_blank":undefined} rel={inline?"noreferrer":undefined}><ExternalLink size={14}/>{label}</a>;
}
export function ListSection({title,description,path,params,result,columns,fields,search,actions,children}:{title:string;description?:string;path:string;params:Params;result:Awaited<ReturnType<typeof list>>;columns:Column[];fields?:FilterField[];search?:string;actions?:React.ReactNode;children?:React.ReactNode}) {
  return <div className="detail-stack"><Heading title={title} description={description} actions={actions}/>
    <Filters path={path} params={params} fields={fields} search={search}/><Card><Table rows={result.rows} columns={columns} title={title}/><Pagination {...result} path={path} params={params}/></Card>{children}</div>;
}
export const dimensionOptions=(c:Choices)=>({
  year_id:c.years,department_id:c.departments,event_id:c.events,member_id:c.members,account_id:c.accounts,category_id:c.categories,
});
export const dimensionFields=(c:Choices)=>dimensions.map(name=>({name,label:({year_id:"Academic year",department_id:"Department",event_id:"Event",member_id:"Member",account_id:"Account",category_id:"Category",from:"From",to:"To"})[name],
  ...(name==="from"||name==="to"?{type:"date"}:{options:dimensionOptions(c)[name]})}));
export function idFilters(params:Params,...columns:string[]) {
  return Object.fromEntries(columns.map(column=>[column,checkedId(one(params,column))]));
}
export const proofColumns:Column[]=[
  {key:"purpose",label:"Purpose",render:row=><DetailLink path="/admin/verification" row={row} field="purpose"/>},{key:"reference",label:"Reference"},
  {key:"payment_date",label:"Payment date",type:"date"},{key:"method",label:"Method"},{key:"amount",label:"Amount",type:"money"},{key:"status",label:"Status",type:"status"},
];
