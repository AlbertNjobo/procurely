import { collection, getDocs, addDoc, query, limit } from 'firebase/firestore';
import { db } from './firebase';

async function collectionEmpty(name: string): Promise<boolean> {
  const snap = await getDocs(query(collection(db, name), limit(1)));
  return snap.empty;
}

export async function seedDemoData(userId: string) {
  const batches: Promise<void>[] = [];

  // Suppliers
  if (await collectionEmpty('suppliers')) {
    const suppliers = [
      { name: 'Amazon Web Services', category: 'Cloud Infrastructure', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Microsoft Azure', category: 'Cloud Infrastructure', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Google Cloud Platform', category: 'Cloud Infrastructure', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Dell Technologies', category: 'Hardware', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Lenovo', category: 'Hardware', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'HP Inc.', category: 'Hardware', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Cisco Systems', category: 'Networking', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'CrowdStrike', category: 'Cybersecurity', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Salesforce', category: 'SaaS / CRM', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Slack Technologies', category: 'SaaS / Collaboration', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Stripe Inc.', category: 'Financial Services', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Snowflake', category: 'Data & Analytics', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Datadog', category: 'Monitoring & Observability', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'MongoDB', category: 'Database', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Twilio', category: 'Communications API', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Okta', category: 'Identity & Access Management', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Atlassian', category: 'SaaS / DevTools', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'GitLab', category: 'SaaS / DevTools', risk: 'Low', status: 'Active', compliance: true, userId },
      { name: 'Elastic', category: 'Data & Analytics', risk: 'Medium', status: 'Active', compliance: true, userId },
      { name: 'Cloudflare', category: 'Cloud Infrastructure', risk: 'Low', status: 'Active', compliance: true, userId },
    ];
    for (const s of suppliers) batches.push(addDoc(collection(db, 'suppliers'), s).then(() => {}));
  }

  // Purchase Requisitions
  if (await collectionEmpty('purchaseRequisitions')) {
    const reqs = [
      { title: 'Q3 AWS Hosting', department: 'Engineering', status: 'PO Generated', totalAmount: 12400, purpose: 'Hosting costs for Q3 production environment.', reason: 'Current hosting expires end of Q2.', category: 'Cloud Infrastructure', supplier: 'Amazon Web Services', createdBy: userId, createdAt: '2026-06-28T10:00:00Z', auditTrail: [{ action: 'Created', actorId: userId, timestamp: '2026-06-28T10:00:00Z' }, { action: 'Approved by Finance', actorId: 'system', timestamp: '2026-06-29T14:00:00Z' }] },
      { title: 'Salesforce Licenses (30 seats)', department: 'Sales', status: 'Pending Finance Approval', totalAmount: 45000, purpose: 'Additional seats for the new SDR team.', reason: 'Team expansion requires immediate access.', category: 'SaaS / CRM', supplier: 'Salesforce', createdBy: userId, createdAt: '2026-06-29T09:00:00Z', auditTrail: [{ action: 'Created', actorId: userId, timestamp: '2026-06-29T09:00:00Z' }, { action: 'Manager Approved', actorId: 'system', timestamp: '2026-06-30T11:00:00Z' }] },
      { title: 'Office Supplies Restock', department: 'Operations', status: 'Draft', totalAmount: 1200, purpose: 'Monthly restock of paper, pens, and whiteboards.', reason: 'Supplies running low.', category: 'Office Supplies', supplier: 'Office Depot Business', createdBy: userId, createdAt: '2026-06-30T08:00:00Z', auditTrail: [{ action: 'Created', actorId: userId, timestamp: '2026-06-30T08:00:00Z' }] },
      { title: 'Q3 Marketing Campaign', department: 'Marketing', status: 'Pending Manager Approval', totalAmount: 25000, purpose: 'Retainer for Q3 digital marketing campaigns.', reason: 'Agency contract renewal.', category: 'Marketing Services', supplier: 'Creative Group Inc.', createdBy: userId, createdAt: '2026-06-25T10:00:00Z', auditTrail: [{ action: 'Created', actorId: userId, timestamp: '2026-06-25T10:00:00Z' }] },
      { title: '10 Engineering Laptops', department: 'Engineering', status: 'Pending RFQ', totalAmount: 15000, purpose: 'New laptops for engineering hires starting Q3.', reason: 'Headcount growth.', category: 'Hardware', supplier: '', createdBy: userId, createdAt: '2026-06-29T11:00:00Z', auditTrail: [{ action: 'Created', actorId: userId, timestamp: '2026-06-29T11:00:00Z' }, { action: 'Manager Approved', actorId: 'system', timestamp: '2026-06-30T09:00:00Z' }] },
      { title: 'Server Room UPS Upgrade', department: 'IT', status: 'PO Generated', totalAmount: 8500, purpose: 'Replace aging UPS units in primary server room.', reason: 'Current units past end-of-life.', category: 'Hardware', supplier: 'Dell Technologies', createdBy: userId, createdAt: '2026-06-20T10:00:00Z', auditTrail: [{ action: 'Created', actorId: userId, timestamp: '2026-06-20T10:00:00Z' }, { action: 'Approved', actorId: 'system', timestamp: '2026-06-21T14:00:00Z' }, { action: 'PO Generated', actorId: 'system', timestamp: '2026-06-22T10:00:00Z' }] },
      { title: 'Employee Training Platform', department: 'HR', status: 'Rejected', totalAmount: 6800, purpose: 'Annual training platform subscription.', reason: 'Budget reallocated to other priorities.', category: 'SaaS / CRM', supplier: '', createdBy: userId, createdAt: '2026-06-15T10:00:00Z', auditTrail: [{ action: 'Created', actorId: userId, timestamp: '2026-06-15T10:00:00Z' }, { action: 'Rejected by Finance', actorId: 'system', timestamp: '2026-06-18T16:00:00Z' }] },
      { title: 'Legal Contract Management', department: 'Legal', status: 'Draft', totalAmount: 18000, purpose: 'Contract lifecycle management software.', reason: 'Current process is manual and error-prone.', category: 'SaaS / CRM', supplier: '', createdBy: userId, createdAt: '2026-07-01T09:00:00Z', auditTrail: [{ action: 'Created', actorId: userId, timestamp: '2026-07-01T09:00:00Z' }] },
    ];
    for (const r of reqs) batches.push(addDoc(collection(db, 'purchaseRequisitions'), r).then(() => {}));
  }

  // RFQs + Bids (created together so bids can reference real RFQ IDs)
  // Wrapped in try/catch — role-gated collections may fail for Requestor users
  try {
  if (await collectionEmpty('rfqs')) {
    const rfqData = [
      {
        title: 'Q3 Laptop Procurement',
        description: 'Procure 10 laptops for engineering team. Must have 16GB+ RAM, 512GB SSD, USB-C docking support. Include on-site warranty.',
        dueDate: '2026-07-20',
        budgetRange: '$12,000 - $16,000',
        category: 'Hardware',
        invitedSuppliers: ['Dell Technologies', 'Acme Corp'],
        status: 'Published',
        createdBy: userId,
        createdAt: '2026-06-29T10:00:00Z',
        auditTrail: [
          { id: crypto.randomUUID(), action: 'Created', actorId: userId, timestamp: '2026-06-29T10:00:00Z' },
          { id: crypto.randomUUID(), action: 'Status → Published', actorId: userId, timestamp: '2026-06-29T11:00:00Z' },
        ],
      },
      {
        title: 'Cloud Migration Services',
        description: 'Migrate on-premise infrastructure to cloud. Includes assessment phase, execution phase, and 3-month post-migration support. Must provide detailed migration plan and rollback strategy.',
        dueDate: '2026-07-25',
        budgetRange: '$50,000 - $80,000',
        category: 'Services',
        invitedSuppliers: ['Amazon Web Services', 'Salesforce'],
        status: 'Evaluating',
        createdBy: userId,
        createdAt: '2026-06-20T10:00:00Z',
        auditTrail: [
          { id: crypto.randomUUID(), action: 'Created', actorId: userId, timestamp: '2026-06-20T10:00:00Z' },
          { id: crypto.randomUUID(), action: 'Status → Published', actorId: userId, timestamp: '2026-06-20T11:00:00Z' },
          { id: crypto.randomUUID(), action: 'Status → Evaluating', actorId: userId, timestamp: '2026-06-27T09:00:00Z' },
        ],
      },
      {
        title: 'Office Furniture Refresh',
        description: 'Replace worn desks and chairs in main office. 50 standing desks (electric, programmable heights), 60 ergonomic chairs with lumbar support.',
        dueDate: '2026-08-01',
        budgetRange: '$20,000 - $30,000',
        category: 'Office Supplies',
        invitedSuppliers: ['Office Depot Business'],
        status: 'Draft',
        createdBy: userId,
        createdAt: '2026-07-01T10:00:00Z',
        auditTrail: [
          { id: crypto.randomUUID(), action: 'Created', actorId: userId, timestamp: '2026-07-01T10:00:00Z' },
        ],
      },
    ];

    const rfqIds: string[] = [];
    for (const r of rfqData) {
      const ref = await addDoc(collection(db, 'rfqs'), r);
      rfqIds.push(ref.id);
    }

    // Bids referencing actual RFQ IDs
    if (await collectionEmpty('bids')) {
      const bidData = [
        { rfqId: rfqIds[0], vendorId: 'dell', vendorName: 'Dell Technologies', amount: 14500, proposal: 'Dell Latitude 5540 x10. 16GB RAM, 512GB SSD, 3-year on-site warranty included.', status: 'Submitted', deliveryDays: 14, warranty: '3 years on-site', createdAt: '2026-07-02T10:00:00Z', createdBy: userId },
        { rfqId: rfqIds[0], vendorId: 'acme', vendorName: 'Acme Corp', amount: 13200, proposal: 'Lenovo ThinkPad L14 Gen 4 x10. 16GB RAM, 256GB SSD, 1-year warranty.', status: 'Submitted', deliveryDays: 21, warranty: '1 year depot', createdAt: '2026-07-03T10:00:00Z', createdBy: userId },
        { rfqId: rfqIds[1], vendorId: 'aws', vendorName: 'Amazon Web Services', amount: 65000, proposal: 'Full migration including assessment, execution, and 3 months post-migration support.', status: 'Submitted', deliveryDays: 90, warranty: '90-day support', createdAt: '2026-06-25T10:00:00Z', createdBy: userId },
        { rfqId: rfqIds[1], vendorId: 'salesforce', vendorName: 'Salesforce', amount: 72000, proposal: 'Migration with Salesforce integration layer included.', status: 'Submitted', deliveryDays: 120, warranty: '60-day support', createdAt: '2026-06-26T10:00:00Z', createdBy: userId },
      ];
      for (const b of bidData) batches.push(addDoc(collection(db, 'bids'), b).then(() => {}));
    }
  }
  } catch (e) { console.warn('RFQ/Bid seed skipped (role-gated):', e); }

  // Purchase Orders — also role-gated, wrap in try/catch
  try {
  if (await collectionEmpty('purchaseOrders')) {
    const pos = [
      { id: 'PO-001', supplierId: 'aws', vendorName: 'Amazon Web Services', items: [{ name: 'AWS Q3 Hosting', quantity: 1, unit_price: '$12,400' }], totalAmount: 12400, status: 'Issued', requisitionId: 'req-aws', createdBy: userId, createdAt: '2026-06-30T10:00:00Z', deliveryDate: '2026-07-01' },
      { id: 'PO-002', supplierId: 'dell', vendorName: 'Dell Technologies', items: [{ name: 'Dell Latitude 5540', quantity: 10, unit_price: '$1,450' }], totalAmount: 14500, status: 'Accepted', requisitionId: 'req-laptop', createdBy: userId, createdAt: '2026-07-03T10:00:00Z', deliveryDate: '2026-07-15' },
      { id: 'PO-003', supplierId: 'dell', vendorName: 'Dell Technologies', items: [{ name: 'APC UPS Unit', quantity: 3, unit_price: '$2,833' }], totalAmount: 8500, status: 'Fulfilled', requisitionId: 'req-ups', createdBy: userId, createdAt: '2026-06-22T10:00:00Z', deliveryDate: '2026-06-28' },
    ];
    for (const p of pos) batches.push(addDoc(collection(db, 'purchaseOrders'), p).then(() => {}));
  }
  } catch (e) { console.warn('PO seed skipped (role-gated):', e); }

  // Knowledge Base
  if (await collectionEmpty('knowledgeBase')) {
    const docs = [
      {
        title: 'Limit on the requisition of laptops',
        fileName: 'Manual Instruction',
        content: 'Policy: No employee may order or request a laptop with a unit cost exceeding $5,000 without written approval from a VP or department head. All laptop purchases must go through the standard procurement process. Requests above $5,000 require: (1) Written justification, (2) VP-level approval, (3) Comparison of at least 3 vendor quotes. Emergency exceptions may be granted by the CFO for business-critical needs only.',
        category: 'Policy',
        department: 'Procurement',
        summary: 'Laptop purchases capped at $5,000 per unit. Above requires VP approval and 3 vendor quotes.',
        userId,
        createdAt: new Date().toISOString(),
        chunks: [],
      },
      {
        title: 'Vendor Onboarding Guidelines',
        fileName: 'Manual Instruction',
        content: 'All new vendors must complete the following onboarding process before they can receive purchase orders: 1. Submit W-9 tax form, 2. Provide proof of insurance (general liability minimum $1M), 3. Complete vendor information form including banking details, 4. Pass compliance review for SOX and data privacy requirements, 5. Sign standard vendor agreement. Onboarding typically takes 5-10 business days. Vendors marked "Onboarding" status cannot be added to RFQs until completed.',
        category: 'Guideline',
        department: 'Procurement',
        summary: 'New vendors need W-9, insurance proof, compliance review, and signed agreement before receiving POs.',
        userId,
        createdAt: new Date().toISOString(),
        chunks: [],
      },
      {
        title: 'Emergency Purchase Procedure',
        fileName: 'Manual Instruction',
        content: 'Emergency purchases are allowed outside the standard procurement workflow under these conditions: 1. The purchase is under $2,500, 2. There is an immediate business need that cannot wait for standard approval (e.g., critical system failure, safety hazard), 3. The requestor documents the emergency justification in writing. Emergency purchases still require manager notification within 24 hours. All emergency purchases are flagged in the monthly audit report. Repeated misuse of the emergency process will result in loss of emergency purchasing privileges.',
        category: 'Policy',
        department: 'Finance',
        summary: 'Emergency purchases under $2,500 allowed with written justification. Manager must be notified within 24 hours.',
        userId,
        createdAt: new Date().toISOString(),
        chunks: [],
      },
    ];
    for (const d of docs) batches.push(addDoc(collection(db, 'knowledgeBase'), d).then(() => {}));
  }

  // Catalog Items
  if (await collectionEmpty('procurementCatalog')) {
    const items = [
      { name: 'Dell Latitude 5540 Laptop', description: '14" business laptop, Intel i5, 16GB RAM, 512GB SSD.', price: 1449.99, category: 'Hardware', vendorId: 'dell', vendorName: 'Dell Technologies' },
      { name: 'Dell UltraSharp 27" Monitor', description: 'USB-C hub monitor, 4K, 100% sRGB.', price: 619.99, category: 'Hardware', vendorId: 'dell', vendorName: 'Dell Technologies' },
      { name: 'AWS EC2 Instance (m5.large) - Monthly', description: 'General purpose compute, 2 vCPU, 8GB RAM.', price: 70.08, category: 'Cloud Infrastructure', vendorId: 'aws', vendorName: 'Amazon Web Services' },
      { name: 'AWS S3 Storage - 1TB', description: 'Standard object storage for backups and archives.', price: 23.00, category: 'Cloud Infrastructure', vendorId: 'aws', vendorName: 'Amazon Web Services' },
      { name: 'Salesforce Sales Cloud - Per Seat', description: 'CRM license per user per month.', price: 150.00, category: 'SaaS / CRM', vendorId: 'salesforce', vendorName: 'Salesforce' },
      { name: 'Ergonomic Office Chair', description: 'Adjustable lumbar support, mesh back.', price: 349.00, category: 'Office Supplies', vendorId: 'od', vendorName: 'Office Depot Business' },
      { name: 'Standing Desk - Electric', description: '60x30 electric sit-stand desk, programmable heights.', price: 599.00, category: 'Office Supplies', vendorId: 'od', vendorName: 'Office Depot Business' },
      { name: 'Logitech MX Master 3S Mouse', description: 'Wireless ergonomic mouse, USB-C charging.', price: 99.99, category: 'Hardware', vendorId: 'od', vendorName: 'Office Depot Business' },
      { name: 'APC Smart-UPS 1500VA', description: 'Rack-mount UPS, 1500VA/1000W, network management card.', price: 2833.00, category: 'Hardware', vendorId: 'dell', vendorName: 'Dell Technologies' },
      { name: 'Whiteboard Markers (12 Pack)', description: 'Assorted colors dry erase markers.', price: 14.50, category: 'Office Supplies', vendorId: 'od', vendorName: 'Office Depot Business' },
    ];
    for (const i of items) {
      batches.push(addDoc(collection(db, 'procurementCatalog'), { ...i, createdAt: new Date().toISOString() }).then(() => {}));
    }
  }

  await Promise.all(batches);
}
