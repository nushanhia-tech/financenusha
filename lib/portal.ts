import { preferences } from "./preferences";
import { requirePortal } from "./session";
export async function portalContext(portal:"admin"|"member") {
  const current=await requirePortal(portal);
  const {language,theme}=await preferences();
  const {count}=await current.db.from("notifications").select("id",{count:"exact",head:true}).is("read_at",null);
  return {...current,unread:count??0,language,theme};
}
