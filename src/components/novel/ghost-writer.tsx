"use client";

import { useAppState } from "@/lib/providers/state-providers";
import { useCurrentEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { ghostTextKey } from "./extensions/ghost-text";

const PAUSE_MS = 1200;
export const GHOST_STORAGE_KEY = "neura:ghost:on";
export const GHOST_TOGGLE_EVENT = "neura:ghost-toggle";

export const ghostEnabled = () => {
  try {
    return localStorage.getItem(GHOST_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

/**
 * Asks the Ghost Writer for the next few words after a pause at the end of a paragraph,
 * and shows them as ghost text (Tab to accept). Never runs while the slash menu is open.
 */
export function GhostWriter() {
  const { editor } = useCurrentEditor();
  const { workspaceId } = useAppState();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<AbortController | null>(null);
  const enabled = useRef(true);

  useEffect(() => {
    enabled.current = ghostEnabled();
    const onToggle = () => {
      enabled.current = ghostEnabled();
      if (!enabled.current) editor?.commands.clearGhostText();
    };
    window.addEventListener(GHOST_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(GHOST_TOGGLE_EVENT, onToggle);
  }, [editor]);

  useEffect(() => {
    if (!editor || !workspaceId) return;

    const request = async () => {
      if (!enabled.current || document.querySelector("#slash-command")) return;
      const { selection } = editor.state;
      if (!selection.empty) return;
      const $pos = selection.$from;
      if (!$pos.parent.isTextblock || $pos.parentOffset !== $pos.parent.content.size) return; // end of block only
      const textBefore = $pos.parent.textContent;
      if (textBefore.trim().length < 40) return;

      const at = selection.from;
      const docAtRequest = editor.state.doc;
      inflight.current?.abort();
      const ac = new AbortController();
      inflight.current = ac;
      try {
        const res = await fetch("/api/agents/ghost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, textBeforeCursor: textBefore }),
          signal: ac.signal,
        });
        const body: { text: string | null } = await res.json();
        // Only show it if nothing changed while we waited
        if (body.text && editor.state.doc.eq(docAtRequest) && editor.state.selection.from === at && enabled.current) {
          editor.commands.setGhostText(body.text, at);
        }
      } catch {
        // aborted or offline: no suggestion
      }
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      inflight.current?.abort();
      if (ghostTextKey.getState(editor.state)?.text) return;
      timer.current = setTimeout(request, PAUSE_MS);
    };
    editor.on("update", schedule);
    return () => {
      editor.off("update", schedule);
      if (timer.current) clearTimeout(timer.current);
      inflight.current?.abort();
    };
  }, [editor, workspaceId]);

  return null;
}
