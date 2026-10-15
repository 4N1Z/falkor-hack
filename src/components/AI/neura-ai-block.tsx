"use client";

import NeuraAIBtn from "./neura-ai-btn";
import NeuraAIOverlay from "@/components/AI/neura-ai-overlay";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function NeuraAIBlock() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.div
            key="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.3 }}
          >
            <NeuraAIBtn onClick={() => setOpen(!open)} open={open} />
          </motion.div>
        ) : (
          <NeuraAIOverlay isOpen={open} onClose={() => setOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
