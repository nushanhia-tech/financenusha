import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Field, Hidden } from "./forms";
import { SearchBox, type Params } from "./primitives";
import { Button } from "./ui/button";
import { one, type Option } from "@/lib/model";

export type FilterField={name:string;label:string;options?:Option[];type?:string};
export function Filters({path,params,fields=[],search,sort=true,keep=[]}:{path:string;params:Params;fields?:FilterField[];search?:string;sort?:boolean;keep?:string[]}) {
  return <form action={path} className="filters">
    {keep.map(key=><Hidden key={key} name={key} value={one(params,key)}/>)}
    <div className="filters-top">{search&&<SearchBox current={one(params,"q")} placeholder={search}/>}
      {sort&&<select name="sort" aria-label="Sort records" defaultValue={one(params,"sort")||"newest"}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>}
      <Button type="submit" size="small" variant="outline"><SlidersHorizontal size={15}/> Apply filters</Button><Button asChild size="small" variant="subtle"><Link href={path}>Clear</Link></Button>
    </div>
    {!!fields.length&&<div className="filter-fields">{fields.map(field=><Field key={field.name} {...field} value={one(params,field.name)} placeholder="All"/>)}</div>}
  </form>;
}
