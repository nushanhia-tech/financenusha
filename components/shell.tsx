"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Bell, ChevronDown, CircleHelp, Globe, Menu, Moon, Search, Sun, X, PanelTop, LogOut, Shield, WalletCards } from "lucide-react";
import { logout } from "@/app/actions";
import { adminNavigation, hrefFor, memberNavigation } from "@/lib/navigation";
import { translate, type Language } from "@/lib/i18n";
import { LanguageProvider } from "./language";
import { human, type Role } from "@/lib/model";

export function Brand({plain=false}:{plain?:boolean}) {
  return <div className={"brand "+(plain?"brand-plain":"")}>
    <span className="brand-mark"><WalletCards size={22} strokeWidth={2.25}/></span>
    <span><strong>NUSHA<span> Finance</span></strong><small>STUDENTS UNION</small></span>
  </div>;
}
function setPreference(name:string,value:string) {
  document.cookie = name+"="+value+"; Path=/; Max-Age=31536000; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");
}
export function Shell({portal,profile,unread,language,theme,children}:{portal:"admin"|"member";profile:{name:string;role:Role};unread:number;language:Language;theme:"dark"|"light";children:React.ReactNode}) {
  const path=usePathname();
  const [open,setOpen]=useState(false);
  const [dark,setDark]=useState(theme==="dark");
  const groups=portal==="admin"?adminNavigation:memberNavigation;
  const selected=groups.flatMap(group=>group.items).find(item=>hrefFor(portal,item.key)===path);
  const t=(name:string)=>translate(language,name);
  const initials=profile.name.split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join("");
  return <LanguageProvider language={language}><div className="shell">
    {open&&<button className="scrim" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
    <aside className={"sidebar "+(open?"sidebar-open":"")}>
      <Link className="brand-link" href={"/"+portal} onClick={()=>setOpen(false)}><Brand/></Link>
      <div className="workspace-label"><span className="workspace-icon"><PanelTop size={16}/></span><div><strong>{t(portal==="admin"?"Admin Portal":"Member Portal")}</strong><small>NUSHA Students Union</small></div><ChevronDown size={14}/></div>
      <nav aria-label="Main navigation">
        {groups.map(group=><div className="nav-group" key={group.label}>
          <div className="nav-label">{t(group.label)}</div>
          {group.items.map(({key,label,icon:Icon})=>{ const url=hrefFor(portal,key); return <Link href={url} prefetch={false} key={key} onClick={()=>setOpen(false)} aria-current={path===url?"page":undefined} className={"nav-item "+(path===url?"nav-active":"")}><Icon size={16}/><span>{t(label)}</span>{key==="notifications"&&unread>0&&<b>{unread}</b>}</Link>; })}
        </div>)}
      </nav>
      <div className="sidebar-bottom"><Link href={portal==="admin"?"/admin/settings":"/member/profile"} onClick={()=>setOpen(false)}><CircleHelp size={17}/> <span>{portal==="admin"?t("Settings"):t("My Profile")}</span><ArrowUpRight size={13}/></Link></div>
    </aside>
    <div className="shell-main">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label={open?"Close navigation":"Open navigation"} onClick={()=>setOpen(!open)}>{open?<X size={21}/>:<Menu size={21}/>}</button>
        <div className="breadcrumb"><span>{t(portal==="admin"?"Admin Portal":"Member Portal")}</span><span className="breadcrumb-slash">/</span><strong>{t(selected?.label??"Dashboard")}</strong></div>
        <div className="topbar-right">
          <form action={portal==="admin"?"/admin/transactions":"/member/ledger"} className="top-search"><Search size={16}/><input name="q" aria-label={t("Search transactions…")} placeholder={t("Search transactions…")}/></form>
          <button className="icon-button locale" title="English / മലയാളം" aria-label="Change language" onClick={()=>{setPreference("nusha-language",language==="en"?"ml":"en");location.reload();}}><Globe size={17}/><span>{language==="en"?"EN":"ML"}</span></button>
          <button className="icon-button" title={t(dark?"Light mode":"Dark mode")} aria-label={t(dark?"Light mode":"Dark mode")} onClick={()=>{const next=!dark;setDark(next);document.documentElement.dataset.theme=next?"dark":"light";setPreference("nusha-theme",next?"dark":"light");}}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button>
          <Link className="icon-button bell-button" aria-label={t("Notifications")} href={"/"+portal+"/notifications"}><Bell size={18}/>{unread>0&&<i/>}</Link>
          <details className="user-menu">
            <summary aria-label="Account menu"><span className="avatar">{initials}</span><span className="top-user"><strong>{profile.name}</strong><small>{human(profile.role.toLowerCase())}</small></span><ChevronDown size={13}/></summary>
            <div>{portal==="admin"&&<Link href="/mfa"><Shield size={16}/> Two-factor authentication</Link>}<form action={logout}><button><LogOut size={16}/>{t("Sign out")}</button></form></div>
          </details>
        </div>
      </header>
      <main className="main-content">{children}</main>
    </div>
  </div></LanguageProvider>;
}
