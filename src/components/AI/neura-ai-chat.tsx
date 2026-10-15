"use client";

import type { Message } from "ai";
import { useChat } from "ai/react";
import { useRef, useEffect, useMemo, useState } from "react";
import { Messages } from "./neura-ai-messages";
import Markdown from "react-markdown";
import {
  ResearchPaper,
  ResearchPaperLink,
} from "./blocks/research-paper-block";
import { neuraQueryLogo } from "@/lib/logos";
import {
  AlertCircle,
  Loader2,
  Mic,
  RotateCw,
  Send,
  User,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useAppState } from "@/lib/providers/state-providers";
import { formatEditorContent } from "@/utils/ai/format-editor-content";
import { VoiceRecorder } from "./voice-recorder";
import { Separator } from "../ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "../ui/tooltip";
import { isSupportedBrowser } from "@/lib/utils";
import ResearchMessage from "./blocks/research-message-block";

interface NeuraAIChatProps {
  id: string;
  initialMessages?: Message[];
  modelId?: string;
  onClose: () => void;
}

// Type for the research paper tool response
interface ResearchToolResponse {
  status: "SUCCESS" | "NO_RESULTS" | "RATE_LIMITED" | "ERROR";
  papers?: any[];
  message?: string;
}

export default function NeuraAIChat({
  id,
  initialMessages = [
    {
      id: "1",
      role: "assistant",
      content:
        "Hello! I'm Neura AI 👋, your research assistant. I'll help you understand and work with your content. What would you like to know?",
    },
  ],
  modelId,
  onClose,
}: NeuraAIChatProps) {
  const pathname = usePathname();
  const fileId = pathname.split("/")[3];
  const { state, dispatch } = useAppState();

  const chatKey = `chat_neura_ai_${fileId}`;

  const fileData = useMemo(() => {
    for (const workspace of state.workspaces) {
      for (const folder of workspace.folders) {
        const file = folder.files.find((f) => f.id === fileId);
        if (file) return file;
      }
    }
    return null;
  }, [state, fileId]);

  const formattedContent = useMemo(() => {
    if (!fileData?.data) return "";
    return formatEditorContent(fileData.data);
  }, [fileData]);

  const [previousContent, setPreviousContent] = useState("");

  // Load initial messages from session
  const savedMessages = useMemo(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(chatKey);
      return saved ? JSON.parse(saved) : initialMessages;
    }
    return initialMessages;
  }, [chatKey, initialMessages]);

  const {
    messages,
    input,
    handleSubmit,
    handleInputChange,
    isLoading,
    setMessages,
  } = useChat({
    api: "/api/neura-ai",
    initialMessages: savedMessages,
    body: {
      id,
      modelId,
    },
    maxSteps: 4,
  });
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    setIsSupported(isSupportedBrowser());
  }, []);

  // Handle content updates separately from visible messages
  // console.log("messages in", messages);
  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem(chatKey, JSON.stringify(messages));
    }
  }, [messages, chatKey]);

  useEffect(() => {
    if (formattedContent !== previousContent) {
      setPreviousContent(formattedContent);
      // Add system message without showing it in the UI
      const updatedMessages = [
        {
          id: "system_content",
          role: "system" as const,
          content: `Current content:\n${formattedContent}`,
        },
        ...messages.filter((m) => m.role !== "system"),
      ] as Message[];
      setMessages(updatedMessages);
    }
  }, [formattedContent, setMessages, messages]);
  //   unmounting
  useEffect(() => {
    return () => {
      // Only clean up if we're actually unmounting
      // and there are no messages
      if (messages.length === 0) {
        const currentMessages = sessionStorage.getItem(chatKey);
        if (!currentMessages || JSON.parse(currentMessages).length === 0) {
          sessionStorage.removeItem(chatKey);
        }
      }
    };
  }, [chatKey, messages.length]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full ">
      <div className="flex justify-between items-center p-4 border-b">
        <div className="flex gap-2 items-center">
          <div className="w-6 h-6">{neuraQueryLogo}</div>
          <span className="text-lg font-semibold bg-gradient-to-r from-[#305EFF] to-[#8DC4FB] bg-clip-text text-transparent">
            Neura AI
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-primary/75 hover:text-primary bg-border border border-sky-100 rounded-sm flex items-center justify-center z-50"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages
          .filter((message) => message.role !== "system")
          .filter((message, index, array) => {
            if (message.role === "assistant" && index > 0) {
              const previousMessage = array[index - 1];
              return !previousMessage.toolInvocations?.length;
            }
            return true;
          })
          .map((message) => (
            <div
              key={message.id}
              className={`flex justify-start items-center rounded-md p-2 ${
                message.role === "user"
                  ? "bg-transparent"
                  : "bg-card border border-border"
              }`}
            >
              <div className="flex gap-2 items-center justify-start box-border">
                {message.role === "user" ? (
                  <div className="bg-card rounded-sm p-1">
                    <User size={16} className="text-primary" />
                  </div>
                ) : null}

                <div>
                  {message.role === "assistant" ? (
                    <ResearchMessage message={message} />
                  ) : (
                    <Markdown className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </Markdown>
                  )}
                </div>
              </div>
            </div>
          ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(e);
          }}
          className="flex flex-col gap-2"
        >
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about research papers..."
              className="w-full rounded-lg px-4 py-2.5 border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary pr-24"
            />
            <div className="absolute right-1 top-2 flex gap-1">
              <div className="flex gap-1">
                {isSupported && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <VoiceRecorder
                          onTranscript={(text) => {
                            handleInputChange({
                              target: { value: input + text },
                            } as React.ChangeEvent<HTMLInputElement>);
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Record voice message</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <Separator orientation="vertical" className="h-full" />

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault(); // Prevent any default behavior
                          // First update the state
                          dispatch({
                            type: "DELETE_CHAT_SESSION",
                            payload: { chatId: fileId },
                          });
                          // Then clear session storage
                          sessionStorage.removeItem(chatKey);
                          // Finally reset messages using the hook's method
                          setMessages([
                            {
                              id: "1",
                              role: "assistant",
                              content:
                                "Hello! I'm Neura AI 👋, your research assistant. I'll help you understand and work with your content. What would you like to know?",
                            },
                          ]);
                        }}
                        className="p-1.5 text-primary hover:bg-white/10 rounded-md transition-colors"
                      >
                        <RotateCw size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Reset conversation</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="p-1.5 bg-gradient-to-r from-primary to-blue-500 px-2 text-white rounded-md transition-colors disabled:opacity-50"
                    >
                      {isLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Send message</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
