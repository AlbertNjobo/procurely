export type UserRole = 'Requestor' | 'Buyer' | 'Finance' | 'Admin';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorName?: string;
  timestamp: string;
  details?: string;
}

export interface ProcurementRequest {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  createdBy: string;
  auditTrail?: AuditLogEntry[];
}

export interface PurchaseRequisition extends ProcurementRequest {
  purpose: string;
  reason: string;
  totalAmount: number | string;
  category?: string;
  items?: string;
  supplier?: string;
  costCenter?: string;
  approverId?: string;
}

export interface RFQ extends ProcurementRequest {
  description: string;
  dueDate: string;
  requisitionId?: string;
  budgetRange?: string;
  invitedSuppliers?: string[];
  category?: string;
}

export interface Bid {
  id: string;
  rfqId: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  proposal: string;
  status: string;
  createdAt: string;
  deliveryDays?: number;
  warranty?: string;
}

export interface RFQQuestion {
  id: string;
  rfqId: string;
  vendorId: string;
  vendorName: string;
  question: string;
  answer?: string;
  isPublic?: boolean;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  requisitionId: string;
  rfqId?: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  quantity: number;
  status: 'Draft' | 'Issued' | 'Accepted' | 'Fulfilled' | 'Paid';
  createdAt: string;
  deliveryDate?: string;
  paymentStatus?: 'Pending' | 'Paid' | 'Overdue';
}

export interface GoodsReceipt {
  id: string;
  purchaseOrderId: string;
  receivedDate: string;
  quantityReceived: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface Invoice {
  id: string;
  purchaseOrderId: string;
  vendorId: string;
  amount: number;
  invoiceDate: string;
  status: 'Pending' | 'Matched' | 'Disputed' | 'Paid';
  createdAt: string;
  createdBy: string;
}

export interface AuditEvent {
  id: string;
  entityId: string;
  entityType: string;
  action: string;
  actorId: string;
  timestamp: string;
  beforeState: any;
  afterState: any;
}
