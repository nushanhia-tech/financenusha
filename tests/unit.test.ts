import assert from "node:assert/strict";
import test from "node:test";
import { money, queryString, safeTextForSpreadsheet, todayIndia } from "../lib/model";
import { commands, parseCsv, trustedFileType } from "../lib/validation";
import { randomUUID } from "node:crypto";

test("Indian currency and date formats are deterministic",()=>{
  assert.match(money("1234567.50"),/₹12,34,567\.50/);
  assert.match(todayIndia(),/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(queryString({q:"Travel & events",p:"2"},{p:undefined}),"?q=Travel+%26+events");
});
test("money accepts decimals up to two places and rejects malformed or oversized entries",()=>{
  const draft={request_id:randomUUID(),year_id:randomUUID(),transaction_date:"2026-08-10",kind:"income",operation:"standard",description:"Bank transfer"};
  for(const amount of ["0.01","125","999999999999.99"])assert.ok(commands.transaction_save.safeParse({...draft,amount}).success);
  for(const amount of ["-1","0","5.001","1e3","1000000000000","NaN","Infinity","5,000"])assert.ok(!commands.transaction_save.safeParse({...draft,amount}).success,amount);
});
test("CSV parsing supports escaping, multiline values and CRLF",()=>{
  assert.deepEqual(parseCsv('\uFEFFname,email,phone\r\n"Menon, Amina",amina@example.com,123\r\n"A ""quoted""\nname",a@example.com,\r\n'),[
    ["name","email","phone"],["Menon, Amina","amina@example.com","123"],['A "quoted"\nname',"a@example.com",""],
  ]);
  assert.throws(()=>parseCsv('"Unterminated'));
});
test("CSV export neutralises leading formula characters",()=>{
  for(const value of ["=1+1","+SUM(A1)","  -5+9","@A1","\tfoo"]) assert.equal(safeTextForSpreadsheet(value),"'"+value);
  assert.equal(safeTextForSpreadsheet("Operations"),"Operations");
});
test("upload signature check rejects executable or HTML content",()=>{
  const bytes=(text:string)=>new TextEncoder().encode(text);
  assert.equal(trustedFileType(bytes("%PDF-1.4\n")),"application/pdf");
  assert.equal(trustedFileType(new Uint8Array([137,80,78,71,13,10,26,10])),"image/png");
  assert.equal(trustedFileType(bytes("<script>alert(1)</script>")),null);
  assert.equal(trustedFileType(bytes("not a file")),null);
});
