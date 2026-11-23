import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...classes: Parameters<typeof clsx>) => twMerge(clsx(classes));
const variants = cva("button", { variants: { variant: { primary: "button-primary", outline: "button-outline", subtle: "button-subtle", danger: "button-danger", icon: "button-icon" }, size: { normal: "", small: "button-small" } }, defaultVariants: {variant:"primary",size:"normal"} });
export function Button({asChild,variant,size,className,...props}:React.ComponentProps<"button"> & VariantProps<typeof variants> & {asChild?:boolean}) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(variants({variant,size}),className)} {...props}/>;
}
