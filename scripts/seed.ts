import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticate, authOperation, configuration, databaseFor, digestToken, serviceDatabase } from "../lib/finance-auth";
import { todayIndia } from "../lib/model";
import { hashPassword } from "../lib/passwords";

const config=configuration();
const localHosts=["localhost","127.0.0.1","[::1]"];
if(!config||!localHosts.includes(new URL(config.url).hostname)
  ||!localHosts.includes(new URL(process.env.APP_ORIGIN??"http://localhost:3000").hostname)) {
  throw new Error("Demo accounts can only be seeded on a loopback database and app.");
}
const serviceDb=serviceDatabase();
function must<T extends {data:unknown;error:{message:string}|null}>(result:T):NonNullable<T["data"]> {
  if(result.error)throw new Error(result.error.message);
  return result.data as NonNullable<T["data"]>;
}

async function officer(username:string,name:string,role:"TREASURER"|"FINANCE_SECRETARY",password:string) {
  const existing=await authOperation<{id?:string}>(serviceDb,"lookup",{username,attempt_key:digestToken("demo-seed")});
  if(!existing?.id)await authOperation(serviceDb,"officer_create",{username,name,role,password_hash:await hashPassword(password)});
  return operator(username,password);
}

async function operator(username:string,password:string) {
  const result=await authenticate(serviceDb,username,password,"demo-seed");
  if(result.state!=="signed_in")throw new Error("Unable to sign in as local demo user "+username+".");
  return databaseFor(result.identity);
}

const admin=await officer("admin","Ananya Menon","TREASURER","admin123");
if(process.argv.includes("--account-only")) {
  console.log("Local demo sign-in · username admin · password admin123");
  process.exit(0);
}
const password=process.env.DEMO_PASSWORD??"";
if(password.length<12) throw new Error("Set DEMO_PASSWORD to at least 12 characters for the remaining local demo users.");
const checker=await officer("secretary","Devika Nair","FINANCE_SECRETARY",password);
const other=await officer("checker","Joel Joseph","FINANCE_SECRETARY",password);
const cmd=async(client:SupabaseClient,command:string,p:Record<string,unknown>={})=>String(must(await client.rpc("finance_command",{command,p})));
if(must(await admin.from("financial_accounts").select("id").limit(1)).length) throw new Error("Demo finance data already exists. Use a fresh local database to seed again.");
const today=todayIndia();
const currentYear=Number(today.slice(0,4))-(Number(today.slice(5,7))<4?1:0);
const start=currentYear+"-04-01",end=(currentYear+1)+"-03-31";
const year=await cmd(admin,"year_save",{name:currentYear+"–"+String(currentYear+1).slice(-2),start_date:start,end_date:end});
await cmd(admin,"year_activate",{id:year});
const deps:Record<string,string>={};
for(const name of ["Arts & Culture","Sports","Student Welfare","Publicity","Operations"]) deps[name]=await cmd(admin,"department_save",{name,description:name+" department"});
const eventDate=(index:number)=>new Date(Date.UTC(currentYear,3+index,15)).toISOString().slice(0,10);
const events:Record<string,string>={};
for(const [index,name,dept] of [[1,"Welcome Week","Student Welfare"],[2,"Interdepartmental Sports","Sports"],[3,"Arts Festival","Arts & Culture"],[5,"Campus Outreach","Publicity"],[6,"Union Day","Operations"]] as const) {
  events[name]=await cmd(admin,"event_save",{name,year_id:year,event_date:eventDate(index),department_id:deps[dept]});
}
const bank=await cmd(admin,"account_save",{name:"Union Bank Account",kind:"bank"});
const upi=await cmd(admin,"account_save",{name:"UPI Collections",kind:"upi"});
const cash=await cmd(admin,"account_save",{name:"Cash on Hand",kind:"cash"});
const members:Record<string,string>={};
const demoMembers=[["member-a@nusha.test","Amina Rahman"],["member-b@nusha.test","Arjun Thomas"],["member-c@nusha.test","Meera Nair"]] as const;
const demoHash=await hashPassword(password);
for(const [email,name] of demoMembers) {
  const member=await cmd(admin,"member_save",{name,email,year_id:year,department_id:deps["Student Welfare"]});
  const username=must(await admin.rpc("finance_member_password",{member_id:member,password_hash:demoHash,replace_existing:false}));
  const temporary=await authenticate(serviceDb,username,password,"demo-seed");
  if(temporary.state!=="signed_in")throw new Error("Unable to activate demo member.");
  await authOperation(serviceDb,"password_change",{token_hash:digestToken(temporary.token),password_hash:demoHash});
  members[name]=member;
}
const categories=new Map(must(await admin.from("transaction_categories").select("id,name")).map(row=>[row.name,row.id]));
const finance=async(description:string,kind:string,amount:number,values:Record<string,unknown>={})=>{
  const id=await cmd(admin,"transaction_save",{request_id:randomUUID(),year_id:year,transaction_date:today,kind,description,amount,account_id:bank,...values});
  await cmd(admin,"transaction_submit",{id});
  if(amount>=5000)await cmd(checker,"transaction_decide",{id,decision:"approved",reason:"Local demonstration review"});
  if(amount>=50000)await cmd(other,"transaction_decide",{id,decision:"approved",reason:"Local demonstration review"});
  await cmd(admin,"transaction_post",{id});
  return id;
};
await finance("Opening bank balance","adjustment",132000,{operation:"opening",transaction_date:start});
await finance("Opening UPI balance","adjustment",16400,{operation:"opening",account_id:upi,transaction_date:start});
await finance("Opening cash balance","adjustment",42000,{operation:"opening",account_id:cash,transaction_date:start});
const activity=[
  [0,24500,12600,"Early membership drive","Operations"],
  [1,33800,15750,"Welcome Week registrations","Student Welfare","Welcome Week"],
  [2,28500,20450,"Sports registrations","Sports","Interdepartmental Sports"],
  [3,46900,33200,"Arts Festival contributions","Arts & Culture","Arts Festival"],
  [4,35850,24100,"Student welfare fundraiser","Student Welfare"],
  [5,52100,27340,"Campus Outreach contributions","Publicity","Campus Outreach"],
  [6,44900,28950,"Union Day registrations","Operations","Union Day"],
  [7,31200,18200,"November collections","Arts & Culture"],
] as const;
for(const [index,income,expense,label,department,...event] of activity) {
  const booked=eventDate(index);
  if(booked>today)continue;
  const eventId=event[0]?events[event[0]]:undefined;
  const account=index%3===0?upi:bank;
  await finance(label,"income",income,{transaction_date:booked,category_id:categories.get(index%2?"Registrations":"Contributions"),department_id:deps[department],event_id:eventId,account_id:account,method:account===upi?"upi":"bank",reference:"DEMO-IN-"+index});
  await finance(index%2?"Venue and programme costs":"Programme supplies","expense",expense,{transaction_date:booked,category_id:categories.get(index%2?"Venue":"Operations"),department_id:deps[department],event_id:eventId,account_id:index%4===0?cash:bank,method:index%4===0?"cash":"bank",reference:"DEMO-OUT-"+index});
}
for(const [department,amount] of [["Arts & Culture",65000],["Sports",62000],["Student Welfare",45000],["Publicity",30000],["Operations",56000]] as const) {
  await cmd(admin,"budget_save",{name:department+" budget",scope:"department",year_id:year,department_id:deps[department],amount});
}
for(const [member,amount] of [["Amina Rahman",4200],["Arjun Thomas",3800],["Meera Nair",3600]] as const) {
  await finance("Annual membership dues","income",amount,{operation:"due",category_id:categories.get("Membership dues"),member_id:members[member],due_date:end,account_id:null});
}
await finance("Membership payment · Amina Rahman","income",1800,{operation:"due_payment",member_id:members["Amina Rahman"],method:"upi",reference:"DEMO-M-101",account_id:upi});
await finance("Welcome kit reimbursement","reimbursement",1500,{operation:"payable",member_id:members["Amina Rahman"],account_id:null});
await finance("Campus outreach contribution","income",2800,{category_id:categories.get("Contributions"),member_id:members["Arjun Thomas"],account_id:upi,method:"upi",reference:"DEMO-M-102"});
await finance("Printing and stationery","expense",3230,{category_id:categories.get("Printing"),account_id:cash,method:"cash"});
const sponsor=await cmd(admin,"sponsor_save",{name:"Riverbank Bookshop",kind:"sponsor",email:"riverbank@nusha.test"});
const pledge=await cmd(admin,"pledge_save",{sponsor_id:sponsor,year_id:year,event_id:events["Arts Festival"],amount:42000});
await finance("Riverbank Bookshop sponsorship payment","income",25000,{category_id:categories.get("Sponsorship"),event_id:events["Arts Festival"],pledge_id:pledge,method:"bank",reference:"DEMO-SP-010"});
const pending=await cmd(admin,"transaction_save",{request_id:randomUUID(),year_id:year,transaction_date:today,kind:"expense",description:"Sound and lighting invoice",amount:14500,category_id:categories.get("Sound"),account_id:bank,method:"bank",reference:"DEMO-PENDING"});
await cmd(admin,"transaction_submit",{id:pending});
console.log("Local demo seeded with posted journals and member ledgers.");
console.log("Local demo sign-in · username admin · password admin123");
console.log("Other demo usernames · secretary, checker, nu-000001, nu-000002, nu-000003 · your DEMO_PASSWORD");
