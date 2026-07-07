/**
 * Custom workflow node handlers for Atlas procurement.
 * These handlers define what each procurement node does when executed.
 */

export interface NodeHandler {
  (inputs: Record<string, unknown>, config: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface WorkflowHandlerContext {
  requisitionId?: string;
  requisition?: Record<string, unknown>;
  supplier?: Record<string, unknown>;
  userId?: string;
  apiBase?: string;
}

/**
 * Generate PO handler — creates a purchase order from a requisition
 */
export const generatePOHandler: NodeHandler = async (inputs, config) => {
  const requisition = inputs.requisition as Record<string, unknown> || {};
  const template = (config.template as string) || 'Standard';
  const autoApprove = config.autoApprove as boolean;
  const threshold = (config.threshold as number) || 5000;

  const amount = parseFloat(String(requisition.amount || '0').replace(/[^0-9.]/g, ''));

  const po = {
    po_number: `PO-${Date.now()}`,
    requisition_id: requisition.id,
    template,
    amount,
    status: autoApprove && amount <= threshold ? 'approved' : 'pending',
    created_at: new Date().toISOString(),
    items: requisition.items || [],
    supplier: requisition.supplier || null,
  };

  return { po, status: po.status };
};

/**
 * Check Budget handler — verifies budget availability
 */
export const checkBudgetHandler: NodeHandler = async (inputs, config) => {
  const requisition = inputs.requisition as Record<string, unknown> || {};
  const department = (config.department as string) || (requisition.department as string) || 'general';
  const budgetPeriod = (config.budgetPeriod as string) || 'Annual';

  // In production, this would query a budget database
  // For now, return a simulated result
  const amount = parseFloat(String(requisition.amount || '0').replace(/[^0-9.]/g, ''));
  const budgetAvailable = 100000; // Simulated budget
  const budgetUsed = 45000; // Simulated usage

  return {
    withinBudget: (budgetUsed + amount) <= budgetAvailable,
    budgetInfo: {
      department,
      period: budgetPeriod,
      allocated: budgetAvailable,
      used: budgetUsed,
      requested: amount,
      remaining: budgetAvailable - budgetUsed,
    },
  };
};

/**
 * Notify Vendor handler — sends PO to supplier
 */
export const notifyVendorHandler: NodeHandler = async (inputs, config) => {
  const po = inputs.po as Record<string, unknown> || {};
  const supplier = inputs.supplier as Record<string, unknown> || {};
  const method = (config.method as string) || 'Email';
  const includeTerms = config.includeTerms as boolean !== false;

  // In production, this would call email/EDI/API
  const confirmation = {
    method,
    sent_to: supplier.email || supplier.name || 'unknown',
    po_number: po.po_number,
    include_payment_terms: includeTerms,
    sent_at: new Date().toISOString(),
  };

  return { sent: true, confirmation: JSON.stringify(confirmation) };
};

/**
 * Three-Way Match handler — matches PO, receipt, and invoice
 */
export const threeWayMatchHandler: NodeHandler = async (inputs, config) => {
  const po = inputs.po as Record<string, unknown> || {};
  const receipt = inputs.receipt as Record<string, unknown> || {};
  const invoice = inputs.invoice as Record<string, unknown> || {};
  const tolerancePercent = (config.tolerancePercent as number) || 2;
  const quantityTolerance = (config.quantityTolerance as number) || 5;

  const discrepancies: string[] = [];

  // Price comparison
  const poAmount = parseFloat(String(po.amount || '0').replace(/[^0-9.]/g, ''));
  const invoiceAmount = parseFloat(String(invoice.amount || '0').replace(/[^0-9.]/g, ''));
  const priceDiff = Math.abs(poAmount - invoiceAmount);
  const priceToleranceAmount = poAmount * (tolerancePercent / 100);

  if (priceDiff > priceToleranceAmount) {
    discrepancies.push(`Price mismatch: PO=$${poAmount}, Invoice=$${invoiceAmount} (diff: $${priceDiff}, tolerance: $${priceToleranceAmount})`);
  }

  // Quantity comparison
  const poQty = Number(po.quantity || receipt.quantity || 0);
  const receiptQty = Number(receipt.quantity || 0);
  const qtyDiff = Math.abs(poQty - receiptQty);
  const qtyToleranceAmount = poQty * (quantityTolerance / 100);

  if (qtyDiff > qtyToleranceAmount) {
    discrepancies.push(`Quantity mismatch: PO=${poQty}, Receipt=${receiptQty}`);
  }

  return {
    matched: discrepancies.length === 0,
    discrepancies,
  };
};

/**
 * Map of all custom node handlers
 */
export const ATLAS_NODE_HANDLERS: Record<string, NodeHandler> = {
  generatePO: generatePOHandler,
  checkBudget: checkBudgetHandler,
  notifyVendor: notifyVendorHandler,
  threeWayMatch: threeWayMatchHandler,
};

/**
 * Execute a single workflow node
 */
export async function executeNode(
  nodeType: string,
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  context?: WorkflowHandlerContext
): Promise<Record<string, unknown>> {
  const handler = ATLAS_NODE_HANDLERS[nodeType];
  if (!handler) {
    throw new Error(`No handler for node type: ${nodeType}`);
  }
  return handler(inputs, config);
}
