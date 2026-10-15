"use client";

import { neuraQueryLogo, cloudLogo, peopleCursor } from "@/lib/logos";
import { cn } from "@/lib/utils";
import { ImagePlus } from "lucide-react";
import CustomCursor from "../../blocks/custom-cursor";
import { FeatureSideCard } from "@/app/(site)/components/bento-cards.";
import { useRef } from "react";

export function CustomPeopleCursor({
  name,
  color,
}: {
  name: string;
  color: string;
}) {
  return (
    <div className="flex items-start gap-1 justify-center">
      <span style={{ color: color }}>{peopleCursor}</span>
      <p
        className={cn(
          `text-sm font-medium  text-white  rounded-full px-2 py-1`
        )}
        style={{ backgroundColor: color }}
      >
        {name}
      </p>
    </div>
  );
}

export default function FeatureEditor({ className }: { className?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={editorRef}
      className={cn(
        `min-w-3xl relative
        p-6 rounded-xl
        bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#FFF_24.44%,#93C7FB_92.29%)]
          
          backdrop-blur-sm
        shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]
          text-foreground
          
         
          duration-150
          border-2 border-sky-100
          cursor-guest ring-4 ring-white/40
    `,
        className
      )}
    >
      <div className="absolute top-20 right-5">
        <CustomPeopleCursor name="Aniz B N" color="#A03BB0" />
      </div>
      <div className="absolute  left-[50%] top-[15%] -translate-x-[50%] ">
        <CustomPeopleCursor name="Aswin" color="#0895B4" />
      </div>

      <div className="w-full flex flex-col">
        <div className="flex flex-row gap-4 border-b border-primary-foreground pb-4">
          {/* Research Assistant */}
          <div
            className={cn(
              `rounded-lg w-12 h-12 p-2`,
              "border border-border",
              "bg-[linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
              "shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]",
              "flex items-center justify-center",
              "transition-transform duration-150 ease-out",
              "hover:scale-[1.02]",
              "hover:shadow-[inset_-5.471px_-5.471px_10.941px_rgba(238,244,251,0.60),0px_10px_15px_rgba(109,205,247,0.60)]"
            )}
          >
            {neuraQueryLogo}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 px-0 bg-green-100 p-1 items-center justify-center text-green-600 rounded-md">
              <ImagePlus size={18} />
              <p className="text-sm font-medium">Upload Banner</p>
            </div>

            <div className="flex flex-col">
              <h1 className="text-lg font-medium text-foreground leading-none">
                Research Assistant
              </h1>
              <p className="text-sm text-muted-foreground leading-none">
                Neura Query
              </p>
            </div>
          </div>
        </div>
        <div className="w-full flex flex-col gap-4 py-4">
          <h2 className="text-xl font-medium">Research is hard</h2>

          <p className="text-muted-foreground font-regular">
            There are countless challenges in the research process. From
            managing citations and finding relevant papers, to organizing
            thoughts and collaborating with peers—each step can be
            time-consuming and overwhelming, especially without the right tools.
          </p>
          <p className="text-muted-foreground font-regular">
            It&apos;s tough to stay organized, and even harder to make your work
            stand out in a competitive field. But research doesn&apos;t have to
            be a struggle. With the right tools, the research process can be
            streamlined, allowing you to focus on what matters most: advancing
            knowledge and making impactful discoveries.
          </p>
          {/* 
          <CustomCursor
            size={50}
            color="#6d28d9"
            dotSize={12}
            dotColor="#ffffff"
          /> */}
        </div>
      </div>
    </div>
  );
}
