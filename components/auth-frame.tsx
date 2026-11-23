import Link from "next/link";
import { ArrowLeft, Landmark, ShieldCheck } from "lucide-react";
import { Brand } from "./shell";
export function AuthFrame({title,description,children,back=false}:{title:string;description:string;children?:React.ReactNode;back?:boolean}) {
  return <main className="auth-page"><section className="auth-aside"><Brand/><div className="auth-deco"/><div className="auth-intro"><span className="auth-figure"><Landmark size={38}/></span><h2>Finance for<br/>NUSHA Students Union</h2><p>Manage union accounts, approve transactions, and keep member financial records in one place.</p></div><div className="auth-footer"><ShieldCheck size={17}/> Secure access for union officers and members</div></section><section className="auth-main"><div className="auth-content">{back&&<Link className="back-link" href="/login"><ArrowLeft size={16}/> Back to sign in</Link>}<h1>{title}</h1><p>{description}</p>{children}</div></section></main>;
}
