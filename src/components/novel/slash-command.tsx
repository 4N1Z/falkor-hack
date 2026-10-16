import {
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Text,
  TextQuote,
  ImageIcon,
  MessageSquare,
  Search,
  Lightbulb,
} from "lucide-react";
import { createSuggestionItems } from "./extensions/slash-command";
import { Command, renderItems } from "./extensions/slash-command";
import { uploadFn } from "./image-upload";
import { FIND_PAPERS_EVENT, type FindPapersDetail } from "./find-papers-dialog";
import { REMEMBER_EVENT, type RememberDetail } from "./notebook-sheet";


export const suggestionItems = createSuggestionItems([
  {
    title: "Text",
    description: "Just start typing with plain text",
    searchTerms: ["p", "paragraph"],
    icon: <Text size={18} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleNode("paragraph", "paragraph")
        .run();
    },
  },
  {
    title: "To-do List",
    description: "Track tasks with a to-do list",
    searchTerms: ["todo", "task", "list", "check", "checkbox"],
    icon: <CheckSquare size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    searchTerms: ["title", "big", "large"],
    icon: <Heading1 size={18} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    searchTerms: ["subtitle", "medium"],
    icon: <Heading2 size={18} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    searchTerms: ["subtitle", "small"],
    icon: <Heading3 size={18} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a bullet list",
    searchTerms: ["unordered", "point"],
    icon: <List size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a numbered list",
    searchTerms: ["ordered"],
    icon: <ListOrdered size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Quote",
    description: "Capture a quote",
    searchTerms: ["blockquote"],
    icon: <TextQuote size={18} />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleNode("paragraph", "paragraph")
        .toggleBlockquote()
        .run(),
  },
  {
    title: "Code",
    description: "Capture a code snippet",
    searchTerms: ["codeblock"],
    icon: <Code size={18} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Image",
    description: "Upload an image from your computer",
    searchTerms: ["photo", "picture", "media"],
    icon: <ImageIcon size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // upload image
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        if (input.files?.length) {
          const file = input.files[0];
          const pos = editor.view.state.selection.from;
          uploadFn(file, editor.view, pos);
        }
      };
      input.click();
    },
  },
  {
    title: "Search Papers",
    description: "Find and cite relevant research papers",
    searchTerms: ["cite", "reference", "paper", "research", "scholar"],
    icon: <Search size={14} />,
    command: ({ editor, range }) => {
      // Remove the slash command text
      editor.chain().focus().deleteRange(range).run();

      // Pre-fill the search with the sentence being written (text before the cursor),
      // so team-library results are about the claim that needs a citation
      const { from } = editor.state.selection;
      const $pos = editor.state.doc.resolve(from);
      const before = editor.state.doc.textBetween($pos.start(), from, " ");
      const sentences = before.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      const query = (sentences.pop() ?? "").replace(/\[[^\]]*\]/g, "").trim();

      window.dispatchEvent(
        new CustomEvent<FindPapersDetail>(FIND_PAPERS_EVENT, { detail: { query, pos: from } })
      );
    },
  },
  {
    title: "Hypothesis",
    description: "Save this sentence to the team's research memory",
    searchTerms: ["hypothesis", "remember", "memory", "note", "idea", "claim"],
    icon: <Lightbulb size={14} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // The sentence just written (before the cursor), without citation labels
      const { from } = editor.state.selection;
      const $pos = editor.state.doc.resolve(from);
      const before = editor.state.doc.textBetween($pos.start(), from, " ");
      const sentences = before.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      const text = (sentences.pop() ?? "").replace(/\[[^\]]*\]/g, "").trim();
      if (text.length >= 8) {
        window.dispatchEvent(new CustomEvent<RememberDetail>(REMEMBER_EVENT, { detail: { text, kind: "hypothesis" } }));
      }
    },
  },
]);


export const slashCommand = Command.configure({
  suggestion: {
    items: () => suggestionItems,
    render: renderItems,
  },
  
});



export const editorCommands = [
  slashCommand,
];
