import type { Metadata } from "next";
import { preferences } from "@/lib/preferences";
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-malayalam/400.css";
import "@fontsource/noto-sans-malayalam/600.css";
import "./globals.css";

export const metadata:Metadata={title:{default:"NUSHA Finance",template:"%s · NUSHA Finance"},description:"The financial management portal for NUSHA Students Union."};
export default async function RootLayout({children}:{children:React.ReactNode}) {
  const {language:lang,theme}=await preferences();
  return <html lang={lang} data-theme={theme}><body>{children}</body></html>;
}
