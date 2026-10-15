"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import NeuraAIChat from "./neura-ai-chat";

interface NeuraAIOverlayProps { 
  isOpen: boolean;
  onClose: () => void;
}

export default function NeuraAIOverlay({
  isOpen,
  onClose,
}: NeuraAIOverlayProps) {
  return (
    <AnimatePresence>
      {/* {isOpen && ( */}
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0.1 }}
          className="fixed inset-0 bg-sky-100/30 z-50"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className={cn(
            "fixed bottom-5 right-6 z-50",
            "w-[420px] h-[600px] max-h-[85vh]",
            "rounded-lg",
            "shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.40),0px_8.206px_13.677px_rgba(109,205,247,0.22)]",
            "ring-2 ring-border",
            "bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
            "overflow-hidden",
            "relative"
          )}
        >
          <NeuraAIChat
            id="floating-chat"
            modelId="gpt-4o-mini"
            onClose={onClose}
          />
        </motion.div>
      </>
      {/* )} */}
    </AnimatePresence>
  );
}
