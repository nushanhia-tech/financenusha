import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { z } from "zod";
import { one, options, value, type Option, type StoreRow } from "./model";
import type { Params } from "@/components/primitives";
const PAGE=12;
type QueryOptions = { order?:string; searchable?:string[]; filter?:Record<string,string>; statuses?:[string,string[]]; ascending?:boolean; take?:number; date?:string; relatedAccount?:boolean };
export function checkedId(input:string) { return z.uuid().safeParse(input).success?input:""; }
export function queryError(error:{message:string;code?:string}|null) {if(error) throw new Error("Database request failed ("+(error.code??"unknown")+"): "+error.message);}
export async function record(db:SupabaseClient,table:string,id:string):Promise<StoreRow> {
  if(!checkedId(id)) notFound();
  const {data,error}=await db.from(table).select("*").eq("id",id).maybeSingle();
  queryError(error);
  if(!data)notFound();
  return data;
}
export async function smallList(db:SupabaseClient,table:string,order="created_at",filter:Record<string,string>={},take=8):Promise<StoreRow[]> {
  let q=db.from(table).select("*").order(order,{ascending:false}).limit(take);
  for(const [key,val] of Object.entries(filter)) if(val) q=q.eq(key,val);
  const {data,error}=await q;
  queryError(error);
  return data??[];
}
export async function list(db:SupabaseClient,table:string,params:Params,config:QueryOptions={}) {
  const input=Math.floor(Number(one(params,"page"))||1);
  const page=Math.min(10000,Math.max(1,input));
  const limit=config.take??PAGE;
  let query=db.from(table).select("*",{count:"exact"});
  for(const [column,entry] of Object.entries(config.filter??{})) if(entry) {
    if(column==="account_id"&&config.relatedAccount) query=query.or("account_id.eq."+entry+",destination_id.eq."+entry);
    else query=query.eq(column,entry);
  }
  if(config.statuses) query=query.in(...config.statuses);
  const search=one(params,"q").replace(/[,*%_()'"\\]/g," ").trim().slice(0,120);
  if(search&&config.searchable?.length) query=query.or(config.searchable.map(column=>column+".ilike.*"+search+"*").join(","));
  const dateInput=z.iso.date();
  const from=one(params,"from"),to=one(params,"to");
  if(config.date&&dateInput.safeParse(from).success)query=query.gte(config.date,from);
  if(config.date&&dateInput.safeParse(to).success)query=query.lte(config.date,to);
  query=query.order(config.order??"created_at",{ascending:one(params,"sort")==="oldest"||config.ascending===true}).order("id").range((page-1)*limit,page*limit-1);
  const {data,count,error}=await query;
  if (error?.code==="PGRST103") return {rows:[] as StoreRow[],count:count??0,page,limit};
  queryError(error);
  return {rows:(data??[]) as StoreRow[],count:count??0,page,limit};
}
export async function choices(db:SupabaseClient,{member=false}:{member?:boolean}={}) {
  const tables=member?["academic_years","events","transaction_categories"]:["academic_years","events","transaction_categories","departments","members","financial_accounts","chart_of_accounts","sponsors","pledge_summary"];
  const entries=await Promise.all(tables.map(async table=>{
    const cols=table==="academic_years"?"id,name,active,closed_at,start_date,end_date":table==="pledge_summary"?"id,sponsor,amount,event_id,year_id":
      table==="members"?"id,name,member_number,active":table==="financial_accounts"?"id,name,kind,active":
      table==="events"?"id,name,year_id":table==="chart_of_accounts"?"id,name,kind":table==="sponsors"?"id,name,kind":"id,name";
    const rows:StoreRow[]=[];
    for(let offset=0;;offset+=500) {
      const {data,error}=await db.from(table).select(cols).order(table==="pledge_summary"?"sponsor":"name").order("id").range(offset,offset+499);
      queryError(error);
      if(!data?.length)break;
      rows.push(...data as unknown as StoreRow[]);
      if(data.length<500)break;
    }
    return [table,rows] as const;
  }));
  const result=Object.fromEntries(entries);
  const active=result.academic_years.find(row=>row.active)??result.academic_years.find(row=>!row.closed_at);
  return {years:options(result.academic_years),openYears:options(result.academic_years.filter(row=>!row.closed_at)),activeYear:value(active,"id"),
    events:options(result.events),categories:options(result.transaction_categories),departments:options(result.departments??[]),
    members:(result.members??[]).map(row=>({value:value(row,"id"),label:value(row,"name")+" · "+value(row,"member_number")})),
    accounts:options(result.financial_accounts??[]),openAccounts:options((result.financial_accounts??[]).filter(row=>row.active)),
    chart:options(result.chart_of_accounts??[]),sponsors:options(result.sponsors??[]),
    pledges:(result.pledge_summary??[]).map(row=>({value:value(row,"id"),label:value(row,"sponsor")+" · ₹"+value(row,"amount")})),
    raw:result};
}
export type Choices=Awaited<ReturnType<typeof choices>>;
export const enumOptions=(values:readonly string[]):Option[]=>values.map(v=>({value:v,label:v.replaceAll("_"," ").replace(/\b\w/g,l=>l.toUpperCase()).replace(/\bUpi\b/g,"UPI")}));
