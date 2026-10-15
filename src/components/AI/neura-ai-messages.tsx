'use client';

import type { Message } from 'ai';
import { cn } from '@/lib/utils';

interface MessagesProps {
  messages: Message[];
  isLoading?: boolean;
}

export function Messages({ messages, isLoading }: MessagesProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-4 p-4">
      {messages.length === 0 ? (
        <p className="text-sm text-gray-500 text-center">
          Start a conversation with Neura AI
        </p>
      ) : (
        messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "flex w-full",
              message.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2",
                message.role === 'user' 
                  ? "bg-blue-500 text-white" 
                  : "bg-gray-100 text-gray-800"
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))
      )}
      {isLoading && (
        <div className="flex justify-start">
          <div className="bg-gray-100 rounded-2xl px-4 py-2">
            <div className="flex space-x-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
