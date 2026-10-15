import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Notebook } from "lucide-react";
import UploadResearchPapers from "./upload-research-papers";
import db from "@/db";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
export default async function ResearchPapers({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const res = await db.query.papers.findMany({
    where: (papers, { eq }) => eq(papers.workspaceId, workspaceId),
  });
  return (
    <Card className={`w-full border-2 border-sky-100`}>
      <CardHeader className={`flex justify-between flex-row relative`}>
        <h3 className={`text-muted-foreground text-sm flex items-center gap-1`}>
          <Notebook size={13} />
          Research Papers
        </h3>
        <UploadResearchPapers
          workspaceId={workspaceId}
          workspaceName="workspace"
        />
      </CardHeader>
      <CardContent>
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
            {res.length > 0 ? (
              res.map((paper, index) => (
                <CarouselItem key={index} className="basis-auto pt-1">
                  <Card className={`p-2 cursor-pointer bg-white  rounded-sm`}>
                    <CardContent className={`text-foreground p-0 select-none`}>
                      {paper.title}
                    </CardContent>
                    <CardFooter className={`p-0`}>
                      <div className={`flex flex-row justify-between `}>
                        {paper.doi ? (
                          <Link
                            href={`https://doi.org/${paper.doi}`}
                            className={cn(
                              buttonVariants({ variant: "link" }),
                              "text-xs p-0"
                            )}
                          >
                            {paper.doi}
                          </Link>
                        ) : (
                          <Link 
                            href={paper.uploadUrl || `https://doi.org/${paper.doi}`|| ""}
                            target="_blank"
                          className="text-muted-foreground text-sm hover:underline">view paper 🡥</Link>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                </CarouselItem>
              ))
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center flex-1 text-foreground select-none cursor-pointer`}
              >
                <p>
                  No papers found. Click on the upload button to add papers.
                </p>
              </div>
            )}
          </CarouselContent>
        </Carousel>
      </CardContent>
    </Card>
  );
}
