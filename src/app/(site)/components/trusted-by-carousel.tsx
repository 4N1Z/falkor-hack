"use client";

import Image from "next/image";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import AutoScroll from "embla-carousel-auto-scroll";

import { useRef } from "react";

export default function TrustedByCarousel({
  partners,
}: {
  partners: { name: string; logo: string | JSX.Element; isSVG: boolean }[];
}) {
  const plugin = useRef(
    AutoScroll({ playOnInit: true,  })
  );

  return (
    <>
      <Carousel
        opts={{
          align: "start",
          loop: true,
          dragFree: true,
        }}
        plugins={[plugin.current]}
        className="w-full max-w-screen select-none"
      >
        <CarouselContent className="">
          {partners.map((partner, index) => (
            <CarouselItem
              key={index}
              className="pl-2 md:pl-4 basis-1/2 md:basis-1/4 select-none"
            >
              <div className="flex gap-2 items-center justify-center">
                <div className="w-24 h-auto relative">
                  {partner.isSVG ? (
                    <div>
                      {partner.logo}
                    </div>
                  ) : (
                    <Image
                      src={typeof partner.logo === 'string' ? partner.logo : ''}
                      alt={partner.name}
                      height={1080}
                      width={1080}
                      className="object-contain w-[100%]"
                    />
                  )}
                </div>
                {/* <span className="text-lg font-medium text-foreground">
                  {partner.name}
                </span> */}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </>
  );
}
