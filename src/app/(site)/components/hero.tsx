"use client";

import BlurFade from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import EditorPreview from "./editor-preview";

const words = ["simplify", "verify", "hypothesise", "experiment"];

export default function Hero() {
  const [currentWord, setCurrentWord] = useState(words[0]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let swap: ReturnType<typeof setTimeout>;
    const intervalId = setInterval(() => {
      setIsVisible(false);
      swap = setTimeout(() => {
        setCurrentWord((current) => words[(words.indexOf(current) + 1) % words.length]);
        setIsVisible(true);
      }, 300);
    }, 3000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(swap);
    };
  }, []);

  return (
    <div>
      <div className="flex flex-col items-center gap-8 md:gap-10">
        <div className="w-full flex flex-col items-center justify-center gap-5">
          <BlurFade delay={0.1} inView>
            <Link
              href="#upgrade"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs text-primary ring-2 ring-white/40 shadow-[0px_3.987px_6.645px_0px_rgba(109,205,247,0.32)] hover:brightness-105 transition-[filter] duration-150"
            >
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">new</span>
              Research agents, a shared knowledge graph, and Adam
            </Link>
          </BlurFade>

          <div className="max-w-[850px] text-center">
            <BlurFade delay={0.2} inView>
              <h1 className="inline-block text-2xl md:text-[2.5rem] tracking-6 text-foreground leading-[1.2] duration-500 w-[80%] md:w-full">
                Your ultimate research copilot:{" "}
                <span
                  className={`
                    text-primary font-serif font-medium italic
                    transition-opacity duration-300 ease-out
                    ${isVisible ? "opacity-100" : "opacity-0"}
                  `}
                >
                  {currentWord}
                </span>{" "}
                effortlessly
              </h1>
            </BlurFade>
          </div>

          <BlurFade delay={0.25} inView>
            <p className="max-w-2xl text-center text-sm md:text-base text-muted-foreground tracking-4 leading-snug px-4">
              A collaborative research editor whose agents read, verify and connect your
              literature on one knowledge graph. Every claim traced to a page, every
              hypothesis paired with the result that would kill it.
            </p>
          </BlurFade>

          <BlurFade
            delay={0.3}
            inView
            className="flex flex-col w-full items-center justify-center"
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="neura" size="lg" className="text-sm">
                <Link href="/dashboard">Start researching</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="text-sm text-primary border-sky-100 bg-sky-50"
              >
                <Link href="#upgrade">See what&apos;s new</Link>
              </Button>
            </div>
          </BlurFade>
        </div>

        <div className="w-full min-h-fit max-h-fit">
          <BlurFade delay={0.4} inView>
            <EditorPreview />
          </BlurFade>
        </div>
      </div>
    </div>
  );
}
