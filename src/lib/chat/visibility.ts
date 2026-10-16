"use client";

// Whether the workspace chat card is shown on the dashboard. Per browser, across workspaces.
// Read through useSyncExternalStore so the server snapshot (true) hydrates cleanly and the
// client value applies before paint, with no setState-in-effect.

import { useSyncExternalStore } from "react";

const KEY = "neura:workspace-chat";
const EVENT = "neura:workspace-chat";

export const readWorkspaceChatVisible = () => {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
};

export const setWorkspaceChatVisible = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export const useWorkspaceChatVisible = () => useSyncExternalStore(subscribe, readWorkspaceChatVisible, () => true);

// ---- popup open / closed (dashboard and graph page), per browser

const OPEN_KEY = "neura:workspace-chat:open";
const OPEN_EVENT = "neura:workspace-chat:open";

export const readChatPopupOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === "on";
  } catch {
    return false;
  }
};

export const setChatPopupOpen = (on: boolean) => {
  try {
    localStorage.setItem(OPEN_KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(OPEN_EVENT));
};

const subscribeOpen = (cb: () => void) => {
  window.addEventListener(OPEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(OPEN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export const useChatPopupOpen = () => useSyncExternalStore(subscribeOpen, readChatPopupOpen, () => false);

// ---- last-seen marker per thread (drives the unread badge in the research rail)

const seenKey = (threadId: string) => `neura:chat:seen:${threadId}`;
const SEEN_EVENT = "neura:chat:seen";

export const readSeenSeq = (threadId: string) => {
  try {
    return Number(localStorage.getItem(seenKey(threadId)) ?? 0) || 0;
  } catch {
    return 0;
  }
};

export const markSeen = (threadId: string, seq: number) => {
  if (seq <= readSeenSeq(threadId)) return;
  try {
    localStorage.setItem(seenKey(threadId), String(seq));
  } catch {}
  window.dispatchEvent(new Event(SEEN_EVENT));
};

const subscribeSeen = (cb: () => void) => {
  window.addEventListener(SEEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SEEN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export const useSeenSeq = (threadId: string) =>
  useSyncExternalStore(
    subscribeSeen,
    () => readSeenSeq(threadId),
    () => 0,
  );
