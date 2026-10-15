"use client";
import { File } from "@/db/database.types";
import { Button } from "@/components/ui/button";
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
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Clock } from "lucide-react";
import Link from "next/link";
import { formatDate, getLastUpdatedTime } from "@/lib/utils";
import React from "react";
import Autoplay from "embla-carousel-autoplay";
import { useWorkspaceFiles } from "@/lib/hooks/state-management-hooks";

// Define proper types for the props
interface RecentCreateFilesProps {
  workspaceId: string;
}
// const plugin = React.useRef(
//   Autoplay({ delay: 2000, stopOnInteraction: true })
// )

export default function RecentCreateFiles({
  workspaceId,
}: RecentCreateFilesProps) {
  // TODO : Recent File check
  // const allFiles = useWorkspaceFiles(workspaceId);
  // const recentFiles = allFiles
  //   .sort(
  //     (a, b) =>
  //       new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  //   )
  //   .slice(0, 5);

  const recentFiles = useWorkspaceFiles(workspaceId);
    // console.log("From session ::", recentFiles)



  return (
    <div className={`flex w-full flex-col gap-2`}>
      <h1 className={`text-muted-foreground text-sm flex items-center gap-1`}>
        <Clock size={13} />
        Recent Created Files
      </h1>

      {recentFiles && recentFiles.length > 0 ? (
        <Carousel
          className="w-full"
          // plugins={[plugin.current]}
        >
          <CarouselContent className="-ml-1 justify-start p-1">
            {recentFiles.map((file) => (
              <CarouselItem key={file.id} className="pl-1 basis-auto ">
                <Link
                  href={`/dashboard/${workspaceId}/${file.id}`}
                  className="text-lg font-semibold"
                  title={file.title}
                >
                  <Card
                    className={`aspect-square w-full flex justify-between text-foreground flex-col hover:bg-border 
                      hover-subtle-shadow-blue hover:shadow-md hover:shadow-sky-100
                    `}>
                    <CardHeader
                      className={`px-2 pb-0 pt-2 flex flex-row w-full justify-between`}
                    >
                      <div>{file.iconId}</div>
                      <div className="text-xs font-normal text-muted-foreground ">
                        {getLastUpdatedTime(file.updatedAt)}
                      </div>
                    </CardHeader>
                    <CardContent className={`px-2 py-0 text-sm`}>
                      {file.title.length > 10
                        ? `${file.title.slice(0, 10)}...`
                        : file.title}{" "}
                    </CardContent>
                    <CardFooter className={`px-2 pb-2 pt-0 text-right`}>
                      <p className="text-xs font-thin text-muted-foreground  text-right">
                        {formatDate(file.createdAt)}
                      </p>
                    </CardFooter>
                  </Card>
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      ) : (
        // If there are no files
        <div className="text-muted-foreground text-sm h-[105px] flex w-full items-center justify-center">
          No recent files
        </div>
      )}
    </div>
  );
}
