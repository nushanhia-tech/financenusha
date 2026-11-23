import { LayoutDashboard, ArrowLeftRight, Landmark, UsersRound, Building2, CalendarDays, Handshake, BadgeCheck, PieChart,
  Files, ShieldCheck, ChartNoAxesColumnIncreasing, ScrollText, GraduationCap, Bell, Settings, BookOpen, HandCoins,
  HeartHandshake, CircleAlert, UploadCloud, Undo2, ReceiptIndianRupee, CircleUserRound
} from "lucide-react";

export const adminNavigation = [
  {label:"Overview",items:[
    {key:"dashboard",label:"Dashboard",icon:LayoutDashboard},{key:"transactions",label:"Transactions",icon:ArrowLeftRight},
    {key:"accounts",label:"Union Accounts",icon:Landmark},{key:"members",label:"Members",icon:UsersRound},
    {key:"departments",label:"Departments",icon:Building2},{key:"events",label:"Events & Programs",icon:CalendarDays},
    {key:"sponsorship",label:"Sponsorship & Donations",icon:Handshake},
  ]},
  {label:"Finance Operations",items:[
    {key:"verification",label:"Payment Verification",icon:BadgeCheck},{key:"budgets",label:"Budget Management",icon:PieChart},
    {key:"documents",label:"Bills & Receipts",icon:Files},{key:"approvals",label:"Approvals",icon:ShieldCheck},{key:"reports",label:"Financial Reports",icon:ChartNoAxesColumnIncreasing},
  ]},
  {label:"Administration",items:[
    {key:"audit",label:"Audit Logs",icon:ScrollText},{key:"years",label:"Academic Year",icon:GraduationCap},
    {key:"notifications",label:"Notifications",icon:Bell},{key:"settings",label:"Settings",icon:Settings},
  ]},
];
export const memberNavigation = [
  {label:"Overview",items:[
    {key:"dashboard",label:"My Dashboard",icon:LayoutDashboard},{key:"ledger",label:"My Financial Ledger",icon:BookOpen},
    {key:"payments",label:"My Payments",icon:HandCoins},{key:"contributions",label:"My Contributions",icon:HeartHandshake},
    {key:"dues",label:"My Dues",icon:CircleAlert},{key:"proof",label:"Submit Payment Proof",icon:UploadCloud},
  ]},
  {label:"Records",items:[
    {key:"refunds",label:"My Refunds",icon:Undo2},{key:"reimbursements",label:"My Reimbursements",icon:ArrowLeftRight},
    {key:"receipts",label:"My Receipts",icon:ReceiptIndianRupee},{key:"statements",label:"My Statements",icon:Files},
    {key:"notifications",label:"Notifications",icon:Bell},{key:"profile",label:"My Profile",icon:CircleUserRound},
  ]},
];
export const hrefFor=(portal:string,key:string)=>"/"+portal+(key==="dashboard" ? "" : "/"+key);
