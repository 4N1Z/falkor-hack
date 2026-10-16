"use client";

import NeuraAIBtn from "./neura-ai-btn";
import NeuraAIOverlay from "@/components/AI/neura-ai-overlay";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function NeuraAIBlock() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {!open ? (
          <motion.div
            key="button"
            initial={{ opacity: 0, transform: "translateY(6px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
          >
            <NeuraAIBtn onClick={() => setOpen(!open)} open={open} />
          </motion.div>
        ) : (
          <NeuraAIOverlay
            key="overlay"
            isOpen={open}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
