"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

import { neuraQueryLogo } from "@/lib/logos";
import { Loader2 } from "lucide-react";
import useSound from "use-sound";

const NeuraAIBtn = () => {
  const [showAIResponse, setShowAIResponse] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [showCapabilities, setShowCapabilities] = useState(false);
  
  const fullMessage = ` Hello! I'm Neura AI 👋, your research assistant. I can help you with: `;
  const capabilities = [
    "Analyzing research papers and data",
    "Generating literature reviews",
    "Finding research gaps",
    "Suggesting research methodologies",
    "Explaining complex concepts"
  ];

  useEffect(() => {
    if (showAIResponse) {
      setIsLoading(true);
      setDisplayText("");
      setShowCapabilities(false);

      setTimeout(() => {
        setIsLoading(false);
        
        let i = 0;
        const typeInterval = setInterval(() => {
          if (i < fullMessage.length) {
            setDisplayText(prev => prev + fullMessage[i]);
            i++;
          } else {
            clearInterval(typeInterval);
            setShowCapabilities(true);
          }
        }, 30);

        return () => clearInterval(typeInterval);
      }, 1000);
    } else {
      setShowCapabilities(false);
    }
  }, [showAIResponse]);

  useEffect(() => {
    const interval = setInterval(() => {
      const button = document.querySelector('.wiggle-button');
      if (button) {
        button.classList.add('animate-wiggle');
        setTimeout(() => {
          button.classList.remove('animate-wiggle');
        }, 2000); // Duration of the wiggle animation
      }
    }, 2000); // Interval between animations

    return () => clearInterval(interval);
  }, []);


  const [play] = useSound("https://www.dropbox.com/s/7xuwdivqh80qn9v/green-sound.mp3?raw=1", {
    // playbackRate,
    volume: 0.5,
    // `interrupt` ensures that if the sound starts again before it's
    // ended, it will truncate it. Otherwise, the sound can overlap.
    // interrupt: true,
  });

  const handleClick = () => {
    play();
    setShowAIResponse(true)
  };



  return (
    <>
      <button
        className={cn(
          "relative rounded-xl w-fit flex gap-4 items-center justify-center p-2",
          "border-[1.5px] border-[#F5FAFF]",
          "ring-2 ring-white/40",
          "bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
          "shadow-[0px_3.987px_6.645px_0px_rgba(109,205,247,0.52)]",
          "" // Add a class to target the button
        )}
        onClick={handleClick}
      >
        <div
          className={cn(
            `rounded-lg w-14 h-14 p-2`,
            "border border-border",
            "bg-[linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
            "shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]",
            "flex items-center justify-center",
            "transition-all duration-500 ease-in-out",
            "hover:shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.60),0px_10px_15px_rgba(109,205,247,0.60)]",
            "wiggle-button",
            "hover:animate-wiggle"
          )}
        >
          {neuraQueryLogo}
        </div>
        <p className="text-xl font-semibold bg-gradient-to-r from-[#305EFF] to-[#8DC4FB] bg-clip-text text-transparent">
          Ask Neura AI
        </p>
    
        {/* <span className="animate-ping absolute duration-1000 inline-flex h-full w-full rounded-md bg-secondary opacity-50"></span> */}
      </button>
      
      {showAIResponse && (
        <div
          className={cn(
            "absolute bottom-24 right-0 w-80 p-4 rounded-lg",
            "ring-2 ring-white/40",
            "bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
            "shadow-[0px_3.987px_6.645px_0px_rgba(109,205,247,0.52)]"
          )}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={cn(
              "w-8 h-8 rounded-sm p-1.5",
              "border border-border",
              "animate-wiggle",
          
              "flex items-center justify-center"
            )}>
              {neuraQueryLogo}
            </div>
            <span className="text-sm font-semibold text-primary opacity-75">Neura AI</span>
          </div>
          <div className="text-sm text-foreground opacity-75 min-h-[120px]">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={16} />
                <span>Thinking...</span>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-line">{displayText}</p>
                {showCapabilities && (
                  <ul className="mt-2 ml-4 list-disc animate-fadeIn">
                    {capabilities.map((capability, index) => (
                      <li 
                        key={index}
                        className="animate-slideIn"
                        style={{ 
                          animationDelay: `${index * 0.5}s`,
                          opacity: 0,
                          animation: `slideIn 0.5s ease-out ${index * 0.5}s forwards`
                        }}
                      >
                        {capability}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <button 
            onClick={() => setShowAIResponse(false)}
            className="absolute top-2 right-2 text-primary/75 hover:text-primary bg-border border-sky-100 w-6 h-6 rounded-sm flex items-center justify-center" 
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
};

function AIWriting() {
  return (
    <div
      className={cn(
        "flex items-center gap-4 w-full py-2 px-4 rounded-lg",
        "ring-2 ring-white/40",
        "bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
        "shadow-[0px_3.987px_6.645px_0px_rgba(109,205,247,0.52)]"
      )}
    >
      <Loader2 className="animate-spin" size={16} />
      <h1 className="text-lg text-left font-semibold text-primary opacity-75">
        AI Writing
      </h1>
    </div>
  );
}
export default function FeatureAI({ className }: { className?: string }) {
  return (
    <div className={cn("relative grid grid-rows-2 h-full ", className)}>
      <div className="flex justify-start items-start">
        <h1 className="text-26 text-left font-regualar tracking-4 max-w-[70%]">
          Specialized
          <span className="text-primary font-serif font-semibold italic">
            {" "}
            AI Agents{" "}
          </span>
          to help through out the research
        </h1>
      </div>
      <div className="flex justify-end items-end">
        <NeuraAIBtn />
      </div>
    </div>
  );
}
