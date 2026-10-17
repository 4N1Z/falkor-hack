"use client";

import { cn } from "@/lib/utils";
import type { RailTool } from "./research-rail";

/**
 * Icon tiles for the research rail, in the landing page's plugin-menu language: a soft
 * gradient tile with a single-colour stroked glyph (see Button variants pluginYellow / Blue /
 * Green / Orange in ui/button.tsx and the logos in lib/logos.tsx). Each tool keeps one colour
 * everywhere it appears: strip, panel header, badges.
 */
export type TileTool = RailTool | "map";

const TILE: Record<TileTool, { tile: string; glow: string; label: string }> = {
  scout: {
    tile: "border-[#FCE1A1] bg-[linear-gradient(140deg,#FDE1BD_7.44%,#FCF0A9_92.29%)]",
    glow: "shadow-[0px_4px_10px_rgba(250,208,106,0.55)]",
    label: "Cite Scout",
  },
  check: {
    tile: "border-[#B9DDFB] bg-[linear-gradient(115deg,#BCE5FF_12.84%,#DCECFE_93.66%)]",
    glow: "shadow-[0px_4px_10px_rgba(109,205,247,0.45)]",
    label: "Check citations",
  },
  notebook: {
    tile: "border-[#FBBB9D] bg-[linear-gradient(134deg,#FBDDD0_27.98%,#EED695_114.61%)]",
    glow: "shadow-[0px_4px_10px_rgba(248,135,82,0.45)]",
    label: "Notebook",
  },
  review: {
    tile: "border-[#A1E3CE] bg-[radial-gradient(50%_50%_at_50%_50%,#CFF7E4_0%,#B3F1DA_100%)]",
    glow: "shadow-[0px_4px_10px_rgba(111,212,181,0.55)]",
    label: "Draft review",
  },
  map: {
    tile: "border-[#C7D2FE] bg-[linear-gradient(135deg,#E0E7FF_10%,#EEF2FF_90%)]",
    glow: "shadow-[0px_4px_10px_rgba(129,140,248,0.4)]",
    label: "Evidence map",
  },
  chat: {
    tile: "border-[#B4C6FF] bg-[linear-gradient(140deg,#DCE6FF_7.44%,#EEF4FB_92.29%)]",
    glow: "shadow-[0px_4px_10px_rgba(48,94,255,0.35)]",
    label: "Workspace chat",
  },
};

const stroke = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Glyph({ tool }: { tool: TileTool }) {
  switch (tool) {
    case "scout":
      // The landing page's AI sparkles (lib/logos.tsx AIStars), in the tile's amber
      return (
        <svg viewBox="0 0 46 48" aria-hidden>
          <path
            fill="#F59E0B"
            d="M19.6254 31.6294L18.0572 37.1192L16.4889 31.6294C16.0836 30.2113 15.3236 28.9199 14.2808 27.877C13.2379 26.8342 11.9465 26.0742 10.5284 25.6689L5.03662 24.0987L10.5265 22.5304C11.9445 22.1251 13.2359 21.3651 14.2788 20.3223C15.3217 19.2794 16.0817 17.988 16.487 16.5699L18.0572 11.0781L19.6254 16.568C20.0308 17.986 20.7907 19.2774 21.8336 20.3203C22.8765 21.3632 24.1679 22.1232 25.586 22.5285L31.0777 24.0987L25.5879 25.6669C24.1698 26.0723 22.8784 26.8322 21.8355 27.8751C20.7927 28.918 20.0327 30.2094 19.6274 31.6275L19.6254 31.6294Z"
          />
          <path
            fill="#F59E0B"
            d="M32.3952 42.4954L33.4117 39.4431C33.6967 38.5881 34.1769 37.8113 34.8141 37.174C35.4514 36.5367 36.2283 36.0566 37.0832 35.7716L40.1355 34.755L37.0832 33.7385C36.2283 33.4535 35.4514 32.9733 34.8141 32.3361C34.1769 31.6988 33.6967 30.9219 33.4117 30.0669L32.3952 27.0146L31.3786 30.0669C31.0936 30.9219 30.6135 31.6988 29.9762 32.3361C29.3389 32.9733 28.562 33.4535 27.7071 33.7385L24.6548 34.755L27.7071 35.7716C28.562 36.0566 29.3389 36.5367 29.9762 37.174C30.6135 37.8113 31.0936 38.5881 31.3786 39.4431L32.3952 42.4954Z"
          />
          <path
            fill="#F59E0B"
            d="M28.2207 16.8722L28.467 15.888C28.6081 15.3235 28.8999 14.8081 29.3113 14.3967C29.7226 13.9854 30.2381 13.6935 30.8025 13.5525L31.7867 13.3062L30.8025 13.0599C30.2381 12.9189 29.7226 12.627 29.3113 12.2157C28.8999 11.8043 28.6081 11.2888 28.467 10.7244L28.2207 9.74023L27.9745 10.7244C27.8335 11.2887 27.5418 11.8041 27.1306 12.2155C26.7194 12.6268 26.2042 12.9187 25.6399 13.0599L24.6548 13.3062L25.6399 13.5525C26.2042 13.6937 26.7194 13.9856 27.1306 14.3969C27.5418 14.8083 27.8335 15.3237 27.9745 15.888L28.2207 16.8722Z"
          />
        </svg>
      );
    case "check":
      // Shield with a tick, same stroke weight and blue as the landing "search" glyph
      return (
        <svg viewBox="0 0 41 41" aria-hidden>
          <path
            {...stroke}
            stroke="#629FF8"
            strokeWidth="3.2"
            d="M20.5 4.8 32.8 9.6v9.2c0 7.9-5.3 14.3-12.3 17.4C13.5 33.1 8.2 26.7 8.2 18.8V9.6L20.5 4.8Z"
          />
          <path {...stroke} stroke="#629FF8" strokeWidth="3.2" d="m14.6 20.6 4.2 4.2 7.8-8.2" />
        </svg>
      );
    case "notebook":
      // The hypothesis bulb (lib/logos.tsx hypothesisLogo), in the orange tile's colour
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path
            {...stroke}
            stroke="#F97316"
            strokeWidth="1.75"
            d="M12 2.75a6.25 6.25 0 0 0-3.9 11.14c.66.53 1.15 1.3 1.15 2.15V17h5.5v-.96c0-.85.49-1.62 1.15-2.15A6.25 6.25 0 0 0 12 2.75Z"
          />
          <path {...stroke} stroke="#F97316" strokeWidth="1.75" d="M9.75 19.25h4.5M10.75 21.5h2.5" />
          <path {...stroke} stroke="#F97316" strokeWidth="1.4" d="M10 7.25a3 3 0 0 1 2.25-1" />
        </svg>
      );
    case "review":
      // The landing "extract papers" document (lib/logos.tsx extract_papers), arrow pointing out: a new draft
      return (
        <svg viewBox="0 0 33 33" aria-hidden>
          <path
            {...stroke}
            stroke="#28C18D"
            strokeWidth="2.66"
            d="M18.7364 3.43848V8.75392C18.7364 9.45879 19.0164 10.1348 19.5148 10.6332C20.0132 11.1316 20.6892 11.4116 21.3941 11.4116H26.7095M20.0652 3.43848H8.10548C7.4006 3.43848 6.7246 3.71849 6.22618 4.21691C5.72776 4.71532 5.44775 5.39133 5.44775 6.0962V27.358C5.44775 28.0628 5.72776 28.7388 6.22618 29.2373C6.7246 29.7357 7.4006 30.0157 8.10548 30.0157H24.0518C24.7567 30.0157 25.4327 29.7357 25.9311 29.2373C26.4295 28.7388 26.7095 28.0628 26.7095 27.358V10.0828L20.0652 3.43848Z"
          />
          <path {...stroke} stroke="#28C18D" strokeWidth="2.66" d="M11.5 17.5h9M11.5 22.5h6" />
        </svg>
      );
    case "chat":
      // Speech bubble with the Neura spark, in the brand blue
      return (
        <svg viewBox="0 0 40 40" aria-hidden>
          <path
            {...stroke}
            stroke="#305EFF"
            strokeWidth="3"
            d="M20 6.5c-8 0-14 5.4-14 12 0 3.4 1.6 6.4 4.2 8.6L8.8 33.5l7.6-3.3c1.1.3 2.4.4 3.6.4 8 0 14-5.4 14-12s-6-12.1-14-12.1Z"
          />
          <path fill="#305EFF" d="m20 11.5 1.5 3.6 3.6 1.4-3.6 1.5L20 21.6l-1.5-3.6-3.6-1.5 3.6-1.4L20 11.5Z" />
        </svg>
      );
    case "map":
      // Claims and papers as a small graph
      return (
        <svg viewBox="0 0 40 40" aria-hidden>
          <path {...stroke} stroke="#6366F1" strokeWidth="2.6" d="M13 13.5 20 20l7-6.5M20 20v9" />
          <rect x="8" y="7" width="9" height="9" rx="2.2" fill="#6366F1" />
          <circle cx="27.5" cy="11.5" r="4.5" fill="#A5B4FC" stroke="#6366F1" strokeWidth="2.2" />
          <circle cx="20" cy="31" r="4.5" fill="#A5B4FC" stroke="#6366F1" strokeWidth="2.2" />
        </svg>
      );
  }
}

export function RailTile({
  tool,
  active = false,
  size = "md",
  className,
}: {
  tool: TileTool;
  /** Full colour and glow; inactive tiles sit back a little so the active one reads first */
  active?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = TILE[tool];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border",
        size === "md" ? "size-8 [&_svg]:size-5" : "size-6 [&_svg]:size-4",
        t.tile,
        "transition-[opacity,box-shadow,filter] duration-150 ease-out",
        active ? t.glow : "opacity-80 saturate-[.9] group-hover:opacity-100 group-hover:saturate-100",
        className,
      )}
    >
      <Glyph tool={tool} />
    </span>
  );
}

export const tileLabel = (tool: TileTool) => TILE[tool].label;
