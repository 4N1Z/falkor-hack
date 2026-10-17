import { getWorkspaceDetail } from "@/db/actions/action-workspace";
import { getGreeting } from "@/lib/utils";
import { redirect } from "next/navigation";
import RecentCreateFiles from "../_components/recent-create-files";
import ResearchSuggestion from "../_components/research-suggestion";
import ResearchPapers from "../_components/research-papers";
import AdamProjects from "../_components/adam-projects";
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
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 lg:px-10">
      {/* Header */}
      <header>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {greetings}, {firstName}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            You&apos;re in <span className="font-medium text-foreground">{data[0].title}</span>
          </span>
          {isSharedWorkspace ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-700/10">
              Shared with you
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary ring-1 ring-inset ring-blue-700/10">
              Owner
            </span>
          )}
        </div>
      </header>

      {/* Pick up where you left off */}
      <section className="mt-10" aria-labelledby="recent-heading">
        <RecentCreateFiles workspaceId={data[0].id} />
      </section>

      {/* Adam: the research-agent system, the workspace's flagship */}
      <section className="mt-10" aria-label="Adam research projects">
        <AdamProjects workspaceId={params.workspaceId} />
      </section>

      {/* Library + suggestions, equal height side by side; stacked on smaller screens */}
      <section className="mt-10 grid items-stretch gap-6 lg:grid-cols-2">
        <ResearchPapers workspaceId={params.workspaceId} />
        <ResearchSuggestion />
      </section>
    </div>
  );
}
