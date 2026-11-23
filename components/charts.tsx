"use client";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, type StoreRow } from "@/lib/model";

const colors=["#3978f9","#18a998","#8c6cf5","#f5a623","#ef6374","#7395c2"];
const axis={fill:"var(--muted)",fontSize:11};
const grid={stroke:"var(--line)",strokeDasharray:"4 4"};
const hint={background:"var(--panel)",border:"1px solid var(--line)",borderRadius:9,fontSize:12,color:"var(--text)"};
const short=(n:number)=>n===0?"₹0":Math.abs(n)>=100000?"₹"+(n/100000).toFixed(n%100000===0?0:1)+"L":Math.abs(n)>=1000?"₹"+(n/1000).toFixed(n%1000===0?0:1)+"k":"₹"+n;
export function IncomeChart({rows}:{rows:StoreRow[]}) {
  const [mode,setMode]=useState("overview");
  return <><div className="chart-controls"><div className="legend"><span><i style={{background:colors[0]}}/>{mode==="overview"?"Income":mode==="cash"?"Net cash flow":"Transactions"}</span>{mode==="overview"&&<span><i style={{background:"#a5c2ff"}}/> Expenses</span>}</div>
    <select aria-label="Chart series" value={mode} onChange={event=>setMode(event.target.value)}><option value="overview">Income & expenses</option><option value="cash">Cash flow</option><option value="volume">Transaction trends</option></select></div>
    <div className="chart-host"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      {mode==="cash"?<AreaChart data={rows}><defs><linearGradient id="cash-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[0]} stopOpacity={0.25}/><stop offset="100%" stopColor={colors[0]} stopOpacity={0.02}/></linearGradient></defs><CartesianGrid vertical={false} {...grid}/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={axis}/><YAxis tickFormatter={short} axisLine={false} tickLine={false} width={52} tick={axis}/><Tooltip contentStyle={hint} formatter={n=>money(n)}/><Area isAnimationActive={false} dataKey="cash_flow" name="Net cash flow" type="monotone" stroke={colors[0]} strokeWidth={2} fill="url(#cash-gradient)"/></AreaChart>:
      <BarChart data={rows} barGap={4} barCategoryGap="29%" margin={{top:6,right:6,left:0,bottom:1}}><CartesianGrid vertical={false} {...grid}/><XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={10} tick={axis}/><YAxis tickFormatter={mode==="volume"?n=>String(n):short} allowDecimals={false} axisLine={false} tickLine={false} width={52} tick={axis}/><Tooltip contentStyle={hint} formatter={n=>mode==="volume"?String(n):money(n)} cursor={{fill:"var(--hover)"}}/>
        <Bar isAnimationActive={false} dataKey={mode==="volume"?"volume":"income"} name={mode==="volume"?"Transactions":"Income"} fill={colors[0]} maxBarSize={22} radius={[5,5,0,0]}/>{mode==="overview"&&<Bar isAnimationActive={false} dataKey="expenses" name="Expenses" fill="#a5c2ff" maxBarSize={22} radius={[5,5,0,0]}/>}
      </BarChart>}
    </ResponsiveContainer></div></>;
}
export function BalanceChart({accounts,total}:{accounts:StoreRow[];total:number}) {
  const values=accounts.map((entry,index)=>({id:entry.id,name:entry.name,balance:entry.balance,magnitude:Math.abs(Number(entry.balance)),color:colors[index%colors.length]}));
  const nonzero=values.some(x=>x.magnitude>0);
  return <><div className="donut"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><PieChart>
    <Pie isAnimationActive={false} data={nonzero?values:[{name:"Balance",magnitude:1,color:"#dce5f2"}]} nameKey="name" dataKey="magnitude" innerRadius="72%" outerRadius="94%" stroke="none" cornerRadius={4} paddingAngle={nonzero&&values.filter(x=>x.magnitude>0).length>1?4:0} startAngle={90} endAngle={-270}>
      {(nonzero?values:[{color:"#dce5f2"}]).map((entry,index)=><Cell key={index} fill={entry.color}/>)}</Pie>{nonzero&&<Tooltip contentStyle={hint} formatter={(_n,_name,item)=>money(item.payload.balance)}/>}
    </PieChart></ResponsiveContainer><div className="donut-label"><strong>{money(total)}</strong><span>Available balance</span></div></div>
    <div className="balance-legend">{values.map(entry=><div key={String(entry.id)}><span><i style={{background:entry.color}}/>{String(entry.name)}</span><strong>{money(entry.balance)}</strong></div>)}</div></>;
}
export function DepartmentChart({rows}:{rows:StoreRow[]}) {
  return <div className="chart-host short-chart"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><BarChart data={rows} layout="vertical" margin={{left:10,right:15}}><CartesianGrid horizontal={false} {...grid}/><XAxis type="number" tickFormatter={short} tick={axis} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={105}/><Tooltip contentStyle={hint} formatter={n=>money(n)}/><Bar isAnimationActive={false} dataKey="amount" name="Expenses" fill={colors[0]} maxBarSize={15} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>;
}
