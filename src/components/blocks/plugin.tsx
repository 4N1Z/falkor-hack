"use client"
import React from "react";
import { Button } from "../ui/button";
import useSound from "use-sound";
import { cn } from "@/lib/utils";



export interface MenuItem {
  icon: React.ReactNode;
  title: string;
  subtitle: string;

  buttonVariant?:
    | "pluginNormal"
    | "pluginBlue"
    | "pluginGreen"
    | "pluginOrange"
    | "pluginYellow";
  isImage?: boolean;
}

interface ResearchToolsMenuProps {
  menuItems: MenuItem[];
  defaultVariant?:
    | "pluginNormal"
    | "pluginBlue"
    | "pluginGreen"
    | "pluginOrange"
    | "pluginYellow";
}

const ResearchToolsMenu: React.FC<ResearchToolsMenuProps> = ({
  menuItems,
  defaultVariant = "pluginNormal",
}) => {

  const [playbackRate, setPlaybackRate] = React.useState(0.75);

  const [play1] = useSound("https://www.dropbox.com/s/uu322x4dqzdss9j/work-circle-click.mp3?raw=1", {
    playbackRate,
    // `interrupt` ensures that if the sound starts again before it's
    // ended, it will truncate it. Otherwise, the sound can overlap.
    volume: 0.5,
    interrupt: true,
  });
  const [play2] = useSound("https://www.dropbox.com/s/s26x8k5d0pq943t/iphone-tock.mp3?raw=1",{
    interrupt: true,
  });

  const handleHover = () => {
  
    setPlaybackRate(playbackRate + 0.1);
    play1();
  };

  const handleClick = () => {
    play2();
  }

  return (
    <div
      className={cn(
        `w-80  rounded-lg p-2`,
        `rounded-xl
        bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#FFF_24.44%,#93C7FB_92.29%)]
        backdrop-blur-sm
        shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]
        text-foreground
        ring-4 ring-white/40
        duration-500 hover:duration-500
        border-2 border-sky-100`
      )}
    >
      <div className="space-y-2 w-full ">
        {menuItems.map((item, index) => (
          <div
            key={index}
            className={cn(`w-full flex items-center gap-4 py-1 px-2 rounded-lg
               hover:bg-white/40 hover:border-2 hover:border-primary-foreground cursor-guest select-none `,
              //  `hover:ring-1 hover:ring-white/70 hover:shadow-[inset_0.5px_0.5px_10px_rgba(238,244,251,0.50)]`,
              // item.buttonVariant === "pluginYellow" && "hover:bg-white/40"
            )}
            onMouseEnter={handleHover}
            onClick={handleClick}
          >
            <Button
              variant={item.buttonVariant || defaultVariant}
              size="plugin"
              className="flex items-center justify-center cursor-guest select-none"
              
            >
              {item.isImage ? (
                <div className="relative w-8 h-8 select-none">{item.icon}</div>
              ) : (
                item.icon
              )}
            </Button>
            <div>
              <h3 className="font-medium text-xl md:text-2xl select-none">{item.title}</h3>
              <p className="text-foreground opacity-60 text-base md:text-lg text-ellipsis line-clamp-1 select-none">{item.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResearchToolsMenu;
