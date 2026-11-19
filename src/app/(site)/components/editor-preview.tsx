import { cn } from "@/lib/utils";
import { neuraQueryLogo } from "@/lib/logos";
import {
  AtSign,
  BookOpenText,
  Check,
  FileDown,
  FlaskConical,
  ImageIcon,
  MessageSquareText,
  Paperclip,
  Search,
  SendHorizontal,
  Smile,
  Sparkles,
} from "lucide-react";
import { logoTile } from "./styles";

/** Light glass panel that sits on the navy frame. */
const panel = cn(
  "rounded-xl border border-white/70 bg-[#F7FAFF] ring-4 ring-white/10",
  "shadow-[0_18px_40px_-12px_rgba(3,16,48,0.55),inset_0_1px_0_rgba(255,255,255,0.9)]"
);

const people = [
  { initials: "SB", className: "bg-rose-200 text-rose-700" },
  { initials: "AL", className: "bg-sky-200 text-sky-700" },
  { initials: "E", className: "bg-emerald-500 text-white" },
];

const tools = [
  { Icon: Sparkles, title: "Cite Scout", sub: "a citation for this sentence", tile: "bg-amber-100 text-amber-500" },
  { Icon: BookOpenText, title: "Zotero import", sub: "bring in your saved papers", tile: "bg-rose-100 text-rose-500" },
  { Icon: FileDown, title: "Upload papers", sub: "claims indexed with page numbers", tile: "bg-emerald-100 text-emerald-600" },
  { Icon: Search, title: "Search papers", sub: "across OpenAlex and your graph", tile: "bg-sky-100 text-primary" },
  { Icon: FlaskConical, title: "Ask Adam", sub: "design the next experiment", tile: "bg-violet-100 text-violet-600" },
];

function Avatar({ initials, className }: { initials: string; className: string }) {
  return (
    <span
      className={cn(
        "grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold ring-2 ring-white",
        className
      )}
    >
      {initials}
    </span>
  );
}

/** A collaborator's caret with a name flag. */
function Caret({ name, className }: { name: string; className: string }) {
  return (
    <span className="relative inline-block h-[1.1em] w-0 align-text-bottom">
      <span className={cn("absolute inset-y-0 left-0 w-[2px] rounded-full", className)} />
      <span
        className={cn(
          "absolute bottom-full left-0 mb-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-white",
          className
        )}
      >
        {name}
      </span>
    </span>
  );
}

/** A pointer cursor with a name pill, as other people move around the doc. */
function Pointer({ name, className, pill, arrow }: { name: string; className?: string; pill: string; arrow: string }) {
  return (
    <span className={cn("pointer-events-none absolute flex items-start", className)}>
      <svg width="14" height="16" viewBox="0 0 14 16" className={cn("drop-shadow-sm", arrow)}>
        <path d="M1 1l12 6.2-5.3 1.4L5.2 15z" fill="currentColor" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <span className={cn("mt-3 -ml-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-sm", pill)}>
        {name}
      </span>
    </span>
  );
}

export default function EditorPreview() {
  return (
    <div
      className={cn(
        "relative h-[520px] md:h-[600px] overflow-hidden rounded-2xl p-3 md:p-5 text-left text-foreground",
        "border border-sky-200/70 ring-4 ring-sky-100/60",
        "bg-[radial-gradient(110%_85%_at_18%_0%,#3B6FF0_0%,#16398A_38%,#0A1F4D_68%,#06142F_100%)]",
        "shadow-[0_40px_80px_-30px_rgba(48,94,255,0.55)]"
      )}
    >
      {/* soft light from the top-right, like the original banner */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-400/25 blur-3xl" />

      {/* top bar */}
      <div className={cn(panel, "relative flex items-center justify-between gap-3 px-4 py-3 md:px-5")}>
        <div className="flex items-center gap-2">
          <span className="h-5 w-5">{neuraQueryLogo}</span>
          <span className="text-sm font-medium md:text-base">Neura Query</span>
        </div>
        <div className="flex items-center gap-3 md:gap-5 text-[13px]">
          <div className="flex -space-x-2">
            {people.map((p) => (
              <Avatar key={p.initials} {...p} />
            ))}
          </div>
          <span className="hidden text-muted-foreground sm:inline">Edited just now</span>
          <span className="hidden font-medium sm:inline">Share</span>
          <MessageSquareText className="hidden h-4 w-4 text-muted-foreground md:block" />
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-700">Saved</span>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.7fr)_minmax(0,0.95fr)]">
        {/* left: ask + comments */}
        <div className="hidden flex-col gap-4 lg:flex">
          <div className={cn(panel, "flex w-fit items-center gap-3 p-2 pr-4")}>
            <span className={cn(logoTile, "h-9 w-9 p-1.5")}>{neuraQueryLogo}</span>
            <span className="text-sm font-medium bg-gradient-to-r from-[#305EFF] to-[#8DC4FB] bg-clip-text text-transparent">
              ask Neura AI
            </span>
          </div>

          <div className={cn(panel, "flex flex-col gap-4 p-4 text-[12px] leading-snug")}>
            <div className="flex gap-2.5">
              <Avatar initials="SB" className="bg-rose-200 text-rose-700 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  Sofia Burner <span className="font-normal text-muted-foreground/70">6h ago</span>
                </p>
                <p className="text-muted-foreground">
                  Is the 92% retention figure from the 2023 study or the review?
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <span className="h-7 w-7 shrink-0 p-1">{neuraQueryLogo}</span>
              <div className="flex flex-col gap-1.5">
                <p className="font-medium">
                  <span className="rounded bg-sky-100 px-1 text-primary">Citation Checker</span>{" "}
                  <span className="font-normal text-muted-foreground/70">4h ago</span>
                </p>
                <p className="text-muted-foreground">
                  Ref [3] says it:{" "}
                  <span className="text-foreground">“retained 92% of initial PL intensity after 500 h”</span>
                </p>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    <Check className="h-3 w-3" /> supported
                  </span>
                  <span className="text-[11px] text-primary/80">Results · p. 6</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5">
              <Avatar initials="AL" className="bg-sky-200 text-sky-700 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  Aswin Lal <span className="font-normal text-muted-foreground/70">now</span>
                </p>
                <p className="text-muted-foreground">
                  Good catch, <span className="rounded bg-violet-100 px-1 text-violet-700">@Sofia</span> resolving
                  this one.
                </p>
              </div>
            </div>

            <div className="mt-1 border-t border-sky-100 pt-3">
              <p className="text-muted-foreground/60">ask neura AI</p>
              <div className="mt-2 flex items-center justify-between text-muted-foreground">
                <div className="flex gap-2.5">
                  <AtSign className="h-3.5 w-3.5" />
                  <Smile className="h-3.5 w-3.5" />
                  <Paperclip className="h-3.5 w-3.5" />
                </div>
                <span className="grid h-6 w-6 place-items-center rounded bg-sky-50">
                  <SendHorizontal className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* centre: the document */}
        <div className={cn(panel, "relative min-h-[460px] overflow-hidden")}>
          <div className="relative flex items-end gap-4 border-b border-sky-100 px-5 pb-4 pt-5 md:px-8">
            <span className={cn(logoTile, "h-14 w-14 shrink-0 p-2.5 md:h-16 md:w-16")}>{neuraQueryLogo}</span>
            <div className="flex flex-col gap-1">
              <span className="inline-flex w-fit items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                <ImageIcon className="h-3 w-3" /> upload banner
              </span>
              <p className="text-2xl font-medium leading-none tracking-tight md:text-3xl">Research</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/60">Photon spectrum project</p>
            </div>
            <Pointer name="Aniz B N" pill="bg-fuchsia-600" arrow="text-fuchsia-600" className="left-16 top-[88px] md:left-20 md:top-[96px]" />
          </div>

          <div className="relative flex flex-col gap-4 px-5 py-5 text-[13px] leading-relaxed text-slate-600 md:px-8 md:text-sm">
            <p className="text-xl font-semibold tracking-tight text-slate-800 md:text-2xl">Research is hard</p>
            <p>
              There are countless challenges in the research process. From managing citations and finding
              relevant papers, to organizing thoughts and{" "}
              <b className="font-semibold text-slate-800">collaborating with peers</b>, each step can be
              time-consuming without the right tools.
            </p>
            <p>
              It&apos;s tough to <Caret name="Sofia Burner" className="bg-emerald-600" />
              <b className="font-semibold text-slate-800">stay organized</b>, and harder still to know which
              claims hold up.{" "}
              <span className="rounded-sm bg-amber-50 underline decoration-amber-400 decoration-dashed underline-offset-4">
                Passivated films keep most of their emission after long illumination.
              </span>
            </p>

            {/* Cite Scout suggestion */}
            <div className="-mt-1 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[12px] shadow-[0_8px_20px_-8px_rgba(245,158,11,0.35)]">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-slate-700">
                <b className="font-semibold">Cite Scout</b> · 3 papers support this sentence
              </span>
              <span className="rounded bg-primary px-2 py-0.5 font-medium text-white">Insert [3]</span>
            </div>

            <p className="pt-2 text-base font-semibold tracking-tight text-slate-800 md:text-lg">
              Imagine you had it all in one place
            </p>
            <p>
              Imagine a single{" "}
              <span className="rounded-sm bg-violet-100/80 underline decoration-violet-400 underline-offset-4">
                platform
              </span>{" "}
              for all your research, where every claim is traced to the page it came from.
            </p>
            <Pointer name="Aswin Lal" pill="bg-sky-600" arrow="text-sky-600" className="right-10 top-[118px] md:right-16" />
          </div>
        </div>

        {/* right: tools */}
        <div className="hidden flex-col justify-between gap-4 lg:flex">
          {/* Adam, running in the background on this project */}
          <div className={cn(panel, "flex flex-col gap-2.5 p-3.5")}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-100 text-violet-600">
                  <FlaskConical className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium leading-tight">Adam</span>
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                gate 2 · your call
              </span>
            </div>
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => (
                <span
                  key={i}
                  className={cn("h-1 flex-1 rounded-full", i < 5 ? "bg-primary" : i === 5 ? "bg-primary/40" : "bg-sky-100")}
                />
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">Hypothesise</span> · 71 papers triaged, 2,215 passages
              read, 3 hypotheses drafted
            </p>
          </div>

          <div className={cn(panel, "flex flex-col gap-1 p-2.5")}>
            {tools.map(({ Icon, title, sub, tile }, i) => (
              <div
                key={title}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2",
                  i === 0 && "bg-sky-50 ring-1 ring-sky-100"
                )}
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tile)}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium leading-tight">{title}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{sub}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* fade the crop at the bottom, like the original screenshot */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#06142F]/80 to-transparent" />
    </div>
  );
}
