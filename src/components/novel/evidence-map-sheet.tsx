"use client";

import type { EvidenceClaim, EvidencePaper, EvidenceResponse } from "@/app/api/graph/[workspaceId]/evidence/route";
import type { Verdict } from "@/lib/agents/citation-checker";
import type { SupportLevel } from "@/lib/jev";
import { FalkorCanvas, type CanvasLink, type CanvasNode } from "@/components/graph/falkor-canvas";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppState } from "@/lib/providers/state-providers";
import { cn } from "@/lib/utils";
import { Loader2, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { revealClaim } from "./citation-check-sheet";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";
const OWNER_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#4d7c0f"];
const OUTSIDE = "#94a3b8";

const VERDICT: Record<Verdict | "unchecked", { label: string; color: string; tone: string; rank: number }> = {
  contradicted: { label: "Contradicted", color: "#dc2626", tone: "bg-red-50 text-red-700", rank: 0 },
  unsupported: { label: "Not supported", color: "#dc2626", tone: "bg-red-50 text-red-700", rank: 1 },
  "unknown-source": { label: "Unknown source", color: "#d97706", tone: "bg-amber-50 text-amber-800", rank: 2 },
  uncited: { label: "Needs citation", color: "#d97706", tone: "bg-amber-50 text-amber-800", rank: 3 },
  weak: { label: "Partly supported", color: "#eab308", tone: "bg-amber-50 text-amber-800", rank: 4 },
  supported: { label: "Supported", color: "#059669", tone: "bg-emerald-50 text-emerald-700", rank: 5 },
  ok: { label: "No citation needed", color: "#cbd5e1", tone: "bg-muted text-muted-foreground", rank: 6 },
  unchecked: { label: "Not checked yet", color: "#64748b", tone: "bg-muted text-muted-foreground", rank: 7 },
};
const LEVEL: Record<SupportLevel, { label: string; color: string }> = {
  supports: { label: "supports", color: "#059669" },
  partial: { label: "partly supports", color: "#eab308" },
  unrelated: { label: "doesn't address", color: "#f87171" },
  contradicts: { label: "contradicts", color: "#dc2626" },
};

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Couldn't load the evidence map");
    return b as EvidenceResponse;
  });

const shortTitle = (p: EvidencePaper) => {
  const words = p.title.replace(/(:| [–—-] ).*$/, "").split(/\s+/).slice(0, 2).join(" ");
  return p.year ? `${words} ’${String(p.year).slice(2)}` : words;
};
const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : new Date(ms).toLocaleDateString();
};
const verdictOf = (c: EvidenceClaim) => c.verdict ?? "unchecked";

/**
 * Evidence map: the draft's argument as a graph from FalkorDB. Each claim (square) links to
 * the papers it cites (circles, coloured by whose library they're in), coloured by whether
 * the Citation Checker found the paper's text supports it; dashed links are papers agents
 * suggest for claims that need one. It shows what a list can't: which claims rest on a single
 * paper, which papers carry several claims, and whose reading the argument actually uses.
 */
export function EvidenceMapSheet({ fileId, open, onOpenChange }: { fileId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { workspaceId } = useAppState();
  const setOpen = onOpenChange;
  const [selected, setSelected] = useState<string | null>(null);
  const [showPaperCites, setShowPaperCites] = useState(false);
  const [checking, setChecking] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    open && workspaceId ? `/api/graph/${workspaceId}/evidence?fileId=${fileId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const userName = useMemo(() => new Map((data?.users ?? []).map((u) => [u.id, u.name.replace(/\s*\(demo\)/, "")])), [data]);
  const ownerColor = useMemo(() => {
    const ids = [...new Set((data?.papers ?? []).flatMap((p) => p.ownerIds))].sort();
    return new Map(ids.map((id, i) => [id, OWNER_COLORS[i % OWNER_COLORS.length]]));
  }, [data]);

  const claimById = useMemo(() => new Map((data?.claims ?? []).map((c) => [c.id, c])), [data]);
  const paperById = useMemo(() => new Map((data?.papers ?? []).map((p) => [p.id, p])), [data]);

  const nodes = useMemo<CanvasNode[]>(() => {
    if (!data) return [];
    return [
      ...data.claims.map((c) => ({
        id: c.id,
        caption: `C${c.n}`,
        color: VERDICT[verdictOf(c)].color,
        size: 12,
        shape: "square" as const,
      })),
      ...data.papers.map((p) => ({
        id: p.id,
        caption: shortTitle(p),
        color: p.ownerIds.length ? ownerColor.get(p.ownerIds[0])! : OUTSIDE,
        size: 8 + Math.min(p.citedBy, 4) * 2,
      })),
    ];
  }, [data, ownerColor]);

  const links = useMemo<CanvasLink[]>(() => {
    if (!data) return [];
    return [
      ...data.links.map((l) =>
        l.kind === "cites"
          ? { source: l.claimId, target: l.paperId, color: l.level ? LEVEL[l.level].color : "#64748b", width: 2 }
          : { source: l.claimId, target: l.paperId, color: "#7c3aed", width: 1.2, dashed: true },
      ),
      ...(showPaperCites ? data.paperCites.map((c) => ({ source: c.source, target: c.target, color: "#cbd5e1", width: 0.7 })) : []),
    ];
  }, [data, showPaperCites]);

  const recheck = async () => {
    if (!workspaceId) return;
    setChecking(true);
    try {
      const res = await fetch("/api/agents/citation-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, fileId }),
      });
      if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't check the draft right now");
      await mutate();
    } finally {
      setChecking(false);
    }
  };

  // What the structure says, worst first
  const insights = useMemo(() => {
    if (!data) return [];
    const out: { id: string; tone: string; text: string }[] = [];
    const suggestionsFor = (claimId: string) =>
      data.links.filter((l) => l.claimId === claimId && l.kind === "suggested").map((l) => paperById.get(l.paperId)!);
    for (const c of [...data.claims].sort((a, b) => VERDICT[verdictOf(a)].rank - VERDICT[verdictOf(b)].rank)) {
      const v = verdictOf(c);
      if (v === "contradicted" || v === "unsupported") out.push({ id: c.id, tone: VERDICT[v].tone, text: `C${c.n}: ${c.why ?? VERDICT[v].label}` });
      else if (v === "uncited") {
        const s = suggestionsFor(c.id)[0];
        out.push({
          id: c.id,
          tone: VERDICT[v].tone,
          text: `C${c.n} needs a citation${s ? `. Try “${s.title.slice(0, 60)}”${s.ownerIds.length ? ` from ${s.ownerIds.map((o) => userName.get(o)).join(" & ")}'s library` : ""}` : ""}.`,
        });
      } else if (v === "unknown-source") out.push({ id: c.id, tone: VERDICT[v].tone, text: `C${c.n} cites a source that isn't in the graph.` });
    }
    // Load-bearing papers: one paper carrying several claims is a single point of failure
    for (const p of data.papers.filter((p) => p.citedBy >= 2).sort((a, b) => b.citedBy - a.citedBy)) {
      out.push({ id: p.id, tone: "bg-sky-50 text-sky-800", text: `${p.citedBy} claims rest on “${p.title.slice(0, 60)}”.` });
    }
    // Claims backed by a single paper
    const single = data.claims.filter((c) => data.links.filter((l) => l.claimId === c.id && l.kind === "cites").length === 1 && verdictOf(c) !== "ok");
    if (single.length >= 2) out.push({ id: single[0].id, tone: "bg-muted text-muted-foreground", text: `${single.length} claims are backed by only one paper.` });
    return out;
  }, [data, paperById, userName]);

  // Whose reading the argument uses
  const coverage = useMemo(() => {
    if (!data) return [];
    const citedPapers = new Set(data.links.filter((l) => l.kind === "cites").map((l) => l.paperId));
    return data.users
      .map((u) => ({
        ...u,
        cited: data.papers.filter((p) => citedPapers.has(p.id) && p.ownerIds.includes(u.id)).length,
        suggested: data.papers.filter((p) => !citedPapers.has(p.id) && p.ownerIds.includes(u.id)).length,
      }))
      .filter((u) => u.cited || u.suggested || ownerColor.has(u.id));
  }, [data, ownerColor]);

  const checkedAt = Math.max(0, ...(data?.claims ?? []).map((c) => c.checkedAt ?? 0));
  const unchecked = !!data?.claims.length && data.claims.every((c) => !c.verdict);
  const selClaim = selected ? claimById.get(selected) : undefined;
  const selPaper = selected ? paperById.get(selected) : undefined;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-[min(1100px,96vw)] flex flex-col gap-3 font-sans">
        <SheetHeader>
          <SheetTitle>Evidence map</SheetTitle>
          <SheetDescription>
            Every claim in this draft and the papers behind it, from your team&apos;s research graph. Squares are claims, circles are papers coloured
            by whose library they&apos;re in, and dashed lines are papers the agents suggest.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 gap-3">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-white">
            {error ? (
              <p className="p-6 text-sm text-muted-foreground">{(error as Error).message}</p>
            ) : isLoading || !data ? (
              <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Reading the draft&apos;s graph…
              </p>
            ) : data.claims.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No claims yet. Write a few sentences; the map fills in as the draft saves.</p>
            ) : (
              <>
                <FalkorCanvas nodes={nodes} links={links} layout={showPaperCites ? "force" : "tree"} selectedId={selected} onSelect={setSelected} />
                <div className="pointer-events-none absolute bottom-2 left-2 space-y-0.5 rounded-md bg-white/90 p-2 text-[11px] shadow-sm">
                  {(["supports", "partial", "unrelated", "contradicts"] as SupportLevel[]).map((l) => (
                    <p key={l} className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4" style={{ background: LEVEL[l].color }} /> paper {LEVEL[l].label} the claim
                    </p>
                  ))}
                  <p className="flex items-center gap-1.5">
                    <span className="w-4 border-t border-dashed border-violet-600" /> suggested by an agent
                  </p>
                </div>
              </>
            )}
          </div>

          <aside className="flex w-[300px] shrink-0 flex-col gap-3 overflow-y-auto text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {checkedAt ? `Checked ${ago(checkedAt)}` : "Not checked yet"} · {data?.claims.length ?? 0} claims · {data?.papers.length ?? 0} papers
              </p>
              <Button size="sm" variant="outline" onClick={recheck} disabled={checking} className={cn("h-7 px-2 text-xs", press)}>
                {checking ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <RotateCw className="mr-1 size-3.5" />}
                {unchecked ? "Check" : "Re-check"}
              </Button>
            </div>
            {unchecked && (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                Run the Citation Checker to colour each claim by whether its sources actually support it.
              </p>
            )}

            {selClaim ? (
              <ClaimCard claim={selClaim} data={data!} userName={userName} onClose={() => setSelected(null)} onJump={() => {
                setOpen(false);
                setTimeout(() => revealClaim(selClaim.text), 250);
              }} />
            ) : selPaper ? (
              <PaperCard paper={selPaper} data={data!} userName={userName} onSelect={setSelected} onClose={() => setSelected(null)} />
            ) : null}

            {insights.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">What the map shows</p>
                {insights.map((i, k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelected(i.id)}
                    className={cn("w-full rounded-md px-2 py-1.5 text-left text-xs transition-opacity duration-150 hover:opacity-80", i.tone)}
                  >
                    {i.text}
                  </button>
                ))}
              </div>
            )}

            {coverage.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium">Whose reading the draft uses</p>
                {coverage.map((u) => (
                  <p key={u.id} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: ownerColor.get(u.id) ?? OUTSIDE }} />
                      {userName.get(u.id)}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {u.cited} cited{u.suggested ? ` · ${u.suggested} suggested` : ""}
                    </span>
                  </p>
                ))}
              </div>
            )}

            {data && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={showPaperCites} onChange={(e) => setShowPaperCites(e.target.checked)} />
                Show citations between the papers
              </label>
            )}
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ClaimCard({
  claim,
  data,
  userName,
  onClose,
  onJump,
}: {
  claim: EvidenceClaim;
  data: EvidenceResponse;
  userName: Map<string, string>;
  onClose: () => void;
  onJump: () => void;
}) {
  const v = VERDICT[verdictOf(claim)];
  const rows = data.links.filter((l) => l.claimId === claim.id);
  const paper = (id: string) => data.papers.find((p) => p.id === id)!;
  return (
    <div className="rounded-lg border p-3 animate-in fade-in-0 duration-150">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", v.tone)}>
          C{claim.n} · {v.label}
        </span>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed">{claim.text}</p>
      {claim.why && <p className="mt-1 text-xs text-muted-foreground">{claim.why}</p>}
      {rows.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rows.map((l) => {
            const p = paper(l.paperId);
            return (
              <li key={l.paperId} className="text-xs">
                <span className={l.kind === "suggested" ? "text-violet-700" : ""}>
                  {l.kind === "suggested" ? "Suggested: " : l.level ? `${LEVEL[l.level].label[0].toUpperCase()}${LEVEL[l.level].label.slice(1)}: ` : "Cites: "}
                </span>
                {p.title}
                {p.ownerIds.length ? <span className="text-muted-foreground"> · {p.ownerIds.map((o) => userName.get(o)).join(" & ")}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      <Button size="sm" variant="outline" onClick={onJump} className={cn("mt-2 h-7 w-full text-xs", press)}>
        Show in the draft
      </Button>
    </div>
  );
}

function PaperCard({
  paper,
  data,
  userName,
  onSelect,
  onClose,
}: {
  paper: EvidencePaper;
  data: EvidenceResponse;
  userName: Map<string, string>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const rows = data.links.filter((l) => l.paperId === paper.id);
  return (
    <div className="rounded-lg border p-3 animate-in fade-in-0 duration-150">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {paper.ownerIds.length ? `${paper.ownerIds.map((o) => userName.get(o)).join(" & ")}'s library` : "Outside the team library"}
          {paper.year ? ` · ${paper.year}` : ""}
        </p>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="mt-1 text-sm font-medium leading-snug">{paper.title}</p>
      <ul className="mt-2 space-y-1">
        {rows.map((l) => {
          const c = data.claims.find((x) => x.id === l.claimId)!;
          return (
            <li key={l.claimId}>
              <button type="button" onClick={() => onSelect(c.id)} className="text-left text-xs hover:underline">
                <span className="font-medium">C{c.n}</span>{" "}
                <span className="text-muted-foreground">
                  {l.kind === "suggested" ? "suggested for" : l.level ? LEVEL[l.level].label : "cited by"}
                </span>{" "}
                “{c.text.slice(0, 70)}…”
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
