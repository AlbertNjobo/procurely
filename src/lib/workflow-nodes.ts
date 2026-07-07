import { NodeTypeDefinition, BUILTIN_NODE_TYPES } from 'wayflow';

// Custom Procurement Node Types for Atlas

export const generatePO: NodeTypeDefinition = {
  label: 'Generate PO',
  category: 'Procurement',
  icon: 'file-text',
  ports: {
    inputs: [
      { id: 'requisition', dataType: 'object', label: 'Requisition' },
    ],
    outputs: [
      { id: 'po', dataType: 'object', label: 'PO' },
      { id: 'status', dataType: 'string', label: 'Status' },
    ],
  },
  configSchema: {
    template: {
      type: 'select',
      label: 'PO Template',
      options: ['Standard', 'Blanket', 'Capital Equipment', 'Services'],
      default: 'Standard',
    },
    autoApprove: {
      type: 'boolean',
      label: 'Auto-approve under threshold',
      default: false,
    },
    threshold: {
      type: 'number',
      label: 'Auto-approve threshold ($)',
      default: 5000,
      min: 0,
      step: 100,
    },
  },
};

export const checkBudget: NodeTypeDefinition = {
  label: 'Check Budget',
  category: 'Procurement',
  icon: 'search',
  ports: {
    inputs: [
      { id: 'requisition', dataType: 'object', label: 'Requisition' },
    ],
    outputs: [
      { id: 'withinBudget', dataType: 'boolean', label: 'Within Budget' },
      { id: 'budgetInfo', dataType: 'object', label: 'Budget Info' },
    ],
  },
  configSchema: {
    department: {
      type: 'text',
      label: 'Department',
    },
    budgetPeriod: {
      type: 'select',
      label: 'Budget Period',
      options: ['Monthly', 'Quarterly', 'Annual'],
      default: 'Annual',
    },
  },
};

export const notifyVendor: NodeTypeDefinition = {
  label: 'Notify Vendor',
  category: 'Procurement',
  icon: 'send',
  ports: {
    inputs: [
      { id: 'po', dataType: 'object', label: 'PO' },
      { id: 'supplier', dataType: 'object', label: 'Supplier' },
    ],
    outputs: [
      { id: 'sent', dataType: 'boolean', label: 'Sent' },
      { id: 'confirmation', dataType: 'string', label: 'Confirmation' },
    ],
  },
  configSchema: {
    method: {
      type: 'select',
      label: 'Notification Method',
      options: ['Email', 'EDI', 'Portal', 'API'],
      default: 'Email',
    },
    includeTerms: {
      type: 'boolean',
      label: 'Include payment terms',
      default: true,
    },
  },
};

export const threeWayMatch: NodeTypeDefinition = {
  label: 'Three-Way Match',
  category: 'Procurement',
  icon: 'check-circle',
  ports: {
    inputs: [
      { id: 'po', dataType: 'object', label: 'PO' },
      { id: 'receipt', dataType: 'object', label: 'Receipt' },
      { id: 'invoice', dataType: 'object', label: 'Invoice' },
    ],
    outputs: [
      { id: 'matched', dataType: 'boolean', label: 'Matched' },
      { id: 'discrepancies', dataType: 'array', label: 'Discrepancies' },
    ],
  },
  configSchema: {
    tolerancePercent: {
      type: 'number',
      label: 'Price tolerance (%)',
      default: 2,
      min: 0,
      max: 100,
      step: 0.5,
    },
    quantityTolerance: {
      type: 'number',
      label: 'Quantity tolerance (%)',
      default: 5,
      min: 0,
      max: 100,
      step: 1,
    },
  },
};

// Merge built-in nodes with procurement nodes
export const ATLAS_NODE_TYPES = {
  ...BUILTIN_NODE_TYPES,
  generatePO,
  checkBudget,
  notifyVendor,
  threeWayMatch,
};

// SVG icon paths for custom nodes (24x24 viewBox, inner paths only)
export const ATLAS_ICONS: Record<string, string> = {
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'send': '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
};
