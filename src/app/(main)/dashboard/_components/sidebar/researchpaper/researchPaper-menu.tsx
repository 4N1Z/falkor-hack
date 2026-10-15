import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import ImportPaper from "@/components/zotero/components/dialog/ImportPaper";
import db from "@/db";
import { dashboardCardStyle } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default async function ResearchPaperMenu({ workspaceId }: { workspaceId: string }) {
  const res = await db.query.papers.findMany({
    where: (papers, { eq }) => eq(papers.workspaceId, workspaceId),
  });
  return (
    <div className="flex flex-col gap-2 justify-between items-start">
      <Carousel
        opts={{
          align: "start",
          containScroll: "trimSnaps",
          loop: false,
        }}
        orientation="vertical"
        className="w-full"
      >
        <CarouselContent className={`-mt-1 h-[300px] overflow-y-auto`}>
          {res.length > 0 ? res.map((paper, index) => (
            <CarouselItem key={index} className="basis-auto pt-1">
              <Card className={`p-2 cursor-pointer`}>
                <CardContent className={`text-foreground p-0 select-none`}>
                  {paper.title}
                </CardContent>
                <CardFooter className={`p-0`}>
                  <div className={`flex flex-row justify-between`}>
                    {paper.doi &&
                      <Link href={`https://doi.org/${paper.doi}`} className={cn(buttonVariants({ variant: 'link' }), 'text-xs p-0')}>
                        {paper.doi}
                      </Link>
                    }
                  </div>
                </CardFooter>
              </Card>
            </CarouselItem>
          )) :
            <div className={`w-full h-full flex items-center justify-center flex-1 text-foreground select-none cursor-pointer`}>
              <p>
                No papers found. Click on the upload button to add papers.
              </p>
            </div>}
        </CarouselContent>
      </Carousel>

      <div className="border-t w-full">
        <div className="flex gap-2 justify-between items-start mt-2">
          <div className={cn("flex gap-2 justify-center items-center p-1.5 text-sm", dashboardCardStyle)}>
            <PlusIcon /> Add Research Paper
          </div>

          <ImportPaper workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
