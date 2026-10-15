import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { cloudLogo } from "@/lib/logos";

const cardVariants = cva("rounded-xl transition-all duration-200", {
  variants: {
    variant: {
      square: "min-h-[40vh] w-full",
      longHorizontal: "h-full w-full md:col-span-2",
      longVertical: "h-full w-full  md:row-span-2",
    },
    color: {
      primary: "bg-primary text-primary-foreground",
      secondary: "bg-secondary text-secondary-foreground",
      neura: `
          bg-card
        `,
    },
  },
  defaultVariants: {
    variant: "square",
    color: "neura",
  },
});

export interface NeuraCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "color">,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

const NeuraCard = React.forwardRef<HTMLDivElement, NeuraCardProps>(
  ({ className, variant, color, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        className={cn(
          cardVariants({ variant, color, className }),
          "relative overflow-hidden"
        )}
        ref={ref}
        {...props}
      >
        {props.children}
      </Comp>
    );
  }
);

NeuraCard.displayName = "NeuraCard";

export const FeatureSideCard = ({
  logo,
  title,
  description,
}: {
  logo: React.ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <>
      <div
        className={`absolute z-50 left-1/2 bottom-0 -translate-x-1/2 mb-4 ring-2 ring-white/40 p-3 md:p-4 gap-1 rounded-md h-fit w-[90%] flex flex-col border border-[rgba(48,94,255,0.24)] bg-[#FAFBFF] 
                shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.40),0px_8.206px_13.677px_rgba(109,205,247,0.22)]`}
      >
        <div className="flex gap-2 text-primary z-10">
          {logo}
          <p className="text-xl font-medium">{title}</p>
        </div>
        <p className="text-base opacity-60 leading-none z-10">{description}</p>
        {/* <div className="absolute h-[200px] w-[200px] top-0 -left-10 bg-secondary rounded-full -z-1 filter blur-3xl opacity-70" /> */}
      </div>
    </>
  );
};
export { NeuraCard, cardVariants };
