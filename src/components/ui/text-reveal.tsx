"use client";

import { FC, ReactNode, useRef } from "react";
import { motion, MotionValue, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface TextRevealByWordProps {
  text: string;
  className?: string;
}

interface ProcessedWord {
  text: string;
  isPrimary: boolean;
}

export const TextRevealByWord: FC<TextRevealByWordProps> = ({
  text,
  className,
}) => {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start 0.6", "start 0"]
  });

  const processWords = (text: string): ProcessedWord[] => {
    const regex = /\*\*(.*?)\*\*|\S+/g;
    const matches = text.match(regex) || [];
    
    return matches.map(word => {
      if (word.startsWith("**") && word.endsWith("**")) {
        return {
          text: word.slice(2, -2),
          isPrimary: true
        };
      }
      return {
        text: word,
        isPrimary: false
      };
    });
  };

  const paragraphs = text.split('\n\n').filter(p => p.trim());
  const processedParagraphs = paragraphs.map(p => processWords(p.trim()));
  const totalWords = processedParagraphs.flat().length;

  return (
    <div ref={targetRef} className={cn("relative z-10" , className)}>
      <div className=" mx-auto flex min-h-[70vh] max-w-4xl items-center py-20 md:py-10 ">
        <div className="flex flex-col gap-8 pt-10 px-1 md:p-8">
          {processedParagraphs.map((paragraph, pIndex) => (
            <p
              key={pIndex}
              className="flex flex-wrap text-26 tracking-6 md:text-32 leading-[1.5]"
            >
              {paragraph.map((word, wIndex) => {
                const previousParagraphsWordCount = processedParagraphs
                  .slice(0, pIndex)
                  .reduce((acc, curr) => acc + curr.length, 0);
                const globalWordIndex = previousParagraphsWordCount + wIndex;
                
                const start = globalWordIndex / totalWords;
                const end = start + 1 / totalWords;

                return (
                  <Word 
                    key={`${pIndex}-${wIndex}`} 
                    progress={scrollYProgress} 
                    range={[start, end]}
                    isPrimary={word.isPrimary}
                  >
                    {word.text}
                  </Word>
                );
              })}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

interface WordProps {
  children: ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
  isPrimary?: boolean;
}

const Word: FC<WordProps> = ({ children, progress, range, isPrimary = false }) => {
  const opacity = useTransform(progress, range, [0, 1]);
  
  return (
    <span className="relative mx-1 lg:mx-1.5 ">
      <span className={cn(
        "absolute duration-700",
        isPrimary ? "text-primary" : "text-primary opacity-30"
      )}>
        {children}
      </span>
      <motion.span
        style={{ opacity }}
        className={cn("duration-700",
          isPrimary ? "text-primary" : "text-foreground"
        )}
      >
        {children}
      </motion.span>
    </span>
  );
};

export default TextRevealByWord;
