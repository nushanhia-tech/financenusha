import { expect, test, type Page } from "@playwright/test";
import { loadEnvFile } from "node:process";
try { loadEnvFile(".env.local"); } catch { /* CI may set variables directly. */ }
const password=process.env.DEMO_PASSWORD??"";

async function signIn(page:Page,username:string,target:RegExp,credential=username==="admin"?"admin123":password) {
  await page.goto("/login");
  await page.getByRole("textbox",{name:"Username"}).fill(username);
  await page.getByLabel("Password",{exact:false}).fill(credential);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(target);
}
test("treasurer can view dashboard, open all admin modules, and export reports",async({page,request})=>{
  await page.goto("/login");
  await expect(page.getByRole("textbox",{name:"Email address"})).toHaveCount(0);
  await signIn(page,"admin",/\/admin$/);
  await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Cash flow",exact:true})).toBeVisible();
  const chartSeries=page.getByRole("combobox",{name:"Chart series",exact:true});
  await expect(chartSeries).toHaveValue("overview");
  await chartSeries.selectOption("cash");
  await expect(page.getByText("Net cash flow",{exact:true})).toBeVisible();
  const exportLink=page.getByRole("link",{name:"Export transactions as CSV"});
  const exportUrl=await exportLink.getAttribute("href");
  expect(exportUrl).toContain("format=csv&year_id=");
  expect((await page.request.get(exportUrl!)).status()).toBe(200);
  for(const [route,title] of Object.entries({
    transactions:"Transactions",accounts:"Union Accounts",members:"Members",departments:"Departments",events:"Events & Programs",
    sponsorship:"Sponsorship & Donations",verification:"Payment Verification",budgets:"Budget Management",documents:"Bills & Receipts",
    approvals:"Approvals",reports:"Financial Reports",audit:"Audit Logs",years:"Academic Year",notifications:"Notifications",settings:"Settings",
  })) {
    await page.goto("/admin/"+route);
    await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
  }
  await expect(page.getByLabel("Require administrator MFA")).toHaveCount(0);
  await page.getByRole("button",{name:"Save settings"}).click();
  await expect(page.getByText("Changes saved.",{exact:true})).toBeVisible();
  for(const format of ["csv","xlsx","pdf"]) {
    const exported=await page.request.get("/api/download/report/trial-balance?format="+format);
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-disposition"]).toContain("trial-balance."+format);
    const body=await exported.body();
    expect(body.length).toBeGreaterThan(20);
    if(format==="pdf")expect(body.subarray(0,5).toString()).toBe("%PDF-");
  }
  expect((await request.get("/api/download/report/trial-balance")).status()).toBe(401);
});

test("member routes stay private, including a substituted receipt ID",async({page,browser})=>{
  await signIn(page,"nu-000001",/\/member$/);
  await expect(page.getByRole("heading",{name:"My Dashboard"})).toBeVisible();
  await page.goto("/admin/transactions");
  await expect(page).toHaveURL(/\/member$/);
  for(const route of ["ledger","payments","contributions","dues","proof","refunds","reimbursements","receipts","statements","notifications","profile"]) {
    await page.goto("/member/"+route);
    await expect(page.getByRole("heading",{level:1})).toBeVisible();
  }
  await page.goto("/member/receipts");
  const receipt=await page.getByRole("link",{name:"PDF",exact:true}).first().getAttribute("href");
  expect(receipt).toBeTruthy();
  expect((await page.request.get(receipt!)).status()).toBe(200);
  const other=await browser.newPage();
  await signIn(other,"nu-000002",/\/member$/);
  expect((await other.request.get(receipt!)).status()).toBe(404);
  expect((await other.request.get("/api/download/report/trial-balance")).status()).toBe(403);
  expect((await page.request.get("/api/download/statement/current?format=pdf")).status()).toBe(200);
  await other.close();
});

test("finance secretary can enter the admin portal and use mobile navigation",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await signIn(page,"secretary",/\/admin$/);
  await expect(page.getByRole("heading",{name:"Transaction activity",exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({width:390,height:844});
  const chartPeriod=page.getByRole("combobox",{name:"Chart period",exact:true});
  await chartPeriod.selectOption("year");
  await expect(chartPeriod).toHaveValue("year");
  const month=page.getByRole("button",{name:/posted transactions/}).first();
  await month.click();
  await expect(month).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("heading",{name:"Recent transactions",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Open navigation"}).click();
  await page.getByRole("link",{name:"Transactions",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Transactions"})).toBeVisible();
  await page.getByRole("button",{name:"Dark mode"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await page.getByRole("button",{name:"Change language"}).click();
  await expect(page.locator("html")).toHaveAttribute("lang","ml");
});

test("admin can save, submit, and post a draft from the portal",async({page})=>{
  await signIn(page,"admin",/\/admin$/);
  await page.getByRole("link",{name:"New transaction"}).click();
  await page.getByLabel("Amount (INR)").fill("32.01");
  await page.getByRole("combobox",{name:"Category",exact:true}).selectOption({label:"Contributions"});
  await page.getByLabel("Financial account").selectOption({label:"Union Bank Account"});
  await page.getByLabel("Description").fill("Browser workflow contribution "+Date.now());
  await page.getByRole("button",{name:"Save draft",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Transaction draft saved.");
  await page.getByRole("link",{name:"Open →"}).click();
  await page.getByRole("button",{name:"Submit for approval",exact:true}).click();
  await expect(page.getByRole("button",{name:"Post transaction",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Post transaction",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Posted journal"})).toBeVisible();
  await expect(page.getByRole("link",{name:/NU-R-/})).toBeVisible();
});

test("proof upload and authorised download work through the portal",async({page,browser})=>{
  test.skip(process.env.FINANCE_TEST_STORAGE==="metadata","Storage HTTP service is required for browser upload and download.");
  await signIn(page,"nu-000001",/\/member$/);
  await page.goto("/member/proof");
  const reference="BROWSER-"+Date.now();
  await page.getByLabel("Amount (INR)").fill("46.90");
  await page.getByLabel("Payment method").selectOption({label:"UPI"});
  await page.getByLabel("UPI or bank reference").fill(reference);
  await page.getByLabel("Purpose").fill(reference);
  await page.getByLabel("Payment screenshot or PDF").setInputFiles({name:"payment.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\n% Payment proof test fixture\n%%EOF\n")});
  await page.getByRole("button",{name:"Submit proof",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Payment proof submitted for review.");
  await page.goto("/member/payments");
  const submission=page.getByRole("row").filter({hasText:reference});
  const download=await submission.getByRole("link",{name:"Preview"}).getAttribute("href");
  expect((await page.request.get(download!)).status()).toBe(200);
  const other=await browser.newPage();
  await signIn(other,"nu-000002",/\/member$/);
  expect((await other.request.get(download!)).status()).toBe(404);
  await other.close();
  const admin=await browser.newPage();
  await signIn(admin,"secretary",/\/admin$/);
  await admin.goto("/admin/verification?q="+reference);
  await admin.getByRole("link",{name:reference,exact:true}).click();
  await admin.getByLabel("Receiving account").selectOption({label:"UPI Collections"});
  await admin.getByLabel("Accounting operation").selectOption({label:"Collect member dues"});
  await admin.getByRole("button",{name:"Verify payment",exact:true}).click();
  await expect(admin.getByText("Verified",{exact:true})).toBeVisible();
  await admin.close();
});


test("temporary member password requires replacement before finance access",async({page,browser})=>{
  await signIn(page,"admin",/\/admin$/);
  await page.goto("/admin/members?q=Meera");
  await page.getByRole("link",{name:"Meera Nair",exact:true}).click();
  await page.getByRole("button",{name:"Reset member password",exact:true}).click();
  const temporary=page.locator(".temporary-login");
  await expect(temporary).toBeVisible();
  const [name,initialPassword]=await temporary.locator("code").allTextContents();
  expect(name).toBe("nu-000003");
  expect(initialPassword.length).toBeGreaterThanOrEqual(12);

  const member=await browser.newPage();
  await signIn(member,name,/\/reset$/,initialPassword);
  await member.goto("/member");
  await expect(member).toHaveURL(/\/reset$/);
  await member.getByLabel("New password").fill(password);
  await member.getByLabel("Confirm password").fill(password);
  await member.getByRole("button",{name:"Save password",exact:true}).click();
  await expect(member).toHaveURL(/\/login\?notice=password$/);
  await signIn(member,name,/\/member$/);
  await member.close();
});

test("the old authenticator URL uses the normal sign-in flow",async({page})=>{
  await page.goto("/mfa");
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page,"admin",/\/admin$/);
  await page.goto("/mfa");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible();
});
