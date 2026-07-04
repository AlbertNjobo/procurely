import { useState, useEffect } from 'react';
import { useFormAutoSave } from '../hooks/useFormAutoSave';
import { Link, useSearchParams } from 'react-router-dom';
import { updateDoc, doc, addDoc, collection, getDoc } from 'firebase/firestore';
import { useData } from '../lib/data-context';
import { db, auth } from '../lib/firebase';
import { logAuditEvent } from '../lib/audit';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, MoreHorizontal, Search, Bot, Sparkles, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { AgentDialog } from '../components/agent/AgentDialog';
import { ApprovalProcess, ApprovalStep } from '../components/ApprovalProcess';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'motion/react';

import { PurchaseRequisition } from '../types';

const WORKFLOW_STEPS = ['Draft', 'Pending Manager', 'Pending RFQ', 'Pending Finance', 'PO Generated'];

function getApprovalSteps(currentStatus: string): ApprovalStep[] {
  let displayStatus = currentStatus;
  if (currentStatus === 'Pending Manager Approval') displayStatus = 'Pending Manager';
  if (currentStatus === 'Pending Finance Approval') displayStatus = 'Pending Finance';
  
  const isRejected = currentStatus === 'Rejected';
  let currentIndex = WORKFLOW_STEPS.indexOf(displayStatus);
  if (currentIndex === -1) currentIndex = isRejected ? 1 : 0; 

  return WORKFLOW_STEPS.map((step, index) => {
    let status: ApprovalStep['status'] = 'pending';
    let actor: string | undefined;
    let date: string | undefined;
    
    if (isRejected && index === currentIndex) {
      status = 'rejected';
      actor = 'System';
      date = new Date().toISOString().split('T')[0];
    } else if (index < currentIndex) {
      status = 'completed';
      if (step === 'Pending Manager') { actor = 'Sarah Connor'; date = '2026-06-25'; }
      if (step === 'Pending RFQ') { actor = 'AI Agent'; date = '2026-06-26'; }
      if (step === 'Pending Finance') { actor = 'John Smith'; date = '2026-06-27'; }
    } else if (index === currentIndex && !isRejected) {
      status = 'current';
      if (step === 'Pending Manager') { actor = 'Sarah Connor'; }
      if (step === 'Pending RFQ') { actor = 'AI Agent'; }
      if (step === 'Pending Finance') { actor = 'John Smith'; }
    }

    return {
      id: step,
      label: step,
      status,
      actor,
      date
    };
  });
}

const getStatusBadge = (status: string) => {
  let badgeProps = { className: "" };
  switch (status) {
    case 'PO Generated':
    case 'Approved':
      badgeProps.className = "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
      break;
    case 'Pending Manager Approval':
    case 'Pending Finance Approval':
    case 'Pending':
      badgeProps.className = "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
      break;
    case 'Pending RFQ':
      badgeProps.className = "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
      break;
    case 'Rejected':
      badgeProps.className = "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800";
      break;
    case 'Draft':
    default:
      badgeProps.className = "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
      break;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="inline-block"
      >
        <Badge variant="outline" className={badgeProps.className}>{status}</Badge>
      </motion.div>
    </AnimatePresence>
  );
};

export function Requisitions() {
  const { purchaseRequisitions: requisitions } = useData();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedRequest, setSelectedRequest] = useState<PurchaseRequisition | null>(null);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<PurchaseRequisition>>({});
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [newRequestData, setNewRequestData, clearAutoSave] = useFormAutoSave('requisitions-new-form', {
    title: '', purpose: '', category: '', items: '', reason: '', totalAmount: '', costCenter: ''
  });



  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setIsNewRequestOpen(true);
      setSearchParams(new URLSearchParams());
    }
  }, [searchParams, setSearchParams]);

  const filteredRequisitions = requisitions.filter((req) => {
    const query = searchQuery.toLowerCase();
    return (
      req.title?.toLowerCase().includes(query) ||
      req.category?.toLowerCase().includes(query) ||
      (req.reason && req.reason.toLowerCase().includes(query)) ||
      (req.id && req.id.toLowerCase().includes(query))
    );
  });

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredRequisitions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRequisitions.map(r => r.id)));
    }
  };

  const handleBulkAction = async (action: 'approve' | 'archive') => {
    if (selectedIds.size === 0) return;
    try {
      const promises = Array.from(selectedIds).map(id => {
        const status = action === 'approve' ? 'Approved' : 'Archived';
        return updateDoc(doc(db, 'purchaseRequisitions', id), { status });
      });
      await Promise.all(promises);
      toast.success(`Successfully ${action}d ${selectedIds.size} items.`);
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      toast.error(`Failed to bulk ${action} items.`);
    }
  };

  const handleCreateRequest = async () => {
    if (!auth.currentUser) {
      toast.error("Please sign in to create a requisition");
      return;
    }
    
    if (!newRequestData.title || !newRequestData.totalAmount) {
      toast.error('Please fill in required fields (Title, Amount).');
      return;
    }
    
    try {
      const amount = parseFloat(newRequestData.totalAmount) || 0;
      let initialStatus = 'Pending Manager Approval';
      if (amount >= 10000) {
        initialStatus = 'Pending Finance Approval';
      }

      const newReq = {
        title: newRequestData.title,
        status: initialStatus,
        purpose: newRequestData.purpose || 'Internal Use',
        category: newRequestData.category || 'Other',
        items: newRequestData.items || '',
        reason: newRequestData.reason || '',
        costCenter: newRequestData.costCenter || '',
        totalAmount: amount,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid,
        supplier: '',
        auditTrail: [{
          id: crypto.randomUUID(),
          action: `Created Requisition (${initialStatus})`,
          actorId: auth.currentUser.uid,
          timestamp: new Date().toISOString()
        }]
      };

      const docRef = await addDoc(collection(db, 'purchaseRequisitions'), newReq);
      
      await logAuditEvent('Created Requisition', docRef.id, 'purchaseRequisitions', null, newReq, auth.currentUser.uid);

      toast.success(`Requisition created and routed to ${initialStatus}`);
      setIsNewRequestOpen(false);
      clearAutoSave();
    } catch (error) {
      console.error("Error creating requisition", error);
      toast.error("Failed to create requisition");
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string, updates: Partial<PurchaseRequisition> = {}) => {
    try {
      const reqRef = doc(db, 'purchaseRequisitions', id);
      const docSnap = await getDoc(reqRef);
      const oldData = docSnap.exists() ? docSnap.data() : null;

      const newData = {
        status: newStatus,
        ...updates
      };

      await updateDoc(reqRef, newData);
      
      if (auth.currentUser) {
        await logAuditEvent('Updated Requisition Status', id, 'purchaseRequisitions', oldData, { ...oldData, ...newData }, auth.currentUser.uid);
      }
      
      // Update local state and selected request
      if (selectedRequest && selectedRequest.id === id) {
        setSelectedRequest({ ...selectedRequest, ...newData } as PurchaseRequisition);
      }
      
      toast.success(`Requisition updated to ${newStatus}`);
    } catch (error) {
      console.error("Error updating status", error);
      toast.error("Failed to update status");
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedRequest) return;
    try {
      await updateDoc(doc(db, 'purchaseRequisitions', selectedRequest.id), {
        category: editData.category || selectedRequest.category,
        totalAmount: typeof editData.totalAmount === 'string' ? parseFloat(editData.totalAmount) : (editData.totalAmount || selectedRequest.totalAmount),
        supplier: editData.supplier || selectedRequest.supplier,
        reason: editData.reason || selectedRequest.reason
      });
      toast.success('Request updated.');
      setIsEditing(false);
      
      // Update local selected request
      setSelectedRequest({
        ...selectedRequest,
        ...editData,
        totalAmount: typeof editData.totalAmount === 'string' ? parseFloat(editData.totalAmount) : (editData.totalAmount || selectedRequest.totalAmount)
      });
    } catch (error) {
      console.error("Error saving changes", error);
      toast.error("Failed to save changes");
    }
  };

  return (
    <div className="p-6 md:p-8 flex flex-col gap-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Requisitions</h1>
          <p className="text-muted-foreground mt-2">Manage and track your procurement requests from idea to pay.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100" onClick={() => setIsAgentDialogOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" /> AI Draft Request
          </Button>
          <Button onClick={() => setIsNewRequestOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Requisition
            <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 font-mono text-[10px] font-medium text-primary-foreground opacity-100">
              <span className="text-xs">⌘</span>N
            </kbd>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Recent Requisitions</CardTitle>
            <CardDescription>A list of your recent procurement requests and their status.</CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search requisitions..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
             <div className="py-8 text-center text-muted-foreground">Loading requisitions...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300"
                      checked={filteredRequisitions.length > 0 && selectedIds.size === filteredRequisitions.length}
                      onChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Request Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequisitions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No requisitions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequisitions.map((req) => (
                    <TableRow key={req.id} className={selectedIds.has(req.id) ? "bg-muted/50" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300"
                          checked={selectedIds.has(req.id)}
                          onChange={() => toggleSelection(req.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{req.title}</TableCell>
                      <TableCell>{req.category || 'N/A'}</TableCell>
                      <TableCell>${Number(req.totalAmount).toLocaleString()}</TableCell>
                      <TableCell>{new Date(req.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {getStatusBadge(req.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link to={`/tracker/${req.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                            Track Journey
                          </Link>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setSelectedRequest(req);
                            setEditData(req);
                          }}>
                            View Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedRequest && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <SheetTitle className="text-2xl font-bold">{selectedRequest.title}</SheetTitle>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <SheetDescription className="text-base text-foreground font-medium">
                  Submitted {new Date(selectedRequest.createdAt).toLocaleDateString()}
                </SheetDescription>
              </SheetHeader>
              
              <div className="flex flex-col gap-8">
                <div>
                  <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Request Workflow</h3>
                  <ApprovalProcess steps={getApprovalSteps(selectedRequest.status)} />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Category</p>
                    {isEditing ? (
                      <Input value={editData.category || ''} onChange={e => setEditData({...editData, category: e.target.value})} className="h-8" />
                    ) : (
                      <p className="font-medium">{selectedRequest.category || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Requested Amount</p>
                    {isEditing ? (
                      <Input type="number" value={editData.totalAmount || ''} onChange={e => setEditData({...editData, totalAmount: e.target.value})} className="h-8" />
                    ) : (
                      <p className="font-medium">${Number(selectedRequest.totalAmount).toLocaleString()}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Target Supplier</p>
                    {isEditing ? (
                      <Input value={editData.supplier || ''} onChange={e => setEditData({...editData, supplier: e.target.value})} className="h-8" />
                    ) : (
                      <p className="font-medium">{selectedRequest.supplier || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Purpose</p>
                    <p className="font-medium">{selectedRequest.purpose || 'Internal Use'}</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Business Justification</h3>
                  {isEditing ? (
                    <Textarea value={editData.reason || ''} onChange={e => setEditData({...editData, reason: e.target.value})} />
                  ) : (
                    <p className="text-sm leading-relaxed">{selectedRequest.reason || 'No justification provided.'}</p>
                  )}
                </div>
              </div>
              
              <SheetFooter className="mt-8 pt-4 border-t flex sm:justify-between items-center">
                <Button variant="outline" onClick={() => {
                  if (isEditing) {
                    setIsEditing(false);
                  } else {
                    setSelectedRequest(null);
                  }
                }}>
                  {isEditing ? 'Cancel' : 'Close'}
                </Button>
                <div className="flex flex-wrap gap-2 justify-end">
                  {isEditing ? (
                    <Button onClick={handleSaveChanges}>Save Changes</Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => {
                        setEditData(selectedRequest);
                        setIsEditing(true);
                      }}>Edit Info</Button>
                      
                      {(selectedRequest.status === 'Draft' || selectedRequest.status === 'Pending') && (
                        <Button onClick={() => handleUpdateStatus(selectedRequest.id, 'Pending Manager Approval')}>Submit to Manager</Button>
                      )}
                      
                      {selectedRequest.status === 'Pending Manager Approval' && (
                        <>
                          <Button variant="destructive" onClick={() => handleUpdateStatus(selectedRequest.id, 'Rejected')}>Reject</Button>
                          <Button onClick={() => handleUpdateStatus(selectedRequest.id, 'Pending RFQ')}>Manager Approve</Button>
                        </>
                      )}
                      
                      {selectedRequest.status === 'Pending RFQ' && (
                        <Button onClick={() => {
                          toast.info('AI is running RFQ to suggest suppliers...');
                          setTimeout(() => {
                            handleUpdateStatus(selectedRequest.id, 'Pending Finance Approval', { supplier: 'TechProcure Inc.' });
                          }, 2000);
                        }}>
                          <Bot className="mr-2 h-4 w-4" /> Generate AI RFQ
                        </Button>
                      )}
                      
                      {selectedRequest.status === 'Pending Finance Approval' && (
                        <>
                          <Button variant="destructive" onClick={() => handleUpdateStatus(selectedRequest.id, 'Rejected')}>Reject</Button>
                          <Button onClick={() => handleUpdateStatus(selectedRequest.id, 'PO Generated')}>Finance Approve (PO)</Button>
                        </>
                      )}
                      
                      {selectedRequest.status === 'PO Generated' && (
                        <Button variant="secondary" onClick={() => {
                          toast.info(`Viewing Purchase Order for ${selectedRequest.title}`);
                        }}>View PO</Button>
                      )}
                    </>
                  )}
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={isNewRequestOpen} onOpenChange={setIsNewRequestOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Requisition</DialogTitle>
            <DialogDescription>
              Fill out the details manually, or let the AI Agent help you.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button variant="outline" className="w-full bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary" onClick={() => setIsAgentDialogOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" /> Auto-fill with AI Agent
            </Button>
            <div className="grid grid-cols-4 items-center gap-4 mt-2">
              <Label htmlFor="title" className="text-right">Title</Label>
              <Input
                id="title"
                value={newRequestData.title}
                onChange={(e) => setNewRequestData({ ...newRequestData, title: e.target.value })}
                className="col-span-3"
                placeholder="e.g. Q3 AWS Hosting"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4 mt-2">
              <Label htmlFor="costCenter" className="text-right">Cost Center</Label>
              <Input
                id="costCenter"
                value={newRequestData.costCenter}
                onChange={(e) => setNewRequestData({ ...newRequestData, costCenter: e.target.value })}
                className="col-span-3"
                placeholder="e.g. Engineering (ENG-101)"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">Category</Label>
              <div className="col-span-3">
                <Select value={newRequestData.category} onValueChange={(v) => setNewRequestData({...newRequestData, category: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IT Equipment">IT Equipment</SelectItem>
                    <SelectItem value="Software Services">Software Services</SelectItem>
                    <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                    <SelectItem value="Consulting">Consulting</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="amount" className="text-right">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                value={newRequestData.totalAmount}
                onChange={(e) => setNewRequestData({ ...newRequestData, totalAmount: e.target.value })}
                className="col-span-3"
                placeholder="e.g. 10000"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="reason" className="text-right mt-2">Justification</Label>
              <Textarea
                id="reason"
                value={newRequestData.reason}
                onChange={(e) => setNewRequestData({ ...newRequestData, reason: e.target.value })}
                className="col-span-3 min-h-[80px]"
                placeholder="Brief justification..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewRequestOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRequest}>Create Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentDialog
        open={isAgentDialogOpen}
        onOpenChange={setIsAgentDialogOpen}
        contextType="intake"
        onSuccess={async (data) => {
          if (!auth.currentUser) return;
          try {
            const amount = parseFloat(data.amount?.replace(/[^0-9.-]+/g, '') || '0');
            const newReq = {
              title: data.title || 'AI Generated Request',
              category: data.department || 'Other',
              amount: amount,
              date: new Date().toISOString().split('T')[0],
              status: 'Draft',
              purpose: data.description || '',
              reason: data.description || '',
              totalAmount: amount,
              createdBy: auth.currentUser.uid,
              auditTrail: [{
                action: 'Created via AI Agent',
                actorId: auth.currentUser.uid,
                timestamp: new Date().toISOString()
              }]
            };
            await addDoc(collection(db, 'purchaseRequisitions'), newReq);
            toast.success('Requisition created successfully!');
            setIsAgentDialogOpen(false);
          } catch (error) {
            console.error("Error creating requisition", error);
            toast.error("Failed to create requisition");
          }
        }}
      />
      
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-background border shadow-lg px-6 py-4 rounded-full"
          >
            <span className="text-sm font-medium">
              {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2 border-l pl-4 ml-2">
              <Button size="sm" onClick={() => handleBulkAction('approve')}>Bulk Approve</Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('archive')}>Bulk Archive</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
