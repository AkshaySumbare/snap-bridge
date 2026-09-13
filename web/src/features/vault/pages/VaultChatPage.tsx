import { useEffect, useRef, useState } from "react";
import {
  Bot,
  FileText,
  Globe,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAskVault, useFolders } from "../hooks/useVault";
import type { ChatMessage, SemanticSearchResult } from "../types/vault.types";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

function SourceCard({ source, index }: { source: SemanticSearchResult; index: number }) {
  return (
    <a
      href={source.secureUrl}
      target="_blank"
      rel="noreferrer"
      className="flex gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
        {index}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-[var(--color-text)]">
          {source.documentTitle}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-muted)]">
          {source.chunkText}
        </p>
      </div>
      <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
    </a>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={cn("max-w-[85%] space-y-3", isUser && "order-first")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-brand-600 text-white"
              : "bg-[var(--color-surface-muted)] text-[var(--color-text)]",
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--color-text-muted)]">Sources</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {message.sources.map((s, i) => (
                <SourceCard key={`${s.documentId}-${s.chunkIndex}`} source={s} index={i + 1} />
              ))}
            </div>
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-muted)]">
          <User className="h-4 w-4 text-[var(--color-text-muted)]" />
        </div>
      )}
    </div>
  );
}

export function VaultChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<"universal" | "folder">("universal");
  const [folderId, setFolderId] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: folders } = useFolders();
  const ask = useAskVault();

  const error = ask.error instanceof ApiError ? ask.error.message : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, ask.isPending]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const query = input.trim();
    if (!query || ask.isPending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    ask.mutate(
      {
        query,
        folderId: scope === "folder" && folderId ? folderId : undefined,
        generateAnswer: true,
        limit: 8,
      },
      {
        onSuccess: (data) => {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              data.answer ??
              (data.results.length > 0
                ? `Found ${data.results.length} relevant excerpt(s) in your vault.`
                : "I couldn't find anything relevant in your documents for that question."),
            sources: data.results,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        },
        onError: (err) => {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        },
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const selectedFolder = folders?.find((f) => f.id === folderId);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header / scope */}
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-600" />
            <h1 className="text-lg font-semibold text-[var(--color-text)]">Ask Vault</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setScope("universal")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "universal"
                  ? "bg-brand-600 text-white"
                  : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              Universal
            </button>
            <button
              type="button"
              onClick={() => setScope("folder")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "folder"
                  ? "bg-brand-600 text-white"
                  : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
              )}
            >
              Folder scope
            </button>
            {scope === "folder" && (
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)]"
              >
                <option value="">Select folder…</option>
                {folders?.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        {scope === "folder" && selectedFolder && (
          <p className="mx-auto mt-2 max-w-4xl text-xs text-[var(--color-text-muted)]">
            Searching only in: <strong>{selectedFolder.name}</strong>
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <Bot className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-[var(--color-text)]">
                Ask anything about your documents
              </h2>
              <p className="mt-2 max-w-md text-sm text-[var(--color-text-muted)]">
                Semantic search across your vault. Choose universal search or limit to a specific folder.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {[
                  "Summarize my uploaded resumes",
                  "What bills did I upload?",
                  "Find interview preparation notes",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setInput(suggestion);
                      textareaRef.current?.focus();
                    }}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-text-muted)] transition-colors hover:border-brand-400 hover:text-[var(--color-text)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {ask.isPending && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl bg-[var(--color-surface-muted)] px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-500" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 sm:px-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          {error && (
            <p className="mb-2 text-center text-xs text-red-500">{error}</p>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                scope === "folder" && !folderId
                  ? "Select a folder first, or switch to Universal…"
                  : "Ask anything about your documents…"
              }
              rows={1}
              disabled={scope === "folder" && !folderId}
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-50"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || ask.isPending || (scope === "folder" && !folderId)}
              className="shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-[var(--color-text-muted)]">
            Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
