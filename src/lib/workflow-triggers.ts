export type TriggerEvent = 'manual' | 'requisition_created' | 'requisition_approved' | 'requisition_rejected' | 'po_created' | 'po_approved' | 'invoice_received' | 'budget_exceeded' | 'vendor_qualified';

export interface WorkflowTrigger {
  id: string;
  name: string;
  event: TriggerEvent;
  workflowId: string;
  enabled: boolean;
  createdAt: string;
}

const TRIGGERS_KEY = 'atlas-workflow-triggers';
const LOG_KEY = 'atlas-workflow-execution-log';

export function loadTriggers(): WorkflowTrigger[] {
  try { return JSON.parse(localStorage.getItem(TRIGGERS_KEY) || '[]'); } catch { return []; }
}

export function saveTriggers(triggers: WorkflowTrigger[]): void {
  localStorage.setItem(TRIGGERS_KEY, JSON.stringify(triggers));
}

export function addTrigger(triggers: WorkflowTrigger[], t: Omit<WorkflowTrigger, 'id' | 'createdAt'>): WorkflowTrigger[] {
  return [...triggers, { ...t, id: `trigger-${Date.now()}`, createdAt: new Date().toISOString() }];
}

export function toggleTrigger(triggers: WorkflowTrigger[], id: string): WorkflowTrigger[] {
  return triggers.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t);
}

export function deleteTrigger(triggers: WorkflowTrigger[], id: string): WorkflowTrigger[] {
  return triggers.filter(t => t.id !== id);
}

export function getExecutionLogs(): Array<any> {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}

export const TRIGGER_EVENTS: Record<TriggerEvent, { label: string; description: string }> = {
  manual: { label: 'Manual', description: 'Triggered manually' },
  requisition_created: { label: 'Requisition Created', description: 'When a requisition is submitted' },
  requisition_approved: { label: 'Requisition Approved', description: 'When a requisition is approved' },
  requisition_rejected: { label: 'Requisition Rejected', description: 'When a requisition is rejected' },
  po_created: { label: 'PO Created', description: 'When a PO is generated' },
  po_approved: { label: 'PO Approved', description: 'When a PO is approved' },
  invoice_received: { label: 'Invoice Received', description: 'When an invoice arrives' },
  budget_exceeded: { label: 'Budget Exceeded', description: 'When a request exceeds budget' },
  vendor_qualified: { label: 'Vendor Qualified', description: 'When a vendor passes qualification' },
};
