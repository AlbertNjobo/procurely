import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, User, Send, Activity, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../lib/auth-context';
import { useData } from '../../lib/data-context';
import { apiFetch } from '../../lib/api';

interface ToolCall {
  name: string;
  arguments: any;
  result: string;
}

interface Message {
  role: 'user' | 'model';
  content: string;
  reasoning?: string;
  tool_calls?: ToolCall[];
  hidden?: boolean;
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

function FormToolCard({ tool, onSubmit }: { tool: any, onSubmit: (data: string, hidden: boolean) => void }) {
  const [formData, setFormData] = useState<Record<string, string>>({});

  return (
    <div className="bg-muted/30 border border-purple-100 dark:border-purple-900 rounded-lg p-4 mb-3 w-full">
      <div className="font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-purple-600" /> Additional Details Required
      </div>
      <div className="space-y-4 mb-4">
        {tool.arguments.questions?.map((q: any) => (
          <div key={q.field_id} className="space-y-1">
            <Label className="text-sm font-medium">{q.label}</Label>
            {q.type === 'select' ? (
              <Select onValueChange={(val) => setFormData(prev => ({ ...prev, [q.field_id]: val }))}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {q.options?.map((opt: string) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input 
                type={q.type === 'number' ? 'number' : 'text'}
                className="w-full bg-background"
                placeholder={`Enter ${q.label.toLowerCase()}`}
                value={formData[q.field_id] || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, [q.field_id]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>
      <Button 
        onClick={() => {
          // Format the submitted data to send back to chat
          const textResponse = Object.entries(formData)
            .map(([key, val]) => {
              const q = tool.arguments.questions.find((q: any) => q.field_id === key);
              return `${q?.label || key}: ${val}`;
            }).join(', ');
          
          if (textResponse) {
            onSubmit(`Here are the details: ${textResponse}`, true);
          }
        }} 
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        disabled={Object.keys(formData).length === 0}
      >
        Submit Details
      </Button>
    </div>
  );
}

export function AgentDialog({ 
  open, 
  onOpenChange, 
  contextType, 
  onSuccess 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  contextType: 'intake' | 'supplier';
  onSuccess: (data: any) => void;
}) {
  const { user } = useAuth();
  const { knowledgeBase } = useData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: 'model',
          content: `Hello ${user?.displayName || 'there'}! I am your AI Assistant. Describe what you'd like to ${contextType === 'intake' ? 'request' : 'add, or describe your requirements for a supplier, '} and I'll help you get started.`,
        }
      ]);
    }
  }, [open, messages.length, user, contextType]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onOpenChange(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = 'unset';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open, onOpenChange]);

  const handleSend = async (overrideInput?: string, hidden?: boolean) => {
    const textToSend = overrideInput !== undefined ? overrideInput : input;
    if (!textToSend.trim()) return;

    const userMessage = { role: 'user' as const, content: textToSend, hidden };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let systemInstruction = `You are a helpful AI assistant in a procurement platform. You help users create a new ${contextType === 'intake' ? 'Procurement Intake Request' : 'Supplier'}.
Use the 'ask_form_questions' tool to gather missing information (like department, amount, etc.) instead of asking in plain text. Present an interactive form to make it easy for the user.
You have automatic native web search capabilities! When users ask for vendors, products, prices, or external information, YOU MUST use your web search to provide real-world options. ALWAYS explicitly tell the user "I searched the web and found..." and share the real data you found.
For an intake request, you need: title, department, amount, and description.
For a supplier, you can also SUGGEST vendor profiles based on your web search (e.g., "I need a CRM for 50 people" -> suggest Salesforce, HubSpot, etc.). 
For a supplier, you need to ultimately gather: name, category, contact_email, and risk_level.
IMPORTANT: Do NOT ask the user for confirmation before creating the request. Once you have all the required information, immediately call the ${contextType === 'intake' ? 'create_intake_request' : 'create_supplier'} function. The UI will present an interactive card for the user to review and confirm.`;

    try {
      const response = await apiFetch('/api/agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{role: 'system', content: systemInstruction}, ...messages, userMessage].map(m => ({ role: m.role, parts: [{ text: m.content }] })),
          context: { knowledgeBase }
        })
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      setMessages(prev => [...prev, { role: 'model', content: '', tool_calls: [] }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const parsed = JSON.parse(line);
            
            setMessages(prev => {
              const newMessages = [...prev];
              const currentModelMessage = { ...newMessages[newMessages.length - 1] };
              const currentToolCalls = currentModelMessage.tool_calls ? [...currentModelMessage.tool_calls] : [];

              if (parsed.type === "tool_start") {
                currentToolCalls.push({
                  name: parsed.name,
                  arguments: parsed.arguments,
                  result: ""
                });
              } else if (parsed.type === "tool_result") {
                const targetTool = currentToolCalls.find(t => t.name === parsed.name && !t.result);
                if (targetTool) {
                  targetTool.result = parsed.result;
                }
              } else if (parsed.type === "reasoning_delta") {
                currentModelMessage.reasoning = (currentModelMessage.reasoning || "") + parsed.delta;
              } else if (parsed.type === "content_delta") {
                currentModelMessage.content += parsed.delta;
              } else if (parsed.type === "final") {
                if (parsed.response) {
                  currentModelMessage.content = parsed.response;
                }
                if (parsed.tool_calls && parsed.tool_calls.length > 0) {
                  currentModelMessage.tool_calls = parsed.tool_calls;
                }
              } else if (parsed.type === "error") {
                currentModelMessage.content = `**Error:** ${parsed.error}`;
              }

              currentModelMessage.tool_calls = currentToolCalls;
              newMessages[newMessages.length - 1] = currentModelMessage;
              return newMessages;
            });
          } catch (e) {
            console.error("Failed to parse stream line", e);
          }
        }
      }
    } catch (error) {
      setMessages(prev => {
        if (prev[prev.length - 1]?.role === 'model' && prev[prev.length - 1]?.content === '') {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], content: '**Error:** Failed to communicate with the agent.' };
          return newMessages;
        }
        return [...prev, { role: 'model', content: '**Error:** Failed to communicate with the agent.' }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between p-4 md:px-6 border-b">
        <div>
          <h2 className="text-xl font-bold tracking-tight">AI {contextType === 'intake' ? 'Intake' : 'Supplier'} Assistant</h2>
          <p className="text-sm text-muted-foreground">
            Chat with the AI to describe what you need, and it will build the request for you.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto relative bg-muted/10 flex flex-col min-h-0" ref={scrollRef}>
        <div className="max-w-4xl mx-auto w-full p-4 md:p-8">
          <div className="flex flex-col gap-6 pb-4">
            {messages.filter(m => !m.hidden).map((msg, idx) => {
              const isStreaming = isLoading && idx === messages.length - 1;
              return (
                <div key={idx} className={`flex gap-3 max-w-[95%] md:max-w-[85%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start w-full'}`}>
                  {msg.role === 'user' ? (
                     <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-primary text-primary-foreground hidden md:flex">
                       <User className="h-4 w-4" />
                     </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-purple-100 text-purple-600 hidden md:flex">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                    <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-white dark:bg-card border shadow-sm rounded-tl-sm w-full'}`}>
                      {!isStreaming && msg.tool_calls && msg.tool_calls.map((tool, tIdx) => {
                        if (tool.name === 'create_intake_request') {
                          return (
                            <div key={tIdx} className="bg-muted/30 border border-purple-100 dark:border-purple-900 rounded-lg p-5 mb-4 w-full">
                              <div className="font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2 mb-4">
                                <Activity className="h-5 w-5 text-purple-600" /> Draft Intake Request
                              </div>
                              <div className="grid grid-cols-[120px_1fr] gap-y-3 text-sm mb-6">
                                <span className="text-muted-foreground">Title:</span> <span className="font-medium">{tool.arguments.title}</span>
                                <span className="text-muted-foreground">Dept:</span> <span>{tool.arguments.department}</span>
                                <span className="text-muted-foreground">Amount:</span> <span>{tool.arguments.amount}</span>
                                <span className="text-muted-foreground">Description:</span> <span>{tool.arguments.description}</span>
                              </div>
                              <Button 
                                onClick={() => onSuccess(tool.arguments)} 
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                              >
                                Confirm & Submit Request
                              </Button>
                            </div>
                          );
                        }
                        
                        if (tool.name === 'create_supplier') {
                          return (
                            <div key={tIdx} className="bg-muted/30 border border-purple-100 dark:border-purple-900 rounded-lg p-5 mb-4 w-full">
                              <div className="font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2 mb-4">
                                <Activity className="h-5 w-5 text-purple-600" /> Draft Supplier Profile
                              </div>
                              <div className="grid grid-cols-[120px_1fr] gap-y-3 text-sm mb-6">
                                <span className="text-muted-foreground">Name:</span> <span className="font-medium">{tool.arguments.name}</span>
                                <span className="text-muted-foreground">Category:</span> <span>{tool.arguments.category}</span>
                                <span className="text-muted-foreground">Email:</span> <span>{tool.arguments.contact_email}</span>
                                <span className="text-muted-foreground">Risk Level:</span> 
                                <span>
                                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                    {tool.arguments.risk_level}
                                  </span>
                                </span>
                              </div>
                              <Button 
                                onClick={() => onSuccess(tool.arguments)} 
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                              >
                                Confirm & Add Supplier
                              </Button>
                            </div>
                          );
                        }

                        if (tool.name === 'suggest_vendors') {
                          return (
                            <div key={tIdx} className="mb-4 w-full space-y-4">
                              {tool.arguments.vendors?.map((vendor: any, vIdx: number) => (
                                <div key={vIdx} className="bg-white dark:bg-card border shadow-sm rounded-lg p-5 transition-all hover:border-purple-300">
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="font-semibold text-lg">{vendor.name}</div>
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                                      {vendor.category}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{vendor.description}</p>
                                  <Button 
                                    variant="outline" 
                                    className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                                    onClick={() => {
                                      handleSend(`I'd like to proceed with ${vendor.name}.`, true);
                                    }}
                                  >
                                    Select {vendor.name}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        if (tool.name === 'search_product_images') {
                          if (!tool.result) {
                            return (
                              <div key={tIdx} className="bg-muted/50 rounded-lg p-3 mb-3 text-sm font-mono flex items-center gap-2">
                                <Activity className="h-4 w-4 animate-spin text-purple-600" /> Searching product images for: {tool.arguments.query}
                              </div>
                            );
                          }
                          try {
                            const data = JSON.parse(tool.result);
                            if (data.images && data.images.length > 0) {
                              return (
                                <div key={tIdx} className="mb-4 w-full space-y-4">
                                  <div className="font-semibold text-sm text-muted-foreground flex items-center gap-2 mb-2">
                                    <Activity className="h-4 w-4 text-purple-600" /> Image Search Results
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    {data.images.map((img: any, pIdx: number) => (
                                      <div key={pIdx} className="bg-white dark:bg-card border shadow-sm rounded-lg overflow-hidden flex flex-col transition-all hover:border-purple-300">
                                        <div className="w-full h-40 bg-muted shrink-0">
                                          <img src={img.url} alt={img.title} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="p-3">
                                          <div className="font-semibold text-sm line-clamp-2">{img.title}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                          } catch(e) {}
                        }

                        if (tool.name === 'ask_form_questions') {
                          return <FormToolCard key={tIdx} tool={tool} onSubmit={handleSend} />;
                        }

                        return (
                          <div key={tIdx} className="bg-muted/50 rounded-lg p-3 mb-3 text-sm font-mono">
                            <div className="flex items-center gap-2 text-purple-600 mb-2">
                              <Activity className="h-4 w-4" /> Tool Call: {tool.name}
                            </div>
                            <div className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(tool.arguments, null, 2)}</div>
                          </div>
                        );
                      })}
                      {!isStreaming && msg.reasoning && (
                        <div className="text-muted-foreground text-sm italic mb-4 border-l-2 border-purple-300 pl-4 py-2 bg-muted/30 rounded-r-lg">
                          <ReactMarkdown>{msg.reasoning}</ReactMarkdown>
                        </div>
                      )}
                      {msg.content && (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )})}
              {isLoading && (
                 <div className="flex gap-3 max-w-[95%] md:max-w-[85%] self-start w-full">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-purple-100 text-purple-600 hidden md:flex">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="bg-white dark:bg-card border shadow-sm p-5 rounded-2xl rounded-tl-sm flex items-center gap-2">
                       <div className="w-2 h-2 bg-purple-500/50 rounded-full animate-bounce" />
                       <div className="w-2 h-2 bg-purple-500/50 rounded-full animate-bounce [animation-delay:-.3s]" />
                       <div className="w-2 h-2 bg-purple-500/50 rounded-full animate-bounce [animation-delay:-.5s]" />
                    </div>
                 </div>
              )}
            </div>
          </div>
      </div>

      <div className="p-4 border-t bg-background">
        <form 
          className="flex w-full max-w-4xl mx-auto gap-3 relative"
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        >
          <Input 
            placeholder="Describe what you need..." 
            value={input}
            onChange={e => setInput(e.target.value)}
            className="flex-1 rounded-full bg-muted/30 h-12 px-5 text-base shadow-sm border-muted-foreground/20 focus-visible:ring-purple-500"
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim()}
            size="icon"
            className="rounded-full h-12 w-12 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
