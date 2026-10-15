import { neuraQueryLogo } from "@/lib/logos";

export function NeuraQueryLogoWithText() {
  return (

    <div className="flex gap-2 items-center justify-center z-0">
      <div className="w-7 h-7">{neuraQueryLogo}</div>
      <span className="text-primary text-16 font-sans font-medium">
        neura query
      </span>
    </div>
  );
}
