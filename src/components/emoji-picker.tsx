"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
// import EmojiPicker from 'emoji-picker-react';

interface EmojiPickerProps {
  children: React.ReactNode;
  getValue?: (emoji: string) => void;
}

export default function EmojiPicker ({ children, getValue }: EmojiPickerProps) {
  const Picker = dynamic(() => import("emoji-picker-react"), { ssr: false });

  const onClick = (selectedEmoji: any) => {
    if (getValue) getValue(selectedEmoji.emoji);
  };

  return (
    <div className="flex items-center">
      <Popover>
        <PopoverTrigger className="cursor-pointer"> {children} </PopoverTrigger>
        <PopoverContent className="p-0 border-none">
          {/* <EmojiPicker onEmojiClick={onClick}/> */}
          <Picker onEmojiClick={onClick} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
