"use client";
import { createContext, useContext } from "react";
import { translate, type Language } from "@/lib/i18n";
const LanguageContext=createContext<Language>("en");
export function LanguageProvider({language,children}:{language:Language;children:React.ReactNode}) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}
export function useTranslation() {
  const language=useContext(LanguageContext);
  return (text:string)=>translate(language,text);
}
