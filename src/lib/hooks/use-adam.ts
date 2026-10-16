"use client";

import type { ProjectStatus } from "@/lib/adam/status";
import type { AdamProject, Gate, JobKind } from "@/lib/adam/types";
import type { QuestionPage } from "@/lib/adam/question-page";
import useSWR, { mutate } from "swr";

/**
 * Adam data hooks. One cached copy per key; the status polls every 3 s while the project is
 * running or has jobs in flight (same pattern as use-library.ts), otherwise it sits still.
 */
export const projectsKey = (workspaceId: string) => `/api/adam/projects?workspaceId=${workspaceId}`;
export const statusKey = (workspaceId: string, projectId: string) => `/api/adam/${projectId}/status?workspaceId=${workspaceId}`;

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
};

async function post<T>(url: string, body: Record<string, unknown>, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const inFlight = (s: ProjectStatus | undefined) =>
  !!s && (s.project.status === "running" || (s.jobs.byStatus.running ?? 0) > 0 || (s.jobs.byStatus.queued ?? 0) > 0);

export function useAdamProjects(workspaceId: string) {
  const { data, error, isLoading } = useSWR(projectsKey(workspaceId), fetcher<{ projects: AdamProject[] }>, { keepPreviousData: true });
  return { projects: data?.projects ?? null, error, isLoading };
}

export function useAdamStatus(workspaceId: string, projectId: string | null) {
  const { data, error, isLoading } = useSWR(projectId ? statusKey(workspaceId, projectId) : null, fetcher<ProjectStatus>, {
    refreshInterval: (latest) => (inFlight(latest) ? 3000 : 15000),
    keepPreviousData: true,
  });
  return { status: data ?? null, error, isLoading };
}

export const refreshAdam = (workspaceId: string, projectId?: string | null) =>
  Promise.all([mutate(projectsKey(workspaceId)), projectId ? mutate(statusKey(workspaceId, projectId)) : Promise.resolve()]);

// ---------------------------------------------------------------- actions

export async function createAdamProject(workspaceId: string, input: { title: string; topic?: string; understanding?: string }) {
  const { project } = await post<{ project: AdamProject }>("/api/adam/projects", { workspaceId, ...input });
  await refreshAdam(workspaceId);
  return project;
}

export async function updateAdamProject(workspaceId: string, projectId: string, patch: Record<string, unknown>) {
  const { project } = await post<{ project: AdamProject }>(`/api/adam/${projectId}`, { workspaceId, ...patch }, "PATCH");
  await refreshAdam(workspaceId, projectId);
  return project;
}

export async function deleteAdamProject(workspaceId: string, projectId: string) {
  await post(`/api/adam/${projectId}`, { workspaceId }, "DELETE");
  await refreshAdam(workspaceId);
}

export async function startAdamProject(workspaceId: string, projectId: string) {
  const r = await post<{ project: AdamProject }>(`/api/adam/${projectId}/start`, { workspaceId });
  await refreshAdam(workspaceId, projectId);
  return r.project;
}

export async function pauseAdamProject(workspaceId: string, projectId: string) {
  const r = await post<{ project: AdamProject }>(`/api/adam/${projectId}/pause`, { workspaceId });
  await refreshAdam(workspaceId, projectId);
  return r.project;
}

export async function passGate(workspaceId: string, projectId: string, gate: Gate, extra: Record<string, unknown> = {}) {
  const r = await post<Record<string, unknown>>(`/api/adam/${projectId}/gate`, { workspaceId, gate, ...extra });
  await refreshAdam(workspaceId, projectId);
  return r;
}

export async function enqueueAdamJob(workspaceId: string, projectId: string, kind: JobKind, subject?: string, payload?: Record<string, unknown>, force = false) {
  const r = await post<{ job: { id: string; created: boolean } }>(`/api/adam/${projectId}/jobs`, { workspaceId, kind, subject, payload, force });
  await refreshAdam(workspaceId, projectId);
  return r.job;
}

export async function editQuestion(workspaceId: string, projectId: string, patch: Partial<QuestionPage>) {
  const r = await post<{ page: QuestionPage }>(`/api/adam/${projectId}/question`, { workspaceId, ...patch }, "PATCH");
  await refreshAdam(workspaceId, projectId);
  return r.page;
}

export async function sendQuestionBack(workspaceId: string, projectId: string, note: string) {
  await post(`/api/adam/${projectId}/question`, { workspaceId, note });
  await refreshAdam(workspaceId, projectId);
}
