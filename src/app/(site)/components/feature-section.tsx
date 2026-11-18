import BlurFade from "@/components/ui/blur-fade";
import Features from "./features";
import MaxWidthContainer from "./max-width-container";

export const bg_shape = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1920"
    height="1440"
    viewBox="0 0 1920 1440"
    fill="none"
    className="w-full h-full"
  >
    <path
      d="M0 0.953125C0 0.953125 585.097 84.7639 960 84.7639C1334.9 84.7639 1920 0.953125 1920 0.953125V1440C1920 1440 1338.51 1353.85 960 1353.85C581.489 1353.85 0 1440 0 1440V0.953125Z"
      fill="currentColor"
    />
  </svg>
);
export const curve = (
  <svg
    viewBox="0 0 1440 58"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width=""
  >
    <path
      d="M-100 58C-100 58 218.416 36.3297 693.5 36.3297C1168.58 36.3297 1487 58 1487 58V-3.8147e-06H-100V58Z"
      fill="currentColor"
    ></path>
  </svg>
);
export default function FeatureSection() {
  return (
    <section className="relative w-full min-h-screen flex flex-col items-start justify-center mt-5 md:mt-20" id="features">
      <div className="absolute bottom-[99.8%] left-1/2 -translate-x-1/2 w-full  z-10">
        <div className="grid items-center text-foreground rotate-180">
          {curve}
        </div>
      </div>
      <div className="bg-foreground pt-10 flex w-full items-center justify-center">

      <MaxWidthContainer className="">
        <div className="max-w-xl">
          <BlurFade delay={0.2} inView> 
            <h1 className="text-32 tracking-6 leading-[1.2] lowercase text-background">
            the
            <span className="text-secondary font-serif font-semibold italic">
              {" "}
              exact tool{" "}
            </span>
              that you wanted for your research purposes
            </h1>
          </BlurFade>
        </div>
        <Features />
      </MaxWidthContainer>
      </div>
      <div className="absolute top-[99.8%] left-1/2 -translate-x-1/2 w-full  z-10">
        <div className="grid items-center text-foreground ">{curve}</div>
      </div>
    </section>
  );
}
