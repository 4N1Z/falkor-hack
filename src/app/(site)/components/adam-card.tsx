import { cn } from "@/lib/utils";
import { innerCard } from "./styles";

const loop = ["Question", "Sweep", "Extract", "Methods", "Connect", "Hypothesise", "Attack", "Experiment"];
const current = 5;

const chain = [
  { step: "Thin-film deposition", status: "runnable" },
  { step: "Defect passivation at 85 °C", status: "gap" },
  { step: "Spectral shift readout", status: "partial" },
];

const statusStyle: Record<string, string> = {
  runnable: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  gap: "bg-red-100 text-red-600",
};

/** Adam in one card: the loop it runs and the two things it hands back. */
export default function AdamCard() {
  return (
    <div className="relative z-[2] flex h-full flex-col gap-4 p-4 md:p-8 pb-32 md:pb-36 text-left text-foreground">
      <div className="flex flex-wrap items-center gap-1.5">
        {loop.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs",
                i < current && "border-sky-100 bg-sky-50 text-primary",
                i === current && "border-primary bg-primary text-white",
                i > current && "border-transparent bg-white/70 text-muted-foreground"
              )}
            >
              {p}
            </span>
            {i < loop.length - 1 && <span className="text-xs text-primary/40">→</span>}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={cn(innerCard, "flex flex-col gap-2.5 p-4")}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-primary">Hypothesis brief</p>
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">survived attack</span>
          </div>
          <p className="text-[13px] leading-snug">
            Surface passivation, not grain size, sets the emission shift under heat.
          </p>
          <p className="rounded border border-dashed border-primary/40 px-2 py-1.5 text-xs">
            <span className="font-semibold text-primary">Kill criterion, signed by you:</span> no shift above 4 nm
            at 85 °C across 3 batches.
          </p>
        </div>

        <div className={cn(innerCard, "flex flex-col gap-2.5 p-4")}>
          <p className="text-sm font-medium text-primary">Experiment chain · cheapest to kill first</p>
          <ol className="flex flex-col gap-2">
            {chain.map((c, i) => (
              <li key={c.step} className="flex items-center gap-2 text-[13px]">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-sky-100 bg-sky-50 text-xs text-primary">
                  {i + 1}
                </span>
                <span className="flex-1 leading-tight">{c.step}</span>
                <span className={cn("rounded px-1.5 py-0.5 text-xs", statusStyle[c.status])}>{c.status}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
