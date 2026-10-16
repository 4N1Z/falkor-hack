"use client";

import type { FalkorDBCanvas, Data, GraphNode, LayoutMode } from "@falkordb/canvas";
import { useEffect, useRef } from "react";

export interface CanvasNode {
  id: string;
  caption: string;
  color: string;
  size: number;
  shape?: "circle" | "square";
}

export interface CanvasLink {
  source: string;
  target: string;
  color: string;
  width?: number;
  dashed?: boolean;
}

/**
 * Imperative wrapper around FalkorDB's <falkordb-canvas> web component (browser-only).
 * Nodes and links use string ids; they're mapped to the numeric ids the canvas expects.
 */
export function FalkorCanvas({
  nodes,
  links,
  layout,
  selectedId,
  onSelect,
}: {
  nodes: CanvasNode[];
  links: CanvasLink[];
  layout: LayoutMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<FalkorDBCanvas | null>(null);
  const keyOf = useRef(new Map<number, string>());
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Mount the custom element once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await import("@falkordb/canvas");
      if (cancelled || !host.current) return;
      const el = document.createElement("falkordb-canvas") as FalkorDBCanvas;
      el.style.width = "100%";
      el.style.height = "100%";
      host.current.appendChild(el);
      canvas.current = el;
      const { width, height } = host.current.getBoundingClientRect();
      el.setConfig({
        width,
        height,
        backgroundColor: "#FFFFFF",
        foregroundColor: "#0F172A",
        captionsKeys: ["caption"],
        nodeStyle: { fontFamily: "Inter, system-ui, sans-serif" },
        interaction: { zoomToFitPadding: 0.15 },
        isNodeSelected: (n: GraphNode) => keyOf.current.get(n.id) === selectedRef.current,
        eventHandlers: {
          onNodeClick: (n: GraphNode) => onSelectRef.current(keyOf.current.get(n.id) ?? null),
          onBackgroundClick: () => onSelectRef.current(null),
        },
      });
    })();
    const ro = new ResizeObserver(([e]) => {
      canvas.current?.setWidth(e.contentRect.width);
      canvas.current?.setHeight(e.contentRect.height);
    });
    if (host.current) ro.observe(host.current);
    return () => {
      cancelled = true;
      ro.disconnect();
      canvas.current?.remove();
      canvas.current = null;
    };
  }, []);

  // Push data whenever it changes (wait for the element to mount)
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      const el = canvas.current;
      if (!el) {
        if (tries++ < 40) timer = setTimeout(push, 50);
        return;
      }
      const num = new Map(nodes.map((n, i) => [n.id, i + 1]));
      keyOf.current = new Map(nodes.map((n, i) => [i + 1, n.id]));
      const data: Data = {
        nodes: nodes.map((n, i) => ({
          id: i + 1,
          labels: [],
          visible: true,
          color: n.color,
          size: n.size,
          shape: n.shape ?? "circle",
          data: { caption: n.caption },
        })),
        links: links
          .filter((l) => num.has(l.source) && num.has(l.target))
          .map((l, i) => ({
            id: i + 1,
            relationship: "",
            source: num.get(l.source)!,
            target: num.get(l.target)!,
            visible: true,
            width: l.width ?? 1,
            color: l.color,
            data: { dashed: !!l.dashed },
          })),
      };
      el.setConfig({
        layoutMode: layout,
        layoutOptions:
          layout === "tree"
            ? { tree: { direction: "lr", levelDistance: 220, nodeSpacing: 60 } }
            : layout === "radial"
              ? { radial: { direction: "out", levelDistance: 150 } }
              : {},
        linkLineDash: (l) => ((l.data as { dashed?: boolean })?.dashed ? [4, 3] : []),
      });
      el.setData(data);
    };
    push();
    return () => clearTimeout(timer);
  }, [nodes, links, layout]);

  // Re-render the selection outline
  useEffect(() => {
    canvas.current?.refresh();
  }, [selectedId]);

  return <div ref={host} className="absolute inset-0" />;
}
