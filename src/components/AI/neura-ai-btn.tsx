import { neuraQueryLogo } from "@/lib/logos";
import { cn } from "@/lib/utils";

export interface NeuraAIBtnProps {
  onClick: () => void;
  open: boolean;
}

export default function NeuraAIBtn({ onClick, open }: NeuraAIBtnProps) {
  return (
    <button
      className={cn(
        "group  flex items-center gap-2 rounded-lg p-1",
        "backdrop-blur-sm ",
        // "bg-none",
        "border-[1.5px] border-transparent hover:border-[#F5FAFF]",
        "hover:bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_100%,rgba(255,255,255,0.70)_0%),linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",

        "transition-[padding,background-color,border-color] duration-200 ease-out",
        open ? "pr-4 " : "hover:pr-4"
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          open ? "hidden" : "relative",
          `rounded-lg w-12 h-12 p-2`,
          "border-2 border-border ",
          "bg-[linear-gradient(140deg,#EEF4FB_17.44%,#93C7FB_92.29%)]",

          "shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]",
          "flex items-center justify-center",
          "transition-shadow duration-200 ease-out",
          "hover:shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.60),0px_10px_15px_rgba(109,205,247,0.60)]"
        )}
      >
        {neuraQueryLogo}
      </div>
      <span
        className={cn(
          "text-md font-medium bg-gradient-to-r from-[#305EFF] to-[#8DC4FB] bg-clip-text text-transparent",
          "transition-[opacity,width] duration-200 ease-out",
          "whitespace-nowrap overflow-hidden",
          open
            ? "w-auto opacity-100"
            : "w-0 opacity-0 group-hover:w-auto group-hover:opacity-100"
        )}
      >
        {open ? "Close Neura AI" : "Ask Neura AI"}
      </span>

      {!open && (
        <span className="absolute top-0 flex h-3 w-3">
          <span className="animate-[ping_1s_cubic-bezier(0,0,0.2,1)_3] absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
        </span>
      )}
    </button>
  );
}
