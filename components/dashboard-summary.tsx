"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, WalletCards } from "lucide-react";
import { money, numeric, value, type StoreRow } from "@/lib/model";
import { useTranslation } from "./language";

export function ActivityBars({rows,compact=false}:{rows:StoreRow[];compact?:boolean}) {
  const t=useTranslation();
  const [selected,setSelected]=useState<number|null>(null);
  const counts=rows.map(row=>numeric(row,"volume"));
  const highest=Math.max(1,...counts);
  const current=selected===null?null:rows[selected];
  if(!rows.length)return <p className="activity-empty">{t("No activity for this period")}</p>;
  return <div className={"activity-bars"+(compact?" activity-bars-compact":"")}>
    {!compact&&<div className="activity-caption" aria-live="polite">{current
      ? value(current,"month")+" · "+numeric(current,"volume")+" "+t("posted transactions")
      : t("Posted transactions by month")}</div>}
    <div className="activity-columns" role="group" aria-label={t("Posted transactions by month")}>
      {rows.map((row,index)=>{
        const month=value(row,"month");
        const count=counts[index];
        const style={height:(count===0?0:Math.max(5,count/highest*100))+"%"};
        const label=month+" · "+count+" "+t("posted transactions");
        return compact
          ? <div className="activity-column" key={index} title={label}><span style={style}/><small className="sr-only">{label}</small></div>
          : <button className="activity-column" type="button" key={index} aria-label={label} aria-pressed={selected===index} onClick={()=>setSelected(index)}>
            <span style={style}/><small aria-hidden="true">{month}</small>
          </button>;
      })}
    </div>
  </div>;
}

export function PhoneSummary({monthly,elapsedMonths,total,income,expenses}:{monthly:StoreRow[];elapsedMonths:number;total:number;income:unknown;expenses:unknown}) {
  const t=useTranslation();
  const [period,setPeriod]=useState("recent");
  const months=period==="year"?monthly:monthly.slice(Math.max(0,elapsedMonths-6),elapsedMonths);
  return <div className="finance-phone-summary">
    <section className="phone-balance" aria-label={t("Available balance")}>
      <div className="phone-balance-header">
        <span className="phone-balance-label"><WalletCards size={16} aria-hidden="true"/>{t("Available balance")}</span>
        <strong>{money(total)}</strong>
      </div>
      <div className="phone-chart-header">
        <h2>{t("Transaction activity")}</h2>
        {monthly.length>0&&<label className="phone-chart-select">
          <select aria-label={t("Chart period")} value={period} onChange={event=>setPeriod(event.target.value)}>
            <option value="recent">{t("Recent months")}</option><option value="year">{t("Academic Year")}</option>
          </select>
          <ChevronDown size={13} aria-hidden="true"/>
        </label>}
      </div>
      <ActivityBars key={period} rows={months}/>
    </section>
    <div className="phone-totals card">
      <div><span><ArrowDownLeft size={14} aria-hidden="true"/>{t("Total income")}</span><strong>{money(income)}</strong></div>
      <div><span><ArrowUpRight size={14} aria-hidden="true"/>{t("Total expenses")}</span><strong>{money(expenses)}</strong></div>
    </div>
  </div>;
}
