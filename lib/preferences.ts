import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { translate, type Language } from "./i18n";
export const preferences=cache(async () => {
  const jar=await cookies();
  const language:Language=jar.get("nusha-language")?.value==="ml"?"ml":"en";
  const theme=jar.get("nusha-theme")?.value==="dark"?"dark" as const:"light" as const;
  return {language,theme,t:(text:string)=>translate(language,text)};
});
