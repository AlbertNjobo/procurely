import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '../lib/api';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Bot, User, Send, FileText, CheckCircle, Paperclip, Table as TableIcon, Activity, Upload, ChevronDown, ChevronUp, AlertCircle, Loader2, Mic, Square, ListChecks, Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft, Search } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useData } from '../lib/data-context';
import ReactMarkdown from 'react-markdown';
import init, { LiteParse } from '@llamaindex/liteparse-wasm';
import { toast } from 'sonner';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BidMatrixCard } from '../components/agent/BidMatrixCard';
import { SupplierFormCard } from '../components/agent/SupplierFormCard';

const isRenderableImage = (url: string) => /\.(jpe?g|png|webp|gif)$/i.test(url);
const PLACEHOLDER_IMG = 'https://placehold.co/400x300/f3f4f6/6b7280?text=Product';
import { ProcessTimelineCard } from '../components/agent/ProcessTimelineCard';
import { ItemDetailsCard } from '../components/agent/ItemDetailsCard';
import { UploadPromptCard } from '../components/agent/UploadPromptCard';
import { SelectedSupplierCard } from '../components/agent/SelectedSupplierCard';
import { ImpactAnalysisCard } from '../components/agent/ImpactAnalysisCard';

// ─── Chat UI Helpers ──────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
      title={copied ? 'Copied!' : 'Copy message'}
    >
      {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
    </button>
  );
}

function formatTimestamp(ts?: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

const SUGGESTED_PROMPTS = [
  { icon: '💻', text: 'I need 10 laptops under $15K for engineering' },
  { icon: '🔍', text: 'Find IT software suppliers with low risk' },
  { icon: '📋', text: 'Check procurement policy for travel expenses' },
  { icon: '☁️', text: 'Research cloud hosting prices for our team' },
];

type MessageType = 'text' | 'bid-matrix' | 'supplier-form' | 'process-timeline' | 'item-details' | 'upload-prompt' | 'selected-supplier' | 'impact-analysis' | 'approval' | 'qualification-questions' | 'intake-confirmation' | 'supplier-confirmation' | 'rfq-confirmation' | 'bid-confirmation' | 'po-confirmation';

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
  timestamp?: number;
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
        <ListChecks className="h-4 w-4 text-zinc-500" />
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
                    ? 'bg-zinc-900 text-zinc-50 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100 shadow-sm'
                    : 'bg-background hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 border-border'
                }`}
              >
                {opt.icon && <span>{opt.icon}</span>}
                {opt.label}
              </button>
            ))}
          </div>
          {q.allow_custom && selectedAnswers[q.question_id] && !q.options.find((o: any) => o.value === selectedAnswers[q.question_id]) && (
            <div className="text-sm text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-900/50 rounded-lg px-3 py-2">
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
                className="flex-1 text-sm border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
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
          className="w-full py-2.5 rounded-xl bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
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
        <Activity className="h-4 w-4 text-zinc-500" /> 
        Suggested Options
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item: any, iIdx: number) => {
          const isSelected = selectedItems.find(i => i.name === item.name);
          return (
            <div 
              key={iIdx} 
              className={`bg-white dark:bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col group ${isSelected ? 'ring-2 ring-zinc-900 border-zinc-900 dark:ring-zinc-100 dark:border-zinc-100' : 'hover:border-zinc-300'}`}
              onClick={() => toggleSelect(item)}
            >
              <div className="h-32 bg-muted relative overflow-hidden">
                <img src={isRenderableImage(item.image_url) ? item.image_url : PLACEHOLDER_IMG} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG; }} />
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black p-1 rounded-full shadow-md z-10">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="p-3 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h5 className="font-semibold text-sm line-clamp-1 flex-1">{item.name}</h5>
                  {item.source && (
                    <Badge variant={item.source === 'online' ? 'default' : 'secondary'} className={`text-[9px] px-1.5 py-0 shrink-0 ${item.source === 'online' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {item.source === 'online' ? '🌐 Online' : '📦 Catalog'}
                    </Badge>
                  )}
                </div>
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
                    className={isSelected ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700" : "group-hover:bg-zinc-100 group-hover:text-zinc-900 group-hover:border-zinc-300 dark:group-hover:bg-zinc-800 dark:group-hover:text-zinc-50"}
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
        <div className="bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden mt-6 animate-in fade-in slide-in-from-bottom-4">
           <div className="bg-zinc-100 dark:bg-zinc-800/40 p-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
             <h5 className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
               <TableIcon className="h-4 w-4" /> Side-by-Side Comparison
             </h5>
             <Button size="sm" onClick={() => onSelect(`I want to select these options for review: ${selectedItems.map(i => i.name).join(', ')}`)}>
                Proceed with Selected
             </Button>
           </div>
           <div className="p-0 overflow-x-auto">
             <table className="w-full text-sm">
               <thead>
                 <tr className="bg-white/50 dark:bg-black/20 border-b border-zinc-250/50 dark:border-zinc-800/50">
                    <th className="p-3 text-left font-medium w-1/4">Feature</th>
                    {selectedItems.map((item, idx) => (
                      <th key={idx} className="p-3 text-left font-medium w-1/3 border-l border-zinc-250/50 dark:border-zinc-800/50">
                        <div className="flex items-center gap-2">
                          <img src={isRenderableImage(item.image_url) ? item.image_url : `https://placehold.co/32x32/f3f4f6/6b7280?text=${encodeURIComponent(item.name.charAt(0))}`} className="w-8 h-8 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/32x32/f3f4f6/6b7280?text=${encodeURIComponent(item.name.charAt(0))}`; }} />
                          <span className="line-clamp-1">{item.name}</span>
                        </div>
                      </th>
                    ))}
                 </tr>
               </thead>
               <tbody className="divide-y divide-zinc-200 dark:divide-zinc-850">
                 <tr className="bg-white/30 dark:bg-black/10 hover:bg-white/50">
                   <td className="p-3 font-medium text-muted-foreground">Price</td>
                   {selectedItems.map((item, idx) => (
                     <td key={idx} className="p-3 border-l border-zinc-250/50 dark:border-zinc-800/50 font-medium">
                       {item.estimated_price}
                     </td>
                   ))}
                 </tr>
                 <tr className="bg-white/30 dark:bg-black/10 hover:bg-white/50">
                   <td className="p-3 font-medium text-muted-foreground">Description</td>
                   {selectedItems.map((item, idx) => (
                     <td key={idx} className="p-3 border-l border-zinc-250/50 dark:border-zinc-800/50 text-xs text-muted-foreground">
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
      <div className="bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-4 flex items-center gap-3">
        <CheckCircle className="h-5 w-5 text-green-600" />
        <div>
          <h4 className="font-medium text-zinc-900 dark:text-zinc-100">Intake Form Completed</h4>
          <p className="text-xs text-muted-foreground">Information submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card border rounded-xl overflow-hidden shadow-sm mt-4">
      <div className="bg-zinc-50 dark:bg-zinc-900/20 p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Intake Form Wizard
        </h4>
        <div className="mt-2 text-xs text-muted-foreground">
          Step {currentStep + 1} of {questions.length}
        </div>
        <div className="w-full bg-zinc-250 dark:bg-zinc-800 h-1 mt-2 rounded-full overflow-hidden">
          <div 
            className="bg-zinc-900 dark:bg-zinc-100 h-full transition-all duration-300 ease-in-out" 
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
                className={currentValue === opt ? "bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200" : "hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"}
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

function getToolLabel(name: string, args: any): string {
  const a = args || {};
  switch (name) {
    case 'search_procurement_catalog': return `Searching catalog for "${a.query || 'all items'}"`;
    case 'suggest_procurement_items': return 'Researching products online...';
    case 'search_product_images': return `Finding images for "${a.query || 'products'}"`;
    case 'evaluate_supplier_risk': return `Analyzing risk for ${a.supplier_id || 'supplier'}...`;
    case 'generate_bid_matrix': return 'Generating bid comparison...';
    case 'negotiate_with_vendor': return `Negotiating with ${a.vendor_id || 'vendor'}...`;
    case 'research_market_price': return `Researching prices for ${a.product || 'product'}...`;
    case 'get_suppliers': return 'Fetching suppliers...';
    case 'get_intake_requests': return 'Fetching requisitions...';
    case 'create_intake_request': return 'Creating requisition...';
    case 'create_supplier': return `Adding supplier ${a.name || ''}...`;
    case 'create_rfq': return `Creating RFQ: ${a.title || ''}`;
    case 'create_purchase_order': return 'Creating purchase order...';
    case 'select_bid': return 'Selecting winning bid...';
    case 'present_qualification_questions': return 'Preparing questions...';
    case 'ask_form_questions': return 'Preparing intake form...';
    case 'request_approval': return 'Requesting approval...';
    case 'confirm_action': return 'Confirming action...';
    case 'recall_memory': return 'Checking memory...';
    case 'store_memory': return 'Saving to memory...';
    case 'delegate_to_specialist': return `Delegating to ${a.specialist || 'specialist'}...`;
    case 'update_intake_status': return `Updating status to "${a.new_status || ''}"...`;
    case 'track_delivery': return `Tracking delivery ${a.po_id || ''}...`;
    case 'process_payment': return 'Processing payment...';
    case 'process_invoice': return 'Processing invoice...';
    default: return `Running ${name}...`;
  }
}

function getToolIcon(name: string) {
  if (name.startsWith('search_') || name === 'research_market_price') return <Search className="h-3.5 w-3.5 text-blue-500" />;
  if (name.startsWith('create_') || name === 'select_bid') return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
  if (name.startsWith('delegate_') || name === 'negotiate_with_vendor') return <Bot className="h-3.5 w-3.5 text-purple-500" />;
  if (name.includes('memory')) return <Activity className="h-3.5 w-3.5 text-amber-500" />;
  if (name.includes('approval') || name.includes('confirm')) return <AlertCircle className="h-3.5 w-3.5 text-orange-500" />;
  return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
}

function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const isPending = !tool.result;
  const label = getToolLabel(tool.name, tool.arguments);
  const [expanded, setExpanded] = useState(false);

  // Parse result for summary
  let resultSummary = '';
  if (tool.result) {
    try {
      const data = JSON.parse(tool.result);
      if (data.message) resultSummary = data.message;
      else if (data.items) resultSummary = `${data.items.length} items found`;
      else if (data.success !== undefined) resultSummary = data.success ? 'Success' : 'Failed';
      else if (data.analysis) resultSummary = 'Analysis complete';
      else if (data.supplier) resultSummary = `Created: ${data.supplier.name || data.supplier.id}`;
      else if (data.extracted) resultSummary = `Extracted: ${data.extracted.vendor_name || 'data'}`;
      else resultSummary = 'Done';
    } catch { resultSummary = 'Done'; }
  }

  return (
    <div className="bg-muted/20 border border-border/50 rounded-lg my-2 overflow-hidden text-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        {isPending ? (
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
          </span>
        ) : (
          getToolIcon(tool.name)
        )}
        <span className={`flex-1 ${isPending ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
        {!isPending && resultSummary && (
          <span className="text-xs text-green-600 dark:text-green-400 shrink-0">{resultSummary}</span>
        )}
        {expanded && <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        {!expanded && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/30">
          {Object.keys(tool.arguments || {}).length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Parameters</span>
              <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words bg-background/50 rounded p-2 max-h-32 overflow-y-auto">
                {JSON.stringify(tool.arguments, null, 2)}
              </pre>
            </div>
          )}
          {tool.result && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Result</span>
              <pre className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words bg-background/50 rounded p-2 max-h-48 overflow-y-auto">
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
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

  const renderInnerContent = () => {
    return (
      <>
        {msg.tool_calls && msg.tool_calls.length > 0 && (
          <div className="mb-3 space-y-2">
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
                  const renderableImages = (data.images || []).filter((img: any) => isRenderableImage(img.url));
                  if (renderableImages.length > 0) {
                    return (
                      <div key={idx} className="mb-4 mt-2">
                        <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                          <Activity className="h-4 w-4 text-zinc-550" />
                          Suggested Options
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {renderableImages.map((img: any, iIdx: number) => (
                            <div key={iIdx} className="bg-white dark:bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer flex flex-col group" onClick={() => onSelect(`I want to select ${img.title}`)}>
                              <div className="h-32 bg-muted relative overflow-hidden">
                                <img src={img.url} alt={img.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG; }} />
                              </div>
                              <div className="p-3 flex flex-col flex-1">
                                <h5 className="font-semibold text-sm line-clamp-2 mb-3">{img.title}</h5>
                                <div className="mt-auto">
                                  <Button variant="outline" size="sm" className="w-full group-hover:bg-zinc-100 group-hover:text-zinc-900 group-hover:border-zinc-300 dark:group-hover:bg-zinc-800 dark:group-hover:text-zinc-100" onClick={(e) => { e.stopPropagation(); onSelect(`I want to select ${img.title}`); }}>
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
                        <Activity className="h-4 w-4 text-zinc-500" /> 
                        Suggested Vendors
                      </h4>
                      {tool.arguments.vendors.map((vendor: any, vIdx: number) => (
                        <div key={vIdx} className="bg-white dark:bg-card border shadow-sm rounded-lg p-5 transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
                          <div className="flex justify-between items-start mb-3">
                            <div className="font-semibold text-lg">{vendor.name}</div>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                              {vendor.category}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{vendor.description}</p>
                          <Button 
                            variant="outline" 
                            className="w-full border-zinc-200 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-850"
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
          <div className="flex items-center gap-1.5 text-muted-foreground py-1 select-none">
            <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-.3s]" />
            <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-.5s]" />
          </div>
        )}
        {msg.content && (
          <div className={`prose prose-sm dark:prose-invert max-w-none text-zinc-900 dark:text-zinc-100 leading-relaxed text-sm ${msg.type !== 'text' ? 'mb-4' : ''}`}>
            <ReactMarkdown>{msg.content + (isStreaming ? ' ▋' : '')}</ReactMarkdown>
          </div>
        )}
        {msg.type !== 'text' && (
          <div className="w-full">
            {renderCard(msg)}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="w-full flex gap-3.5 text-left items-start">
      <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 flex items-center justify-center shrink-0 mt-0.5 shadow-none border border-zinc-200/40 dark:border-zinc-700/30">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        {isInteractive ? (
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xs rounded-2xl w-full overflow-hidden rounded-tl-sm">
            <div 
              className={`px-4 py-3 flex justify-between items-center transition-colors cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 ${isExpanded ? 'border-b bg-muted/10' : 'bg-muted/10'}`}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <span className="font-semibold text-xs text-foreground tracking-wide uppercase">
                {getTitle(msg.type)}
              </span>
              <button className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted">
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
            <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <div className="p-4">
                  {renderInnerContent()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-0.5">
            {renderInnerContent()}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const WELCOME_MSG: Message = {
  role: 'model',
  content: `Hello! I am Procurely, your AI Procurement Agent. I can help you orchestrate intake, source suppliers autonomously, and negotiate contracts.`,
  type: 'text'
};

export function AgentChat() {
  const { user } = useAuth();
  const { intakes, procurementCatalog, knowledgeBase, suppliers, updateIntake, agentMemory, purchaseRequisitions } = useData();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);

  const chatsRef = collection(db, 'userChats', user?.uid || '__none__', 'conversations');

  // Load conversation list
  useEffect(() => {
    if (!user) return;
    const loadChats = async () => {
      try {
        const q = query(chatsRef, orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({
          id: d.id,
          title: d.data().title || 'New Chat',
          updatedAt: d.data().updatedAt || ''
        }));
        setChats(list);
        // Auto-select most recent chat
        if (list.length > 0 && !activeChatId) {
          setActiveChatId(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load conversations:", err);
      } finally {
        setIsHistoryLoaded(true);
      }
    };
    loadChats();
  }, [user]);

  // Load active conversation messages
  useEffect(() => {
    if (!user || !activeChatId) return;
    const loadMessages = async () => {
      try {
        const chatDoc = await getDoc(doc(db, 'userChats', user.uid, 'conversations', activeChatId));
        if (chatDoc.exists() && chatDoc.data().messages) {
          setMessages(chatDoc.data().messages);
        } else {
          setMessages([WELCOME_MSG]);
        }
      } catch (err) {
        console.error("Failed to load conversation:", err);
        setMessages([WELCOME_MSG]);
      }
    };
    loadMessages();
  }, [user, activeChatId]);

  // Auto-save messages to active conversation
  useEffect(() => {
    if (!user || !activeChatId || !isHistoryLoaded || messages.length === 0) return;
    const save = async () => {
      try {
        await setDoc(doc(db, 'userChats', user.uid, 'conversations', activeChatId), {
          messages,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Failed to save conversation:", err);
      }
    };
    const timeout = setTimeout(save, 1000);
    return () => clearTimeout(timeout);
  }, [messages, user, activeChatId, isHistoryLoaded]);

  const createNewChat = async () => {
    if (!user) return;
    try {
      const docRef = await addDoc(chatsRef, {
        title: 'New Chat',
        messages: [WELCOME_MSG],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setChats(prev => [{ id: docRef.id, title: 'New Chat', updatedAt: new Date().toISOString() }, ...prev]);
      setActiveChatId(docRef.id);
      setMessages([WELCOME_MSG]);
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  };

  const deleteChat = async (chatId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'userChats', user.uid, 'conversations', chatId));
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChatId === chatId) {
        const remaining = chats.filter(c => c.id !== chatId);
        if (remaining.length > 0) {
          setActiveChatId(remaining[0].id);
        } else {
          createNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const switchChat = (chatId: string) => {
    setActiveChatId(chatId);
    setMessages([WELCOME_MSG]);
  };

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [kbContext, setKbContext] = useState('');
  const [useContext, setUseContext] = useState(() => localStorage.getItem('kb-context-enabled') !== 'false');
  const [isRecording, setIsRecording] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('chat-model-qwen') || 'qwen3.7-plus');

  useEffect(() => {
    localStorage.setItem('chat-model-qwen', selectedModel);
  }, [selectedModel]);
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

        // Check file size (max 1MB to avoid timeout)
        if (audioBlob.size > 1024 * 1024) {
          toast.error("Recording too long. Keep it under 30 seconds.", { id: 'transcribe' });
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          try {
            toast.info("Transcribing audio...", { id: 'transcribe' });
            const response = await apiFetch('/api/agent/transcribe', {
              method: 'POST',
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

    const userMessage = { role: 'user' as const, content: textToSend, type: 'text' as MessageType, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    if (typeof overrideInput !== 'string') {
      setInput('');
    }
    setIsLoading(true);

    // Auto-generate title from first user message
    if (messages.length <= 1 && activeChatId && user) {
      const title = textToSend.length > 50 ? textToSend.substring(0, 50) + '...' : textToSend;
      setDoc(doc(db, 'userChats', user.uid, 'conversations', activeChatId), {
        title
      }, { merge: true }).catch(() => {});
      setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, title } : c));
    }

    // Default API call
    try {
      let apiMessages = messages.filter(m => m.type === 'text' || !m.type).concat(userMessage).map(m => ({ role: m.role, parts: [{ text: m.content }] }));
      
      // Load workflow from localStorage (saved by WorkflowDesigner)
      let workflowNodes: any[] = [];
      let workflowEdges: any[] = [];
      let activeWorkflowId: string | null = null;
      try {
        const savedWorkflows = localStorage.getItem('workflow-list');
        if (savedWorkflows) {
          const list = JSON.parse(savedWorkflows);
          if (Array.isArray(list) && list.length > 0) {
            // Pick the most recently updated ACTIVE workflow
            const active = list
              .filter((w: any) => w.active !== false)
              .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            if (active.length > 0) {
              workflowNodes = active[0].nodes || [];
              workflowEdges = active[0].edges || [];
              activeWorkflowId = active[0].id;
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load workflow from localStorage:', e);
      }

      const response = await apiFetch('/api/agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: apiMessages,
          model: selectedModel,
          context: {
            intakes,
            procurementCatalog,
            suppliers,
            purchaseRequisitions,
            agentMemory: agentMemory.slice(0, 20),
            workflowNodes,
            workflowEdges,
            activeWorkflowId,
            userId: user?.uid,
            knowledgeBase: useContext ? knowledgeBase : undefined
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
      setMessages(prev => [...prev, { role: 'model', content: '', type: 'text', tool_calls: [], timestamp: Date.now() }]);

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

                  // Intercept create_supplier to show confirmation card
                  if (parsed.name === 'create_supplier' && targetTool.arguments) {
                    try {
                      const args = typeof targetTool.arguments === 'string'
                        ? JSON.parse(targetTool.arguments)
                        : targetTool.arguments;
                      currentModelMessage.type = 'supplier-confirmation';
                      (currentModelMessage as any).pendingSupplier = {
                        name: args.name,
                        category: args.category,
                        contact_email: args.contact_email,
                        risk_level: args.risk_level || 'Pending',
                      };
                    } catch (e) {}
                  }

                  // Intercept update_intake_status — auto-write to Firestore
                  if (parsed.name === 'update_intake_status' && targetTool.result) {
                    const data = JSON.parse(targetTool.result);
                    if (data.success && data.intake_id) {
                      import('firebase/firestore').then(fb =>
                        fb.updateDoc(fb.doc(db, 'intakes', data.intake_id), { status: data.new_status })
                      ).catch(() => {});
                    }
                  }

                  // Intercept store_memory — auto-write to Firestore
                  if (parsed.name === 'store_memory' && targetTool.result) {
                    const data = JSON.parse(targetTool.result);
                    if (data.success && data.memory) {
                      import('firebase/firestore').then(fb =>
                        fb.addDoc(fb.collection(db, 'agentMemory'), data.memory)
                      ).catch(() => {});
                    }
                  }

                  // Intercept create_rfq — show confirmation card
                  if (parsed.name === 'create_rfq' && targetTool.arguments) {
                    try {
                      const args = typeof targetTool.arguments === 'string'
                        ? JSON.parse(targetTool.arguments)
                        : targetTool.arguments;
                      currentModelMessage.type = 'rfq-confirmation';
                      (currentModelMessage as any).pendingRfq = {
                        title: args.title,
                        description: args.description,
                        supplier_ids: args.supplier_ids,
                        due_date: args.due_date,
                        budget_range: args.budget_range,
                      };
                    } catch (e) {}
                  }

                  // Intercept select_bid — show confirmation card
                  if (parsed.name === 'select_bid' && targetTool.arguments) {
                    try {
                      const args = typeof targetTool.arguments === 'string'
                        ? JSON.parse(targetTool.arguments)
                        : targetTool.arguments;
                      currentModelMessage.type = 'bid-confirmation';
                      (currentModelMessage as any).pendingBid = {
                        rfq_id: args.rfq_id,
                        bid_id: args.bid_id,
                        supplier_id: args.supplier_id,
                        amount: args.amount,
                        reasoning: args.reasoning,
                      };
                    } catch (e) {}
                  }

                  // Intercept create_purchase_order — show confirmation card
                  if (parsed.name === 'create_purchase_order' && targetTool.arguments) {
                    try {
                      const args = typeof targetTool.arguments === 'string'
                        ? JSON.parse(targetTool.arguments)
                        : targetTool.arguments;
                      currentModelMessage.type = 'po-confirmation';
                      (currentModelMessage as any).pendingPo = {
                        supplier_id: args.supplier_id,
                        items: args.items,
                        total_amount: args.total_amount,
                        requisition_id: args.requisition_id,
                      };
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
                // Check if create_intake_request was called - force confirmation card
                const intakeTool = currentToolCalls.find(t => t.name === 'create_intake_request');
                if (intakeTool && intakeTool.arguments && currentModelMessage.type !== 'intake-confirmation') {
                  try {
                    const args = typeof intakeTool.arguments === 'string'
                      ? JSON.parse(intakeTool.arguments)
                      : intakeTool.arguments;
                    currentModelMessage.type = 'intake-confirmation';
                    (currentModelMessage as any).pendingIntake = {
                      title: args.title,
                      department: args.department,
                      amount: args.amount,
                      description: args.description,
                    };
                  } catch (e) {}
                }

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
          <div className="bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-zinc-500" />
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Confirm Purchase Requisition</h4>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">Please review the details before creating this requisition:</p>
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
                className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900"
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
                    // Clear the confirmation card by removing pendingIntake
                    setMessages(prev => prev.map(m => m.type === 'intake-confirmation' ? { ...m, type: 'text', pendingIntake: undefined } : m));
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
                className="border-zinc-200 text-muted-foreground hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                onClick={() => handleSend("I changed my mind. Cancel this requisition.")}
              >
                <AlertCircle className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        );
      }
      case 'supplier-confirmation': {
        const pending = (msg as any).pendingSupplier;
        if (!pending) return null;
        return (
          <div className="bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Confirm New Supplier</h4>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">Please review the supplier details before adding:</p>
            <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">{pending.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category:</span>
                <span className="font-medium">{pending.category}</span>
              </div>
              {pending.contact_email && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{pending.contact_email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Risk Level:</span>
                <span className="font-medium">{pending.risk_level}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900"
                onClick={async () => {
                  try {
                    const { addDoc, collection: fbCollection } = await import('firebase/firestore');
                    const newSupplier = {
                      name: pending.name,
                      category: pending.category,
                      contact_email: pending.contact_email || '',
                      risk: pending.risk_level,
                      status: 'Onboarding',
                      compliance: false,
                      userId: user?.uid || '',
                    };
                    const docRef = await addDoc(fbCollection(db, 'suppliers'), newSupplier);
                    toast.success(`Supplier "${pending.name}" added successfully`);
                    setMessages(prev => prev.map(m => m.type === 'supplier-confirmation' ? { ...m, type: 'text', pendingSupplier: undefined } : m));
                    handleSend(`Supplier "${pending.name}" has been added to the directory with ID ${docRef.id}. What would you like to do next?`);
                  } catch (e) {
                    console.error("Error creating supplier:", e);
                    toast.error("Failed to add supplier");
                  }
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Confirm & Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-200 text-muted-foreground hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                onClick={() => handleSend("I changed my mind. Cancel adding this supplier.")}
              >
                <AlertCircle className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        );
      }
      case 'rfq-confirmation': {
        const rfq = (msg as any).pendingRfq;
        if (!rfq) return null;
        return (
          <div className="bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-zinc-500" />
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Confirm RFQ Creation</h4>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Title:</span><span className="font-medium">{rfq.title}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Suppliers:</span><span className="font-medium">{rfq.supplier_ids?.length || 0}</span></div>
              {rfq.budget_range && <div className="flex justify-between"><span className="text-muted-foreground">Budget:</span><span className="font-medium">{rfq.budget_range}</span></div>}
              {rfq.due_date && <div className="flex justify-between"><span className="text-muted-foreground">Due:</span><span className="font-medium">{rfq.due_date}</span></div>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900" onClick={async () => {
                try {
                  const fb = await import('firebase/firestore');
                  const docRef = await fb.addDoc(fb.collection(db, 'rfqs'), {
                    title: rfq.title, description: rfq.description || '',
                    supplierIds: rfq.supplier_ids || [], dueDate: rfq.due_date || '',
                    budgetRange: rfq.budget_range || '', status: 'Draft',
                    createdBy: user?.uid || '', createdAt: new Date().toISOString(),
                    auditTrail: [{ action: 'created', actorId: user?.uid || '', timestamp: new Date().toISOString() }]
                  });
                  toast.success(`RFQ ${docRef.id} created`);
                  setMessages(prev => prev.map(m => m.type === 'rfq-confirmation' ? { ...m, type: 'text', pendingRfq: undefined } : m));
                  handleSend(`RFQ "${rfq.title}" created with ID ${docRef.id}. What next?`);
                } catch (e) { toast.error("Failed to create RFQ"); }
              }}><CheckCircle className="h-4 w-4 mr-1" /> Confirm</Button>
              <Button size="sm" variant="outline" className="border-zinc-200 text-muted-foreground hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800" onClick={() => handleSend("Cancel this RFQ.")}><AlertCircle className="h-4 w-4 mr-1" /> Cancel</Button>
            </div>
          </div>
        );
      }
      case 'bid-confirmation': {
        const bid = (msg as any).pendingBid;
        if (!bid) return null;
        return (
          <div className="bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="h-5 w-5 text-amber-600" />
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Confirm Bid Selection</h4>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Supplier:</span><span className="font-medium">{bid.supplier_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-medium">{bid.amount}</span></div>
              {bid.reasoning && <div className="pt-2 border-t"><span className="text-muted-foreground text-xs">Reasoning:</span><p className="text-xs mt-1">{bid.reasoning}</p></div>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900" onClick={async () => {
                try {
                  const fb = await import('firebase/firestore');
                  await fb.addDoc(fb.collection(db, 'bids'), {
                    rfqId: bid.rfq_id, supplierId: bid.supplier_id,
                    amount: bid.amount, reasoning: bid.reasoning || '',
                    status: 'Selected', createdBy: user?.uid || '',
                    createdAt: new Date().toISOString()
                  });
                  toast.success("Bid selected and recorded");
                  setMessages(prev => prev.map(m => m.type === 'bid-confirmation' ? { ...m, type: 'text', pendingBid: undefined } : m));
                  handleSend(`Bid from ${bid.supplier_id} for ${bid.amount} confirmed. What next?`);
                } catch (e) { toast.error("Failed to record bid"); }
              }}><CheckCircle className="h-4 w-4 mr-1" /> Confirm</Button>
              <Button size="sm" variant="outline" className="border-zinc-200 text-muted-foreground hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800" onClick={() => handleSend("Cancel this bid selection.")}><AlertCircle className="h-4 w-4 mr-1" /> Cancel</Button>
            </div>
          </div>
        );
      }
      case 'po-confirmation': {
        const po = (msg as any).pendingPo;
        if (!po) return null;
        return (
          <div className="bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-zinc-500" />
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Confirm Purchase Order</h4>
            </div>
            <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Supplier:</span><span className="font-medium">{po.supplier_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total:</span><span className="font-medium">{po.total_amount}</span></div>
              {po.items?.length > 0 && (
                <div className="pt-2 border-t">
                  <span className="text-muted-foreground text-xs">Items:</span>
                  {po.items.map((item: any, i: number) => (
                    <div key={i} className="text-xs mt-1">{item.name} x{item.quantity} @ {item.unit_price}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900" onClick={async () => {
                try {
                  const fb = await import('firebase/firestore');
                  const poId = `PO-${Date.now()}`;
                  await fb.addDoc(fb.collection(db, 'purchaseOrders'), {
                    id: poId, supplierId: po.supplier_id, items: po.items || [],
                    totalAmount: po.total_amount, status: 'Pending Approval',
                    createdBy: user?.uid || '', createdAt: new Date().toISOString()
                  });
                  toast.success(`PO ${poId} created`);
                  setMessages(prev => prev.map(m => m.type === 'po-confirmation' ? { ...m, type: 'text', pendingPo: undefined } : m));
                  handleSend(`Purchase Order ${poId} created for ${po.total_amount}. What next?`);
                } catch (e) { toast.error("Failed to create PO"); }
              }}><CheckCircle className="h-4 w-4 mr-1" /> Confirm</Button>
              <Button size="sm" variant="outline" className="border-zinc-200 text-muted-foreground hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800" onClick={() => handleSend("Cancel this purchase order.")}><AlertCircle className="h-4 w-4 mr-1" /> Cancel</Button>
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
            <div className="bg-zinc-50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Human Approval Required</h4>
                <Badge className={riskColors[approvalTool.arguments?.risk_level || 'medium']}>
                  {approvalTool.arguments?.risk_level || 'medium'} risk
                </Badge>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">{approvalTool.arguments?.action}</p>
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
                  className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900"
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

  const renderInputForm = () => {
    return (
      <form
        className="flex flex-col w-full gap-2 relative"
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept=".pdf,.txt,.md,.docx,.xlsx"
        />
        <div className="flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-3xl bg-zinc-50/50 dark:bg-zinc-950/20 px-4 py-3 focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-600 focus-within:border-zinc-400 dark:focus-within:border-zinc-600 transition-all text-left">
          <textarea
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message Procurely..."
            rows={1}
            className="w-full resize-none bg-transparent border-0 outline-none text-sm min-h-[28px] max-h-[120px] py-1 placeholder:text-muted-foreground text-foreground"
            disabled={isLoading}
            style={{ height: 'auto' }}
          />
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-150/80 dark:border-zinc-800/40">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 rounded-full text-muted-foreground hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isLoading}
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="sm" 
                    className="h-8 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs px-2.5 font-normal text-muted-foreground flex items-center gap-1.5 hover:bg-zinc-200/40 dark:hover:bg-zinc-805 bg-background shadow-none"
                  />
                }>
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-medium">{selectedModel}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-popover text-popover-foreground border border-zinc-200 dark:border-zinc-800 shadow-md max-h-[400px] overflow-y-auto">
                  {/* Qwen Flagship */}
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Qwen Flagship</div>
                  <DropdownMenuItem onClick={() => setSelectedModel('qwen3.7-max')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">qwen3.7-max</span>
                      <span className="text-[10px] text-muted-foreground">Maximum Performance</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedModel('qwen3.7-max-2026-06-08')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">qwen3.7-max-2026-06-08</span>
                      <span className="text-[10px] text-muted-foreground">Maximum Performance</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedModel('qwen3.5-plus-2026-02-15')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">qwen3.5-plus-2026-02-15</span>
                      <span className="text-[10px] text-muted-foreground">Balanced</span>
                    </div>
                  </DropdownMenuItem>

                  {/* Qwen Fast */}
                  <div className="px-2 py-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t border-zinc-200 dark:border-zinc-800">Qwen Fast</div>
                  <DropdownMenuItem onClick={() => setSelectedModel('qwen3.6-flash')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">qwen3.6-flash</span>
                      <span className="text-[10px] text-muted-foreground">Fast & Cost-Efficient</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedModel('qwen3.6-plus')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">qwen3.6-plus</span>
                      <span className="text-[10px] text-muted-foreground">Preview Model</span>
                    </div>
                  </DropdownMenuItem>

                  {/* Third-Party */}
                  <div className="px-2 py-1 mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t border-zinc-200 dark:border-zinc-800">Third-Party Models</div>
                  <DropdownMenuItem onClick={() => setSelectedModel('glm-5.2')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">glm-5.2</span>
                      <span className="text-[10px] text-muted-foreground">Zhipu AI</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedModel('deepseek-v4-pro')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">deepseek-v4-pro</span>
                      <span className="text-[10px] text-muted-foreground">DeepSeek Pro</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedModel('deepseek-v4-flash')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">deepseek-v4-flash</span>
                      <span className="text-[10px] text-muted-foreground">DeepSeek Fast</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedModel('MiniMax-M2.7')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">MiniMax-M2.7</span>
                      <span className="text-[10px] text-muted-foreground">MiniMax</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedModel('mimo-v2.5-pro')} className="cursor-pointer">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">mimo-v2.5-pro</span>
                      <span className="text-[10px] text-muted-foreground">Xiaomi MiMo</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={toggleRecording}
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-full ${isRecording ? 'text-red-500 hover:text-red-650 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-900 animate-pulse' : 'text-muted-foreground hover:text-foreground hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'}`}
              >
                {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                size="icon"
                className="h-8 w-8 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-950 text-white shadow-sm disabled:opacity-30 flex items-center justify-center cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </Button>
            </div>
          </div>
        </div>
      </form>
    );
  };

  const renderSuggestedPrompts = () => {
    return (
      <div className="flex flex-wrap justify-center gap-2 w-full max-w-2xl mx-auto mt-2">
        {SUGGESTED_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => handleSend(prompt.text)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs text-muted-foreground hover:bg-zinc-100/50 dark:hover:bg-zinc-850 hover:text-foreground transition-all duration-200 shadow-none cursor-pointer"
          >
            <span className="text-sm">{prompt.icon}</span>
            <span className="font-medium">{prompt.text.length > 35 ? prompt.text.substring(0, 35) + '...' : prompt.text}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="p-0 md:p-4 flex h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] gap-0">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-200 overflow-hidden border-r bg-zinc-50/60 dark:bg-zinc-950/20 flex flex-col shrink-0 hidden md:flex`}>
        <div className="p-4 flex items-center justify-between border-b mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-white dark:text-zinc-900" />
            </div>
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-50">procurely</span>
          </div>
        </div>
        <div className="px-3 pb-3">
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2 rounded-xl text-xs font-medium border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 bg-background text-foreground h-9 shadow-none"
            onClick={createNewChat}
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            New Thread
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {chats.map(chat => (
            <div
              key={chat.id}
              onClick={() => switchChat(chat.id)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                activeChatId === chat.id
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 hover:text-foreground'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate flex-1 text-xs">{chat.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-destructive text-muted-foreground"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        <Card className="flex-1 flex flex-col min-h-0 bg-background border-0 shadow-none rounded-none">
          <CardHeader className="border-b py-3 px-4 bg-background">
            <CardTitle className="flex items-center gap-3 text-base font-medium">
              {/* Back Button */}
              <a 
                href="/app" 
                className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                title="Back to Dashboard"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </a>

              {/* Toggle Sidebar Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg transition-colors shrink-0"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title="Toggle Sidebar"
              >
                {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
              </Button>

              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 shrink-0" />

              {/* Chat Title */}
              <span className="text-sm font-medium truncate text-foreground">
                {activeChatId ? (chats.find(c => c.id === activeChatId)?.title || "Chat") : "New Chat"}
              </span>
            {useContext && (
              <Badge variant="secondary" className="text-[10px] bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 ml-1">
                KB Active
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0 relative bg-background">
          <div className="h-full overflow-y-auto" ref={scrollRef}>
            {/* Empty state: show when only welcome message exists */}
            {messages.length <= 1 && !isLoading && messages[0]?.content === WELCOME_MSG.content && (
              <div className="flex flex-col items-center justify-center min-h-[85%] h-full max-w-3xl mx-auto px-4 gap-6 select-none">
                <h2 className="text-3xl font-semibold text-foreground tracking-tight text-center">How can I help you today?</h2>
                <div className="w-full">
                  {renderInputForm()}
                </div>
                {renderSuggestedPrompts()}
              </div>
            )}

            {/* Messages */}
            {(messages.length > 1 || messages[0]?.content !== WELCOME_MSG.content) && (
            <div className="flex flex-col gap-6 p-4 md:p-6 pb-4 max-w-3xl mx-auto w-full">
              {messages.map((msg, idx) => {
                const isStreaming = isLoading && idx === messages.length - 1;
                const isLastModel = msg.role === 'model' && idx === messages.length - 1;
                return (
                  <div key={idx} className={`flex gap-3 max-w-[95%] md:max-w-[85%] group ${msg.role === 'user' ? 'self-end' : 'self-start w-full'}`}>
                    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
                      {msg.role === 'user' ? (
                        <div className="relative">
                          <div className="px-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-250/20 dark:border-zinc-700/35 rounded-tr-sm shadow-none">
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-headings:my-0 text-zinc-900 dark:text-zinc-100">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1 justify-end">
                            {msg.timestamp && <span className="text-[10px] text-muted-foreground">{formatTimestamp(msg.timestamp)}</span>}
                            <CopyButton text={msg.content} />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full">
                          <ExpandableBotMessage msg={msg} renderCard={renderCard} isStreaming={isStreaming} onSelect={handleSend} />
                          <div className="flex items-center gap-2 mt-1">
                            {msg.timestamp && <span className="text-[10px] text-muted-foreground">{formatTimestamp(msg.timestamp)}</span>}
                            <CopyButton text={msg.content} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Regenerate button */}
              {!isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'model' && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                      if (lastUserMsg) {
                        setMessages(prev => prev.slice(0, -1));
                        handleSend(lastUserMsg.content);
                      }
                    }}
                    className="gap-2 text-xs text-muted-foreground"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                    Regenerate
                  </Button>
                </div>
              )}
              {isLoading && messages[messages.length - 1]?.role !== 'model' && (
                <div className="flex gap-3 max-w-[95%] md:max-w-[85%] self-start w-full">
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <Bot className="h-3.5 w-3.5 text-zinc-50 dark:text-zinc-900" />
                  </div>
                  <div className="bg-card border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-.3s]" />
                        <span className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-.5s]" />
                      </div>
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </CardContent>
        {/* Footer: only render when chat is NOT empty or is loading */}
        {(messages.length > 1 || messages[0]?.content !== WELCOME_MSG.content || isLoading) && (
          <div className="px-4 pb-6 pt-2 bg-background w-full">
            <div className="w-full max-w-3xl mx-auto">
              {renderInputForm()}
            </div>
          </div>
        )}
      </Card>
      </div>
    </div>
  );
}
