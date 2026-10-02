import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, MessageCircleHeart, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSearchParams } from "react-router";
import rehypeSanitize from "rehype-sanitize";
import { toast } from "sonner";

import { ErrorState } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlays";
import { ApiError, errorMessage } from "@/lib/api/client";
import { keys, streamCoachReply, useClearThread, useCoachThread } from "@/lib/api/queries";
import type { ChatMessage } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useTitle } from "@/lib/useTitle";

const SUGGESTIONS = [
  "What should I have for dinner tonight?",
  "Am I getting enough protein this week?",
  "Give me a quick vegetarian lunch idea",
  "How can I cut down on evening snacking?",
];

function Bubble({
  role,
  text,
  streaming,
}: {
  role: "user" | "model";
  text: string;
  streaming?: boolean;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 whitespace-pre-wrap text-primary-fg">
          {text}
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-secondary-soft text-secondary"
      >
        <MessageCircleHeart className="size-4" />
      </span>
      <div
        className={cn(
          "prose-chat max-w-[85%] min-w-0 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-soft",
          streaming &&
            "after:ml-0.5 after:inline-block after:h-4 after:w-1.5 after:animate-pulse after:rounded-sm after:bg-ink-subtle after:align-middle",
        )}
      >
        {text ? (
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
        ) : (
          <span className="text-ink-muted">Thinking…</span>
        )}
      </div>
    </div>
  );
}

export default function CoachPage() {
  useTitle("Coach");
  const { user } = useAuth();
  const qc = useQueryClient();
  const thread = useCoachThread();
  const clear = useClearThread();
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<{ question: string; reply: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentAsk = useRef(false);

  const messages: ChatMessage[] = thread.data ?? [];
  const busy = pending !== null;

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;
      setInput("");
      setPending({ question, reply: "" });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamCoachReply(
          question,
          (delta) => setPending((p) => (p ? { ...p, reply: p.reply + delta } : p)),
          controller.signal,
        );
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          toast.error("The coach couldn't reply", { description: errorMessage(err) });
          setInput(question);
        }
      } finally {
        abortRef.current = null;
        await qc.invalidateQueries({ queryKey: keys.thread });
        setPending(null);
      }
    },
    [busy, qc],
  );

  // A question handed over from another screen (?ask=…) is sent once.
  useEffect(() => {
    const ask = params.get("ask");
    if (ask && thread.isSuccess && !sentAsk.current) {
      sentAsk.current = true;
      setParams({}, { replace: true });
      void send(ask);
    }
  }, [params, setParams, send, thread.isSuccess]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending?.reply]);

  const unavailable = thread.error instanceof ApiError && thread.error.code === "coach_unavailable";
  const firstName = user?.displayName?.split(" ")[0];

  return (
    <div className="container-app flex h-[calc(100dvh-11.5rem)] max-w-3xl flex-col lg:h-[calc(100dvh-4rem)]">
      <header className="flex items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="text-[2rem] leading-tight font-semibold">Nutri</h1>
          <p className="text-sm text-ink-muted">
            Your coach. Knows your goals and what you've logged.
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} disabled={busy}>
            <RotateCcw /> Start over
          </Button>
        )}
      </header>

      <div className="-mx-1 flex-1 overflow-y-auto px-1" aria-live="polite" aria-busy={busy}>
        {thread.isPending ? (
          <div className="grid gap-4">
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
          </div>
        ) : unavailable ? (
          <ErrorState message="The coach isn't switched on for this server yet. Everything else works as usual." />
        ) : thread.isError ? (
          <ErrorState message={errorMessage(thread.error)} onRetry={() => void thread.refetch()} />
        ) : messages.length === 0 && !pending ? (
          <div className="grid gap-6 py-6">
            <Bubble
              role="model"
              text={`Hi${firstName ? ` ${firstName}` : ""}! I'm Nutri. Ask me about meals, portions or your progress — I can see your targets and what you've logged this week.`}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm shadow-soft transition-colors hover:border-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            {messages.map((m) => (
              <Bubble key={m.id} role={m.role} text={m.text} />
            ))}
            {pending && (
              <>
                <Bubble role="user" text={pending.question} />
                <Bubble role="model" text={pending.reply} streaming />
              </>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-3 flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-2 shadow-soft focus-within:border-primary"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="coach-input" className="sr-only">
          Message Nutri
        </label>
        <textarea
          id="coach-input"
          rows={1}
          value={input}
          maxLength={2000}
          disabled={unavailable}
          placeholder="Ask Nutri anything…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[0.95rem] outline-none placeholder:text-ink-subtle"
        />
        {busy ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Stop"
            onClick={() => abortRef.current?.abort()}
          >
            <Square />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={!input.trim() || unavailable}
          >
            <ArrowUp />
          </Button>
        )}
      </form>
      <p className="mt-2 text-center text-xs text-ink-subtle">
        Nutri gives general guidance, not medical advice.
      </p>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent
          title="Start a new conversation?"
          description="This clears your chat history with Nutri. Your diary stays as it is."
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                clear.mutate();
                setConfirmClear(false);
              }}
            >
              Clear chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
