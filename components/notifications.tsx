import Link from "next/link";
import { CheckCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, Heading, Pagination, Table, type Params } from "./primitives";
import { ActionForm, Hidden } from "./forms";
import { Filters } from "./filters";
import { list } from "@/lib/queries";
import { dateLabel, value } from "@/lib/model";

export async function Notifications({db,portal,params}:{db:SupabaseClient;portal:"admin"|"member";params:Params}) {
  const path="/"+portal+"/notifications";
  const result=await list(db,"notifications",params,{searchable:["title","message"]});
  return <><Heading title="Notifications" description="Payment, approval, and account updates." actions={<ActionForm compact command="notification_read" variant="outline" submit="Mark all as read"><span className="sr-only"><CheckCheck/></span></ActionForm>}/>
    <Filters path={path} params={params} search="Search notifications…"/>
    <Card><Table rows={result.rows} columns={[{key:"message",label:"Update",render:row=><div className="notification-text">{value(row,"href").startsWith("/"+portal+"/")?<Link className="text-link" href={value(row,"href")}>{value(row,"title")}</Link>:<strong>{value(row,"title")}</strong>}<p>{value(row,"message")}</p></div>},
      {key:"created_at",label:"Date",render:row=>dateLabel(row.created_at)},{key:"read_at",label:"Status",render:row=>row.read_at?"Read":<ActionForm command="notification_read" variant="outline" submit="Mark as read" compact><Hidden name="id" value={value(row,"id")}/></ActionForm>}]}/>
      <Pagination {...result} path={path} params={params}/></Card></>;
}
