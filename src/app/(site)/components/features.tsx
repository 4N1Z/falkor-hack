import FeatureEditor from "@/components/landing/feature-section/feature-editor";
import { NeuraCard, FeatureSideCard } from "./bento-cards.";
import { cloudLogo, hypothesisLogo, toolsLogo, workspaceLogo } from "@/lib/logos";
import AdamCard from "./adam-card";
import FeatureAI from "@/components/landing/feature-section/feature-ai";
import FeaturePlugin from "@/components/landing/feature-section/feature-plugin";
import ResearchGraphMock from "./research-graph-mock";


export default function Features() {
  return (
    <section className="w-full pt-8 md:pt-10">
      <div className="flex flex-col items-center justify-center">
        <div className="grid w-full gap-4 md:gap-5 grid-cols-1 md:grid-cols-3 md:grid-rows-[1fr_1fr_auto]">
          {/* First Square Card */}
          <NeuraCard
            variant="square"
            className="p-4 md:p-6 relative overflow-hidden min-h-[400px] md:min-h-[40vh]"
            >
            <div className="absolute left-20 top-20 z-10">
              <FeatureEditor />
            </div>
            <FeatureSideCard
              logo={cloudLogo}
              title="Share your thoughts"
              description="Collaborate with Mates and comment on them"
              />
            <div className="absolute h-[200px] w-[200px] top-0 -left-10 bg-secondary rounded-full z-1 filter blur-3xl" />
          </NeuraCard>
            

          <NeuraCard
            variant="square"
            className="p-4 md:p-6 relative overflow-hidden min-h-[400px] md:min-h-[40vh]"
          >
            <FeatureAI className="z-20" />
            <div className="absolute h-[300px] w-[300px] -bottom-5 right-0 bg-secondary rounded-full z-[2] filter blur-3xl" />
            <div className="absolute h-[200px] w-[200px] -bottom-5 right-10 bg-primary opacity-50  rounded-full z-[1] filter blur-[32px]" />
          </NeuraCard>

          <NeuraCard
            variant="longVertical"
            className="row-span-2 p-4 md:p-6 relative min-h-[600px] md:min-h-auto "
          >
            <div className="  bottom-0 md:-bottom-2/3 left-0  md:left-1/3 ">
              <FeaturePlugin />
            </div>
            <FeatureSideCard
              logo={toolsLogo}
              title="Research Tools"
              description="Access a wide range of research tools"
            />
            <div className="absolute h-[200px] w-[200px] bottom-0 -left-10 bg-secondary rounded-full z-1 filter blur-3xl" />
          </NeuraCard>

          <NeuraCard
            variant="longHorizontal"
            className="p-4 md:p-6 col-span-1 relative min-h-[40vh]"
          >
            <FeatureSideCard
              logo={workspaceLogo}
              title="One graph for the whole team"
              description="Every paper, passage, draft sentence and note in your workspace's FalkorDB graph"
            />
            <div className="absolute h-[200px] w-[200px] bottom-0 -left-10 bg-secondary rounded-full z-[5] filter blur-3xl hidden md:block" />
            <div className="absolute inset-0 pb-28 z-[1]">
              <ResearchGraphMock />
            </div>
          </NeuraCard>

          <NeuraCard
            variant="longHorizontal"
            className="md:col-span-3 relative min-h-[520px] md:min-h-[400px]"
          >
            <AdamCard />
            <FeatureSideCard
              logo={hypothesisLogo}
              title="Adam, from question to experiment"
              description="Reads the field, extracts claims with their pages, attacks its own hypotheses, and plans the cheapest experiment that could prove them wrong. You make the four decisions."
            />
            <div className="absolute h-[260px] w-[260px] -top-10 -right-10 bg-secondary rounded-full z-[1] filter blur-3xl" />
          </NeuraCard>
        </div>
      </div>
    </section>
  );
}
