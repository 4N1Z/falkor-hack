import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Grey "ghost" text after the cursor (Ghost Writer). Tab accepts it, Esc dismisses it, and any
 * edit or cursor move clears it. Tab only belongs to the ghost while one is showing; otherwise
 * it falls through to lists / indent (TabIndent has lower priority).
 */
export const ghostTextKey = new PluginKey<{ text: string | null; pos: number }>("ghostText");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ghostText: {
      setGhostText: (text: string, pos: number) => ReturnType;
      clearGhostText: () => ReturnType;
    };
  }
}

export const GhostText = Extension.create({
  name: "ghostText",
  priority: 1000,

  addCommands() {
    return {
      setGhostText:
        (text, pos) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(ghostTextKey, { text, pos }).setMeta("addToHistory", false));
          return true;
        },
      clearGhostText:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(ghostTextKey, { text: null, pos: 0 }).setMeta("addToHistory", false));
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    const current = () => ghostTextKey.getState(this.editor.state);
    return {
      Tab: () => {
        const g = current();
        if (!g?.text || this.editor.state.selection.from !== g.pos) return false;
        const text = g.text;
        this.editor.chain().clearGhostText().insertContentAt(g.pos, { type: "text", text }).run();
        return true;
      },
      Escape: () => {
        if (!current()?.text) return false;
        this.editor.commands.clearGhostText();
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<{ text: string | null; pos: number }>({
        key: ghostTextKey,
        state: {
          init: () => ({ text: null, pos: 0 }),
          apply(tr, value) {
            const meta = tr.getMeta(ghostTextKey);
            if (meta) return meta;
            // Any typing or cursor movement makes the suggestion stale
            if (value.text && (tr.docChanged || tr.selectionSet)) return { text: null, pos: 0 };
            return value;
          },
        },
        props: {
          decorations(state) {
            const g = ghostTextKey.getState(state);
            if (!g?.text) return null;
            const widget = document.createElement("span");
            widget.className = "ghost-text";
            widget.textContent = g.text;
            widget.setAttribute("aria-hidden", "true");
            widget.style.cssText = "color: hsl(var(--muted-foreground)); opacity: 0.6; pointer-events: none;";
            return DecorationSet.create(state.doc, [Decoration.widget(g.pos, widget, { side: 1 })]);
          },
        },
      }),
    ];
  },
});
