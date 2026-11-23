"use client";
import Image from "next/image";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Shield } from "lucide-react";
import { mutate, enrollFactor, verifyFactor, type ActionResult } from "@/app/actions";
import type { Command } from "@/lib/validation";
import type { Option } from "@/lib/model";
import { useTranslation } from "./language";
import { Button } from "./ui/button";

type FormAction = (previous:ActionResult,form:FormData)=>Promise<ActionResult>;
export function Feedback({state}:{state:ActionResult}) {
  const t=useTranslation();
  if (state.error) return <p role="alert" className="feedback feedback-error"><CircleAlert size={16}/>{t(state.error)}</p>;
  if (state.message) return <p role="status" className="feedback feedback-success"><CircleCheck size={16}/>{t(state.message)}</p>;
  return null;
}
export function ActionForm({command,action,title,children,submit,compact=false,variant="primary",successPath}:{command?:Command;action?:FormAction;title?:string;children:React.ReactNode;submit:string;compact?:boolean;successPath?:string;variant?:"primary"|"outline"|"danger"}) {
  const t=useTranslation();
  const selected:FormAction=action??mutate.bind(null,command!);
  const [state,run,pending]=useActionState(selected,{});
  const [,dispatch]=useTransition();
  return <form action={run} onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);dispatch(()=>run(data));}} className={compact?"action-form compact-form":"action-form"}>
    {title&&<h3>{t(title)}</h3>}{children}<Feedback state={state}/>
    {state.username&&state.temporaryPassword&&<div className="temporary-login">
      <dl><dt>{t("Username")}</dt><dd><code>{state.username}</code></dd>
        <dt>{t("Temporary password")}</dt><dd><code>{state.temporaryPassword}</code></dd></dl>
      <p className="form-help">{t("Share this password privately. It expires in 24 hours and must be changed at sign-in.")}</p>
    </div>}
    <div className="form-actions"><Button type="submit" variant={variant} size={compact?"small":"normal"} disabled={pending}>{pending&&<LoaderCircle size={15} className="spin"/>}{t(submit)}</Button></div>
    {state.id&&state.message&&successPath&&<Link className="inline-link" href={successPath+state.id}>{t("Open")} →</Link>}
  </form>;
}
export function Field({label,name,type="text",value,placeholder,required=false,options,wide=false,hint,min,max,step,accept,autoComplete}:{label:string;name:string;type?:string;value?:string;placeholder?:string;required?:boolean;options?:Option[];wide?:boolean;hint?:string;min?:string;max?:string;step?:string;accept?:string;autoComplete?:string}) {
  const t=useTranslation();
  return <label className={"field "+(wide?"field-wide":"")}><span>{t(label)}{required&&<b aria-hidden="true"> *</b>}</span>
    {options?<select name={name} defaultValue={value??""} required={required}><option value="">{t(placeholder??"Select")}</option>{options.map(o=><option key={o.value} value={o.value}>{t(o.label)}</option>)}</select>
    :type==="textarea"?<textarea name={name} defaultValue={value} placeholder={placeholder?t(placeholder):undefined} required={required} rows={3}/>
    :<input name={name} type={type} defaultValue={type==="file"?undefined:value} placeholder={placeholder?t(placeholder):undefined} required={required} min={min} max={max} step={step} accept={accept} autoComplete={autoComplete??(type==="password"?(name==="password"?"current-password":"new-password"):undefined)}/>}
    {hint&&<small>{t(hint)}</small>}
  </label>;
}
export const Hidden=({name,value}:{name:string;value:string})=><input type="hidden" name={name} value={value}/>;
export function MfaControls({enabled}:{enabled:boolean}) {
  const [enrollment,setEnrollment]=useState<ActionResult>({});
  const [busy,start]=useTransition();
  return <>
    {!enabled&&!enrollment.secret&&<><p>Use an authenticator app to generate a six-digit code for your administrator account.</p><Feedback state={enrollment}/><Button disabled={busy} onClick={()=>start(async()=>setEnrollment(await enrollFactor()))}><Shield size={16}/> Set up authenticator</Button></>}
    {enrollment.qr&&<div className="mfa-secret"><Image unoptimized alt="Authenticator enrollment QR code" width={160} height={160} src={enrollment.qr}/><p>Setup key <code>{enrollment.secret}</code></p></div>}
    {(enabled||enrollment.secret)&&<ActionForm action={verifyFactor} submit="Verify code"><Field label="Authenticator code" name="code" autoComplete="one-time-code" required placeholder="000000"/></ActionForm>}
  </>;
}
