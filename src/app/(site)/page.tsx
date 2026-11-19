import Hero from "./components/hero";
import Navbar from "./components/navbar";
import TrustedBy from "./components/trusted.by";
import AboutNeura from "./components/about-neura";
import Footer from "./components/footer";
import FeatureSection from "./components/feature-section";
import UpgradeSection from "./components/upgrade-section";
import RailSection from "./components/rail-section";

export default async function Home() {
  return (
    <>
      <Navbar />
      <RailSection id="home" className="py-8 md:py-12">
        <Hero />
      </RailSection>
      <RailSection className="py-6 md:py-8">
        <TrustedBy />
      </RailSection>
      <RailSection className="py-2 md:py-4">
        <AboutNeura />
      </RailSection>
      <RailSection className="h-10 md:h-14" />
      <FeatureSection />
      <UpgradeSection />
      <Footer />
    </>
  );
}
