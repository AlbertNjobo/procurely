import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Clock, CheckCircle, Search, MessageSquare, ArrowLeft, Award, Calendar, DollarSign, Users, FileText, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { collection, query, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { toast } from 'sonner';
import { RFQ, RFQQuestion, Bid } from '../types';

const STATUS_COLORS: { [key: string]: string } = {
  Draft: 'bg-slate-100 text-slate-700',
  Published: 'bg-blue-100 text-blue-700',
  Evaluating: 'bg-amber-100 text-amber-700',
  Awarded: 'bg-green-100 text-green-700',
  Closed: 'bg-red-100 text-red-700',
};

const STATUS_FLOW = ['Draft', 'Published', 'Evaluating', 'Awarded'];

export function RFQs() {
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [bids, setBids] = useState<{ [key: string]: Bid[] }>({});
  const [questions, setQuestions] = useState<{ [key: string]: RFQQuestion[] }>({});
  const [selectedRfq, setSelectedRfq] = useState<RFQ | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [replyText, setReplyText] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [newRfq, setNewRfq] = useState({ title: '', description: '', dueDate: '', budgetMin: '', budgetMax: '', category: '' });

  const fetchRFQsAndBids = async () => {
    try {
      const rfqSnap = await getDocs(query(collection(db, 'rfqs')));
      const fetchedRfqs = rfqSnap.docs.map(d => ({ id: d.id, ...d.data() })) as RFQ[];
      fetchedRfqs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRfqs(fetchedRfqs);

      const bidsSnap = await getDocs(query(collection(db, 'bids')));
      const bidsMap: { [key: string]: Bid[] } = {};
      bidsSnap.docs.forEach(d => {
        const bid = { id: d.id, ...d.data() } as Bid;
        if (!bidsMap[bid.rfqId]) bidsMap[bid.rfqId] = [];
        bidsMap[bid.rfqId].push(bid);
      });
      setBids(bidsMap);

      const qSnap = await getDocs(query(collection(db, 'rfqQuestions')));
      const qMap: { [key: string]: RFQQuestion[] } = {};
      qSnap.docs.forEach(d => {
        const q = { id: d.id, ...d.data() } as RFQQuestion;
        if (!qMap[q.rfqId]) qMap[q.rfqId] = [];
        qMap[q.rfqId].push(q);
      });
      setQuestions(qMap);
    } catch (error) {
      console.error("Error fetching RFQs", error);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(user => { if (user) fetchRFQsAndBids(); });
    return () => unsub();
  }, []);

  const filteredRfqs = useMemo(() => {
    return rfqs.filter(rfq => {
      const matchesSearch = !searchQuery || rfq.title.toLowerCase().includes(searchQuery.toLowerCase()) || rfq.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || rfq.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rfqs, searchQuery, statusFilter]);

  const handleCreateRFQ = async () => {
    if (!auth.currentUser) return;
    if (!newRfq.title || !newRfq.description || !newRfq.dueDate) {
      toast.error("Please fill out all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const budgetRange = newRfq.budgetMin && newRfq.budgetMax
        ? `$${Number(newRfq.budgetMin).toLocaleString()} - $${Number(newRfq.budgetMax).toLocaleString()}`
        : '';
      await addDoc(collection(db, 'rfqs'), {
        title: newRfq.title, description: newRfq.description, dueDate: newRfq.dueDate,
        budgetRange, category: newRfq.category || 'General',
        status: 'Draft', createdBy: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
        auditTrail: [{ id: crypto.randomUUID(), action: 'Created', actorId: auth.currentUser.uid, timestamp: new Date().toISOString() }]
      });
      toast.success("RFQ created");
      setIsCreateOpen(false);
      setNewRfq({ title: '', description: '', dueDate: '', budgetMin: '', budgetMax: '', category: '' });
      fetchRFQsAndBids();
    } catch (error) {
      toast.error("Failed to create RFQ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (rfqId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'rfqs', rfqId), {
        status: newStatus,
        auditTrail: [...(selectedRfq?.auditTrail || []), { id: crypto.randomUUID(), action: `Status → ${newStatus}`, actorId: auth.currentUser?.uid || '', timestamp: new Date().toISOString() }]
      });
      toast.success(`RFQ status updated to ${newStatus}`);
      fetchRFQsAndBids();
      if (selectedRfq?.id === rfqId) setSelectedRfq(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleAwardBid = async (rfqId: string, bidId: string) => {
    try {
      await updateDoc(doc(db, 'rfqs', rfqId), {
        status: 'Awarded',
        auditTrail: [...(selectedRfq?.auditTrail || []), { id: crypto.randomUUID(), action: `Awarded to bid ${bidId}`, actorId: auth.currentUser?.uid || '', timestamp: new Date().toISOString() }]
      });
      await updateDoc(doc(db, 'bids', bidId), { status: 'Accepted' });
      for (const bid of (bids[rfqId] || []).filter(b => b.id !== bidId)) {
        await updateDoc(doc(db, 'bids', bid.id), { status: 'Rejected' });
      }
      toast.success("Bid awarded!");
      fetchRFQsAndBids();
      setSelectedRfq(prev => prev ? { ...prev, status: 'Awarded' } : null);
    } catch (error) {
      toast.error("Failed to award bid");
    }
  };

  const handleAnswerQuestion = async (qId: string, isPublic: boolean) => {
    if (!replyText) return;
    try {
      await updateDoc(doc(db, 'rfqQuestions', qId), { answer: replyText, isPublic });
      toast.success("Answer posted");
      setReplyText('');
      setReplyingTo(null);
      fetchRFQsAndBids();
    } catch (error) {
      toast.error("Failed to post answer");
    }
  };

  // ── DETAIL VIEW ──
  if (selectedRfq) {
    const rfqBids = bids[selectedRfq.id] || [];
    const rfqQuestions = questions[selectedRfq.id] || [];
    const sortedBids = [...rfqBids].sort((a, b) => a.amount - b.amount);
    const currentIdx = STATUS_FLOW.indexOf(selectedRfq.status);
    const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setSelectedRfq(null)} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back to RFQs
        </Button>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{selectedRfq.title}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Due: {new Date(selectedRfq.dueDate).toLocaleDateString()}</span>
              {selectedRfq.budgetRange && <span className="flex items-center gap-1"><DollarSign className="h-4 w-4" /> {selectedRfq.budgetRange}</span>}
              {selectedRfq.category && <Badge variant="outline">{selectedRfq.category}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_COLORS[selectedRfq.status] || ''}>{selectedRfq.status}</Badge>
            {nextStatus && (
              <Button size="sm" onClick={() => handleStatusChange(selectedRfq.id, nextStatus)}>
                Move to {nextStatus}
              </Button>
            )}
          </div>
        </div>

        {/* Description */}
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">{selectedRfq.description}</p>
          </CardContent>
        </Card>

        {/* Bid Comparison Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Bid Comparison</span>
              <Badge variant="outline">{rfqBids.length} Bids</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedBids.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                      <TableHead>Warranty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedBids.map((bid, i) => (
                      <TableRow key={bid.id} className={bid.status === 'Accepted' ? 'bg-green-50' : ''}>
                        <TableCell className="font-medium">
                          {bid.vendorName}
                          {i === 0 && selectedRfq.status !== 'Awarded' && <Badge className="ml-2 bg-amber-100 text-amber-700 text-[10px]">Lowest</Badge>}
                          {bid.status === 'Accepted' && <Badge className="ml-2 bg-green-100 text-green-700 text-[10px]">Winner</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-bold">${bid.amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{bid.deliveryDays ? `${bid.deliveryDays} days` : '—'}</TableCell>
                        <TableCell>{bid.warranty || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{bid.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          {selectedRfq.status !== 'Awarded' && selectedRfq.status !== 'Draft' && (
                            <Button size="sm" variant={bid.status === 'Accepted' ? 'default' : 'outline'} onClick={() => handleAwardBid(selectedRfq.id, bid.id)}>
                              <Award className="h-3 w-3 mr-1" /> Award
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-4">No bids received yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Q&A */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Vendor Q&A</span>
              <Badge variant="outline">{rfqQuestions.length} Questions</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rfqQuestions.length > 0 ? (
              <div className="space-y-4">
                {rfqQuestions.map(q => (
                  <div key={q.id} className="border rounded-lg p-4 bg-slate-50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-sm text-slate-700">{q.vendorName} asks:</span>
                      <span className="text-xs text-muted-foreground">{new Date(q.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm">{q.question}</p>
                    {q.answer ? (
                      <div className="mt-3 pl-4 border-l-2 border-slate-300">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm text-blue-700">Answer:</span>
                          <Badge variant="secondary" className="text-[10px]">{q.isPublic ? 'Public' : 'Private'}</Badge>
                        </div>
                        <p className="text-sm">{q.answer}</p>
                      </div>
                    ) : replyingTo === q.id ? (
                      <div className="mt-3 space-y-2">
                        <Textarea placeholder="Type your answer..." value={replyText} onChange={e => setReplyText(e.target.value)} />
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyText(''); }}>Cancel</Button>
                          <Button size="sm" variant="outline" onClick={() => handleAnswerQuestion(q.id, false)}>Reply Private</Button>
                          <Button size="sm" onClick={() => handleAnswerQuestion(q.id, true)}>Publish to All</Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => setReplyingTo(q.id)}>Answer</Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-4">No questions from vendors.</p>
            )}
          </CardContent>
        </Card>

        {/* Audit Trail */}
        {selectedRfq.auditTrail && selectedRfq.auditTrail.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[...selectedRfq.auditTrail].reverse().map((entry, i) => (
                  <div key={entry.id || i} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-medium">{entry.action}</span>
                      <span className="text-muted-foreground ml-2">{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Request for Quotations (RFQs)</h1>
          <p className="text-muted-foreground mt-1">Manage RFQs and compare vendor bids.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Create New RFQ</Button>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search RFQs..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_FLOW.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* RFQ Cards */}
      {filteredRfqs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-dashed">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No RFQs found</h3>
          <p className="text-muted-foreground">Create an RFQ to start receiving bids.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredRfqs.map(rfq => {
            const rfqBids = bids[rfq.id] || [];
            const lowestBid = rfqBids.length > 0 ? Math.min(...rfqBids.map(b => b.amount)) : null;
            return (
              <Card key={rfq.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedRfq(rfq)}>
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg truncate">{rfq.title}</h3>
                        <Badge className={`${STATUS_COLORS[rfq.status] || ''} shrink-0`}>{rfq.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{rfq.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Due {new Date(rfq.dueDate).toLocaleDateString()}</span>
                        {rfq.budgetRange && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {rfq.budgetRange}</span>}
                        {rfq.category && <Badge variant="outline" className="text-[10px]">{rfq.category}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{rfqBids.length}</div>
                        <div className="text-xs text-muted-foreground">Bids</div>
                      </div>
                      {lowestBid && (
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">${lowestBid.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">Lowest</div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Create Request for Quotation</DialogTitle>
            <DialogDescription>Publish a new RFQ for vendors to bid on.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>RFQ Title *</Label>
              <Input placeholder="e.g., Q3 Laptop Procurement" value={newRfq.title} onChange={e => setNewRfq({ ...newRfq, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date *</Label>
                <Input type="date" value={newRfq.dueDate} onChange={e => setNewRfq({ ...newRfq, dueDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newRfq.category} onValueChange={v => setNewRfq({ ...newRfq, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hardware">Hardware</SelectItem>
                    <SelectItem value="Software">Software</SelectItem>
                    <SelectItem value="Services">Services</SelectItem>
                    <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Budget Min ($)</Label>
                <Input type="number" placeholder="e.g., 5000" value={newRfq.budgetMin} onChange={e => setNewRfq({ ...newRfq, budgetMin: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Budget Max ($)</Label>
                <Input type="number" placeholder="e.g., 15000" value={newRfq.budgetMax} onChange={e => setNewRfq({ ...newRfq, budgetMax: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description & Requirements *</Label>
              <Textarea placeholder="Describe items, quantities, specifications..." className="h-28" value={newRfq.description} onChange={e => setNewRfq({ ...newRfq, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRFQ} disabled={submitting}>{submitting ? 'Creating...' : 'Create RFQ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
