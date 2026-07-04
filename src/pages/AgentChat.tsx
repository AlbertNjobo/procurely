import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Bot, User, Send, FileText, CheckCircle, Paperclip, Table as TableIcon, Activity, UserPlus, Upload, ChevronDown, ChevronUp, AlertCircle, Loader2, Mic, Square, ListChecks } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '../lib/auth-context';
import { useData } from '../lib/data-context';
import ReactMarkdown from 'react-markdown';
import init, { LiteParse } from '@llamaindex/liteparse-wasm';
import { toast } from 'sonner';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BidMatrixCard } from '../components/agent/BidMatrixCard';
import { SupplierFormCard } from '../components/agent/SupplierFormCard';
import { ProcessTimelineCard } from '../components/agent/ProcessTimelineCard';
import { ItemDetailsCard } from '../components/agent/ItemDetailsCard';
import { UploadPromptCard } from '../components/agent/UploadPromptCard';
import { SelectedSupplierCard } from '../components/agent/SelectedSupplierCard';
import { ImpactAnalysisCard } from '../components/agent/ImpactAnalysisCard';

type MessageType = 'text' | 'bid-matrix' | 'supplier-form' | 'process-timeline' | 'item-details' | 'upload-prompt' | 'selected-supplier' | 'impact-analysis' | 'approval' | 'qualification-questions' | 'intake-confirmation';

interface ToolCall {
  name: string;
  arguments: any;
  result: string;
}

interface Message {
  role: 'user' | 'model';
  content: string;
  type?: MessageType;
  tool_calls?: ToolCall[];
  qualificationData?: any[];
}

function QualificationQuestions({ questions, onSelect }: { questions: any[], onSelect: (text: string) => void }) {
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});

  const handleSelect = (questionId: string, value: string) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleCustomSubmit = (questionId: string) => {
    const customValue = customInputs[questionId];
    if (customValue?.trim()) {
      setSelectedAnswers(prev => ({ ...prev, [questionId]: customValue.trim() }));
    }
  };

  const allAnswered = questions.every(q => selectedAnswers[q.question_id]);

  const handleSubmitAll = () => {
    const answers = questions.map(q => {
      const answer = selectedAnswers[q.question_id];
      return `${q.question_text}: ${answer}`;
    }).join('\n');
    onSelect(answers);
  };

  return (
    <div className="mb-4 mt-2 space-y-4">
      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-blue-600" />
        Quick Select Your Preferences
      </h4>
      {questions.map((q) => (
        <div key={q.question_id} className="bg-white dark:bg-card border rounded-xl p-4 space-y-3">
          <p className="font-medium text-sm">{q.question_text}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt: any, i: number) => (
              <button
                key={i}
                onClick={() => handleSelect(q.question_id, opt.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  selectedAnswers[q.question_id] === opt.value
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-background hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border-border'
                }`}
              >
                {opt.icon && <span>{opt.icon}</span>}
                {opt.label}
              </button>
            ))}
          </div>
          {q.allow_custom && selectedAnswers[q.question_id] && !q.options.find((o: any) => o.value === selectedAnswers[q.question_id]) && (
            <div className="text-sm text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
              Custom: {selectedAnswers[q.question_id]}
            </div>
          )}
          {q.allow_custom && (
            <div className="flex gap-2">
              <input
                type="text"
                value={customInputs[q.question_id] || ''}
                onChange={(e) => setCustomInputs(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customInputs[q.question_id]?.trim()) {
                    handleCustomSubmit(q.question_id);
                  }
                }}
                placeholder={q.custom_placeholder || "Type your own answer..."}
                className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => handleCustomSubmit(q.question_id)}
                disabled={!customInputs[q.question_id]?.trim()}
                className="text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-50 transition-colors"
              >
                Set
              </button>
            </div>
          )}
        </div>
      ))}
      {allAnswered && (
        <button
          onClick={handleSubmitAll}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          Confirm Selections & Continue
        </button>
      )}
    </div>
  );
}

function SuggestedItemsGrid({ items, onSelect }: { items: any[], onSelect: (text: string) => void }) {
  const [selectedItems, setSelectedItems] = useState<any[]>([]);

  const toggleSelect = (item: any) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.name === item.name);
      if (exists) return prev.filter(i => i.name !== item.name);
      return [...prev, item];
    });
  };

  return (
    <div className="mb-4 mt-2">
      <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-purple-600" /> 
        Suggested Options
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item: any, iIdx: number) => {
          const isSelected = selectedItems.find(i => i.name === item.name);
          return (
            <div 
              key={iIdx} 
              className={`bg-white dark:bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col group ${isSelected ? 'ring-2 ring-purple-500 border-purple-500' : 'hover:border-purple-300'}`}
              onClick={() => toggleSelect(item)}
            >
              <div className="h-32 bg-muted relative overflow-hidden">
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-purple-600 text-white p-1 rounded-full shadow-md z-10">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="p-3 flex flex-col flex-1">
                <h5 className="font-semibold text-sm line-clamp-1 mb-1 pr-6">{item.name}</h5>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.description}</p>
                {item.badges && item.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {item.badges.map((badge: any, bIdx: number) => (
                      <Badge key={bIdx} variant={badge.variant as any || "secondary"} className="text-[10px] px-1.5 py-0">
                        {badge.text}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="mt-auto flex items-center justify-between">
                  <span className="font-medium text-sm text-foreground">{item.estimated_price}</span>
                  <Button 
                    variant={isSelected ? "secondary" : "outline"} 
                    size="sm" 
                    className={isSelected ? "bg-purple-100 text-purple-700 hover:bg-purple-200" : "group-hover:bg-purple-50 group-hover:text-purple-700 group-hover:border-purple-200"}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (selectedItems.length === 0) {
                        onSelect(`I want to select ${item.name}`); 
                      } else {
                        toggleSelect(item);
                      }
                    }}
                  >
                    {isSelected ? 'Selected' : 'Select'}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedItems.length > 1 && (
        <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 rounded-xl overflow-hidden mt-6 animate-in fade-in slide-in-from-bottom-4">
           <div className="bg-purple-100 dark:bg-purple-900/40 p-3 border-b border-purple-200 dark:border-purple-900 flex justify-between items-center">
             <h5 className="font-medium text-purple-900 dark:text-purple-100 flex items-center gap-2">
               <TableIcon className="h-4 w-4" /> Side-by-Side Comparison
             </h5>
             <Button size="sm" onClick={() => onSelect(`I want to select these options for review: ${selectedItems.map(i => i.name).join(', ')}`)}>
                Proceed with Selected
             </Button>
           </div>
           <div className="p-0 overflow-x-auto">
             <table className="w-full text-sm">
               <thead>
                 <tr className="bg-white/50 dark:bg-black/20 border-b border-purple-100 dark:border-purple-900/50">
                    <th className="p-3 text-left font-medium w-1/4">Feature</th>
                    {selectedItems.map((item, idx) => (
                      <th key={idx} className="p-3 text-left font-medium w-1/3 border-l border-purple-100 dark:border-purple-900/50">
                        <div className="flex items-center gap-2">
                          <img src={item.image_url} className="w-8 h-8 rounded object-cover" />
                          <span className="line-clamp-1">{item.name}</span>
                        </div>
                      </th>
                    ))}
                 </tr>
               </thead>
               <tbody className="divide-y divide-purple-100 dark:divide-purple-900/50">
                 <tr className="bg-white/30 dark:bg-black/10 hover:bg-white/50">
                   <td className="p-3 font-medium text-muted-foreground">Price</td>
                   {selectedItems.map((item, idx) => (
                     <td key={idx} className="p-3 border-l border-purple-100 dark:border-purple-900/50 font-medium">
                       {item.estimated_price}
                     </td>
                   ))}
                 </tr>
                 <tr className="bg-white/30 dark:bg-black/10 hover:bg-white/50">
                   <td className="p-3 font-medium text-muted-foreground">Description</td>
                   {selectedItems.map((item, idx) => (
                     <td key={idx} className="p-3 border-l border-purple-100 dark:border-purple-900/50 text-xs text-muted-foreground">
                       {item.description}
                     </td>
                   ))}
                 </tr>
               </tbody>
             </table>
           </div>
        </div>
      )}
    </div>
  );
}

function GuidedWizard({ questions, onComplete }: { questions: any[], onComplete: (data: Record<string, any>) => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentValue, setCurrentValue] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  const question = questions[currentStep];

  const handleNext = () => {
    const newAnswers = { ...answers, [question.field_id]: currentValue };
    setAnswers(newAnswers);
    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
      setCurrentValue("");
    } else {
      setIsComplete(true);
      onComplete(newAnswers);
    }
  };

  if (isComplete) {
    return (
      <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-xl p-4 mt-4 flex items-center gap-3">
        <CheckCircle className="h-5 w-5 text-purple-600" />
        <div>
          <h4 className="font-medium text-purple-900 dark:text-purple-100">Intake Form Completed</h4>
          <p className="text-xs text-muted-foreground">Information submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card border rounded-xl overflow-hidden shadow-sm mt-4">
      <div className="bg-purple-50 dark:bg-purple-950/20 p-4 border-b border-purple-100 dark:border-purple-900/50">
        <h4 className="font-semibold text-purple-900 dark:text-purple-100 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Intake Form Wizard
        </h4>
        <div className="mt-2 text-xs text-muted-foreground">
          Step {currentStep + 1} of {questions.length}
        </div>
        <div className="w-full bg-purple-200 dark:bg-purple-900/50 h-1 mt-2 rounded-full overflow-hidden">
          <div 
            className="bg-purple-600 h-full transition-all duration-300 ease-in-out" 
            style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div className="font-medium text-foreground">
          {question.label}
        </div>
        
        {question.type === 'select' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {question.options?.map((opt: string, idx: number) => (
              <Button
                key={idx}
                variant={currentValue === opt ? "default" : "outline"}
                className={currentValue === opt ? "bg-purple-600 hover:bg-purple-700" : "hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"}
                onClick={() => setCurrentValue(opt)}
              >
                {opt}
              </Button>
            ))}
          </div>
        ) : (
          <Input 
            type={question.type === 'number' ? 'number' : 'text'}
            value={currentValue}
            onChange={(e) => setCurrentValue(e.target.value)}
            placeholder="Type your answer here..."
            className="w-full"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && currentValue.trim()) {
                handleNext();
              }
            }}
          />
        )}

        <div className="flex justify-between pt-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              if (currentStep > 0) {
                setCurrentStep(currentStep - 1);
                setCurrentValue(answers[questions[currentStep - 1].field_id] || "");
              }
            }}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          <Button 
            onClick={handleNext} 
            disabled={!currentValue.trim() && question.type !== 'select'}
          >
            {currentStep < questions.length - 1 ? 'Next' : 'Submit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const isPending = !tool.result;

  return (
    <div className="bg-muted/30 border border-purple-200/50 rounded-lg p-3 my-2 font-mono text-xs overflow-hidden">
      <div className="flex items-center gap-2 mb-2 text-purple-700">
        <Activity className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
        <span className="font-semibold">Tool Call: {tool.name}</span>
        {isPending && (
          <span className="ml-auto flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
          </span>
        )}
      </div>
      <div className="grid gap-2">
        <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
          <span className="text-muted-foreground block mb-1">Arguments:</span>
          <pre className="whitespace-pre-wrap break-words">{JSON.stringify(tool.arguments, null, 2)}</pre>
        </div>
        <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
          <span className="text-muted-foreground block mb-1">Result:</span>
          {isPending ? (
            <div className="flex items-center gap-2 text-muted-foreground italic min-h-[1.25rem]">
              <span className="inline-flex gap-1">
                <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-bounce" />
                <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-.3s]" />
                <span className="w-1 h-1 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-.5s]" />
              </span>
              Awaiting response from Qwen environment...
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words">{tool.result}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpandableBotMessage({ msg, renderCard, isStreaming, onSelect }: { msg: Message, renderCard: (msg: Message) => React.ReactNode, isStreaming: boolean, onSelect: (text: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const getTitle = (type?: MessageType) => {
    switch (type) {
      case 'bid-matrix': return 'Bid Matrix Analysis';
      case 'supplier-form': return 'Supplier Onboarding Details';
      case 'process-timeline': return 'Process Workflow Timeline';
      case 'item-details': return 'Service Description & Deliverables';
      case 'upload-prompt': return 'Document Upload Status';
      case 'selected-supplier': return 'Supplier Selection Confirmed';
      case 'impact-analysis': return 'Supplier Impact Analysis';
      case 'approval': return 'Approval Required';
      case 'qualification-questions': return 'Select Your Preferences';
      default: return isStreaming ? 'Generating...' : 'Agent Response';
    }
  };

  const isInteractive = msg.type && msg.type !== 'text';

  return (
    <div className="bg-white dark:bg-card border shadow-sm rounded-2xl w-full overflow-hidden rounded-tl-sm">
      <div 
        className={`px-4 py-3 flex justify-between items-center transition-colors ${isInteractive ? 'cursor-pointer hover:bg-muted/30' : ''} ${isExpanded ? 'border-b bg-muted/10' : 'bg-muted/10'}`}
        onClick={() => { if (isInteractive) setIsExpanded(!isExpanded); }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4" />
          </div>
          <span className="font-medium text-sm text-foreground">
            {getTitle(msg.type)}
          </span>
        </div>
        {isInteractive && (
          <button className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
      
      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="p-4">
            {msg.tool_calls && msg.tool_calls.length > 0 && (
              <div className="mb-4 space-y-2">
                {msg.tool_calls.map((tool, idx) => {
                  if (tool.name === 'suggest_procurement_items' && tool.result) {
                    try {
                      const data = JSON.parse(tool.result);
                      if (data.items && data.items.length > 0) {
                        return <SuggestedItemsGrid key={idx} items={data.items} onSelect={onSelect} />;
                      }
                    } catch (e) {}
                  }

                  if (tool.name === 'ask_form_questions' && tool.arguments?.questions) {
                    return (
                      <GuidedWizard 
                        key={idx} 
                        questions={tool.arguments.questions} 
                        onComplete={(data) => {
                          onSelect("Form submitted: \n" + Object.entries(data).map(([k, v]) => `- ${k}: ${v}`).join("\n"));
                        }} 
                      />
                    );
                  }

                  if (tool.name === 'search_product_images' && tool.result) {
                    try {
                      const data = JSON.parse(tool.result);
                      if (data.images && data.images.length > 0) {
                        return (
                          <div key={idx} className="mb-4 mt-2">
                            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                              <Activity className="h-4 w-4 text-purple-600" /> 
                              Suggested Options
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {data.images.map((img: any, iIdx: number) => (
                                <div key={iIdx} className="bg-white dark:bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-purple-300 transition-all cursor-pointer flex flex-col group" onClick={() => onSelect(`I want to select ${img.title}`)}>
                                  <div className="h-32 bg-muted relative overflow-hidden">
                                    <img src={img.url} alt={img.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                  </div>
                                  <div className="p-3 flex flex-col flex-1">
                                    <h5 className="font-semibold text-sm line-clamp-2 mb-3">{img.title}</h5>
                                    <div className="mt-auto">
                                      <Button variant="outline" size="sm" className="w-full group-hover:bg-purple-50 group-hover:text-purple-700 group-hover:border-purple-200" onClick={(e) => { e.stopPropagation(); onSelect(`I want to select ${img.title}`); }}>
                                        Select Option
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                    } catch (e) {}
                  }

                  if (tool.name === 'present_qualification_questions') {
                    // Try result first, fall back to arguments
                    let questions = null;
                    try {
                      if (tool.result) {
                        const qualData = JSON.parse(tool.result);
                        if (qualData.questions) questions = qualData.questions;
                      }
                    } catch (e) {}
                    if (!questions && tool.arguments?.questions) {
                      questions = tool.arguments.questions;
                    }
                    if (questions && questions.length > 0) {
                      return <QualificationQuestions key={idx} questions={questions} onSelect={onSelect} />;
                    }
                  }

                  if (tool.name === 'suggest_vendors' && tool.arguments?.vendors) {
                     return (
                        <div key={idx} className="mb-4 w-full space-y-4">
                          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                            <Activity className="h-4 w-4 text-purple-600" /> 
                            Suggested Vendors
                          </h4>
                          {tool.arguments.vendors.map((vendor: any, vIdx: number) => (
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
                                onClick={() => onSelect(`I'd like to proceed with ${vendor.name}.`)}
                              >
                                Select {vendor.name}
                              </Button>
                            </div>
                          ))}
                        </div>
                     );
                  }

                  return <ToolCallBlock key={idx} tool={tool} />;
                })}
              </div>
            )}
            {isStreaming && !msg.content && (!msg.tool_calls || msg.tool_calls.length === 0) && (
              <div className="flex items-center gap-2 text-muted-foreground min-h-[1.25rem]">
                <div className="w-2 h-2 bg-purple-500/50 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-purple-500/50 rounded-full animate-bounce [animation-delay:-.3s]" />
                <div className="w-2 h-2 bg-purple-500/50 rounded-full animate-bounce [animation-delay:-.5s]" />
              </div>
            )}
            {msg.content && (
              <div className={`prose prose-sm dark:prose-invert max-w-none ${msg.type !== 'text' ? 'mb-4' : ''}`}>
                <ReactMarkdown>{msg.content + (isStreaming ? ' ▋' : '')}</ReactMarkdown>
              </div>
            )}
            {msg.type !== 'text' && (
              <div className="w-full">
                {renderCard(msg)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentChat() {
  const { user } = useAuth();
  const { intakes, procurementCatalog, knowledgeBase, suppliers, updateIntake, agentMemory, purchaseRequisitions } = useData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadHistory = async () => {
      try {
        const chatDoc = await getDoc(doc(db, 'userChats', user.uid));
        if (chatDoc.exists() && chatDoc.data().messages) {
          setMessages(chatDoc.data().messages);
        } else {
          setMessages([
            {
              role: 'model',
              content: `Hello ${user?.displayName || 'there'}! I am Atlas, your AI Procurement Agent. I can help you orchestrate intake, source suppliers autonomously, and negotiate contracts.\n\nTry some of our interactive flows below!`,
              type: 'text'
            }
          ]);
        }
      } catch (err) {
        console.error("Failed to load chat history", err);
      } finally {
        setIsHistoryLoaded(true);
      }
    };
    loadHistory();
  }, [user]);

  useEffect(() => {
    if (!user || !isHistoryLoaded || messages.length === 0) return;
    
    const saveHistory = async () => {
      try {
        await setDoc(doc(db, 'userChats', user.uid), {
           messages: messages,
           updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Failed to save chat history", err);
      }
    };

    const timeout = setTimeout(saveHistory, 1000);
    return () => clearTimeout(timeout);
  }, [messages, user, isHistoryLoaded]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [kbContext, setKbContext] = useState('');
  const [useContext, setUseContext] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    init('/liteparse_wasm_bg.wasm').catch(console.error);
  }, []);

  useEffect(() => {
    const fetchKB = async () => {
      if (!user) return;
      try {
        const q = query(
          collection(db, 'knowledgeBase'), 
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(doc => doc.data());
        if (docs.length > 0) {
          const context = docs.map(d => `--- Document: ${d.title} ---\n${d.content}`).join('\n\n');
          setKbContext(context);
        }
      } catch (err) {
        console.error('Failed to fetch KB docs:', err);
      }
    };
    fetchKB();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    toast.info(`Parsing ${file.name}...`);

    try {
      const parser = new LiteParse({
        ocrEnabled: false,
        outputFormat: "markdown",
      });

      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      const result = await parser.parse(bytes);
      
      const uploadMessage = `I have uploaded a document named "${file.name}". Here is its content:\n\n\`\`\`\n${result.text}\n\`\`\`\n\nPlease review it.`;
      
      handleSend(uploadMessage);
      toast.success('Document uploaded and parsed successfully');
    } catch (error) {
      console.error('Error parsing document:', error);
      toast.error('Failed to parse document');
    } finally {
      setIsUploading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };


  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' };
      const mediaRecorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm') ? options : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const format = mediaRecorder.mimeType.includes('webm') ? 'webm' : 'mp3';
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          try {
            toast.info("Transcribing audio...", { id: 'transcribe' });
            const response = await fetch('/api/agent/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioData: base64data, format })
            });
            if (response.ok) {
              const data = await response.json();
              if (data.text) {
                setInput(prev => prev + (prev ? " " : "") + data.text);
                toast.success("Transcription added", { id: 'transcribe' });
              } else {
                toast.error("No speech detected", { id: 'transcribe' });
              }
            } else {
              toast.error("Failed to transcribe", { id: 'transcribe' });
            }
          } catch (e) {
            toast.error("Error transcribing audio", { id: 'transcribe' });
          }
          
          stream.getTracks().forEach(track => track.stop());
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSend = async (overrideInput?: string) => {
    const textToSend = typeof overrideInput === 'string' ? overrideInput : input;
    if (!textToSend.trim()) return;

    const userMessage = { role: 'user' as const, content: textToSend, type: 'text' as MessageType };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = textToSend;
    if (typeof overrideInput !== 'string') {
      setInput('');
    }
    setIsLoading(true);

    // Simulated interactive flows for demonstration
    const lowerInput = currentInput.toLowerCase();
    
    if (lowerInput.includes('catering') || lowerInput.includes('quote')) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'model', content: '', type: 'upload-prompt' }]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    if (lowerInput.includes('bid matrix') || lowerInput.includes('matrix')) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'model', content: 'Here is the initial bid matrix based on the received supplier quotes.', type: 'bid-matrix' }]);
        setIsLoading(false);
      }, 1000);
      return;
    }
    
    if (lowerInput.includes('new supplier') || lowerInput.includes('onboard')) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'model', content: '', type: 'supplier-form' }]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    if (lowerInput.includes('marketing') || lowerInput.includes('item details')) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'model', content: '', type: 'item-details' }]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    if (lowerInput.includes('select equinox') || lowerInput.includes('select supplier')) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'model', content: '', type: 'selected-supplier' }]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    if (lowerInput.includes('process') || lowerInput.includes('timeline')) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'model', content: '', type: 'process-timeline' }]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    if (lowerInput.includes('impact') || lowerInput.includes('delay') || lowerInput.includes('overdue')) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'model', content: 'Here is the impact analysis based on recent vendor communications and overdue POs.', type: 'impact-analysis' }]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    // Default API call
    try {
      let apiMessages = messages.filter(m => m.type === 'text' || !m.type).concat(userMessage).map(m => ({ role: m.role, parts: [{ text: m.content }] }));
      
      // Load workflow from localStorage (saved by WorkflowDesigner)
      let workflowNodes: any[] = [];
      let workflowEdges: any[] = [];
      try {
        const savedWorkflow = localStorage.getItem('workflow-designer-autosave');
        if (savedWorkflow) {
          const parsed = JSON.parse(savedWorkflow);
          workflowNodes = parsed.nodes || [];
          workflowEdges = parsed.edges || [];
        }
      } catch (e) {
        console.warn('Failed to load workflow from localStorage:', e);
      }

      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          context: {
            intakes,
            procurementCatalog,
            suppliers,
            purchaseRequisitions,
            agentMemory: agentMemory.slice(0, 20),
            workflowNodes,
            workflowEdges,
            userId: user?.uid,
            knowledgeBase: useContext ? knowledgeBase : undefined,
            kbChunks: useContext ? knowledgeBase.flatMap((doc: any) =>
              (doc.chunks || []).map((c: any) => ({ ...c, docId: doc.id, title: doc.title }))
            ) : undefined
          }
        })
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Add a placeholder message for the model
      setMessages(prev => [...prev, { role: 'model', content: '', type: 'text', tool_calls: [] }]);

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
                // Find the LAST tool call with matching name that hasn't received a result yet
                const targetTool = [...currentToolCalls].reverse().find(t => t.name === parsed.name && !t.result);
                if (targetTool) {
                  targetTool.result = parsed.result;
                  
                  // Intercept create_intake_request to show confirmation card
                  if (parsed.name === 'create_intake_request' && targetTool.arguments) {
                    try {
                      const args = typeof targetTool.arguments === 'string'
                        ? JSON.parse(targetTool.arguments)
                        : targetTool.arguments;
                      // Store intake data on the message for the confirmation card
                      currentModelMessage.type = 'intake-confirmation';
                      (currentModelMessage as any).pendingIntake = {
                        title: args.title,
                        department: args.department,
                        amount: args.amount,
                        description: args.description,
                      };
                    } catch (e) {
                      console.error("Error parsing intake request args", e);
                    }
                  }

                  // Intercept request_approval to show approval card
                  if (parsed.name === 'request_approval' && targetTool.result) {
                    try {
                      const approvalData = JSON.parse(targetTool.result);
                      if (approvalData.status === 'approval_required') {
                        currentModelMessage.type = 'approval';
                      }
                    } catch (e) {}
                  }

                  // Intercept present_qualification_questions to show interactive chips
                  if (parsed.name === 'present_qualification_questions') {
                    try {
                      const qualData = JSON.parse(targetTool.result || parsed.result || '');
                      if (qualData.type === 'qualification_questions') {
                        currentModelMessage.type = 'qualification-questions';
                        currentModelMessage.qualificationData = qualData.questions;
                      }
                    } catch (e) {}
                  }
                }
              } else if (parsed.type === "final") {
                // Don't overwrite content if interactive elements are showing
                const hasInteractiveTools = currentToolCalls.some(t =>
                  t.name === 'present_qualification_questions' ||
                  t.name === 'suggest_procurement_items' ||
                  t.name === 'ask_form_questions' ||
                  t.name === 'suggest_vendors' ||
                  t.name === 'create_intake_request'
                );
                if (!hasInteractiveTools && currentModelMessage.type !== 'qualification-questions' && currentModelMessage.type !== 'intake-confirmation') {
                  currentModelMessage.content = parsed.response;
                } else if (parsed.response && currentModelMessage.content !== parsed.response) {
                  // Append text content after interactive elements
                  currentModelMessage.content = (currentModelMessage.content || '') + '\n\n' + parsed.response;
                }
                // Update full tool calls if necessary
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
        // If we already added a placeholder, update it. Otherwise, add a new one.
        if (prev[prev.length - 1]?.role === 'model' && prev[prev.length - 1]?.content === '') {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], content: '**Error:** Failed to communicate with the agent.' };
          return newMessages;
        }
        return [...prev, { role: 'model', content: '**Error:** Failed to communicate with the agent.', type: 'text' }];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderCard = (msg: Message) => {
    switch (msg.type) {
      case 'bid-matrix': return <BidMatrixCard />;
      case 'supplier-form': return <SupplierFormCard />;
      case 'process-timeline': return <ProcessTimelineCard />;
      case 'item-details': return <ItemDetailsCard />;
      case 'upload-prompt': return <UploadPromptCard />;
      case 'selected-supplier': return <SelectedSupplierCard />;
      case 'impact-analysis': return <ImpactAnalysisCard />;
      case 'intake-confirmation': {
        const pending = (msg as any).pendingIntake;
        if (!pending) return null;
        return (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-blue-600" />
              <h4 className="font-semibold text-blue-900 dark:text-blue-100">Confirm Purchase Requisition</h4>
            </div>
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">Please review the details before creating this requisition:</p>
            <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Title:</span>
                <span className="font-medium">{pending.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Department:</span>
                <span className="font-medium">{pending.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-medium">{pending.amount}</span>
              </div>
              {pending.description && (
                <div className="pt-2 border-t">
                  <span className="text-muted-foreground text-xs">Description:</span>
                  <p className="text-xs mt-1">{pending.description}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={async () => {
                  try {
                    const { addDoc, collection: fbCollection } = await import('firebase/firestore');
                    const newReq = {
                      title: pending.title,
                      category: pending.department || 'General',
                      amount: parseFloat((pending.amount || '0').replace(/[^0-9.]/g, '')) || 0,
                      date: new Date().toISOString().split('T')[0],
                      status: 'Draft',
                      purpose: pending.description || '',
                      reason: pending.description || '',
                      totalAmount: parseFloat((pending.amount || '0').replace(/[^0-9.]/g, '')) || 0,
                      createdBy: user?.uid || '',
                      auditTrail: [{
                        action: 'Created via AI Agent',
                        actorId: user?.uid || '',
                        timestamp: new Date().toISOString()
                      }]
                    };
                    const docRef = await addDoc(fbCollection(db, 'purchaseRequisitions'), newReq);
                    toast.success(`Requisition ${docRef.id} created successfully`);
                    handleSend(`Requisition ${docRef.id} created. What would you like to do next?`);
                  } catch (e) {
                    console.error("Error creating requisition:", e);
                    toast.error("Failed to create requisition");
                  }
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Confirm & Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => handleSend("I changed my mind. Cancel this requisition.")}
              >
                <AlertCircle className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        );
      }
      case 'approval': {
        // Find the request_approval tool call in this message
        const approvalTool = msg.tool_calls?.find(t => t.name === 'request_approval');
        if (approvalTool) {
          const details = approvalTool.arguments?.details || {};
          const riskColors: Record<string, string> = { low: 'bg-green-100 text-green-800', medium: 'bg-yellow-100 text-yellow-800', high: 'bg-red-100 text-red-800' };
          return (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <h4 className="font-semibold text-amber-900 dark:text-amber-100">Human Approval Required</h4>
                <Badge className={riskColors[approvalTool.arguments?.risk_level || 'medium']}>
                  {approvalTool.arguments?.risk_level || 'medium'} risk
                </Badge>
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">{approvalTool.arguments?.action}</p>
              {Object.keys(details).length > 0 && (
                <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4 text-xs space-y-1">
                  {Object.entries(details).map(([key, val]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                      <span className="font-medium">{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleSend("I approve this action. Please proceed.")}
                >
                  <CheckCircle className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => handleSend("I reject this action. Please cancel and explain why.")}
                >
                  <AlertCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </div>
          );
        }
        return null;
      }
      default: return null;
    }
  };

  return (
    <div className="p-0 md:p-4 flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      <div className="mb-4 hidden md:block">
        <h1 className="text-2xl font-bold tracking-tight">Atlas Agentic Platform</h1>
        <p className="text-muted-foreground mt-1">Intake Orchestration, Autonomous Sourcing & Negotiation</p>
      </div>

      <Card className="flex-1 flex flex-col min-h-0 bg-background/50 border shadow-sm">
        <CardHeader className="border-b py-3 px-4 bg-white dark:bg-card">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-600 flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            Ask Agent
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0 relative bg-muted/20">
          <div className="h-full overflow-y-auto p-4 md:p-6" ref={scrollRef}>
            <div className="flex flex-col gap-6 pb-4">
              {messages.map((msg, idx) => {
                const isStreaming = isLoading && idx === messages.length - 1;
                return (
                  <div key={idx} className={`flex gap-3 max-w-[95%] md:max-w-[85%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start w-full'}`}>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-primary text-primary-foreground hidden md:flex">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                      {msg.role === 'user' ? (
                        <div className="p-3.5 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-foreground rounded-tr-sm">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        <ExpandableBotMessage msg={msg} renderCard={renderCard} isStreaming={isStreaming} onSelect={handleSend} />
                      )}
                    </div>
                  </div>
                );
              })}
              {isLoading && messages[messages.length - 1]?.role !== 'model' && (
                <div className="flex gap-3 max-w-[95%] md:max-w-[85%] self-start w-full">
                  <div className="flex flex-col items-start w-full">
                    <div className="bg-white dark:bg-card border shadow-sm rounded-2xl w-full overflow-hidden rounded-tl-sm">
                      <div className="px-4 py-3 border-b bg-muted/10 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                          <Bot className="h-4 w-4" />
                        </div>
                        <span className="font-medium text-sm text-foreground">
                          Thinking...
                        </span>
                      </div>
                      <div className="p-5 flex items-center gap-2">
                        <div className="w-2 h-2 bg-amber-500/50 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-amber-500/50 rounded-full animate-bounce [animation-delay:-.3s]" />
                        <div className="w-2 h-2 bg-amber-500/50 rounded-full animate-bounce [animation-delay:-.5s]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t p-3 bg-white dark:bg-card">
          <form 
            className="flex flex-col w-full gap-2 relative"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useContext}
                    onClick={() => setUseContext(!useContext)}
                    className={`w-7 h-4 rounded-full transition-colors relative flex items-center ${useContext ? 'bg-amber-600' : 'bg-muted-foreground/30'}`}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full absolute shadow-sm transition-transform ${useContext ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </button>
                  Use KB Context
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept=".pdf,.txt,.md,.docx,.xlsx" 
              />
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="shrink-0 rounded-full text-muted-foreground hover:bg-muted"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isLoading}
              >
                {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
              </Button>
              <div className="relative flex-1 flex items-center">
                {isRecording && (
                  <div className="absolute inset-y-0 left-0 right-20 bg-background/80 backdrop-blur-sm rounded-l-full flex items-center pl-4 z-10 border-y border-l border-muted-foreground/20">
                    <span className="text-amber-600 font-medium text-sm mr-3">Listening...</span>
                    <div className="flex items-center gap-1 h-5">
                      <div className="w-1 h-full bg-amber-500 rounded-full animate-waveform [animation-delay:-0.4s]" />
                      <div className="w-1 h-full bg-amber-500 rounded-full animate-waveform [animation-delay:-0.2s]" />
                      <div className="w-1 h-full bg-amber-500 rounded-full animate-waveform [animation-delay:-0.6s]" />
                      <div className="w-1 h-full bg-amber-500 rounded-full animate-waveform [animation-delay:-0.1s]" />
                      <div className="w-1 h-full bg-amber-500 rounded-full animate-waveform [animation-delay:-0.5s]" />
                    </div>
                  </div>
                )}
                <Input 
                  placeholder="Describe your business needs..." 
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  className="flex-1 rounded-full pl-4 pr-24 bg-muted/30 border-muted-foreground/20 focus-visible:ring-purple-500 h-12"
                  disabled={isLoading}
                />
                <div className="absolute right-1.5 flex items-center gap-1 z-20">
                  <Button 
                    type="button" 
                    onClick={toggleRecording}
                    variant="ghost"
                    size="icon"
                    className={`h-9 w-9 rounded-full ${isRecording ? 'text-red-500 hover:text-red-600 bg-red-100 hover:bg-red-200 animate-pulse' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !input.trim()}
                    size="icon"
                    className="h-9 w-9 rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

              </div>
            </div>
            
            <div className="flex gap-2 flex-wrap mt-2 px-2 pb-1 justify-center md:justify-start">
              <Button type="button" variant="outline" size="sm" onClick={() => setInput("I want to source catering services and I have a quote")} className="text-xs rounded-full h-8 border-dashed bg-muted/30 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200">
                <Upload className="h-3 w-3 mr-1.5" /> Sourcing + Upload
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setInput("Show the initial bid matrix")} className="text-xs rounded-full h-8 bg-muted/30 hover:bg-purple-50 hover:text-purple-700">
                <TableIcon className="h-3 w-3 mr-1.5" /> Bid Matrix
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setInput("Start marketing campaign and enter item details")} className="text-xs rounded-full h-8 bg-muted/30 hover:bg-purple-50 hover:text-purple-700">
                <FileText className="h-3 w-3 mr-1.5" /> Item Details
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setInput("Add a new supplier")} className="text-xs rounded-full h-8 bg-muted/30 hover:bg-purple-50 hover:text-purple-700">
                <UserPlus className="h-3 w-3 mr-1.5" /> Add Supplier
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setInput("Show review process timeline")} className="text-xs rounded-full h-8 bg-muted/30 hover:bg-purple-50 hover:text-purple-700">
                <Activity className="h-3 w-3 mr-1.5" /> Process Timeline
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setInput("Analyze vendor delays and overdue POs")} className="text-xs rounded-full h-8 bg-muted/30 hover:bg-purple-50 hover:text-purple-700">
                <AlertCircle className="h-3 w-3 mr-1.5" /> Impact Analysis
              </Button>
            </div>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
