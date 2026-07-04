import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDocs, writeBatch, query, where } from 'firebase/firestore';
import { db, auth } from './firebase';
import { useAuth } from './auth-context';
import { PurchaseRequisition, RFQ, Bid, GoodsReceipt, Invoice } from '../types';

export type IntakeRequest = { id: string; title: string; department: string; status: string; amount: string; date: string; supplier: string; description: string; userId: string; };
export type Supplier = { id: string; name: string; category: string; risk: string; status: string; compliance: boolean; userId: string; };
export type SpendMetric = { id: string; month: string; spend: number; userId: string; };
export type DepartmentSpendMetric = { id: string; department: string; q1: number; q2: number; q3: number; q4: number; userId: string; };

const initialSpendData = [
  { id: 'SM-001', month: 'Jan', spend: 12000 },
  { id: 'SM-002', month: 'Feb', spend: 18000 },
  { id: 'SM-003', month: 'Mar', spend: 15000 },
  { id: 'SM-004', month: 'Apr', spend: 28000 },
  { id: 'SM-005', month: 'May', spend: 32000 },
  { id: 'SM-006', month: 'Jun', spend: 29000 },
  { id: 'SM-007', month: 'Jul', spend: 35000 },
  { id: 'SM-008', month: 'Aug', spend: 38000 },
  { id: 'SM-009', month: 'Sep', spend: 41000 },
  { id: 'SM-010', month: 'Oct', spend: 36000 },
  { id: 'SM-011', month: 'Nov', spend: 45000 },
  { id: 'SM-012', month: 'Dec', spend: 52000 },
];

const initialDepartmentSpendData = [
  { id: 'DM-001', department: 'Engineering', q1: 45000, q2: 52000, q3: 48000, q4: 61000 },
  { id: 'DM-002', department: 'Marketing', q1: 32000, q2: 38000, q3: 41000, q4: 45000 },
  { id: 'DM-003', department: 'Sales', q1: 28000, q2: 31000, q3: 35000, q4: 39000 },
  { id: 'DM-004', department: 'HR & Admin', q1: 15000, q2: 18000, q3: 16000, q4: 21000 },
  { id: 'DM-005', department: 'Operations', q1: 22000, q2: 25000, q3: 28000, q4: 32000 },
];

const initialIntakes = [
  { id: 'REQ-001', title: 'Q3 AWS Hosting', department: 'Engineering', status: 'PO Generated', amount: '$12,400', date: '2026-06-28', supplier: 'Amazon Web Services', description: 'Hosting costs for the Q3 production environment.' },
  { id: 'REQ-002', title: 'Salesforce Licenses', department: 'Sales', status: 'Pending Finance Approval', amount: '$45,000', date: '2026-06-29', supplier: 'Salesforce', description: 'Additional 30 seats for the new SDR team.' },
  { id: 'REQ-003', title: 'Office Supplies', department: 'Operations', status: 'Draft', amount: '$1,200', date: '2026-06-30', supplier: 'Staples', description: 'Monthly restock of paper, pens, and whiteboards.' },
  { id: 'REQ-004', title: 'Marketing Agency', department: 'Marketing', status: 'Pending Manager Approval', amount: '$25,000', date: '2026-06-25', supplier: 'Creative Group', description: 'Retainer for Q3 digital marketing campaigns.' },
  { id: 'REQ-005', title: 'New Laptops', department: 'Engineering', status: 'Pending RFQ', amount: '$15,000', date: '2026-06-29', supplier: '', description: '10 new laptops for the new engineering hires.' },
];

const initialSuppliers = [
  { id: 'SUP-001', name: 'Amazon Web Services', category: 'IT Software', risk: 'Low', status: 'Active', compliance: true },
  { id: 'SUP-002', name: 'Stripe Inc.', category: 'Financial Services', risk: 'Low', status: 'Active', compliance: true },
  { id: 'SUP-003', name: 'Acme Corp', category: 'Hardware', risk: 'Medium', status: 'Onboarding', compliance: false },
  { id: 'SUP-004', name: 'Global Logistics LLC', category: 'Logistics', risk: 'High', status: 'Under Review', compliance: false },
];

const initialProcurementCatalogItems = [
  { id: 'CAT-001', name: 'Dell XPS 15 Laptop', description: 'High-performance laptop for engineering and design work.', price: 1899.99, category: 'Hardware', vendorId: 'SUP-003', vendorName: 'Acme Corp', createdAt: new Date().toISOString() },
  { id: 'CAT-002', name: 'AWS EC2 Instance (m5.large) - Monthly', description: 'General purpose compute instance for cloud infrastructure.', price: 70.08, category: 'Cloud Infrastructure', vendorId: 'SUP-001', vendorName: 'Amazon Web Services', createdAt: new Date().toISOString() },
  { id: 'CAT-003', name: 'AWS S3 Storage - 1TB', description: 'Standard object storage for data archiving and backups.', price: 23.00, category: 'Cloud Infrastructure', vendorId: 'SUP-001', vendorName: 'Amazon Web Services', createdAt: new Date().toISOString() },
  { id: 'CAT-004', name: 'Stripe Payment Processing Setup', description: 'Initial configuration and integration setup for payment processing.', price: 500.00, category: 'Financial Services', vendorId: 'SUP-002', vendorName: 'Stripe Inc.', createdAt: new Date().toISOString() },
  { id: 'CAT-005', name: 'Premium Office Chair', description: 'Ergonomic office chair with lumbar support.', price: 349.00, category: 'Office Supplies', vendorId: 'SUP-003', vendorName: 'Acme Corp', createdAt: new Date().toISOString() },
  { id: 'CAT-006', name: 'Logitech MX Master 3S Mouse', description: 'Advanced wireless mouse for productivity.', price: 99.99, category: 'Hardware', vendorId: 'SUP-003', vendorName: 'Acme Corp', createdAt: new Date().toISOString() },
  { id: 'CAT-007', name: 'Whiteboard Markers (12 Pack)', description: 'Assorted colors dry erase markers.', price: 14.50, category: 'Office Supplies', vendorId: 'SUP-003', vendorName: 'Acme Corp', createdAt: new Date().toISOString() },
];

enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export type AgentMemoryEntry = {
  id: string;
  userId: string;
  type: "preference" | "decision" | "fact" | "pattern";
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
  createdAt: string;
};

type DataContextType = {
  intakes: IntakeRequest[];
  setIntakes: (intakes: IntakeRequest[]) => void;
  updateIntake: (id: string, updates: Partial<IntakeRequest>) => void;
  suppliers: Supplier[];
  setSuppliers: (suppliers: Supplier[]) => void;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  spendMetrics: SpendMetric[];
  departmentSpendMetrics: DepartmentSpendMetric[];
  purchaseRequisitions: PurchaseRequisition[];
  rfqs: RFQ[];
  purchaseOrders: any[];
  bids: Bid[];
  goodsReceipts: GoodsReceipt[];
  invoices: Invoice[];
  procurementCatalog: any[];
  knowledgeBase: any[];
  agentMemory: AgentMemoryEntry[];
  addMemory: (entry: Omit<AgentMemoryEntry, 'id'>) => Promise<void>;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [intakes, setIntakes] = useState<IntakeRequest[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [spendMetrics, setSpendMetrics] = useState<SpendMetric[]>([]);
  const [departmentSpendMetrics, setDepartmentSpendMetrics] = useState<DepartmentSpendMetric[]>([]);
  const [purchaseRequisitions, setPurchaseRequisitions] = useState<PurchaseRequisition[]>([]);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [procurementCatalog, setProcurementCatalog] = useState<any[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([]);
  const [agentMemory, setAgentMemory] = useState<AgentMemoryEntry[]>([]);

  useEffect(() => {
    if (!user) return;

    const seedData = async () => {
      try {
        console.log('Starting seedData...');
        const intakesQuery = query(collection(db, 'intakes'), where("userId", "==", user.uid));
        const suppliersQuery = query(collection(db, 'suppliers'), where("userId", "==", user.uid));
        const spendMetricsQuery = query(collection(db, 'spendMetrics'), where("userId", "==", user.uid));
        const departmentSpendMetricsQuery = query(collection(db, 'departmentSpendMetrics'), where("userId", "==", user.uid));
        const procurementCatalogQuery = query(collection(db, 'procurementCatalog'));
        
        console.log('Fetching intakes...');
        const intakesSnap = await getDocs(intakesQuery);
        console.log('Fetching suppliers...');
        const suppliersSnap = await getDocs(suppliersQuery);
        console.log('Fetching spendMetrics...');
        const spendMetricsSnap = await getDocs(spendMetricsQuery);
        console.log('Fetching departmentSpendMetrics...');
        const departmentSpendMetricsSnap = await getDocs(departmentSpendMetricsQuery);
        console.log('Fetching procurementCatalog...');
        const procurementCatalogSnap = await getDocs(procurementCatalogQuery);

        console.log('All snaps fetched successfully');
        const batch = writeBatch(db);
        let willCommit = false;
        
        if (intakesSnap.empty && suppliersSnap.empty) {
          console.log('Seeding initial intakes and suppliers...');
          initialIntakes.forEach(intake => {
            const { id, ...data } = intake;
            batch.set(doc(db, 'intakes', id), { ...data, userId: user.uid });
          });
          initialSuppliers.forEach(supplier => {
            const { id, ...data } = supplier;
            batch.set(doc(db, 'suppliers', id), { ...data, userId: user.uid });
          });
          willCommit = true;
        }
        
        if (spendMetricsSnap.empty) {
          console.log('Seeding initial spend metrics...');
          initialSpendData.forEach(metric => {
            const { id, ...data } = metric;
            batch.set(doc(db, 'spendMetrics', id), { ...data, userId: user.uid });
          });
          willCommit = true;
        }
        
        if (departmentSpendMetricsSnap.empty) {
          console.log('Seeding initial department spend metrics...');
          initialDepartmentSpendData.forEach(metric => {
            const { id, ...data } = metric;
            batch.set(doc(db, 'departmentSpendMetrics', id), { ...data, userId: user.uid });
          });
          willCommit = true;
        }

        if (procurementCatalogSnap.empty) {
          console.log('Seeding initial procurement catalog...');
          initialProcurementCatalogItems.forEach(item => {
            const { id, ...data } = item;
            batch.set(doc(db, 'procurementCatalog', id), { ...data });
          });
          willCommit = true;
        }
        
        if (willCommit) {
          console.log('Committing batch...');
          await batch.commit();
          console.log('Batch committed successfully');
        } else {
          console.log('No data to seed');
        }
      } catch (err) {
        console.error("seedData error:", err);
        handleFirestoreError(err, OperationType.WRITE, 'seedData');
      }
    };
    seedData();

    const intakesQuery = query(collection(db, 'intakes'), where("userId", "==", user.uid));
    const unsubIntakes = onSnapshot(intakesQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as IntakeRequest));
      setIntakes(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'intakes'));

    const suppliersQuery = query(collection(db, 'suppliers'), where("userId", "==", user.uid));
    const unsubSuppliers = onSnapshot(suppliersQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
      setSuppliers(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'suppliers'));

    const spendMetricsQuery = query(collection(db, 'spendMetrics'), where("userId", "==", user.uid));
    const unsubSpendMetrics = onSnapshot(spendMetricsQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SpendMetric));
      // Sort by month correctly if needed, or assume ordered. The hardcoded data is ordered, 
      // but firestore might return them unordered if we don't order them, but since we use the ID SM-001.. it might be fine, 
      // or we can sort by ID.
      data.sort((a, b) => a.id.localeCompare(b.id));
      setSpendMetrics(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'spendMetrics'));

    const departmentSpendMetricsQuery = query(collection(db, 'departmentSpendMetrics'), where("userId", "==", user.uid));
    const unsubDepartmentSpendMetrics = onSnapshot(departmentSpendMetricsQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as DepartmentSpendMetric));
      data.sort((a, b) => a.id.localeCompare(b.id));
      setDepartmentSpendMetrics(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'departmentSpendMetrics'));

    const prQuery = query(collection(db, 'purchaseRequisitions'), where("createdBy", "==", user.uid));
    const unsubPRs = onSnapshot(prQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseRequisition));
      setPurchaseRequisitions(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'purchaseRequisitions'));

    const rfqQuery = query(collection(db, 'rfqs'), where("createdBy", "==", user.uid));
    const unsubRFQs = onSnapshot(rfqQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as RFQ));
      setRfqs(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rfqs'));

    const poQuery = query(collection(db, 'purchaseOrders'));
    const unsubPOs = onSnapshot(poQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setPurchaseOrders(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'purchaseOrders'));

    const bidsQuery = query(collection(db, 'bids'));
    const unsubBids = onSnapshot(bidsQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bid));
      setBids(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'bids'));

    const receiptsQuery = query(collection(db, 'goodsReceipts'));
    const unsubReceipts = onSnapshot(receiptsQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as GoodsReceipt));
      setGoodsReceipts(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'goodsReceipts'));

    const invoicesQuery = query(collection(db, 'invoices'));
    const unsubInvoices = onSnapshot(invoicesQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
      setInvoices(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invoices'));

    const catalogQuery = query(collection(db, 'procurementCatalog'));
    const unsubCatalog = onSnapshot(catalogQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setProcurementCatalog(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'procurementCatalog'));

    const kbQuery = query(collection(db, 'knowledgeBase'));
    const unsubKb = onSnapshot(kbQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setKnowledgeBase(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'knowledgeBase'));

    const memoryQuery = query(collection(db, 'agentMemory'), where("userId", "==", user.uid));
    const unsubMemory = onSnapshot(memoryQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentMemoryEntry));
      setAgentMemory(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'agentMemory'));

    return () => {
      unsubIntakes();
      unsubSuppliers();
      unsubSpendMetrics();
      unsubDepartmentSpendMetrics();
      unsubPRs();
      unsubRFQs();
      unsubPOs();
      unsubBids();
      unsubReceipts();
      unsubInvoices();
      unsubCatalog();
      unsubKb();
      unsubMemory();
    };
  }, [user]);

  const updateIntake = async (id: string, updates: Partial<IntakeRequest>) => {
    try {
      if (!user) throw new Error("Not authenticated");
      const { id: _, ...updateData } = updates;
      // Also ensure userId is added on new creates
      if (Object.keys(updateData).length > 0) {
        // If it's a completely new one we should use setDoc, otherwise updateDoc
        const exists = intakes.some(i => i.id === id);
        if (!exists) {
          await setDoc(doc(db, 'intakes', id), { ...updateData, userId: user.uid });
        } else {
          await updateDoc(doc(db, 'intakes', id), updateData);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `intakes/${id}`);
    }
  };

  const updateSupplier = async (id: string, updates: Partial<Supplier>) => {
    try {
      if (!user) throw new Error("Not authenticated");
      const { id: _, ...updateData } = updates;
      if (Object.keys(updateData).length > 0) {
        const exists = suppliers.some(s => s.id === id);
        if (!exists) {
          await setDoc(doc(db, 'suppliers', id), { ...updateData, userId: user.uid });
        } else {
          await updateDoc(doc(db, 'suppliers', id), updateData);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `suppliers/${id}`);
    }
  };

  const addMemory = async (entry: Omit<AgentMemoryEntry, 'id'>) => {
    try {
      if (!user) throw new Error("Not authenticated");
      const docRef = doc(collection(db, 'agentMemory'));
      await setDoc(docRef, { ...entry, id: docRef.id, userId: user.uid });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'agentMemory');
    }
  };

  // We keep setIntakes and setSuppliers for local state overriding if really needed,
  // but they shouldn't be used as the source of truth anymore.
  return (
    <DataContext.Provider value={{ intakes, setIntakes, updateIntake, suppliers, setSuppliers, updateSupplier, spendMetrics, departmentSpendMetrics, purchaseRequisitions, rfqs, purchaseOrders, bids, goodsReceipts, invoices, procurementCatalog, knowledgeBase, agentMemory, addMemory }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
