import Hero from "./components/hero";
import MaxWidthContainer from "./components/max-width-container";
import Navbar from "./components/navbar";
import TrustedBy from "./components/trusted.by";
import AboutNeura from "./components/about-neura";
import Footer from "./components/footer";
import FeatureSection from "./components/feature-section";
import AdamSection from "./components/adam-section";
import UpgradeSection from "./components/upgrade-section";

export default async function Home() {
  return (
    <>
      <Navbar />
      <MaxWidthContainer className="w-full flex flex-col gap-0 md:gap-12 pt-4 md:pt-12 ">
        <Hero />
        <TrustedBy />
        <AboutNeura />
      </MaxWidthContainer>
      <AdamSection />
      <FeatureSection />
      <UpgradeSection />
      <Footer />
    </>
  );
}
