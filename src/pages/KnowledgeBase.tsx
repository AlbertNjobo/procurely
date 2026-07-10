import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, FileText, Trash2, Search, Loader2, Folder, ChevronDown, ChevronRight, Shield } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { toast } from 'sonner';
import init, { LiteParse } from '@llamaindex/liteparse-wasm';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import ReactMarkdown from 'react-markdown';
import { apiFetch } from '../lib/api';

interface KnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  content: string;
  category?: string;
  department?: string;
  summary?: string;
  createdAt: string;
}

export function KnowledgeBase() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Pending Upload State
  const [pendingUpload, setPendingUpload] = useState<{ fileName: string, title: string, text: string, summary?: string } | null>(null);
  const [suggestedCategory, setSuggestedCategory] = useState<string>('Other');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('Uncategorized');
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);

  // Manual Instruction State
  const [isInstructionDialogOpen, setIsInstructionDialogOpen] = useState(false);
  const [instructionTitle, setInstructionTitle] = useState('');
  const [instructionContent, setInstructionContent] = useState('');
  const [instructionDept, setInstructionDept] = useState('Uncategorized');
  const [instructionCategory, setInstructionCategory] = useState('Guideline');

  // Expanded Folders
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (dept: string) => {
    setCollapsedFolders(prev => ({ ...prev, [dept]: !prev[dept] }));
  };

  // Preview state
  const [previewDoc, setPreviewDoc] = useState<KnowledgeDocument | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [kbEnabled, setKbEnabled] = useState(() => localStorage.getItem('kb-context-enabled') !== 'false');

  const toggleKbEnabled = () => {
    const next = !kbEnabled;
    setKbEnabled(next);
    localStorage.setItem('kb-context-enabled', String(next));
  };

  useEffect(() => {
    // Initialize LiteParse WASM module
    init('/liteparse_wasm_bg.wasm').catch(console.error);
    fetchDocuments();
  }, [user]);

  const fetchDocuments = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'knowledgeBase'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KnowledgeDocument));
      setDocuments(docs);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Failed to load knowledge base documents');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

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
      const text = result.text;
      const title = file.name.replace(/\.[^/.]+$/, "");
      
      setIsUploading(false);
      setIsClassifying(true);
      toast.info('Analyzing document category...');
      
      // Auto-classify using AI
      let summaryStr = undefined;
      try {
        const response = await apiFetch('/api/documents/classify', {
          method: 'POST',
          body: JSON.stringify({ text, fileName: file.name })
        });
        const data = await response.json();
        if (data.category) {
          setSuggestedCategory(data.category);
        }
        if (data.summary) {
          summaryStr = data.summary;
        }
      } catch (err) {
        console.error('Classification error:', err);
        setSuggestedCategory('Other');
      }

      setPendingUpload({ fileName: file.name, title, text, summary: summaryStr });
      setIsClassifying(false);
      setIsConfirmDialogOpen(true);

    } catch (error) {
      console.error('Error uploading document:', error);
      toast.error('Failed to parse document');
      setIsUploading(false);
    } finally {
      if (event.target) {
        event.target.value = ''; // Reset input
      }
    }
  };

  const confirmUpload = async () => {
    if (!user || !pendingUpload) return;
    
    setIsUploading(true);
    setIsConfirmDialogOpen(false);
    
    try {
      const newDoc = {
        userId: user.uid,
        title: pendingUpload.title,
        fileName: pendingUpload.fileName,
        content: pendingUpload.text,
        category: suggestedCategory,
        department: selectedDepartment,
        summary: pendingUpload.summary || null,
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'knowledgeBase'), newDoc);

      // Generate embeddings and store in Zvec
      try {
        toast.info('Generating embeddings for semantic search...');
        const embedResponse = await apiFetch('/api/kb/embed', {
          method: 'POST',
          body: JSON.stringify({
            docId: docRef.id,
            title: pendingUpload.title,
            content: pendingUpload.text,
            category: suggestedCategory
          })
        });
        if (embedResponse.ok) {
          const embedData = await embedResponse.json();
          toast.success(`Document uploaded with ${embedData.count} searchable chunks`);
        }
      } catch (embedErr) {
        console.error('Embedding failed (document still saved):', embedErr);
        toast.success('Document uploaded (embedding pending)');
      }

      setPendingUpload(null);
      fetchDocuments();
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Failed to save document');
    } finally {
      setIsUploading(false);
    }
  };

  const saveInstruction = async () => {
    if (!user) return;
    if (!instructionTitle.trim() || !instructionContent.trim()) {
      toast.error('Title and content are required');
      return;
    }
    
    setIsUploading(true);
    try {
      const newDoc = {
        userId: user.uid,
        title: instructionTitle,
        fileName: 'Manual Instruction',
        content: instructionContent,
        category: instructionCategory,
        department: instructionDept,
        summary: 'Manual instruction added by user.',
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'knowledgeBase'), newDoc);

      // Generate embeddings and store in Zvec
      try {
        const embedResponse = await apiFetch('/api/kb/embed', {
          method: 'POST',
          body: JSON.stringify({
            docId: docRef.id,
            title: instructionTitle,
            content: instructionContent,
            category: instructionCategory
          })
        });
      } catch (embedErr) {
        console.error('Embedding failed for instruction:', embedErr);
      }

      toast.success('Instruction added with semantic search enabled');
      setIsInstructionDialogOpen(false);
      setInstructionTitle('');
      setInstructionContent('');
      fetchDocuments();
    } catch (error) {
      console.error('Error saving instruction:', error);
      toast.error('Failed to save instruction');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'knowledgeBase', id));
      setDocuments(docs => docs.filter(d => d.id !== id));
      toast.success('Document deleted');
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete document');
    }
  };

  const filteredDocs = documents.filter(d => {
    const query = searchQuery.toLowerCase();
    return d.title.toLowerCase().includes(query) || 
           d.fileName.toLowerCase().includes(query) ||
           (d.category && d.category.toLowerCase().includes(query)) ||
           (d.department && d.department.toLowerCase().includes(query)) ||
           (d.content && d.content.toLowerCase().includes(query));
  });

  const groupedDocs = filteredDocs.reduce((acc, doc) => {
    const dept = doc.department || 'Uncategorized';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(doc);
    return acc;
  }, {} as Record<string, KnowledgeDocument[]>);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">Upload policies and documents for the AI Agent to reference.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
            <button
              type="button"
              role="switch"
              aria-checked={kbEnabled}
              onClick={toggleKbEnabled}
              className={`w-9 h-5 rounded-full transition-colors relative flex items-center ${kbEnabled ? 'bg-amber-600' : 'bg-muted-foreground/30'}`}
            >
              <div className={`w-3.5 h-3.5 bg-white rounded-full absolute shadow-sm transition-transform ${kbEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
            </button>
            AI Agent uses KB context
          </label>
        </div>
        <div>
          <Input 
            type="file" 
            id="file-upload" 
            className="hidden" 
            onChange={handleFileUpload} 
            accept=".pdf,.txt,.md"
            disabled={isUploading || isClassifying}
          />
          <Button variant="outline" className="mr-2" onClick={() => setIsInstructionDialogOpen(true)} disabled={isUploading || isClassifying}>
            <FileText className="mr-2 h-4 w-4" /> Add Instruction
          </Button>
          <Button onClick={() => document.getElementById('file-upload')?.click()} disabled={isUploading || isClassifying}>
            {isUploading || isClassifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {isClassifying ? 'Classifying...' : isUploading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, tag, or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-1">No documents found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Upload policies, contracts, or guidelines. The AI Agent will use these to answer your procurement questions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedDocs).map(([dept, docs]) => (
            <div key={dept} className="space-y-3">
              <div 
                className="flex items-center gap-2 cursor-pointer p-2 hover:bg-muted/50 rounded-md transition-colors"
                onClick={() => toggleFolder(dept)}
              >
                <Folder className="h-5 w-5 text-purple-500 fill-purple-100 dark:fill-purple-900" />
                <h3 className="font-medium text-lg">{dept}</h3>
                <Badge variant="secondary" className="ml-2">{docs.length}</Badge>
                {collapsedFolders[dept] ? <ChevronRight className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
              </div>
              
              {!collapsedFolders[dept] && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-4 border-l-2 border-muted ml-2">
                  {docs.map((doc) => (
                    <Card 
                      key={doc.id} 
                      className="group hover:shadow-md transition-all cursor-pointer"
                      onClick={() => {
                        setPreviewDoc(doc);
                        setIsPreviewOpen(true);
                      }}
                    >
                      <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                        <div className="space-y-1">
                          <CardTitle className="text-base font-semibold line-clamp-1">{doc.title}</CardTitle>
                          <CardDescription className="text-xs line-clamp-1">{doc.fileName}</CardDescription>
                        </div>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${(doc as any).category === 'Policy' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10'}`}>
                          {(doc as any).category === 'Policy' ? (
                            <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <FileText className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xs text-muted-foreground mb-4">
                          Added on {new Date(doc.createdAt).toLocaleDateString()}
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex gap-2">
                            {(doc as any).chunks && (doc as any).chunks.length > 0 ? (
                              <Badge variant="outline" className="text-[10px]">Indexed</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">Not Indexed</Badge>
                            )}
                            {(doc as any).category === 'Policy' ? (
                              <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                                <Shield className="h-3 w-3 mr-1" />
                                Policy
                              </Badge>
                            ) : (doc as any).category ? (
                              <Badge variant="secondary" className="text-[10px]">{(doc as any).category}</Badge>
                            ) : null}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(doc.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmDialogOpen} onOpenChange={(open) => {
        setIsConfirmDialogOpen(open);
        if (!open) setPendingUpload(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Document Details</DialogTitle>
            <DialogDescription>
              We've analyzed "{pendingUpload?.fileName}" and suggested a category. Please assign a department and confirm before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="department">Department</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger id="department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Finance">Finance</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                  <SelectItem value="Legal">Legal</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="Procurement">Procurement</SelectItem>
                  <SelectItem value="Uncategorized">Uncategorized</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Select value={suggestedCategory} onValueChange={setSuggestedCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Policy">Policy</SelectItem>
                  <SelectItem value="Contract">Contract</SelectItem>
                  <SelectItem value="Quote">Quote</SelectItem>
                  <SelectItem value="Invoice">Invoice</SelectItem>
                  <SelectItem value="Guideline">Guideline</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsConfirmDialogOpen(false);
              setPendingUpload(null);
            }}>Cancel</Button>
            <Button onClick={confirmUpload} disabled={isUploading}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Instruction Dialog */}
      <Dialog open={isInstructionDialogOpen} onOpenChange={setIsInstructionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Manual Instruction</DialogTitle>
            <DialogDescription>
              Paste instructions or knowledge directly into the knowledge base for the AI Agent to reference.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="instruction-title">Title</Label>
              <Input 
                id="instruction-title" 
                value={instructionTitle} 
                onChange={(e) => setInstructionTitle(e.target.value)} 
                placeholder="e.g. Gemini on AI Studio Usage"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="instruction-dept">Department</Label>
                <Select value={instructionDept} onValueChange={setInstructionDept}>
                  <SelectTrigger id="instruction-dept">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="Procurement">Procurement</SelectItem>
                    <SelectItem value="Uncategorized">Uncategorized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="instruction-category">Category</Label>
                <Select value={instructionCategory} onValueChange={setInstructionCategory}>
                  <SelectTrigger id="instruction-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Policy">Policy</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Quote">Quote</SelectItem>
                    <SelectItem value="Invoice">Invoice</SelectItem>
                    <SelectItem value="Guideline">Guideline</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2 flex-1">
              <Label htmlFor="instruction-content">Content / Instructions</Label>
              <textarea 
                id="instruction-content" 
                className="flex min-h-[250px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                value={instructionContent} 
                onChange={(e) => setInstructionContent(e.target.value)}
                placeholder="Paste the instructions or knowledge here..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInstructionDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveInstruction} disabled={isUploading}>
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Instruction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewDoc?.title}</DialogTitle>
            <DialogDescription>
              {previewDoc?.fileName}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-6">
            {previewDoc?.summary && (
              <div className="bg-muted p-4 rounded-lg">
                <h4 className="text-sm font-semibold mb-2">Key Points</h4>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{previewDoc.summary}</ReactMarkdown>
                </div>
              </div>
            )}
            <div>
              <h4 className="text-sm font-semibold mb-2">Full Document</h4>
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                <ReactMarkdown>{previewDoc?.content || ''}</ReactMarkdown>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
