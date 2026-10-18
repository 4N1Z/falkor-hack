// Everything the Adam page's status bar and Activity tab need, in one read.

import { ADAM_QUERY_TIMEOUT_MS } from "./types";
import type { Graph } from "falkordb";
import { recentEvents } from "./events";
import * as jobs from "./jobs";
import { NODE_COUNTS, TRIAGE_COUNTS } from "./queries";
import { QUEUE_OPEN_COUNT } from "./queries-review";
import { getQuestionPage, type QuestionPage } from "./question-page";
import type { AdamEvent, AdamJob, AdamProject, JobStatus } from "./types";

export interface NodeCount {
  label: string;
  state: string;
  n: number;
}

export interface TriageCount {
  label: string;
  ring: string;
  fullText: number;
  n: number;
}

export interface ProjectStatus {
  project: AdamProject;
  questionPage: QuestionPage | null;
  jobs: { byStatus: Partial<Record<JobStatus, number>>; recent: AdamJob[] };
  nodes: NodeCount[];
  triage: TriageCount[];
  queueOpen: number;
  events: AdamEvent[];
}

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export async function projectStatus(graph: Graph, project: AdamProject): Promise<ProjectStatus> {
  const [questionPage, jobCounts, recentJobs, nodes, triage, queueRows, events] = await Promise.all([
    getQuestionPage(graph, project.id),
    jobs.counts(graph, project.id),
    jobs.recent(graph, project.id, 30),
    graph.roQuery<NodeCount>(NODE_COUNTS, params({ projectId: project.id })).then((r) => r.data ?? []),
    graph.roQuery<TriageCount>(TRIAGE_COUNTS, params({ projectId: project.id })).then((r) => r.data ?? []),
    graph.roQuery<{ n: number }>(QUEUE_OPEN_COUNT, params({ projectId: project.id })).then((r) => r.data ?? []),
    recentEvents(graph, project.id, 40),
  ]);
  return {
    project,
    questionPage,
    jobs: { byStatus: jobCounts.byStatus, recent: recentJobs },
    nodes: nodes.filter((n) => n.n > 0),
    triage,
    queueOpen: queueRows.reduce((s, r) => s + (r.n ?? 0), 0),
    events,
  };
}
