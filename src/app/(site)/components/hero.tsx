"use client";

import BlurFade from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { WaitingList } from "@/components/waitinglist";
import Image from "next/image";
import { useEffect, useState } from "react";
import HeroFeatureCard from "./hero-feature-card";


export default function Hero() {
  const [currentWord, setCurrentWord] = useState("simplify");
  const [isVisible, setIsVisible] = useState(true);

  const words = ["simplify", "organize", "collaborate"];

  useEffect(() => {
    const intervalId = setInterval(() => {
      // Start fade out
      setIsVisible(false);

      // Change word and fade in after a short delay
      setTimeout(() => {
        setCurrentWord((current) => {
          const currentIndex = words.indexOf(current);
          const nextIndex = (currentIndex + 1) % words.length;
          return words[nextIndex];
        });
        setIsVisible(true);
      }, 300); // Wait 300ms before changing word
    }, 3000); // Keep the 3 second interval

    return () => clearInterval(intervalId);
  }, []);

  return (
    <section className="min-h-[60dvh] max-h-fit mt-16 md:mt-0" id="home">
      <div className="flex flex-col items-center space-y-2 md:space-y-12 gap-12  ">
        <div className="w-full flex flex-col items-center justify-center gap-10 md:mt-12 mt-0">
          <div className=" max-w-[850px] text-center ">
            <BlurFade delay={0.2} inView>
              <h1 className="inline-block text-32 md:text-56 tracking-6 text-foreground leading-[1.2] duration-500 w-[80%] md:w-full">
                Your ultimate research copilot:{" "}
                <span
                  className={`
                    text-primary font-serif font-medium italic
                    transition-opacity duration-700 linear
                    ${isVisible ? "opacity-100" : "opacity-0"}
                  `}
                >
                  {currentWord}
                </span>{" "}
                effortlessly
              </h1>
            </BlurFade>
          </div>

          <BlurFade
            delay={0.3}
            inView
            className="flex flex-col w-full items-center justify-center"
          >
            <div className="inline-block w-fit">
              <WaitingList />
            </div>

            {/* <div className="flex flex-wrap gap-2 items-center justify-center w-full">
              <HeroFeatureCard text="beautiful" emoji="✨" className="bg-purple-50 text-purple-600 border-purple-600/50 border"/>
              <HeroFeatureCard text="smart" emoji="💡" className="bg-blue-50 text-blue-600 border-blue-600 border"/>
              <HeroFeatureCard text="fast" emoji="🔍" className="bg-green-50 text-green-600 border-green-600 border"/>
              <HeroFeatureCard text="easy" emoji="🔗" className="bg-yellow-50 text-yellow-600 border-yellow-600 border"/>
            </div> */}
          </BlurFade>
        </div>

        <div className="w-full min-h-fit max-h-fit rounded-xl">
          <BlurFade delay={0.4} inView>
            {/* <Image src={"/images/hero.png"} alt="hero" fill/> */}
            <Image
              src={"/thumbnail.png"}
              alt="hero"
              width={1920}
              height={1080}
              className="hidden lg:block h-fit object-cover"
              loading="eager"
            />
          </BlurFade>
          <BlurFade delay={0.4} inView>
            <Image
              src={"/thumbnail-phone.png"}
              alt="hero"
              width={1920}
              height={1080}
              className="lg:hidden h-fit object-contain "
              loading="eager"
            />
          </BlurFade>
        </div>
      </div>
    </section>
  );
}
