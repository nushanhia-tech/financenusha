import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authenticate, authOperation, databaseFor, digestToken } from "../lib/finance-auth";
import { todayIndia } from "../lib/model";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY!;
const password=process.env.DEMO_PASSWORD!;
const storageMetadata=process.env.FINANCE_TEST_STORAGE==="metadata";
if(!["localhost","127.0.0.1","[::1]"].includes(new URL(url).hostname))throw new Error("Run integration tests only against local Supabase.");
const config={auth:{persistSession:false,autoRefreshToken:false}};

function must<T extends {data:unknown;error:unknown}>(result:T):NonNullable<T["data"]> {
  assert.equal(result.error,null,result.error?JSON.stringify(result.error):undefined);
  return result.data as NonNullable<T["data"]>;
}
async function open(username:string) {
  const service=createClient(url,serviceKey,config);
  const operator=await authenticate(service,username,username==="admin"?"admin123":password,"integration");
  assert.equal(operator.state,"signed_in");
  if(operator.state!=="signed_in")throw new Error("Unable to sign in.");
  return {db:databaseFor(operator.identity),user:operator.identity,token:operator.token};
}
const command=(db:SupabaseClient,command:string,p:Record<string,unknown>={})=>db.rpc("finance_command",{command,p});
const action=async(db:SupabaseClient,verb:string,p:Record<string,unknown>={})=>String(must(await command(db,verb,p)));
const reject=async(db:SupabaseClient,verb:string,p:Record<string,unknown>,message?:RegExp)=>{
  const {error}=await command(db,verb,p);
  assert.ok(error,verb+" should have failed");
  if(message)assert.match(error.message,message);
};

test("Username sign-in, finance commands, role isolation and year close",async t=>{
  const service=createClient(url,serviceKey,config);
  const [{db:admin,user:treasurer},{db:checker},{db:other},{db:memberA,user:userA},{db:memberB}]=await Promise.all(
    ["admin","secretary","checker","nu-000001","nu-000002"].map(open));
  assert.equal(must(await admin.rpc("finance_admin_access")),true);
  assert.equal(must(await memberA.rpc("finance_admin_access")),false);
  const activeYear=must(await admin.from("academic_years").select("*").eq("active",true).single());
  const accounts=must(await admin.from("account_balances").select("id,kind,balance"));
  const bank=accounts.find(a=>a.kind==="bank")!,upi=accounts.find(a=>a.kind==="upi")!,cash=accounts.find(a=>a.kind==="cash")!;
  const categories=must(await admin.from("transaction_categories").select("id,name"));
  const category=(name:string)=>categories.find(c=>c.name===name)!.id;
  const memberId=must(await memberA.from("members").select("id").single()).id;
  const otherMemberId=must(await memberB.from("members").select("id").single()).id;
  const contribution=category("Contributions");
  const transactionDate=todayIndia(),tag=randomUUID().slice(0,10);
  const payload=(amount:string,kind="income",overrides:Record<string,unknown>={})=>({
    request_id:randomUUID(),year_id:activeYear.id,transaction_date:transactionDate,kind,amount,description:"Integration "+kind+" "+tag,
    account_id:bank.id,category_id:kind==="income"?contribution:category("Operations"),method:"bank",reference:"INT-"+randomUUID(),...overrides,
  });
  const tx=async(p:Record<string,unknown>)=>{
    const id=await action(admin,"transaction_save",p);
    await action(admin,"transaction_submit",{id});
    await action(admin,"transaction_post",{id});
    return id;
  };
  const balance=async(id:string)=>Number(must(await admin.from("account_balances").select("balance").eq("id",id).single()).balance);
  const journal=async(id:string)=>must(await admin.from("journal_entries").select("debit,credit").eq("transaction_id",id));
  await t.test("an ended application session revokes finance access immediately",async()=>{
    const {db,token,user}=await open("nu-000001");
    assert.ok(must(await db.from("users").select("id").eq("id",user.id).single()));
    assert.ok((await db.rpc("finance_auth",{operation:"lookup",p:{username:"admin"}})).error);
    await authOperation(service,"session_end",{token_hash:digestToken(token)});
    assert.deepEqual(must(await db.from("users").select("id").eq("id",user.id)),[]);
  });
  await t.test("members cannot read other records or invoke admin commands",async()=>{
    assert.deepEqual(must(await memberA.from("members").select("id").eq("id",otherMemberId)),[]);
    assert.deepEqual(must(await memberA.from("ledger_detail").select("id").eq("member_id",otherMemberId)),[]);
    assert.deepEqual(must(await memberA.from("audit_logs").select("id").limit(1)),[]);
    assert.deepEqual(must(await memberA.from("journal_entries").select("id").limit(1)),[]);
    await reject(memberA,"account_save",{name:"Disallowed",kind:"cash"},/Administrator/);
    assert.ok((await memberA.rpc("finance_report",{report:"trial-balance"})).error);
    assert.ok((await memberA.rpc("finance_member_password",{member_id:otherMemberId,password_hash:null,replace_existing:true})).error);
  });
  let incomeId="";
  await t.test("income, expense, transfer and reversal post exact, balanced journal movements",async()=>{
    const bankBefore=await balance(bank.id),cashBefore=await balance(cash.id);
    const p=payload("100.12","income",{member_id:memberId});
    incomeId=await action(admin,"transaction_save",p);
    assert.equal(await action(admin,"transaction_save",p),incomeId);
    await action(admin,"transaction_submit",{id:incomeId});
    assert.equal(await action(admin,"transaction_post",{id:incomeId}),incomeId);
    assert.equal(await action(admin,"transaction_post",{id:incomeId}),incomeId);
    const expense=await tx(payload("20.10","expense"));
    const transfer=await tx(payload("15.02","transfer",{category_id:null,destination_id:cash.id}));
    assert.equal(await balance(bank.id),Math.round((bankBefore+65)*100)/100);
    assert.equal(await balance(cash.id),Math.round((cashBefore+15.02)*100)/100);
    for(const [id,amount] of [[incomeId,100.12],[expense,20.10],[transfer,15.02]] as const) {
      const lines=await journal(id);
      assert.equal(lines.length,2);
      assert.equal(lines.reduce((n,line)=>n+Number(line.debit),0),amount);
      assert.equal(lines.reduce((n,line)=>n+Number(line.credit),0),amount);
    }
    const duplicate=await action(admin,"transaction_save",{...p,request_id:randomUUID()});
    await reject(admin,"transaction_submit",{id:duplicate},/duplicate key/i);
    assert.ok((await admin.from("transactions").update({amount:999}).eq("id",incomeId)).error);
    await reject(admin,"transaction_save",{...p,id:incomeId},/cannot be edited/);
    const reverse=await action(admin,"transaction_reverse",{id:incomeId,year_id:activeYear.id,transaction_date:transactionDate,reason:"Duplicate test entry"});
    await action(admin,"transaction_post",{id:reverse});
    await reject(admin,"transaction_reverse",{id:incomeId,year_id:activeYear.id,transaction_date:transactionDate,reason:"Second reversal"},/already exists/);
    const digest=must(await admin.rpc("finance_report",{report:"trial-balance",p:{year_id:activeYear.id}})) as Record<string,number>[];
    const sum=(key:string)=>Math.round(digest.reduce((total,row)=>total+Number(row[key]),0)*100);
    assert.equal(sum("Debits"),sum("Credits"));
  });
  await t.test("maker-checker and two distinct approvers are enforced",async()=>{
    const p=payload("51000","expense");
    const id=await action(admin,"transaction_save",p);
    await action(admin,"transaction_submit",{id});
    await reject(admin,"transaction_post",{id},/requires approval/);
    await reject(admin,"transaction_decide",{id,decision:"approved"},/different administrator/);
    await action(checker,"transaction_decide",{id,decision:"approved"});
    await reject(checker,"transaction_decide",{id,decision:"approved"},/duplicate key/i);
    await reject(admin,"transaction_post",{id},/requires approval/);
    await action(other,"transaction_decide",{id,decision:"approved"});
    await action(admin,"transaction_post",{id});
  });
  await t.test("submission leaves accounting unchanged; verification posts once and issues a private receipt",async()=>{
    const data={year_id:activeYear.id,payment_date:transactionDate,amount:"50.15",method:"upi",reference:"PROOF-"+tag,purpose:"Integration dues payment"};
    const issueDocument=async(who:typeof memberA,label:string)=>{
      const path=userA.id+"/"+randomUUID();
      if(storageMetadata) {
        must(await service.schema("storage").from("objects").insert({bucket_id:"finance-documents",name:path,owner:userA.id,metadata:{mimetype:"application/pdf"}}));
      } else {
        must(await who.storage.from("finance-documents").upload(path,new Blob(["%PDF-1.5\n Integration fixture"],{type:"application/pdf"})));
      }
      return {...data,object_path:path,file_name:label+".pdf"};
    };
    const dueBefore=Number(must(await memberA.from("member_summary").select("amount_due").single()).amount_due);
    const before=await balance(upi.id);
    const submitted=await issueDocument(memberA,"proof");
    const proof=await action(memberA,"proof_submit",submitted);
    assert.equal(await balance(upi.id),before);
    assert.deepEqual(must(await memberB.from("payment_proofs").select("id").eq("id",proof)),[]);
    const proofRow=must(await memberA.from("payment_proofs").select("document_id").eq("id",proof).single());
    assert.deepEqual(must(await memberB.from("documents").select("id").eq("id",proofRow.document_id)),[]);
    if(storageMetadata) {
      assert.equal(must(await memberA.schema("storage").from("objects").select("id").eq("name",submitted.object_path)).length,1);
      assert.deepEqual(must(await memberB.schema("storage").from("objects").select("id").eq("name",submitted.object_path)),[]);
    } else {
      assert.equal((await memberA.storage.from("finance-documents").download(submitted.object_path)).error,null);
      assert.ok((await memberB.storage.from("finance-documents").download(submitted.object_path)).error);
      assert.ok((await createClient(url,key,config).storage.from("finance-documents").download(submitted.object_path)).error);
    }
    await reject(memberA,"proof_submit",await issueDocument(memberA,"duplicate"),/duplicate key/i);
    const results=await Promise.all([0,1].map(()=>action(checker,"proof_review",{id:proof,decision:"verify",account_id:upi.id,operation:"due_payment"})));
    assert.deepEqual(results,[proof,proof]);
    assert.equal(await balance(upi.id),Math.round((before+50.15)*100)/100);
    assert.equal(Number(must(await memberA.from("member_summary").select("amount_due").single()).amount_due),Math.round((dueBefore-50.15)*100)/100);
    const verified=must(await memberA.from("payment_proofs").select("status,transaction_id").eq("id",proof).single());
    assert.equal(verified.status,"verified");
    const receipt=must(await memberA.from("receipts").select("id").eq("transaction_id",verified.transaction_id).single());
    assert.deepEqual(must(await memberB.from("receipts").select("id").eq("id",receipt.id)),[]);
    assert.equal((await journal(verified.transaction_id)).length,2);
    assert.equal(must(await admin.from("member_ledger_entries").select("id").eq("transaction_id",verified.transaction_id)).length,1);
    assert.ok(must(await memberA.from("notifications").select("title").eq("title","Payment verified")).length>0);
    const rejected=await action(memberA,"proof_submit",{...await issueDocument(memberA,"rejected"),reference:"REJECT-"+tag});
    await action(admin,"proof_review",{id:rejected,decision:"correct",reason:"Please upload the full confirmation."});
    assert.equal(must(await memberA.from("payment_proofs").select("status").eq("id",rejected).single()).status,"rejected");
    assert.equal(await balance(upi.id),Math.round((before+50.15)*100)/100);
  });
  await t.test("year closing requires reconciliation and locks entries",async()=>{
    const years=must(await admin.from("academic_years").select("start_date").order("start_date").limit(1));
    const start=Number(years[0].start_date.slice(0,4))-1;
    const endOn=start+"-12-31";
    const id=await action(admin,"year_save",{name:"Integration past "+tag,start_date:start+"-01-01",end_date:endOn});
    const pastAccount=await action(admin,"account_save",{name:"Integration account "+tag,kind:"cash"});
    const transaction=await tx(payload("17.01","income",{year_id:id,account_id:pastAccount,transaction_date:endOn,method:"cash"}));
    await reject(admin,"year_close",{id},/Reconcile/);
    await action(admin,"reconcile",{account_id:pastAccount,year_id:id,statement_date:endOn,actual_balance:"17.01",lines:[]});
    await action(admin,"year_close",{id});
    const period=must(await admin.from("academic_years").select("closed_at").eq("id",id).single());
    assert.ok(period.closed_at);
    await reject(admin,"transaction_save",payload("5","income",{year_id:id,transaction_date:endOn}),/open academic year/);
    assert.equal(await balance(pastAccount),17.01);
    assert.equal((await journal(transaction)).length,2);
    const close=must(await admin.from("transactions").select("id").eq("year_id",id).eq("operation","closing").single());
    assert.equal((await journal(close.id)).length,2);
    assert.ok(must(await admin.from("audit_logs").select("id").eq("actor_id",treasurer.id).eq("action","transaction_posted").eq("entity_id",close.id)).length);
  });
});
