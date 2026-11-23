"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, numeric, type StoreRow } from "@/lib/model";
import { useTranslation } from "./language";

const colors=["#4f62e8","#24a798","#9c77e8","#e99a48","#e0697f","#6b9ec8"];
const axis={fill:"var(--muted)",fontSize:11};
const grid={stroke:"var(--line)"};
const hint={background:"var(--panel)",border:"1px solid var(--line)",borderRadius:10,fontSize:12,color:"var(--text)"};
const short=(n:number)=>{
  const amount=Math.abs(n);
  const sign=n<0?"−":"";
  if(amount>=100000)return sign+"₹"+(amount/100000).toFixed(amount%100000===0?0:1)+"L";
  if(amount>=1000)return sign+"₹"+(amount/1000).toFixed(amount%1000===0?0:1)+"k";
  return sign+"₹"+amount;
};
export function IncomeChart({rows}:{rows:StoreRow[]}) {
  const [mode,setMode]=useState("overview");
  const t=useTranslation();
  const chartRows=rows.map(row=>({...row,outflow:-numeric(row,"expenses")}));
  return <>
    <div className="chart-controls finance-chart-controls">
      <div className="legend">
        <span><i style={{background:"var(--finance-income)"}}/>{t(mode==="overview"?"Income":mode==="cash"?"Net cash flow":"Transactions")}</span>
        {mode==="overview"&&<span><i style={{background:"var(--finance-expense)"}}/>{t("Expenses")}</span>}
      </div>
      <select aria-label={t("Chart series")} value={mode} onChange={event=>setMode(event.target.value)}>
        <option value="overview">{t("Income & expenses")}</option>
        <option value="cash">{t("Cash flow")}</option>
        <option value="volume">{t("Transaction trends")}</option>
      </select>
    </div>
    <div className="chart-host finance-chart-host">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
        {mode==="cash"?<AreaChart data={chartRows} margin={{top:8,right:14,left:0,bottom:4}}>
          <defs><linearGradient id="cash-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--finance-income)" stopOpacity={0.28}/><stop offset="100%" stopColor="var(--finance-income)" stopOpacity={0.02}/>
          </linearGradient></defs>
          <CartesianGrid vertical={false} {...grid}/><XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={10} tick={axis}/>
          <YAxis tickFormatter={short} axisLine={false} tickLine={false} width={58} tick={axis}/>
          <ReferenceLine y={0} stroke="var(--chart-baseline)"/>
          <Tooltip contentStyle={hint} formatter={n=>money(n)}/>
          <Area isAnimationActive={false} dataKey="cash_flow" name={t("Net cash flow")} type="monotone" stroke="var(--finance-income)" strokeWidth={2} fill="url(#cash-gradient)"/>
        </AreaChart>:
        <BarChart data={chartRows} stackOffset="sign" barCategoryGap="28%" margin={{top:8,right:14,left:0,bottom:4}}>
          <CartesianGrid vertical={false} {...grid}/><XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={10} tick={axis}/>
          <YAxis tickFormatter={mode==="volume"?n=>String(n):short} allowDecimals={false} axisLine={false} tickLine={false} width={58} tick={axis}/>
          <ReferenceLine y={0} stroke="var(--chart-baseline)"/>
          <Tooltip contentStyle={hint} formatter={(n,name)=>mode==="volume"?String(n):money(name===t("Expenses")?-Number(n):n)} cursor={{fill:"var(--hover)"}}/>
          <Bar isAnimationActive={false} stackId="activity" dataKey={mode==="volume"?"volume":"income"} name={t(mode==="volume"?"Transactions":"Income")} fill="var(--finance-income)" maxBarSize={32} radius={[5,5,mode==="volume"?0:4,mode==="volume"?0:4]}/>
          {mode==="overview"&&<Bar isAnimationActive={false} stackId="activity" dataKey="outflow" name={t("Expenses")} fill="var(--finance-expense)" maxBarSize={32} radius={[3,3,5,5]}/>}
        </BarChart>}
      </ResponsiveContainer>
    </div>
  </>;
}
export function BalanceChart({accounts,total}:{accounts:StoreRow[];total:number}) {
  const t=useTranslation();
  const values=accounts.map((entry,index)=>({id:entry.id,name:entry.name,balance:entry.balance,magnitude:Math.abs(Number(entry.balance)),color:colors[index%colors.length]}));
  const nonzero=values.some(x=>x.magnitude>0);
  const slices=nonzero?values.filter(entry=>entry.magnitude>0):[{name:t("Available balance"),magnitude:1,color:"var(--line)"}];
  return <><div className="donut"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><PieChart>
    <Pie isAnimationActive={false} data={slices} nameKey="name" dataKey="magnitude" innerRadius="73%" outerRadius="92%" stroke="none" cornerRadius={5} paddingAngle={slices.length>1?3:0} startAngle={90} endAngle={-270}>
      {slices.map((entry,index)=><Cell key={index} fill={entry.color}/>)}</Pie>{nonzero&&<Tooltip contentStyle={hint} formatter={(_n,_name,item)=>money(item.payload.balance)}/>}
    </PieChart></ResponsiveContainer><div className="donut-label"><strong>{money(total)}</strong><span>{t("Available balance")}</span></div></div>
    <div className="balance-legend">{values.map(entry=><div key={String(entry.id)}><span><i style={{background:entry.color}}/>{String(entry.name)}</span><strong>{money(entry.balance)}</strong></div>)}</div></>;
}
export function DepartmentChart({rows}:{rows:StoreRow[]}) {
  return <div className="chart-host short-chart"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={rows} layout="vertical" margin={{left:10,right:15}}><CartesianGrid horizontal={false} {...grid}/><XAxis type="number" tickFormatter={short} tick={axis} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={105}/><Tooltip contentStyle={hint} formatter={n=>money(n)}/><Bar isAnimationActive={false} dataKey="amount" name="Expenses" fill={colors[0]} maxBarSize={15} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>;
}
