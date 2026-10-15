import ResearchToolsMenu from "@/components/blocks/plugin";
import { AIStars, bold, cloudLogo, extract_papers, H1_logo, H2_logo, italics, powerAI, search } from "@/lib/logos";
import { cn } from "@/lib/utils";
import { MenuItem } from "@/components/blocks/plugin";
import Image from "next/image";

const menuItems: MenuItem[] = [
    {
      icon: AIStars,
      title: "Ask AI",
      subtitle: "Expand your research with AI",
      buttonVariant: "pluginNormal" as const
    },
    {
      icon: H1_logo,
      title: "Heading 1",
      subtitle: "Big section heading",
      buttonVariant: "pluginNormal" as const
    },
    {
      icon: H2_logo,
      title: "Heading 2",
      subtitle: "Medium section heading",
      buttonVariant: "pluginNormal" as const
    },
    {
      icon: bold,
      title: "Bold",
      subtitle: "Make text bold",
      buttonVariant: "pluginNormal" as const
    },
    {
      icon: italics,
      title: "Italics",
      subtitle: "Make text italic",
        buttonVariant: "pluginNormal" as const
    },
    {
      icon: search,
      title: "search",
      subtitle: "research paper search",
      buttonVariant: "pluginBlue" as const
    },
    {
      icon: <Image 
              src="/zotero.png" 
              alt="Zotero" 
              width={1080} 
              height={1080} 
              className="object-contain"
            />,
      title: "get documents",
      subtitle: "zotero plugin",
      buttonVariant: "pluginOrange" as const,
      isImage: true
    },
    {
      icon: extract_papers,
      title: "extract papers",
      subtitle: "upload your papers and extract",
      buttonVariant: "pluginGreen" as const
    },
    {
      icon: powerAI,
      title: "Chat with AI",
      subtitle: "research paper search",
      buttonVariant: "pluginYellow" as const
    }
  ];


export default function FeaturePlugin({className}:{className?:string}) {
  return (
    <div className={cn(" relative flex w-full  ",className)}>
        <div className={`absolute left-[40%] -top-20`}> 
          <ResearchToolsMenu
            menuItems={menuItems}
            defaultVariant="pluginNormal"
          />
        </div>
    </div>
  )
}