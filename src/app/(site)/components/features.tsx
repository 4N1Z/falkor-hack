import FeatureEditor from "@/components/landing/feature-section/feature-editor";
import { NeuraCard, FeatureSideCard } from "./bento-cards.";
import { cloudLogo, toolsLogo, workspaceLogo } from "@/lib/logos";
import FeatureAI from "@/components/landing/feature-section/feature-ai";
import FeaturePlugin from "@/components/landing/feature-section/feature-plugin";
import Image from "next/image";


export default function Features() {
  return (
    <section className="w-full min-h-screen py-20">
      <div className="flex flex-col items-center justify-center">
        <div className="grid gap-5 md:gap-10 grid-cols-1 md:grid-cols-3 md:grid-rows-2 min-h-[60vh] md:min-h-[90vh] ">
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
              title="Manage your research"
              description="A dedicated workspace-board to manage the workspace"
            />
            <div className="absolute h-[200px] w-[200px] bottom-0 -left-10 bg-secondary rounded-full z-[5] filter blur-3xl hidden md:block" />

            <div className="absolute inset-10 w-full h-full object-cover ring-4 ring-border hidden md:block rounded-xl overflow-clip z-1 ">
              {/* Desktop Image */}
              <Image
                src="/workspaceDashboard.png"
                alt="Collaborative Workspace"
                height={1080}
                width={1920}
                className="left-1/2" // Hide on mobile, show on desktop
              />
            </div>
            {/* Mobile Image */}
            <div className="absolute inset-0 w-full h-full object-cover ring-2 ring-white/40 md:hidden ">
              {/* Desktop Image */}
              <Image
                src="/dashboard_phone.png"
                alt="Collaborative Workspace"
                height={1080}
                width={1920}
                loading="eager"
                className=" " // Hide on mobile, show on desktop
              />
            </div>
          </NeuraCard>
        </div>
      </div>
    </section>
  );
}
