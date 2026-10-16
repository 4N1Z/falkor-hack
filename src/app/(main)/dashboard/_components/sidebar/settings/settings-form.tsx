"use client";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  addCollaborators,
  deleteWorkspace,
  removeCollaborators,
  updateWorkspace,
} from "@/db/actions/action-workspace";
import { getCollaborators } from "@/db/actions/get-user-subscription";
import { User } from "@/db/database.types";
import { useAppState } from "@/lib/providers/state-providers";
import { useUser } from "@/lib/providers/user-provider";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import {
  Briefcase,
  Check,
  CreditCard,
  ExternalLink,
  ImageUp,
  Loader2,
  Lock,
  LogOut,
  Share2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { v4 } from "uuid";
import CollaboratorSearch from "../collaborator-search";

type Section = "workspace" | "members" | "account" | "plan";

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "workspace", label: "Workspace", icon: Briefcase },
  { id: "members", label: "Members", icon: Users },
  { id: "account", label: "Account", icon: UserRound },
  { id: "plan", label: "Plan & billing", icon: CreditCard },
];

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";

const initials = (email?: string | null) => (email ? email.slice(0, 2).toUpperCase() : "?");

/* ------------------------------------------------------------------ layout pieces */

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** One setting: label + hint on the left, control on the right (stacks on mobile). */
function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 py-5 first:pt-0 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="sm:w-56 sm:shrink-0">
        <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
        </Label>
        {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Initials({ email, image, size = 36 }: { email?: string | null; image?: string | null; size?: number }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-50 text-xs font-medium text-primary ring-1 ring-sky-100"
      style={{ width: size, height: size }}
    >
      {image ? <Image src={image} alt="" fill sizes={`${size}px`} className="object-cover" /> : initials(email)}
    </div>
  );
}

/* ------------------------------------------------------------------ main */

export default function SettingsForm() {
  const [section, setSection] = useState<Section>("workspace");

  return (
    <Tabs
      value={section}
      onValueChange={(v) => setSection(v as Section)}
      orientation="vertical"
      className="flex h-full min-h-0 w-full flex-col sm:flex-row"
    >
      {/* Section nav */}
      <aside className="shrink-0 border-b border-border/60 bg-[#FBFBFA] px-3 pb-3 pt-5 sm:w-60 sm:border-b-0 sm:border-r sm:px-3 sm:pt-6">
        <div className="mb-4 px-2.5">
          <DialogTitle className="text-base font-semibold">Settings</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">Workspace, members and your account.</DialogDescription>
        </div>
        <TabsList className="flex h-auto w-full flex-row items-stretch justify-start gap-0.5 overflow-x-auto bg-transparent p-0 sm:flex-col">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className={cn(
                "justify-start gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-normal text-muted-foreground",
                "transition-colors duration-150 hover:bg-black/[0.03] hover:text-foreground",
                "data-[state=active]:bg-white data-[state=active]:font-medium data-[state=active]:text-foreground",
                "data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.06)] data-[state=active]:ring-1 data-[state=active]:ring-black/[0.04]"
              )}
            >
              <Icon size={16} />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </aside>

      {/* Content */}
      <div className="min-h-0 flex-1">
        <TabsContent value="workspace" className="mt-0 h-full overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          <WorkspaceSection />
        </TabsContent>
        <TabsContent value="members" className="mt-0 h-full overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          <MembersSection />
        </TabsContent>
        <TabsContent value="account" className="mt-0 h-full overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          <AccountSection />
        </TabsContent>
        <TabsContent value="plan" className="mt-0 h-full overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
          <PlanSection />
        </TabsContent>
      </div>
    </Tabs>
  );
}

/* ------------------------------------------------------------------ workspace */

function WorkspaceSection() {
  const router = useRouter();
  const supabase = createClient();
  const { state, workspaceId, dispatch } = useAppState();
  const current = state.workspaces.find((ws) => ws.id === workspaceId);

  const [name, setName] = useState(current?.title ?? "");
  const [savingName, setSavingName] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Workspaces load after the dialog can open; fill the field once they arrive
  const loadedTitle = current?.title;
  const [syncedTitle, setSyncedTitle] = useState(loadedTitle);
  if (loadedTitle !== syncedTitle) {
    setSyncedTitle(loadedTitle);
    setName(loadedTitle ?? "");
  }

  const nameChanged = !!current && name.trim().length > 0 && name.trim() !== current.title;

  const saveName = async () => {
    if (!workspaceId || !nameChanged) return;
    setSavingName(true);
    const title = name.trim();
    const res = await updateWorkspace({ title }, workspaceId);
    setSavingName(false);
    if (res?.error) {
      toast.error("Could not rename the workspace");
      return;
    }
    dispatch({ type: "UPDATE_WORKSPACE", payload: { workspace: { title }, workspaceId } });
    toast.success("Workspace renamed");
  };

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!workspaceId || !file) return;
    setUploadingLogo(true);
    try {
      const { data, error } = await supabase.storage
        .from("workspace")
        .upload(`workspace.${v4()}`, file, { cacheControl: "3600", upsert: true });
      if (error || !data) throw error ?? new Error("Upload failed");
      const res = await updateWorkspace({ logo: data.path }, workspaceId);
      if (res?.error) throw new Error(res.error);
      dispatch({ type: "UPDATE_WORKSPACE", payload: { workspace: { logo: data.path }, workspaceId } });
      toast.success("Logo updated");
    } catch {
      toast.error("Could not upload the logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const doDelete = async () => {
    if (!workspaceId) return;
    setDeleting(true);
    await deleteWorkspace(workspaceId);
    dispatch({ type: "DELETE_WORKSPACE", payload: workspaceId });
    toast("Workspace deleted");
    router.replace("/dashboard");
  };

  const logoUrl = current?.logo ? supabase.storage.from("workspace").getPublicUrl(current.logo).data.publicUrl : null;

  return (
    <>
      <SectionHeader title="Workspace" description="How this workspace appears to you and your collaborators." />

      <Row label="Name" hint="Shown in the sidebar and the workspace switcher." htmlFor="workspace-name">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <Input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={!nameChanged || savingName} className={cn("h-9 min-w-[72px]", press)}>
            {savingName ? <Loader2 className="size-4 animate-spin" /> : "Save"}
          </Button>
        </form>
      </Row>

      <Row label="Logo" hint="Square image, at least 128×128.">
        <div className="flex items-center gap-4">
          <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-[#FBFBFA] text-2xl">
            {logoUrl ? <Image src={logoUrl} alt="" fill sizes="56px" className="object-cover" /> : current?.iconId}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploadingLogo}
            onClick={() => fileRef.current?.click()}
            className={cn("h-9 gap-1.5", press)}
          >
            {uploadingLogo ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
            {uploadingLogo ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
          </Button>
        </div>
      </Row>

      {/* Danger zone */}
      <div className="mt-10 rounded-lg border border-red-200 bg-red-50/40 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-red-800">Delete workspace</p>
            <p className="mt-1 text-xs leading-relaxed text-red-700/80">
              Permanently deletes every folder, file and paper in this workspace. This can&apos;t be undone.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDeleteText("");
              setConfirmDelete(true);
            }}
            className={cn("h-9 shrink-0 border-red-300 bg-white text-red-700 hover:bg-red-50 hover:text-red-800", press)}
          >
            Delete workspace
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{current?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything in this workspace is deleted for you and every collaborator. Type the workspace name to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder={current?.title}
            className="h-9"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteText.trim() !== current?.title || deleting}
              onClick={(e) => {
                e.preventDefault();
                doDelete();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : "Delete workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------------ members */

function MembersSection() {
  const router = useRouter();
  const { workspaceId } = useAppState();
  const [visibility, setVisibility] = useState<"private" | "shared">("private");
  const [collaborators, setCollaborators] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmPrivate, setConfirmPrivate] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    getCollaborators(workspaceId).then((list) => {
      if (!alive) return;
      setCollaborators(list);
      if (list.length) setVisibility("shared");
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const choose = (v: "private" | "shared") => {
    if (v === visibility) return;
    if (v === "private" && collaborators.length) setConfirmPrivate(true);
    else setVisibility(v);
  };

  const makePrivate = async () => {
    if (!workspaceId) return;
    if (collaborators.length) await removeCollaborators(collaborators, workspaceId);
    setCollaborators([]);
    setVisibility("private");
    setConfirmPrivate(false);
    router.refresh();
  };

  const add = async (user: User) => {
    if (!workspaceId) return;
    await addCollaborators([user], workspaceId);
    setCollaborators((list) => [...list, user]);
    toast.success(`Invited ${user.email}`);
  };

  const remove = async (user: User) => {
    if (!workspaceId) return;
    setRemoving(user.id);
    await removeCollaborators([user], workspaceId);
    setRemoving(null);
    setCollaborators((list) => list.filter((c) => c.id !== user.id));
    router.refresh();
  };

  const options = [
    { id: "private" as const, icon: Lock, title: "Private", body: "Only you can see this workspace." },
    { id: "shared" as const, icon: Share2, title: "Shared", body: "Invite collaborators to read and edit with you." },
  ];

  return (
    <>
      <SectionHeader title="Members" description="Choose who can open this workspace." />

      <div role="radiogroup" aria-label="Workspace visibility" className="grid gap-3 sm:grid-cols-2">
        {options.map(({ id, icon: Icon, title, body }) => {
          const selected = visibility === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(id)}
              className={cn(
                "relative flex items-start gap-3 rounded-lg border p-4 text-left",
                "transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.99]",
                selected ? "border-sky-300 bg-sky-50/50" : "border-border/70 hover:border-border hover:bg-black/[0.015]"
              )}
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md",
                  selected ? "bg-white text-primary ring-1 ring-sky-200" : "bg-[#F7F6F3] text-muted-foreground"
                )}
              >
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
              </div>
              {selected && <Check size={16} className="absolute right-3 top-3 text-primary" />}
            </button>
          );
        })}
      </div>

      {visibility === "shared" && (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Collaborators{" "}
              {collaborators.length > 0 && (
                <span className="tabular-nums text-muted-foreground">· {collaborators.length}</span>
              )}
            </p>
            <CollaboratorSearch existingCollaborators={collaborators} getCollaborator={add}>
              <span
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm text-background hover:bg-foreground/90",
                  press
                )}
              >
                <UserPlus className="size-4" /> Invite
              </span>
            </CollaboratorSearch>
          </div>

          <div className="rounded-lg border border-border/70">
            {loading ? (
              <div className="space-y-2 p-3">
                {[0, 1].map((i) => (
                  <div key={i} className="h-10 rounded-md bg-muted/60 animate-pulse motion-reduce:animate-none" />
                ))}
              </div>
            ) : collaborators.length ? (
              <ul className="divide-y divide-border/60">
                {collaborators.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Initials email={c.email} />
                      <span className="truncate text-sm text-foreground">{c.email}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removing === c.id}
                      onClick={() => remove(c)}
                      className={cn("h-8 shrink-0 text-muted-foreground hover:text-red-700", press)}
                    >
                      {removing === c.id ? <Loader2 className="size-4 animate-spin" /> : "Remove"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
                <Users className="size-6 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm font-medium">No collaborators yet</p>
                <p className="text-xs text-muted-foreground">Invite someone to share your papers and drafts.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={confirmPrivate} onOpenChange={setConfirmPrivate}>
        <AlertDialogContent className="font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle>Make this workspace private?</AlertDialogTitle>
            <AlertDialogDescription>
              All {collaborators.length} collaborator{collaborators.length === 1 ? "" : "s"} will lose access. You can
              invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={makePrivate}>Make private</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------------ account */

function AccountSection() {
  const { session } = useUser();
  const { dispatch } = useAppState();
  const [signingOut, setSigningOut] = useState(false);
  const user = session?.user;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      dispatch({ type: "SET_WORKSPACES", payload: { workspaces: [] } });
      await signOut({ callbackUrl: "/login" });
    } catch {
      setSigningOut(false);
      toast.error("Could not sign out. Please try again.");
    }
  };

  return (
    <>
      <SectionHeader title="Account" description="Your profile across every workspace." />

      <div className="flex items-center gap-4 rounded-lg border border-border/70 p-4">
        <Initials email={user?.email} image={user?.image} size={48} />
        <div className="min-w-0">
          {user?.name && <p className="truncate text-sm font-medium text-foreground">{user.name}</p>}
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <div className="mt-6">
        <Row label="Sign out" hint="Sign out of Neura on this device.">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={signingOut}
            onClick={handleSignOut}
            className={cn("h-9 gap-1.5", press)}
          >
            {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </Row>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ plan */

function PlanSection() {
  const { subscription } = useUser();
  const pro = subscription?.status === "active";

  return (
    <>
      <SectionHeader title="Plan & billing" description="Your current plan and what's included." />

      <div className="rounded-lg border border-border/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current plan</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-foreground">{pro ? "Pro" : "Free"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pro ? "Unlimited folders and collaborators." : "Good for getting started with a small library."}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
              pro ? "bg-[#EDF3EC] text-[#346538]" : "bg-[#F7F6F3] text-[#787774]"
            )}
          >
            {pro ? "Active" : "Free"}
          </span>
        </div>
        <div className="mt-5 border-t border-border/60 pt-4">
          <Link
            href="/"
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            View plans <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>
    </>
  );
}
