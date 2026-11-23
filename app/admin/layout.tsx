import { Shell } from "@/components/shell";
import { portalContext } from "@/lib/portal";
export default async function Layout({children}:{children:React.ReactNode}) {
  const context=await portalContext("admin");
  return <Shell portal="admin" profile={context.profile} unread={context.unread} language={context.language} theme={context.theme}>{children}</Shell>;
}
