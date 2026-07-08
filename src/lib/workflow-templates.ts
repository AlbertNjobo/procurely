export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'atlas-workflow-templates';

const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [
  { id: 'standard', name: 'Standard Purchase', description: 'Auto-PO under $10K, manager approval above', enabled: true, builtIn: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'capex', name: 'Capital Expenditure', description: 'Multi-level approval for CapEx', enabled: true, builtIn: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'threeWayMatch', name: 'Three-Way Match', description: 'Match PO, receipt, and invoice before payment', enabled: true, builtIn: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'rfqProcess', name: 'RFQ Process', description: 'Request for Quotation with bid evaluation', enabled: true, builtIn: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

export function loadTemplates(): WorkflowTemplate[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as WorkflowTemplate[];
      return BUILT_IN_TEMPLATES.map(b => {
        const s = parsed.find(t => t.id === b.id);
        return s ? { ...b, enabled: s.enabled } : b;
      }).concat(parsed.filter(t => !t.builtIn));
    }
  } catch {}
  return [...BUILT_IN_TEMPLATES];
}

export function saveTemplates(templates: WorkflowTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function getEnabledTemplates(templates: WorkflowTemplate[]): WorkflowTemplate[] {
  return templates.filter(t => t.enabled);
}

export function toggleTemplate(templates: WorkflowTemplate[], id: string): WorkflowTemplate[] {
  return templates.map(t => t.id === id ? { ...t, enabled: !t.enabled, updatedAt: new Date().toISOString() } : t);
}

export function addTemplate(templates: WorkflowTemplate[], t: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt'>): WorkflowTemplate[] {
  return [...templates, { ...t, id: `custom-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
}

export function updateTemplate(templates: WorkflowTemplate[], id: string, updates: { name?: string; description?: string }): WorkflowTemplate[] {
  return templates.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t);
}

export function deleteTemplate(templates: WorkflowTemplate[], id: string): WorkflowTemplate[] {
  return templates.filter(t => t.id === id || !t.builtIn);
}

export function duplicateTemplate(templates: WorkflowTemplate[], id: string): WorkflowTemplate[] {
  const src = templates.find(t => t.id === id);
  if (!src) return templates;
  return [...templates, { ...src, id: `custom-${Date.now()}`, name: `${src.name} (Copy)`, builtIn: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
}

export function exportTemplates(templates: WorkflowTemplate[]): string {
  return JSON.stringify(templates, null, 2);
}

export function importTemplates(json: string): WorkflowTemplate[] {
  return JSON.parse(json).map((t: any) => ({ ...t, id: t.builtIn ? t.id : `custom-${Date.now()}`, builtIn: false, updatedAt: new Date().toISOString() }));
}
