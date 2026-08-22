import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useExperiment } from '@/contexts/ExperimentContext';
import { useEDA } from '@/hooks/useEDA';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface DataScienceAssistantProps {
  datasetId?: string;
  edaData?: any;
  currentPhase?: 'analysis' | 'config' | 'training' | 'results' | 'predict';
  experimentConfig?: any;
  trainingData?: any;
  resultsData?: any;
}

const phaseCopy = {
  analysis: 'Explore data quality, distributions and relationships.',
  config: 'Choose targets, features and models with clear reasoning.',
  training: 'Understand progress, failures and training behaviour.',
  results: 'Interpret metrics, compare models and choose the best candidate.',
  predict: 'Understand predictions, confidence and safe next steps.',
};

const truncateJson = (value: unknown, maxLength = 12000) => {
  if (value == null) return 'Not available';
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n…context truncated`;
  } catch {
    return 'Unable to serialize this context.';
  }
};

export const DataScienceAssistant = ({
  datasetId,
  edaData: propEdaData,
  currentPhase = 'analysis',
  experimentConfig,
  trainingData,
  resultsData,
}: DataScienceAssistantProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { currentExperiment } = useExperiment();
  const { edaData: hookEdaData } = useEDA(datasetId || currentExperiment?.datasetId);
  const edaData = propEdaData || hookEdaData;

  const apiBaseUrl = useMemo(() => {
    const raw = import.meta.env.VITE_API_URL?.trim();
    return raw && /^https?:\/\//i.test(raw) ? raw.replace(/\/$/, '') : 'http://localhost:8000';
  }, []);

  const systemPrompt = useMemo(() => {
    return `You are NoCodeML's Data Science Assistant. Help technical and non-technical users understand only the experiment context supplied below.

Rules:
- Never invent dataset facts, metrics, model results or predictions.
- If the supplied context is insufficient, say so clearly.
- Explain recommendations in plain English first, then add concise technical detail.
- Prefer actionable guidance over generic ML theory.
- Do not claim a model is best before results exist.
- Keep normal answers under 250 words unless the user explicitly asks for detail.

Current phase: ${currentPhase}
Phase goal: ${phaseCopy[currentPhase]}

Experiment:
${truncateJson(currentExperiment)}

Experiment configuration:
${truncateJson(experimentConfig)}

EDA:
${truncateJson(edaData)}

Training:
${truncateJson(trainingData)}

Results:
${truncateJson(resultsData)}
`;
  }, [currentExperiment, currentPhase, edaData, experimentConfig, resultsData, trainingData]);

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: `Hi — I’m your NoCodeML assistant for the **${currentPhase}** phase. ${phaseCopy[currentPhase]}`,
      },
    ]);
  }, [currentPhase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || isLoading) return;

    const userMessage: Message = { role: 'user', content };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput('');
    setIsLoading(true);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiBaseUrl}/api/v1/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          messages: history.slice(-20),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'The assistant is temporarily unavailable.');
      }

      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: data.content || 'I could not generate a response.' },
      ]);
    } catch (error: any) {
      setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content: `I couldn’t answer that right now. ${error?.message || 'Please try again.'}`,
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
        aria-label={isOpen ? 'Close Data Science Assistant' : 'Open Data Science Assistant'}
        onClick={() => setIsOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-50 h-12 rounded-full border border-primary/30 bg-background/90 px-4 text-foreground shadow-2xl backdrop-blur-xl hover:bg-primary/10 sm:bottom-6 sm:right-6"
      >
        {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        <span className="ml-2 hidden sm:inline">AI Assistant</span>
      </Button>

      {isOpen && (
        <Card className="fixed inset-x-3 bottom-20 z-50 flex max-h-[72vh] flex-col overflow-hidden border-primary/20 bg-background/95 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-20 sm:right-6 sm:h-[620px] sm:max-h-[78vh] sm:w-[430px]">
          <div className="border-b border-border/70 bg-gradient-to-r from-primary/10 via-primary-purple/10 to-primary-blue/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/25">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Data Science Assistant</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                    {currentPhase}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">Grounded in your current NoCodeML experiment</p>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setIsOpen(false)} className="sm:hidden">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'assistant' && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md border border-border/70 bg-card/80 text-card-foreground'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none break-words [&_p]:my-1 [&_ul]:my-1">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Analyzing your experiment…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-border/70 bg-card/40 p-3">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                disabled={isLoading}
                placeholder="Ask about your data, models or results…"
                className="bg-background/80"
              />
              <Button type="button" size="icon" onClick={() => void sendMessage()} disabled={!input.trim() || isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Recommendations are grounded in the experiment context shown to the assistant.
            </p>
          </div>
        </Card>
      )}
    </>
  );
};

export default DataScienceAssistant;
