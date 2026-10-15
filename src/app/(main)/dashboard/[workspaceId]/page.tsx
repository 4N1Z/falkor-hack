import { getWorkspaceDetail } from "@/db/actions/action-workspace";
import { getGreeting } from "@/lib/utils";
import { redirect } from "next/navigation";
import RecentCreateFiles from "../_components/recent-create-files";
import SemanticScholarSuggestion from "../_components/semantic-scholar-suggestion";
import ResearchPapers from "../_components/research-papers";
import { auth } from "@/auth";

export default async function WordspaceIdPage(
  props: {
    params: Promise<{ workspaceId: string }>;
  }
) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user || session === null) redirect("/login");

  const { data, error } = await getWorkspaceDetail(params.workspaceId);
  if (error || !data.length) redirect(`/dashboard`);

  const greetings = getGreeting();
  const isSharedWorkspace = data[0].workspaceOwner !== session?.user?.id;

  return (
    <div className="relative h-full max-h-screen grid w-full max-w-screen-lg mx-auto ">
      <div className={`flex items-center flex-col gap-2`}>
        <div className={`flex flex-col w-full pt-8 mb-12`}>
          <h1 className={`text-2xl font-semibold`}>
            {greetings}, {session?.user?.name || "User"}
          </h1>
          <div className="flex items-center gap-2">
            <p className={`font-xs`}>Welcome to {data[0].title} workspace</p>
            {isSharedWorkspace ? (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-700/10">
                Shared
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-blue-700/10">
                owner
              </span>
            )}
          </div>
        </div>
        <div className="w-full h-screen max-h-screen grid grid-cols-4 grid-rows-4">
          {/* <div className="grid row-span-2 col-span-2 justify-center">
            <RecentCreateFiles workspaceId={data[0].id} />
            <ResearchPapers workspaceId={params.workspaceId} />
          </div> */}

          <div className="grid col-span-3 row-span-1 mx-4 items-end mb-4">
            <RecentCreateFiles workspaceId={data[0].id} />
          </div>
          <div className=" col-span-2 row-span-2 col-start-3 row-start-2 mx-4 ">
            <SemanticScholarSuggestion />
          </div>
          <div className="col-span-2 row-span-2 col-start-1 row-start-2 mx-4">
            <ResearchPapers workspaceId={params.workspaceId} />
          </div>
        </div>
      </div>
    </div>
  );
}
