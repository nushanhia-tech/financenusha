"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}) {
  return <div className="error-page"><h2>Couldn’t load this page</h2><p>Check the connection and try again.</p><Button onClick={reset}>Try again</Button></div>;
}
