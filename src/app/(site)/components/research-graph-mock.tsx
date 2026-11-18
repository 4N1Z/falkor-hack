type Node = { id: string; label: string; x: number; y: number; kind: "user" | "paper" | "adam" | "draft" };

const nodes: Node[] = [
  { id: "you", label: "You", x: 70, y: 70, kind: "user" },
  { id: "bea", label: "Bea", x: 70, y: 190, kind: "user" },
  { id: "p1", label: "Paper", x: 220, y: 60, kind: "paper" },
  { id: "p2", label: "Paper", x: 230, y: 175, kind: "paper" },
  { id: "p3", label: "Paper", x: 360, y: 115, kind: "paper" },
  { id: "chunk", label: "Passage · p.6", x: 380, y: 225, kind: "paper" },
  { id: "sentence", label: "Draft sentence", x: 130, y: 260, kind: "draft" },
  { id: "claim", label: "Claim", x: 500, y: 60, kind: "adam" },
  { id: "method", label: "Method", x: 540, y: 160, kind: "adam" },
  { id: "proc", label: "Procedure", x: 660, y: 100, kind: "adam" },
  { id: "hyp", label: "Hypothesis", x: 680, y: 230, kind: "adam" },
];

const edges: [string, string, string][] = [
  ["you", "p1", "IMPORTED"],
  ["bea", "p2", "IMPORTED"],
  ["p1", "p3", "CITES"],
  ["p2", "p3", "CITES"],
  ["chunk", "p3", "CHUNK_OF"],
  ["sentence", "p2", "SUPPORTED_BY"],
  ["claim", "p3", "EXTRACTED_FROM"],
  ["claim", "method", "USES"],
  ["proc", "method", "SPECIFIES"],
  ["hyp", "claim", "EVIDENCE_FOR"],
  ["hyp", "proc", "CHAIN"],
];

const fill: Record<Node["kind"], string> = {
  user: "#FAFBFF",
  paper: "#EEF4FB",
  draft: "#FAFBFF",
  adam: "#305EFF",
};

const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

/** A static sketch of the workspace graph: the library layer on the left, Adam's layer on the right. */
export default function ResearchGraphMock() {
  return (
    <svg
      viewBox="0 0 760 300"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Users import papers, papers cite papers, Adam's claims, methods, procedures and hypotheses point at the same paper nodes"
    >
      {edges.map(([a, b, label]) => {
        const s = byId[a];
        const t = byId[b];
        return (
          <g key={`${a}-${b}`}>
            <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="#93C7FB" strokeWidth={1.5} />
            <text
              x={(s.x + t.x) / 2}
              y={(s.y + t.y) / 2 - 4}
              textAnchor="middle"
              fontSize={9}
              fill="#305EFF"
              opacity={0.6}
              fontFamily="var(--font-geist-mono)"
            >
              {label}
            </text>
          </g>
        );
      })}
      {nodes.map((n) => {
        const w = n.label.length * 7 + 22;
        return (
          <g key={n.id}>
            <rect
              x={n.x - w / 2}
              y={n.y - 14}
              width={w}
              height={28}
              rx={8}
              fill={fill[n.kind]}
              stroke={n.kind === "adam" ? "#84CDFF" : "rgba(48,94,255,0.24)"}
              strokeWidth={1.5}
            />
            <text
              x={n.x}
              y={n.y + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={500}
              fill={n.kind === "adam" ? "#FFFFFF" : "#305EFF"}
            >
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
