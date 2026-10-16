import { Extension } from "@tiptap/core";

const INDENT = "\t";

/**
 * Keeps Tab inside the editor. Without this, Tab outside a list falls through to
 * the browser and moves focus away from the document.
 * - In list / task items: nest (Tab) or un-nest (Shift-Tab).
 * - Elsewhere: insert a tab character; Shift-Tab removes one directly before the cursor.
 *
 * Text is inserted with a raw transaction, not insertContent(): the Markdown extension
 * parses insertContent strings, which escaped whitespace into a literal "&nbsp;".
 * The editor already renders with `white-space: pre-wrap`, so "\t" shows as indentation.
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
        return editor.commands.command(({ tr }) => {
          tr.insertText(INDENT);
          return true;
        });
      },
      "Shift-Tab": ({ editor }) => {
        if (editor.isActive("listItem")) return editor.commands.liftListItem("listItem") || true;
        if (editor.isActive("taskItem")) return editor.commands.liftListItem("taskItem") || true;

        const { from, empty } = editor.state.selection;
        if (empty && from > 1 && editor.state.doc.textBetween(from - 1, from) === INDENT) {
          return editor.commands.deleteRange({ from: from - 1, to: from });
        }
        return true; // swallow so focus doesn't jump backwards out of the editor
      },
    };
  },
});
