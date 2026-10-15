import { Extension } from "@tiptap/core";

const INDENT = "    "; // 4 non-breaking spaces (plain spaces collapse in HTML)

/**
 * Keeps Tab inside the editor. Without this, Tab outside a list falls through to
 * the browser and moves focus away from the document.
 * - In list / task items: nest (Tab) or un-nest (Shift-Tab).
 * - Elsewhere: insert an indent; Shift-Tab removes one directly before the cursor.
 */
export const TabIndent = Extension.create({
  name: "tabIndent",
  // Lower than default (100) so other extensions that own Tab (e.g. autocomplete
  // ghost text) get first refusal.
  priority: 50,

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive("listItem")) return editor.commands.sinkListItem("listItem") || true;
        if (editor.isActive("taskItem")) return editor.commands.sinkListItem("taskItem") || true;
        if (editor.isActive("codeBlock")) return editor.commands.insertContent("  ");
        return editor.commands.insertContent(INDENT);
      },
      "Shift-Tab": ({ editor }) => {
        if (editor.isActive("listItem")) return editor.commands.liftListItem("listItem") || true;
        if (editor.isActive("taskItem")) return editor.commands.liftListItem("taskItem") || true;

        const { from, empty } = editor.state.selection;
        if (empty && from > INDENT.length) {
          const before = editor.state.doc.textBetween(from - INDENT.length, from);
          if (before === INDENT) {
            return editor.commands.deleteRange({ from: from - INDENT.length, to: from });
          }
        }
        return true; // swallow so focus doesn't jump backwards out of the editor
      },
    };
  },
});
