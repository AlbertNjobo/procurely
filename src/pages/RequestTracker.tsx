import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, FileText, Send, Truck, DollarSign, ExternalLink, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';
import { useData } from '../lib/data-context';
import { PurchaseRequisition, RFQ, Bid, GoodsReceipt, Invoice } from '../types';
import { useAuth } from '../lib/auth-context';
import { logAuditEvent } from '../lib/audit';
import { useMatchValidator } from '../hooks/useMatchValidator';
import { PipelineStepper } from '../components/PipelineStepper';

function safeDate(val: unknown): string {
  if (!val) return 'N/A';
  const d = val instanceof Date ? val : new Date(val as string | number);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
}

export function RequestTracker() {
  const { id } = useParams<{ id: string }>();
  const { purchaseRequisitions, rfqs, bids, purchaseOrders, goodsReceipts, invoices } = useData();
  const { user, profile } = useAuth();
  const { validate3WayMatch, matchErrors } = useMatchValidator();

  const [req, setReq] = useState<PurchaseRequisition | null>(null);
  const [rfq, setRfq] = useState<RFQ | null>(null);
  const [rfqBids, setRfqBids] = useState<Bid[]>([]);
  const [po, setPo] = useState<any | null>(null);
  const [receipt, setReceipt] = useState<GoodsReceipt | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    if (id) {
      const foundReq = purchaseRequisitions.find(r => r.id === id) || null;
      setReq(foundReq);
      
      // In a real app we'd query by requisitionId
      // For this demo, let's just find an RFQ with the same title or ID if no direct link exists
      let foundRfq = rfqs.find(r => r.requisitionId === id);
      if (!foundRfq && foundReq) {
        foundRfq = rfqs.find(r => r.title.includes(foundReq.title)) || null;
      }
      setRfq(foundRfq || null);

      if (foundRfq) {
        setRfqBids(bids.filter(b => b.rfqId === foundRfq?.id));
      } else {
        setRfqBids([]);
      }

      // Find PO
      const foundPo = purchaseOrders?.find(p => p.requisitionId === id);
      setPo(foundPo || null);

      if (foundPo) {
        setReceipt(goodsReceipts?.find(r => r.purchaseOrderId === foundPo.id) || null);
        setInvoice(invoices?.find(i => i.purchaseOrderId === foundPo.id) || null);
      }
    }
  }, [id, purchaseRequisitions, rfqs, bids, purchaseOrders, goodsReceipts, invoices]);

  const handleApprove = async () => {
    try {
      if (!req || !user) return;
      await updateDoc(doc(db, 'purchaseRequisitions', req.id), { status: 'Pending RFQ' });
      await logAuditEvent('Approved Requisition', req.id, 'purchaseRequisitions', req, { ...req, status: 'Pending RFQ' }, user.uid);
      toast.success("Requisition approved");
    } catch (e) {
      toast.error("Failed to approve requisition");
    }
  };

  const handleSelectBid = async (bid: Bid) => {
    try {
      if (!req || !rfq || !user) return;
      // Mark bid as selected
      await updateDoc(doc(db, 'bids', bid.id), { status: 'Selected' });
      // Update RFQ to Awarded
      await updateDoc(doc(db, 'rfqs', rfq.id), { status: 'Awarded' });
      // Update Requisition to Ordered
      await updateDoc(doc(db, 'purchaseRequisitions', req.id), { status: 'Ordered' });
      await logAuditEvent('Selected Bid & Created PO', req.id, 'purchaseRequisitions', req, { ...req, status: 'Ordered' }, user.uid);
      
      // Create PO
      await addDoc(collection(db, 'purchaseOrders'), {
        requisitionId: req.id,
        rfqId: rfq.id,
        vendorId: bid.vendorId,
        vendorName: bid.vendorName,
        amount: bid.amount,
        quantity: 1, // Assume 1 for demo purposes
        status: 'Issued',
        createdAt: new Date().toISOString()
      });
      toast.success("Bid selected and PO generated");
    } catch (e) {
      console.error(e);
      toast.error("Failed to select bid");
    }
  };

  const handleMarkDelivered = async () => {
    try {
      if (!po || !user) return;
      const receiptData = {
        purchaseOrderId: po.id,
        receivedDate: new Date().toISOString(),
        quantityReceived: 1, // Simplified for demo
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      };
      await addDoc(collection(db, 'goodsReceipts'), receiptData);
      
      await updateDoc(doc(db, 'purchaseOrders', po.id), { 
        status: 'Fulfilled',
        deliveryDate: new Date().toISOString()
      });
      await logAuditEvent('Added Goods Receipt', po.id, 'purchaseOrders', po, { ...po, status: 'Fulfilled' }, user.uid);
      toast.success("Order marked as fulfilled and Goods Receipt generated");
    } catch (e) {
      toast.error("Failed to update order");
    }
  };

  const handleAddInvoice = async () => {
    try {
      if (!po || !user) return;
      const invoiceData = {
        purchaseOrderId: po.id,
        vendorId: po.vendorId,
        amount: po.amount, // Simplified, assuming full match
        invoiceDate: new Date().toISOString(),
        status: 'Pending',
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      };
      await addDoc(collection(db, 'invoices'), invoiceData);
      await logAuditEvent('Added Invoice', po.id, 'invoices', null, invoiceData, user.uid);
      toast.success("Invoice added");
    } catch (e) {
      toast.error("Failed to add invoice");
    }
  };

  const handleApprovePayment = async () => {
    try {
      if (!po || !invoice || !receipt || !user) return;
      
      const { isValid, errors } = validate3WayMatch(po, receipt, invoice);
      if (!isValid) {
        errors.forEach(err => toast.error(`3-Way Match Failed: ${err}`));
        return;
      }

      await updateDoc(doc(db, 'invoices', invoice.id), { status: 'Paid' });
      await updateDoc(doc(db, 'purchaseOrders', po.id), { paymentStatus: 'Paid', status: 'Paid' });
      await logAuditEvent('Approved Payment (3-Way Match)', po.id, 'purchaseOrders', po, { ...po, status: 'Paid' }, user.uid);
      toast.success("Payment approved via 3-way match");
    } catch (e) {
      toast.error("Failed to approve payment");
    }
  };

  if (!req) {
    return (
      <div className="p-6">
        <Link to="/app/requisitions" className={buttonVariants({ variant: "ghost", className: "mb-4" })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Requisitions
        </Link>
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="text-xl font-semibold mb-2">Request Not Found</h2>
            <p className="text-muted-foreground">The requested procurement lifecycle could not be loaded.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved': return <Badge className="bg-emerald-500">Approved</Badge>;
      case 'Pending': return <Badge variant="outline" className="text-amber-500 border-amber-500">Pending Review</Badge>;
      case 'Rejected': return <Badge variant="destructive">Rejected</Badge>;
      case 'Draft': return <Badge variant="secondary">Draft</Badge>;
      case 'Ordered': return <Badge className="bg-blue-500">Ordered</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const steps = [
    { id: 'req', title: 'Requisition Created', icon: <FileText className="h-4 w-4" />, date: safeDate(req.createdAt), active: true, done: true },
    { id: 'approve', title: 'Approval', icon: <CheckCircle2 className="h-4 w-4" />, date: req.status === 'Approved' || req.status === 'Ordered' ? 'Completed' : 'Pending', active: req.status === 'Approved' || req.status === 'Ordered' || req.status === 'Pending', done: req.status === 'Approved' || req.status === 'Ordered' },
    { id: 'rfq', title: 'RFQ Sourcing', icon: <Send className="h-4 w-4" />, date: rfq ? safeDate(rfq.createdAt) : 'Pending', active: !!rfq, done: !!rfq && rfq.status !== 'Draft' },
    { id: 'po', title: 'Purchase Order', icon: <DollarSign className="h-4 w-4" />, date: req.status === 'Ordered' ? 'Issued' : 'Pending', active: req.status === 'Ordered', done: req.status === 'Ordered' },
    { id: 'delivery', title: 'Delivery & Payment', icon: <Truck className="h-4 w-4" />, date: 'Pending', active: false, done: false },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/app/requisitions" className={buttonVariants({ variant: "ghost", className: "mb-2 -ml-4" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Requisitions
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Lifecycle Tracker</h1>
          <p className="text-muted-foreground mt-1">
            Tracking procurement journey for <strong>{req.title}</strong>
          </p>
        </div>
        {getStatusBadge(req.status)}
      </div>

      {/* Timeline view */}
      <Card>
        <CardContent className="p-6">
          <PipelineStepper steps={steps} className="w-full max-w-4xl mx-auto" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Requisition Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              1. Purchase Requisition
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">ID</div>
              <div className="font-mono text-xs">{req.id}</div>
              
              <div className="text-muted-foreground">Title</div>
              <div className="font-medium">{req.title}</div>
              
              <div className="text-muted-foreground">Category</div>
              <div>{req.category || 'N/A'}</div>
              
              <div className="text-muted-foreground">Amount</div>
              <div className="font-medium">\${Number(req.totalAmount).toLocaleString()}</div>
              
              <div className="text-muted-foreground">Created By</div>
              <div>{req.createdBy}</div>
              
              <div className="text-muted-foreground">Date</div>
              <div>{safeDate(req.createdAt)}</div>
            </div>
            
            {req.status === 'Pending Manager Approval' && profile?.role !== 'Requestor' && (
              <div className="mt-4 flex justify-end">
                <Button onClick={handleApprove} className="bg-emerald-500 hover:bg-emerald-600">Approve Requisition</Button>
              </div>
            )}
            {req.status === 'Pending Finance Approval' && profile?.role === 'Finance' && (
              <div className="mt-4 flex justify-end">
                <Button onClick={handleApprove} className="bg-emerald-500 hover:bg-emerald-600">Approve Requisition (Finance)</Button>
              </div>
            )}
            
            <Separator />
            
            <div>
              <div className="text-sm text-muted-foreground mb-1">Purpose</div>
              <p className="text-sm">{req.purpose}</p>
            </div>
            
            {req.items && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Items</div>
                <p className="text-sm whitespace-pre-line">{req.items}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RFQ Details */}
        <Card className={!rfq ? 'opacity-60' : ''}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5 text-purple-500" />
              2. Sourcing (RFQ)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!rfq ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No RFQ has been created for this requisition yet.</p>
                {req.status === 'Approved' && (
                  <Link to="/app/rfqs" className={buttonVariants({ variant: "outline" })}>
                    <Plus className="h-4 w-4 mr-2" /> Create RFQ
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="font-medium">{rfq.title}</div>
                  <Badge variant="outline">{rfq.status}</Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Due Date</div>
                  <div>{new Date(rfq.dueDate).toLocaleDateString()}</div>
                  
                  <div className="text-muted-foreground">Bids Received</div>
                  <div>{rfqBids.length}</div>
                </div>
                
                <Separator />
                
                {rfqBids.length > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium mb-2">Vendor Bids</div>
                      <div className="space-y-2">
                        {rfqBids.map(bid => (
                          <div key={bid.id} className="flex justify-between items-center p-2 rounded-md border text-sm">
                            <div>
                              <div className="font-medium">{bid.vendorName}</div>
                              <div className="text-muted-foreground text-xs">{safeDate(bid.createdAt)}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">\${bid.amount.toLocaleString()}</div>
                              {bid.status === 'Selected' ? (
                                <Badge className="bg-emerald-500 text-[10px] mt-1 h-4">Selected</Badge>
                              ) : (
                                <div className="flex flex-col items-end gap-1 mt-1">
                                  <Badge variant="outline" className="text-[10px] h-4">{bid.status}</Badge>
                                  {!rfqBids.find(b => b.status === 'Selected') && (
                                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => handleSelectBid(bid)}>Select</Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {rfqBids.find(b => b.status === 'Selected') && (
                      <div className="bg-muted p-3 rounded-md text-sm">
                        <div className="font-medium mb-1">Selection Reason</div>
                        <p className="text-muted-foreground">This vendor was selected based on optimal pricing and their ability to meet the requested delivery schedule.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No bids received yet.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purchase Order Details */}
        <Card className={!po ? 'opacity-60 md:col-span-2' : 'md:col-span-2'}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              3. Purchase Order & Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!po ? (
              <div className="text-center py-6 text-muted-foreground">
                Purchase Order has not been generated yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Order Information</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">PO Number</div>
                    <div className="font-mono">PO-{po.id.substring(0, 8).toUpperCase()}</div>
                    
                    <div className="text-muted-foreground">Vendor</div>
                    <div className="font-medium">{po.vendorName}</div>
                    
                    <div className="text-muted-foreground">Total Amount</div>
                    <div className="font-medium">\${Number(po.amount).toLocaleString()}</div>
                    
                    <div className="text-muted-foreground">Status</div>
                    <div><Badge className="bg-blue-500">{po.status}</Badge></div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Fulfillment Status</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Expected Delivery</div>
                    <div>Pending</div>
                    
                    <div className="text-muted-foreground">Receipt</div>
                    <div>{receipt ? new Date(receipt.receivedDate).toLocaleDateString() : 'Pending'}</div>
                    
                    <div className="text-muted-foreground">Invoice</div>
                    <div>{invoice ? 'Received' : 'Not Received'}</div>
                    
                    <div className="text-muted-foreground">Payment</div>
                    <div><Badge variant="outline">{po.paymentStatus || 'Unpaid'}</Badge></div>
                  </div>

                  {!receipt && po.status !== 'Draft' && (
                    <div className="pt-2">
                      <Button onClick={handleMarkDelivered} className="w-full" size="sm" variant="outline">Add Goods Receipt</Button>
                    </div>
                  )}

                  {receipt && !invoice && (
                    <div className="pt-2">
                      <Button onClick={handleAddInvoice} className="w-full" size="sm" variant="outline">Simulate Vendor Invoice</Button>
                    </div>
                  )}

                  {receipt && invoice && po.paymentStatus !== 'Paid' && (profile?.role === 'Finance' || profile?.role === 'Admin') && (
                    <div className="pt-2">
                      <Button onClick={handleApprovePayment} className="w-full bg-emerald-500 hover:bg-emerald-600" size="sm">
                        Approve Payment (3-Way Match)
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
