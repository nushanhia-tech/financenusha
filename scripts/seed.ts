import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { todayIndia } from "../lib/model";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL??"";
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??"";
const service=process.env.SUPABASE_SERVICE_ROLE_KEY??"";
const password=process.env.DEMO_PASSWORD??"";
if(!["localhost","127.0.0.1","[::1]"].includes(new URL(url).hostname)||password.length<12) throw new Error("Use a loopback Supabase URL and a local-only password of at least 12 characters.");
const auth={persistSession:false,autoRefreshToken:false};
const serviceDb=createClient(url,service,{auth});
function must<T extends {data:unknown;error:{message:string}|null}>(result:T):NonNullable<T["data"]> {
  if(result.error)throw new Error(result.error.message);
  return result.data as NonNullable<T["data"]>;
}
const roster=[
  ["treasurer@nusha.test","Ananya Menon","TREASURER"],["secretary@nusha.test","Devika Nair","FINANCE_SECRETARY"],
  ["checker@nusha.test","Joel Joseph","FINANCE_SECRETARY"],["member-a@nusha.test","Amina Rahman","MEMBER"],
  ["member-b@nusha.test","Arjun Thomas","MEMBER"],["member-c@nusha.test","Meera Nair","MEMBER"],
] as const;
const existing=must(await serviceDb.auth.admin.listUsers({page:1,perPage:1000})).users;
const profiles=new Map<string,string>();
for(const [email,name,role] of roster) {
  const user=existing.find(candidate=>candidate.email===email)??must(await serviceDb.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name}})).user;
  if(!user)throw new Error("Unable to create fixture user.");
  profiles.set(email,user.id);
  if(role!=="MEMBER")must(await serviceDb.from("users").upsert({id:user.id,name,role}));
}
const operator=async(email:string)=>{
  const client=createClient(url,key,{auth});
  must(await client.auth.signInWithPassword({email,password}));
  return client;
};
const admin=await operator(roster[0][0]),checker=await operator(roster[1][0]),other=await operator(roster[2][0]);
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
for(const [email,name] of roster.slice(3)) {
  const member=await cmd(admin,"member_save",{name,email,year_id:year,department_id:deps["Student Welfare"]});
  must(await serviceDb.rpc("link_member_login",{member_id:member,user_id:profiles.get(email),requested_by:profiles.get(roster[0][0])}));
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
console.log("Sign in using treasurer@nusha.test, secretary@nusha.test, member-a@nusha.test, or member-b@nusha.test and your DEMO_PASSWORD.");
