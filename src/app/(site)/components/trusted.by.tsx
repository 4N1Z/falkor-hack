import { iTechlogo, sswLogo, TinkerSpace } from "@/components/partnerlogo";
import TrustedByCarousel from "./trusted-by-carousel";
import BlurFade from "@/components/ui/blur-fade";

const partners = [
{
  name : "Soft Served Web",
  logo :sswLogo,
  isSVG : true
},{
  name : "iTech",
  logo :iTechlogo,
  isSVG : true
},
{
  name : "TinkerSpace",
  logo :TinkerSpace,
  isSVG : true
},{
  name: "Skylux",
  logo :"/partnerLogo/skylux.png",
  isSVG : false
},
{
  name:"al jamia",
  logo :"/partnerLogo/aljamia.png",
  isSVG : false
}
];

export default function TrustedBy() {
  

  return (
    <BlurFade className="w-full flex flex-col items-center justify-center gap-8 mt-12 md:mt-0" delay={0.5} inView>
      <h2 className="text-xl tracking-6 leading-[1.2] lowercase text-primary ">
        Trusted by
      </h2>
    {/* on hover i need to show a contact btn , and need to add a backdrop blur to the carousel */}
      <TrustedByCarousel partners={partners}/>
   
    </BlurFade>
  );
}
