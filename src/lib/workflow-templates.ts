import { Graph } from 'wayflow';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  graph: Graph;
  enabled: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'atlas-workflow-templates';

// Built-in templates that ship with the app
const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'standard',
    name: 'Standard Purchase',
    description: 'Auto-PO under $10K, manager approval above',
    graph: {
      nodes: {
        'trigger-1': { id: 'trigger-1', type: 'input', label: 'New Intake Request', icon: 'play', position: { x: 250, y: 50 }, size: { width: 180, height: 60 }, data: {}, ports: [{ id: 'out', side: 'output', dataType: 'object', label: 'Request' }], zIndex: 0 },
        'condition-1': { id: 'condition-1', type: 'conditional', label: 'Amount > $10,000', icon: 'git-fork', position: { x: 250, y: 180 }, size: { width: 180, height: 60 }, data: { operator: '>', comparisonValue: '10000', inputField: 'amount' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }, { id: 'true', side: 'output', dataType: 'object', label: 'Yes' }, { id: 'false', side: 'output', dataType: 'object', label: 'No' }], zIndex: 0 },
        'auto-po': { id: 'auto-po', type: 'generatePO', label: 'Generate PO', icon: 'file-text', position: { x: 100, y: 320 }, size: { width: 180, height: 60 }, data: { template: 'Standard', autoApprove: true, threshold: 10000 }, ports: [{ id: 'requisition', side: 'input', dataType: 'object', label: 'Requisition' }, { id: 'po', side: 'output', dataType: 'object', label: 'PO' }, { id: 'status', side: 'output', dataType: 'string', label: 'Status' }], zIndex: 0 },
        'manager-approval': { id: 'manager-approval', type: 'human', label: 'Manager Approval', icon: 'users', position: { x: 400, y: 320 }, size: { width: 180, height: 60 }, data: { instructions: 'Review and approve this purchase requisition.' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }, { id: 'approved', side: 'output', dataType: 'object', label: 'Approved' }, { id: 'rejected', side: 'output', dataType: 'object', label: 'Rejected' }], zIndex: 0 },
      },
      edges: {
        'e1': { id: 'e1', sourceNodeId: 'trigger-1', sourcePortId: 'out', targetNodeId: 'condition-1', targetPortId: 'in' },
        'e2': { id: 'e2', sourceNodeId: 'condition-1', sourcePortId: 'false', targetNodeId: 'auto-po', targetPortId: 'requisition' },
        'e3': { id: 'e3', sourceNodeId: 'condition-1', sourcePortId: 'true', targetNodeId: 'manager-approval', targetPortId: 'in' },
      },
      metadata: { name: 'Standard Purchase', description: 'Auto-PO under $10K, manager approval above' },
    },
    enabled: true,
    builtIn: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'capex',
    name: 'Capital Expenditure',
    description: 'Multi-level approval for CapEx',
    graph: {
      nodes: {
        'trigger-1': { id: 'trigger-1', type: 'input', label: 'CapEx Request', icon: 'play', position: { x: 250, y: 50 }, size: { width: 180, height: 60 }, data: {}, ports: [{ id: 'out', side: 'output', dataType: 'object', label: 'Request' }], zIndex: 0 },
        'dept-head': { id: 'dept-head', type: 'human', label: 'Dept Head Approval', icon: 'users', position: { x: 250, y: 180 }, size: { width: 180, height: 60 }, data: { instructions: 'Department head review for capital expenditure.' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }, { id: 'approved', side: 'output', dataType: 'object', label: 'Approved' }, { id: 'rejected', side: 'output', dataType: 'object', label: 'Rejected' }], zIndex: 0 },
        'condition-1': { id: 'condition-1', type: 'conditional', label: 'Budget Check', icon: 'git-fork', position: { x: 250, y: 310 }, size: { width: 180, height: 60 }, data: { operator: '>', comparisonValue: '50000', inputField: 'amount' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }, { id: 'true', side: 'output', dataType: 'object', label: 'Over $50K' }, { id: 'false', side: 'output', dataType: 'object', label: 'Under $50K' }], zIndex: 0 },
        'finance': { id: 'finance', type: 'human', label: 'Finance Director', icon: 'briefcase', position: { x: 100, y: 440 }, size: { width: 180, height: 60 }, data: { instructions: 'Final financial review for large capital expenditures.' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }, { id: 'approved', side: 'output', dataType: 'object', label: 'Approved' }, { id: 'rejected', side: 'output', dataType: 'object', label: 'Rejected' }], zIndex: 0 },
        'generate-po': { id: 'generate-po', type: 'generatePO', label: 'Generate Capital PO', icon: 'file-text', position: { x: 400, y: 440 }, size: { width: 180, height: 60 }, data: { template: 'Capital Equipment' }, ports: [{ id: 'requisition', side: 'input', dataType: 'object', label: 'Requisition' }, { id: 'po', side: 'output', dataType: 'object', label: 'PO' }, { id: 'status', side: 'output', dataType: 'string', label: 'Status' }], zIndex: 0 },
      },
      edges: {
        'e1': { id: 'e1', sourceNodeId: 'trigger-1', sourcePortId: 'out', targetNodeId: 'dept-head', targetPortId: 'in' },
        'e2': { id: 'e2', sourceNodeId: 'dept-head', sourcePortId: 'approved', targetNodeId: 'condition-1', targetPortId: 'in' },
        'e3': { id: 'e3', sourceNodeId: 'condition-1', sourcePortId: 'true', targetNodeId: 'finance', targetPortId: 'in' },
        'e4': { id: 'e4', sourceNodeId: 'condition-1', sourcePortId: 'false', targetNodeId: 'generate-po', targetPortId: 'requisition' },
        'e5': { id: 'e5', sourceNodeId: 'finance', sourcePortId: 'approved', targetNodeId: 'generate-po', targetPortId: 'requisition' },
      },
      metadata: { name: 'Capital Expenditure', description: 'Multi-level approval for CapEx' },
    },
    enabled: true,
    builtIn: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'threeWayMatch',
    name: 'Three-Way Match',
    description: 'Match PO, receipt, and invoice before payment',
    graph: {
      nodes: {
        'input-1': { id: 'input-1', type: 'input', label: 'Invoice Received', icon: 'play', position: { x: 250, y: 50 }, size: { width: 180, height: 60 }, data: {}, ports: [{ id: 'out', side: 'output', dataType: 'object', label: 'Invoice' }], zIndex: 0 },
        'match-1': { id: 'match-1', type: 'threeWayMatch', label: 'Three-Way Match', icon: 'check-circle', position: { x: 250, y: 180 }, size: { width: 180, height: 60 }, data: { tolerancePercent: 2, quantityTolerance: 5 }, ports: [{ id: 'po', side: 'input', dataType: 'object', label: 'PO' }, { id: 'receipt', side: 'input', dataType: 'object', label: 'Receipt' }, { id: 'invoice', side: 'input', dataType: 'object', label: 'Invoice' }, { id: 'matched', side: 'output', dataType: 'boolean', label: 'Matched' }, { id: 'discrepancies', side: 'output', dataType: 'array', label: 'Issues' }], zIndex: 0 },
        'condition-1': { id: 'condition-1', type: 'conditional', label: 'Matched?', icon: 'git-fork', position: { x: 250, y: 310 }, size: { width: 180, height: 60 }, data: { inputField: 'matched', operator: '==', comparisonValue: 'true' }, ports: [{ id: 'in', side: 'input', dataType: 'boolean', label: 'Input' }, { id: 'true', side: 'output', dataType: 'object', label: 'Yes' }, { id: 'false', side: 'output', dataType: 'object', label: 'No' }], zIndex: 0 },
        'pay-1': { id: 'pay-1', type: 'action', label: 'Process Payment', icon: 'dollar-sign', position: { x: 100, y: 440 }, size: { width: 180, height: 60 }, data: { description: 'Release payment to vendor' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }], zIndex: 0 },
        'flag-1': { id: 'flag-1', type: 'human', label: 'Flag Discrepancy', icon: 'alert-triangle', position: { x: 400, y: 440 }, size: { width: 180, height: 60 }, data: { instructions: 'Review the invoice discrepancy and decide next steps.' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }, { id: 'approved', side: 'output', dataType: 'object', label: 'Resolve' }, { id: 'rejected', side: 'output', dataType: 'object', label: 'Reject' }], zIndex: 0 },
      },
      edges: {
        'e1': { id: 'e1', sourceNodeId: 'input-1', sourcePortId: 'out', targetNodeId: 'match-1', targetPortId: 'invoice' },
        'e2': { id: 'e2', sourceNodeId: 'match-1', sourcePortId: 'matched', targetNodeId: 'condition-1', targetPortId: 'in' },
        'e3': { id: 'e3', sourceNodeId: 'condition-1', sourcePortId: 'true', targetNodeId: 'pay-1', targetPortId: 'in' },
        'e4': { id: 'e4', sourceNodeId: 'condition-1', sourcePortId: 'false', targetNodeId: 'flag-1', targetPortId: 'in' },
      },
      metadata: { name: 'Three-Way Match', description: 'Match PO, receipt, and invoice before payment' },
    },
    enabled: true,
    builtIn: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rfqProcess',
    name: 'RFQ Process',
    description: 'Request for Quotation with bid evaluation',
    graph: {
      nodes: {
        'input-1': { id: 'input-1', type: 'input', label: 'RFQ Request', icon: 'play', position: { x: 250, y: 50 }, size: { width: 180, height: 60 }, data: {}, ports: [{ id: 'out', side: 'output', dataType: 'object', label: 'Request' }], zIndex: 0 },
        'notify-1': { id: 'notify-1', type: 'notifyVendor', label: 'Send RFQ to Vendors', icon: 'send', position: { x: 250, y: 180 }, size: { width: 180, height: 60 }, data: { method: 'Email', includeTerms: false }, ports: [{ id: 'po', side: 'input', dataType: 'object', label: 'RFQ' }, { id: 'supplier', side: 'input', dataType: 'object', label: 'Vendor' }, { id: 'sent', side: 'output', dataType: 'boolean', label: 'Sent' }], zIndex: 0 },
        'human-1': { id: 'human-1', type: 'human', label: 'Evaluate Bids', icon: 'users', position: { x: 250, y: 310 }, size: { width: 180, height: 60 }, data: { instructions: 'Review vendor bids and select the best value.' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Bids' }, { id: 'approved', side: 'output', dataType: 'object', label: 'Award' }, { id: 'rejected', side: 'output', dataType: 'object', label: 'Reject All' }], zIndex: 0 },
        'po-1': { id: 'po-1', type: 'generatePO', label: 'Generate PO', icon: 'file-text', position: { x: 250, y: 440 }, size: { width: 180, height: 60 }, data: { template: 'Standard' }, ports: [{ id: 'requisition', side: 'input', dataType: 'object', label: 'Requisition' }, { id: 'po', side: 'output', dataType: 'object', label: 'PO' }], zIndex: 0 },
      },
      edges: {
        'e1': { id: 'e1', sourceNodeId: 'input-1', sourcePortId: 'out', targetNodeId: 'notify-1', targetPortId: 'po' },
        'e2': { id: 'e2', sourceNodeId: 'notify-1', sourcePortId: 'sent', targetNodeId: 'human-1', targetPortId: 'in' },
        'e3': { id: 'e3', sourceNodeId: 'human-1', sourcePortId: 'approved', targetNodeId: 'po-1', targetPortId: 'requisition' },
      },
      metadata: { name: 'RFQ Process', description: 'Request for Quotation with bid evaluation' },
    },
    enabled: true,
    builtIn: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'vendorQualification',
    name: 'Vendor Qualification',
    description: 'Qualify new vendors through compliance checks',
    graph: {
      nodes: {
        'input-1': { id: 'input-1', type: 'input', label: 'Vendor Application', icon: 'play', position: { x: 250, y: 50 }, size: { width: 180, height: 60 }, data: {}, ports: [{ id: 'out', side: 'output', dataType: 'object', label: 'Application' }], zIndex: 0 },
        'check-1': { id: 'check-1', type: 'checkBudget', label: 'Insurance Check', icon: 'shield', position: { x: 250, y: 180 }, size: { width: 180, height: 60 }, data: { department: 'Compliance', budgetPeriod: 'Annual' }, ports: [{ id: 'requisition', side: 'input', dataType: 'object', label: 'Vendor' }, { id: 'withinBudget', side: 'output', dataType: 'boolean', label: 'Valid' }], zIndex: 0 },
        'condition-1': { id: 'condition-1', type: 'conditional', label: 'Passed?', icon: 'git-fork', position: { x: 250, y: 310 }, size: { width: 180, height: 60 }, data: { inputField: 'withinBudget', operator: '==', comparisonValue: 'true' }, ports: [{ id: 'in', side: 'input', dataType: 'boolean', label: 'Input' }, { id: 'true', side: 'output', dataType: 'object', label: 'Yes' }, { id: 'false', side: 'output', dataType: 'object', label: 'No' }], zIndex: 0 },
        'approve-1': { id: 'approve-1', type: 'human', label: 'Final Review', icon: 'users', position: { x: 100, y: 440 }, size: { width: 180, height: 60 }, data: { instructions: 'Final vendor qualification review.' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Vendor' }, { id: 'approved', side: 'output', dataType: 'object', label: 'Approved' }, { id: 'rejected', side: 'output', dataType: 'object', label: 'Rejected' }], zIndex: 0 },
        'reject-1': { id: 'reject-1', type: 'action', label: 'Reject Application', icon: 'x-circle', position: { x: 400, y: 440 }, size: { width: 180, height: 60 }, data: { description: 'Notify vendor of rejection' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }], zIndex: 0 },
      },
      edges: {
        'e1': { id: 'e1', sourceNodeId: 'input-1', sourcePortId: 'out', targetNodeId: 'check-1', targetPortId: 'requisition' },
        'e2': { id: 'e2', sourceNodeId: 'check-1', sourcePortId: 'withinBudget', targetNodeId: 'condition-1', targetPortId: 'in' },
        'e3': { id: 'e3', sourceNodeId: 'condition-1', sourcePortId: 'true', targetNodeId: 'approve-1', targetPortId: 'in' },
        'e4': { id: 'e4', sourceNodeId: 'condition-1', sourcePortId: 'false', targetNodeId: 'reject-1', targetPortId: 'in' },
      },
      metadata: { name: 'Vendor Qualification', description: 'Qualify new vendors through compliance checks' },
    },
    enabled: true,
    builtIn: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'budgetTransfer',
    name: 'Budget Transfer',
    description: 'Transfer budget between cost centers with threshold approval',
    graph: {
      nodes: {
        'input-1': { id: 'input-1', type: 'input', label: 'Transfer Request', icon: 'play', position: { x: 250, y: 50 }, size: { width: 180, height: 60 }, data: {}, ports: [{ id: 'out', side: 'output', dataType: 'object', label: 'Request' }], zIndex: 0 },
        'condition-1': { id: 'condition-1', type: 'conditional', label: 'Amount > $25K?', icon: 'git-fork', position: { x: 250, y: 180 }, size: { width: 180, height: 60 }, data: { inputField: 'amount', operator: '>', comparisonValue: '25000' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }, { id: 'true', side: 'output', dataType: 'object', label: 'Yes' }, { id: 'false', side: 'output', dataType: 'object', label: 'No' }], zIndex: 0 },
        'cfo-1': { id: 'cfo-1', type: 'human', label: 'CFO Approval', icon: 'briefcase', position: { x: 100, y: 310 }, size: { width: 180, height: 60 }, data: { instructions: 'CFO must approve transfers over $25K.' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Transfer' }, { id: 'approved', side: 'output', dataType: 'object', label: 'Approved' }, { id: 'rejected', side: 'output', dataType: 'object', label: 'Rejected' }], zIndex: 0 },
        'auto-1': { id: 'auto-1', type: 'action', label: 'Auto-Process', icon: 'zap', position: { x: 400, y: 310 }, size: { width: 180, height: 60 }, data: { description: 'Process transfer automatically' }, ports: [{ id: 'in', side: 'input', dataType: 'object', label: 'Input' }], zIndex: 0 },
        'notify-1': { id: 'notify-1', type: 'notifyVendor', label: 'Notify Departments', icon: 'send', position: { x: 250, y: 440 }, size: { width: 180, height: 60 }, data: { method: 'Email', includeTerms: false }, ports: [{ id: 'po', side: 'input', dataType: 'object', label: 'Transfer' }, { id: 'sent', side: 'output', dataType: 'boolean', label: 'Sent' }], zIndex: 0 },
      },
      edges: {
        'e1': { id: 'e1', sourceNodeId: 'input-1', sourcePortId: 'out', targetNodeId: 'condition-1', targetPortId: 'in' },
        'e2': { id: 'e2', sourceNodeId: 'condition-1', sourcePortId: 'true', targetNodeId: 'cfo-1', targetPortId: 'in' },
        'e3': { id: 'e3', sourceNodeId: 'condition-1', sourcePortId: 'false', targetNodeId: 'auto-1', targetPortId: 'in' },
        'e4': { id: 'e4', sourceNodeId: 'cfo-1', sourcePortId: 'approved', targetNodeId: 'notify-1', targetPortId: 'po' },
        'e5': { id: 'e5', sourceNodeId: 'auto-1', sourcePortId: 'in', targetNodeId: 'notify-1', targetPortId: 'po' },
      },
      metadata: { name: 'Budget Transfer', description: 'Transfer budget between cost centers with threshold approval' },
    },
    enabled: true,
    builtIn: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

/**
 * Load all templates from localStorage, merging with built-in templates.
 * Built-in templates are always present but their enabled state is persisted.
 */
export function loadTemplates(): WorkflowTemplate[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as WorkflowTemplate[];
      // Merge: keep saved state for built-in, add any new built-ins, keep custom
      const merged = BUILT_IN_TEMPLATES.map(builtIn => {
        const savedVersion = parsed.find(t => t.id === builtIn.id);
        return savedVersion
          ? { ...builtIn, enabled: savedVersion.enabled, updatedAt: savedVersion.updatedAt }
          : builtIn;
      });
      // Add custom templates (not built-in)
      const custom = parsed.filter(t => !t.builtIn);
      return [...merged, ...custom];
    }
  } catch (e) {
    console.error('Failed to load templates:', e);
  }
  return [...BUILT_IN_TEMPLATES];
}

/**
 * Save all templates to localStorage.
 */
export function saveTemplates(templates: WorkflowTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

/**
 * Get only enabled templates (for the dropdown).
 */
export function getEnabledTemplates(templates: WorkflowTemplate[]): WorkflowTemplate[] {
  return templates.filter(t => t.enabled);
}

/**
 * Toggle a template's enabled state.
 */
export function toggleTemplate(templates: WorkflowTemplate[], templateId: string): WorkflowTemplate[] {
  return templates.map(t =>
    t.id === templateId ? { ...t, enabled: !t.enabled, updatedAt: new Date().toISOString() } : t
  );
}

/**
 * Add a custom template.
 */
export function addTemplate(templates: WorkflowTemplate[], template: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt'>): WorkflowTemplate[] {
  const newTemplate: WorkflowTemplate = {
    ...template,
    id: `custom-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return [...templates, newTemplate];
}

/**
 * Update a template's name and description.
 */
export function updateTemplate(templates: WorkflowTemplate[], templateId: string, updates: { name?: string; description?: string }): WorkflowTemplate[] {
  return templates.map(t =>
    t.id === templateId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
  );
}

/**
 * Delete a template (only custom templates can be deleted).
 */
export function deleteTemplate(templates: WorkflowTemplate[], templateId: string): WorkflowTemplate[] {
  return templates.filter(t => t.id !== templateId || t.builtIn);
}

/**
 * Duplicate a template.
 */
export function duplicateTemplate(templates: WorkflowTemplate[], templateId: string): WorkflowTemplate[] {
  const source = templates.find(t => t.id === templateId);
  if (!source) return templates;
  const duplicate: WorkflowTemplate = {
    ...source,
    id: `custom-${Date.now()}`,
    name: `${source.name} (Copy)`,
    builtIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return [...templates, duplicate];
}

/**
 * Export templates as JSON string.
 */
export function exportTemplates(templates: WorkflowTemplate[]): string {
  return JSON.stringify(templates, null, 2);
}

/**
 * Import templates from JSON string.
 */
export function importTemplates(json: string): WorkflowTemplate[] {
  const parsed = JSON.parse(json) as WorkflowTemplate[];
  return parsed.map(t => ({
    ...t,
    id: t.builtIn ? t.id : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    builtIn: false,
    updatedAt: new Date().toISOString(),
  }));
}
