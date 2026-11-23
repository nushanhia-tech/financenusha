import { session } from "@/lib/session";
import { dimensions, dateLabel, human, money, reportNames, type Report, type StoreRow } from "@/lib/model";
import { reportFilters } from "@/lib/validation";
import { checkedId } from "@/lib/queries";
import { csv, pdf, workbook } from "@/lib/exports";

export const runtime="nodejs";
const contentType={pdf:"application/pdf",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",csv:"text/csv; charset=utf-8"};
const privateHeaders={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"};
const response=(message:string,status:number)=>new Response(message,{status,headers:privateHeaders});
function fileResponse(body:BodyInit,name:string,mime:string,inline=false) {
  const cleaned=name.replace(/[^A-Za-z0-9._-]/g,"-");
  return new Response(body,{headers:{...privateHeaders,"Content-Type":mime,"Content-Disposition":(inline?"inline":"attachment")+'; filename="'+cleaned+'"; filename*=UTF-8\'\''+encodeURIComponent(name).replace(/['()]/g,c=>"%"+c.charCodeAt(0).toString(16))}});
}

export async function GET(request:Request,context:{params:Promise<{kind:string;id:string}>}) {
  const actor=await session();
  if(!actor)return response("Sign in to download this file.",401);
  const {kind,id}=await context.params;
  const u=new URL(request.url);
  if(kind==="document"||kind==="receipt") {
    if(!checkedId(id))return response("File not found.",404);
    if(kind==="document") {
      const {data:doc}=await actor.db.from("documents").select("object_path,file_name,mime_type").eq("id",id).maybeSingle();
      if(!doc)return response("File not found.",404);
      const {data:blob}=await actor.db.storage.from("finance-documents").download(doc.object_path);
      if(!blob)return response("File not found.",404);
      return fileResponse(blob,doc.file_name,doc.mime_type,u.searchParams.get("inline")==="1");
    }
    const {data:receipt}=await actor.db.from("receipt_detail").select("*").eq("id",id).maybeSingle();
    if(!receipt)return response("Receipt not found.",404);
    const {data:tx}=await actor.db.from("transaction_detail").select("member_name,account_name,method,reference,state").eq("id",receipt.transaction_id).maybeSingle();
    if(tx?.state!=="posted")return response("Receipt not found.",404);
    const title=receipt.kind==="expense"||receipt.kind==="reimbursement"?"Expense Voucher":receipt.kind==="refund"?"Refund Acknowledgement":"Payment Receipt";
    const buffer=await pdf(title,receipt.number,[{"Receipt number":receipt.number,Transaction:receipt.code,Date:dateLabel(receipt.transaction_date),Description:receipt.description,Member:tx.member_name??"—",
      Account:tx.account_name??"—","Payment method":human(tx.method??""),Reference:tx.reference??"—",Amount:money(receipt.amount)}],true);
    return fileResponse(buffer as Uint8Array<ArrayBuffer>,receipt.number+".pdf",contentType.pdf);
  }
  if(!["statement","report"].includes(kind))return response("File not found.",404);
  const format=u.searchParams.get("format")||"pdf";
  if(!Object.hasOwn(contentType,format))return response("Unsupported file format.",400);
  const downloadFormat=format as keyof typeof contentType;
  const result=reportFilters.safeParse(Object.fromEntries(dimensions.map(key=>[key,u.searchParams.get(key)??""])));
  if(!result.success||(result.data.from&&result.data.to&&result.data.from>result.data.to))return response("Invalid report filters.",400);
  const p=result.data;
  let rows:StoreRow[],title:string,notes:string,base:string;
  if(kind==="report") {
    if(!actor.admin)return response("Administrator access required.",403);
    if(!Object.hasOwn(reportNames,id))return response("Report not found.",404);
    const limit=downloadFormat==="pdf"?501:5001;
    const {data,error}=await actor.db.rpc("finance_report",{report:id,p,max_rows:limit});
    if(error)return response("The report could not be generated.",400);
    rows=Array.isArray(data)?data:[];
    if(rows.length>=limit)return response("This export is too large. Choose a narrower date range or a spreadsheet format.",413);
    const audit=await actor.db.rpc("finance_command",{command:"report_export",p:{report:id,format,filters:p}});
    if(audit.error)return response("Export rate limit reached. Try again shortly.",429);
    title=reportNames[id as Report];notes="Posted accounting records  •  INR";base=id;
  } else {
    if(!actor.member||id!=="current")return response("Statement not found.",404);
    const posted:StoreRow[]=[];
    const max=downloadFormat==="pdf"?500:5000;
    for(let offset=0;offset<=max;offset+=500) {
      let query=actor.db.from("ledger_detail").select("*").eq("member_id",actor.member.id).order("transaction_date").order("code").range(offset,offset+499);
      if(p.year_id)query=query.eq("year_id",p.year_id);
      if(p.from)query=query.gte("transaction_date",p.from);
      if(p.to)query=query.lte("transaction_date",p.to);
      const {data,error}=await query;
      if(error)return response("The statement could not be generated.",400);
      posted.push(...data??[]);
      if(data.length<500)break;
    }
    if(posted.length>max)return response("This export is too large. Choose a narrower date range.",413);
    rows=posted.map(row=>({Date:row.transaction_date,Transaction:row.code,Description:row.description,Type:human(String(row.kind)),
      "Member to Union":Math.max(0,Number(row.cash_delta)),"Union to Member":Math.max(0,-Number(row.cash_delta)),
      "Dues change":Number(row.due_delta),"Payable change":Number(row.payable_delta),"Advance change":Number(row.advance_delta)}));
    const audit=await actor.db.rpc("finance_command",{command:"statement_export",p:{format,filters:p}});
    if(audit.error)return response("The statement could not be exported. Try again shortly.",429);
    title="Member Financial Statement";notes=actor.profile.name+"  •  INR";base="member-statement";
  }
  const output=downloadFormat==="csv"?csv(rows):downloadFormat==="xlsx"?await workbook(title,rows):await pdf(title,notes,rows);
  return fileResponse(output as BodyInit,base+"."+format,contentType[downloadFormat]);
}
