import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSession } from "@/contexts/SessionContext";
import { API_BASE_URL, getStoredSessionToken } from "@/services/sessionService";
import { workspaceDatasetAPI, workspaceTrainingAPI } from "@/services/workspaceService";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const safeJson = (value: unknown, maxLength = 14000) => {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n…context truncated`;
  } catch {
    return "Context unavailable.";
  }
};

export const DataScienceAssistant = () => {
  const { status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi — I can help interpret your current NoCodeML workspace, model results and next steps. I use derived workspace context, not raw dataset rows.",
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || isLoading || status !== "active") return;

    const token = getStoredSessionToken();
    if (!token) return;

    const userMessage: Message = { role: "user", content };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput("");
    setIsLoading(true);

    try {
      const [datasets, runs] = await Promise.all([
        workspaceDatasetAPI.list().catch(() => []),
        workspaceTrainingAPI.list().catch(() => []),
      ]);
      const latestRun = runs[0] || null;
      const systemPrompt = `You are NoCodeML's Data Science Assistant for a temporary, account-free ML workspace.

Rules:
- Never invent dataset facts, metrics, results or predictions.
- Never ask the user to paste secrets or private credentials.
- The supplied context deliberately excludes raw dataset rows. Do not claim you inspected raw records.
- Explain in plain English first, then concise technical detail.
- Prefer actionable guidance tied to the current workspace.
- Keep normal answers under 250 words unless the user asks for detail.

Temporary datasets metadata:
${safeJson(datasets.map((dataset) => ({
  name: dataset.name,
  row_count: dataset.row_count,
  column_count: dataset.column_count,
  file_size_bytes: dataset.file_size_bytes,
})))}

Latest temporary training run:
${safeJson(latestRun ? {
  dataset_name: latestRun.dataset_name,
  status: latestRun.status,
  config: latestRun.config,
  results: latestRun.results,
  best_model: latestRun.best_model,
  error: latestRun.error,
} : null)}
`;

      const response = await fetch(`${API_BASE_URL}/api/v1/assistant/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-NoCodeML-Session": token,
        },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          messages: history.slice(-20),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail;
        const message = typeof detail === "string" ? detail : detail?.message;
        throw new Error(message || "The assistant is temporarily unavailable.");
      }

      setMessages((previous) => [...previous, { role: "assistant", content: data.content || "I could not generate a response." }]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `I couldn't answer that right now. ${error instanceof Error ? error.message : "Please try again."}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        aria-label={isOpen ? "Close Data Science Assistant" : "Open Data Science Assistant"}
        onClick={() => setIsOpen((value) => !value)}
        disabled={status !== "active"}
        className="fixed bottom-5 right-5 z-50 h-12 rounded-full border border-primary/30 bg-background/90 px-4 text-foreground shadow-2xl backdrop-blur-xl hover:bg-primary/10 sm:bottom-6 sm:right-6"
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        <span className="ml-2 hidden sm:inline">AI Assistant</span>
      </Button>

      {isOpen && (
        <Card className="fixed inset-x-3 bottom-20 z-50 flex max-h-[72vh] flex-col overflow-hidden border-primary/20 bg-background/95 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-20 sm:right-6 sm:h-[620px] sm:max-h-[78vh] sm:w-[430px]">
          <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-primary-purple/10 to-primary-blue/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25"><Sparkles className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0 flex-1"><h3 className="font-semibold">Data Science Assistant</h3><p className="truncate text-xs text-muted-foreground">Derived context only · no raw rows</p></div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setIsOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Bot className="h-4 w-4 text-primary" /></div>}
                <div className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/70 bg-card/80 text-card-foreground"}`}>
                  {message.role === "assistant" ? <div className="prose prose-sm prose-invert max-w-none break-words [&_p]:my-1 [&_ul]:my-1"><ReactMarkdown>{message.content}</ReactMarkdown></div> : message.content}
                </div>
              </div>
            ))}
            {isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Thinking…</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-border/70 p-3">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }}
                placeholder="Ask about your model or next step…"
                disabled={isLoading}
                className="rounded-xl"
              />
              <Button type="button" size="icon" onClick={() => void sendMessage()} disabled={!input.trim() || isLoading} className="shrink-0 rounded-xl" aria-label="Send message">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
};

export default DataScienceAssistant;
