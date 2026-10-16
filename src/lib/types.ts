import { NextApiResponse } from "next";
import { Socket, Server as NetServer } from "net";
import { Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import type { Message } from 'ai'

export const FormSchema = z.object({
  email: z.string().describe("Email").email({ message: "Invalid Email" }),
  password: z.string().describe("Password").min(1, "password is required"),
});

export const WorkspaceFormSchema = z.object({
  workspaceName: z
    .string()
    .describe("Workspace Name")
    .min(1, "workspace name must be 1 character"),
  logo: z.any(),
});

export const UploadBannerSchema = z.object({
  banner: z.string().describe("Banner Image"),
});

export type VisibilityType = 'private' | 'public'

export interface Chat {
  id: string
  userId: string
  visibility: VisibilityType
  createdAt: Date
  updatedAt: Date
}

export interface DBMessage {
  id: string
  chatId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export type NextAPIResponseServerIO = NextApiResponse & {
  socket: Socket & {
    server: NetServer & {
      io: SocketIOServer;
    };
  };
};


export type LoadingKeys = 'files' | 'workspace' | 'folders' | 'collaboration';


// Centralize type definitions
export interface ResearchSummary {
  summary: string
  updatedAt: number
}

// Configuration as a constant outside the component
export const RESEARCH_CONFIG = {
  fields: [
    'machine learning', 
    'artificial intelligence', 
    'computer science',
    'data science',
    'robotics'
  ],
  refreshIntervalDays: 4
}

export interface StepProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  NavigationButtons: React.ReactNode;
}


export interface OnboardingDetails {
  version: string;
  completed_at: string;
  details: {
    name: string;
    university: string;
    designation: string;
    research_areas: string[];
  };
}

export interface UserContext {
  name: string;
  university: string;
  designation: string;
  researchAreas: string;
}



export interface Author {
  authorId: string;
  name: string;
}

export interface ExternalIds {
  DOI?: string;
  ArXiv?: string;
  DBLP?: string;
  CorpusId?: number;
}

