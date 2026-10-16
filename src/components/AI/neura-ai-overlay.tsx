"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import NeuraAIChat from "./neura-ai-chat";

interface NeuraAIOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export default function NeuraAIOverlay({
  isOpen,
  onClose,
}: NeuraAIOverlayProps) {
  const reduceMotion = useReducedMotion();
  const hidden = reduceMotion
    ? { opacity: 0 }
    : { opacity: 0, transform: "translateY(16px) scale(0.98)" };
  const shown = reduceMotion
    ? { opacity: 1 }
    : { opacity: 1, transform: "translateY(0px) scale(1)" };

  return (
    <>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="fixed inset-0 bg-sky-100/30 z-50"
        onClick={onClose}
      />
      <motion.div
        key="panel"
        initial={hidden}
        animate={shown}
        exit={hidden}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        style={{ transformOrigin: "bottom right" }}
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
          modelId="deepseek-v4-flash"
          onClose={onClose}
        />
      </motion.div>
    </>
  );
}
