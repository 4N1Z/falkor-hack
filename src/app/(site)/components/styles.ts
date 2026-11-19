import { cn } from "@/lib/utils";

/** The landing's frosted blue glass panel (same recipe as the original editor mockup). */
export const glassCard = cn(
  "rounded-xl border-2 border-sky-100 ring-4 ring-white/40",
  "bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#FFF_24.44%,#93C7FB_92.29%)]",
  "shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]"
);

/** The pale card that sits on a glass panel (same recipe as FeatureSideCard). */
export const innerCard = cn(
  "rounded-lg border border-[rgba(48,94,255,0.24)] bg-[#FAFBFF] ring-2 ring-white/40",
  "shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.40),0px_8.206px_13.677px_rgba(109,205,247,0.22)]"
);

/** The gradient logo tile used across the landing. */
export const logoTile = cn(
  "rounded-lg border border-border flex items-center justify-center",
  "bg-[linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
  "shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]"
);
