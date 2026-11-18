"use client";

import BlurFade from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import AdamPreview from "./adam-preview";

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
    <section className="min-h-[60dvh] max-h-fit mt-16 md:mt-0" id="home">
      <div className="flex flex-col items-center space-y-2 md:space-y-12 gap-12">
        <div className="w-full flex flex-col items-center justify-center gap-8 md:mt-12 mt-0">
          <BlurFade delay={0.1} inView>
            <Link
              href="#adam"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-sm text-primary ring-2 ring-white/40 shadow-[0px_3.987px_6.645px_0px_rgba(109,205,247,0.32)] hover:brightness-105 transition-[filter] duration-150"
            >
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">new</span>
              Meet Adam, the research agent that designs your next experiment
            </Link>
          </BlurFade>

          <div className="max-w-[850px] text-center">
            <BlurFade delay={0.2} inView>
              <h1 className="inline-block text-32 md:text-56 tracking-6 text-foreground leading-[1.2] duration-500 w-[80%] md:w-full">
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
            <p className="max-w-2xl text-center text-lg md:text-xl text-muted-foreground tracking-4 leading-snug px-4">
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
              <Button asChild variant="neura" size="lg" className="text-16">
                <Link href="/dashboard">Start researching</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="text-16 text-primary border-sky-100 bg-sky-50"
              >
                <Link href="#adam">See how Adam works</Link>
              </Button>
            </div>
          </BlurFade>
        </div>

        <div className="w-full min-h-fit max-h-fit">
          <BlurFade delay={0.4} inView>
            <AdamPreview />
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
