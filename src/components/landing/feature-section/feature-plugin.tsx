import ResearchToolsMenu from "@/components/blocks/plugin";
import { AIStars, bold, extract_papers, H1_logo, H2_logo, hypothesisLogo, italics, powerAI, search } from "@/lib/logos";
import { cn } from "@/lib/utils";
import { MenuItem } from "@/components/blocks/plugin";
import { BookOpenText } from "lucide-react";

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
      title: "Search Papers",
      subtitle: "cite from the whole team's library",
      buttonVariant: "pluginBlue" as const
    },
    {
      icon: hypothesisLogo,
      title: "Hypothesis",
      subtitle: "save it to the team notebook",
      buttonVariant: "pluginOrange" as const
    },
    {
      icon: extract_papers,
      title: "Upload papers",
      subtitle: "indexed into the graph, page by page",
      buttonVariant: "pluginGreen" as const
    },
    {
      icon: <BookOpenText className="w-full h-full text-[#C2410C]" />,
      title: "Zotero import",
      subtitle: "bring your folders across",
      buttonVariant: "pluginOrange" as const
    },
    {
      icon: powerAI,
      title: "Ask Neura AI",
      subtitle: "routed to the right agent",
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