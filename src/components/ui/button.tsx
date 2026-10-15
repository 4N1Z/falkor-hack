import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex z-50 items-center gap-2 whitespace-nowrap rounded-md font-medium ring-offset-background transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-card border border-transparent hover:border-sky-100 hover:text-accent-foreground ",
        link: "text-primary underline-offset-4 hover:underline",
        none: "bg-transparent ",
        neura: `
            bg-[radial-gradient(134.48%_89.51%_at_108.11%_35.71%,#305EFF_66.2%,#84CDFF_100%)]
            border
            border-primary-foreground
            text-white
            shadow-[inset_0px_3px_4px_1px_rgba(132,205,255,0.80)]
            transition-[box-shadow,filter] duration-200 ease-out
            hover:brightness-110
            `,
        neurNormal: `
          "border-[1.5px] border-[#F5FAFF]",
          "ring-2 ring-white/40",
          "bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
          "shadow-[0px_3.987px_6.645px_0px_rgba(109,205,247,0.52)]"
        `,
        neuraShadow:`
          px-1 py-0 border bg-none 
          text-secondary font-medium  gap-2 hover-subtle-shadow-blue rounded-md
          backdrop-blur-sm
          shadow-[inset_2.471px_2.471px_10.941px_rgba(238,244,251,0.30),0px_8.206px_13.677px_rgba(109,205,247,0.30)]
          ring-2 ring-white/40 
          border border-sky-100
        `,
        pluginNormal: `
          bg-white rounded-md border border-black/5 
          flex items-center justify-center p-2 [&_svg]:w-6 [&_svg]:h-6
        `,
        pluginBlue: `
          border border-secondary-foreground rounded-md 
          bg-[linear-gradient(115deg,#BCE5FF_12.84%,#DCECFE_93.66%)] 
          shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.3)] 
          flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6
          transition-[transform,box-shadow] duration-150 ease-out
          [@media(hover:hover)]:hover:scale-[1.03] 
          hover:shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.50),0px_12px_20px_rgba(109,205,247,0.4)]
          hover:bg-[linear-gradient(115deg,#BCE5FF_20%,#DCECFE_100%)]
        `,
        pluginGreen: `
          border border-[#A1E3CE] rounded-md 
          bg-[radial-gradient(50%_50%_at_50%_50%,#CFF7E4_0%,#B3F1DA_100%)] 
          shadow-[0px_1.662px_13.297px_0px_rgba(111,212,181,0.64)] 
          flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6
          transition-[transform,box-shadow] duration-150 ease-out
          [@media(hover:hover)]:hover:scale-[1.03]
          hover:shadow-[0px_4px_20px_rgba(111,212,181,0.8)]
          hover:bg-[radial-gradient(50%_50%_at_50%_50%,#CFF7E4_20%,#B3F1DA_120%)]
        `,
        pluginOrange: `
          border border-[#FBBB9D] rounded-md 
          bg-[linear-gradient(134deg,#FBDDD0_27.98%,#EED695_114.61%)] 
          shadow-[0px_4.986px_8.311px_0px_rgba(248,135,82,0.52)] 
          flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6
          transition-[transform,box-shadow] duration-150 ease-out
          [@media(hover:hover)]:hover:scale-[1.03]
          hover:shadow-[0px_8px_20px_rgba(248,135,82,0.6)]
          hover:bg-[linear-gradient(134deg,#FBDDD0_35%,#EED695_120%)]
        `,
        pluginYellow: `
          border border-[#FCE1A1] rounded-md 
          bg-[linear-gradient(140deg,#FDE1BD_7.44%,#FCF0A9_92.29%)] 
          shadow-[0px_4.986px_8.311px_0px_rgba(250,208,106,0.64)] 
          flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6
          transition-[transform,box-shadow] duration-150 ease-out
          [@media(hover:hover)]:hover:scale-[1.03]
          hover:shadow-[0px_8px_20px_rgba(250,208,106,0.7)]
          hover:bg-[linear-gradient(140deg,#FDE1BD_15%,#FCF0A9_100%)]
        `,
        zotero: ` 
        px-1 py-0 text-sm border
      
        text-neura-dashboardGray font-medium duration-150 gap-2 hover-subtle-shadow-blue rounded-md
        hover:backdrop-blur-sm

        ring-2 ring-transparent
        hover:shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.30),0px_8.206px_13.677px_rgba(109,205,247,0.30)]
          hover:ring-2 hover:ring-white/40
          hover:border hover:border-sky-100

        `,
        
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        plugin: "w-12 h-12",
        pluginSm:"w-6 h-6",
        none:"p-0"
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
