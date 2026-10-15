import { cn } from "@/lib/utils";
import { EditorBubbleItem, useEditor } from "novel";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikethroughIcon,
  CodeIcon,
} from "lucide-react";
import type { SelectorItem } from "./node-selector";
import { Button } from "@/components/ui/button";

export const TextButtons = () => {
  const { editor } = useEditor();
  if (!editor) return null;
  const items: SelectorItem[] = [
    {
      name: "bold",
      isActive: (editor) => !!editor && editor.isActive("bold"),
      command: (editor) => editor?.chain().focus().toggleBold().run(),
      icon: BoldIcon,
    },
    {
      name: "italic",
      isActive: (editor) => !!editor && editor.isActive("italic"),
      command: (editor) => editor?.chain().focus().toggleItalic().run(),
      icon: ItalicIcon,
    },
    {
      name: "underline",
      isActive: (editor) => !!editor && editor.isActive("underline"),
      command: (editor) => editor?.chain().focus().toggleUnderline().run(),
      icon: UnderlineIcon,
    },
    {
      name: "strike",
      isActive: (editor) => !!editor && editor.isActive("strike"),
      command: (editor) => editor?.chain().focus().toggleStrike().run(),
      icon: StrikethroughIcon,
    },
    {
      name: "code",
      isActive: (editor) => !!editor && editor.isActive("code"),
      command: (editor) => editor?.chain().focus().toggleCode().run(),
      icon: CodeIcon,
    },
  ];
  return (
    <div className="flex gap-1 pt-2 border-t">
      {items.map((item, index) => (
        <EditorBubbleItem
          key={index}
          onSelect={(editor) => {
            item.command(editor!);
          }}
        >
          <Button size="sm" className="rounded-sm border-l  border-r hover:bg-card hover:border hover:border-sky-100 focus:ring-0" variant="ghost">
            <item.icon
              className={cn("h-4 w-4", {
                "text-primary": item.isActive(editor!),
              })}
            />
          </Button>
        </EditorBubbleItem>
      ))}
    </div>
  );
};
