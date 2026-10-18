// The Question page (spec, Phase 0): the topic as a one-page brief — hunch, why it matters,
// 3–5 sub-questions, search vocabulary including neighbouring fields' terms, and a scope
// fence. Written by the Scoper, checked by the scope checker, approved by the researcher
// (gate 1). Stored as (:QuestionPage)-[:OF]->(:AdamProject), one per pass.

import { ADAM_QUERY_TIMEOUT_MS } from "./types";
import { randomUUID } from "crypto";
import type { Graph } from "falkordb";
import { APPROVE_QUESTION_PAGE, EDIT_QUESTION_PAGE, GET_QUESTION_PAGE, UPSERT_QUESTION_PAGE } from "./queries";
import { parseJson, type NodeState } from "./types";

export interface SubQuestion {
  id: string;
  text: string;
  /** What kind of evidence or experiment would settle it */
  answerableBy: string;
}

export interface Vocabulary {
  /** Terms the field itself uses */
  terms: string[];
  /** The same problem under other names in neighbouring fields */
  adjacentTerms: { term: string; field: string }[];
}

export interface ScopeFence {
  inside: string[];
  outside: string[];
}

/** The scope checker's verdict (spec "Checking at every step" → Scope). */
export interface ScopeChecks {
  subquestions: { id: string; answerable: boolean; issue: string | null }[];
  fenceIssues: string[];
  /** Overall: can this page go to the researcher as is? */
  ready: boolean;
}

export interface QuestionPage {
  id: string;
  projectId: string;
  pass: number;
  hunch: string;
  why: string;
  subquestions: SubQuestion[];
  vocabulary: Vocabulary;
  scopeFence: ScopeFence;
  checks: ScopeChecks | null;
  state: NodeState;
  runId: string | null;
  approvedBy: string | null;
  approvedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

type Row = Omit<QuestionPage, "subquestions" | "vocabulary" | "scopeFence" | "checks"> & {
  subquestions: string;
  vocabulary: string;
  scopeFence: string;
  checks: string;
};

const toPage = (r: Row): QuestionPage => ({
  ...r,
  subquestions: parseJson(r.subquestions, []),
  vocabulary: { terms: [], adjacentTerms: [], ...parseJson<Partial<Vocabulary>>(r.vocabulary, {}) },
  scopeFence: { inside: [], outside: [], ...parseJson<Partial<ScopeFence>>(r.scopeFence, {}) },
  checks: parseJson<ScopeChecks | null>(r.checks === "{}" ? null : r.checks, null),
});

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export async function getQuestionPage(graph: Graph, projectId: string): Promise<QuestionPage | null> {
  const row = (await graph.roQuery<Row>(GET_QUESTION_PAGE, params({ projectId }))).data?.[0];
  return row ? toPage(row) : null;
}

export async function writeQuestionPage(
  graph: Graph,
  input: {
    projectId: string;
    pass: number;
    hunch: string;
    why: string;
    subquestions: SubQuestion[];
    vocabulary: Vocabulary;
    scopeFence: ScopeFence;
    checks: ScopeChecks | null;
    state: NodeState;
    runId: string | null;
  },
): Promise<QuestionPage> {
  const row = (
    await graph.query<Row>(
      UPSERT_QUESTION_PAGE,
      params({
        id: randomUUID(),
        projectId: input.projectId,
        pass: input.pass,
        hunch: input.hunch,
        why: input.why,
        subquestions: JSON.stringify(input.subquestions),
        vocabulary: JSON.stringify(input.vocabulary),
        scopeFence: JSON.stringify(input.scopeFence),
        checks: JSON.stringify(input.checks ?? {}),
        state: input.state,
        runId: input.runId,
        at: Date.now(),
      }),
    )
  ).data?.[0];
  if (!row) throw new Error("question page write failed");
  return toPage(row);
}

/** The researcher's edits: anything given replaces the agent's version and is human_approved. */
export async function editQuestionPage(
  graph: Graph,
  projectId: string,
  pass: number,
  userId: string,
  patch: Partial<Pick<QuestionPage, "hunch" | "why" | "subquestions" | "vocabulary" | "scopeFence">>,
): Promise<QuestionPage | null> {
  const row = (
    await graph.query<Row>(
      EDIT_QUESTION_PAGE,
      params({
        projectId,
        pass,
        userId,
        hunch: patch.hunch ?? null,
        why: patch.why ?? null,
        subquestions: patch.subquestions ? JSON.stringify(patch.subquestions) : null,
        vocabulary: patch.vocabulary ? JSON.stringify(patch.vocabulary) : null,
        scopeFence: patch.scopeFence ? JSON.stringify(patch.scopeFence) : null,
        at: Date.now(),
      }),
    )
  ).data?.[0];
  return row ? toPage(row) : null;
}

export async function approveQuestionPage(graph: Graph, projectId: string, pass: number, userId: string): Promise<QuestionPage | null> {
  const row = (await graph.query<Row>(APPROVE_QUESTION_PAGE, params({ projectId, pass, userId, at: Date.now() }))).data?.[0];
  return row ? toPage(row) : null;
}
