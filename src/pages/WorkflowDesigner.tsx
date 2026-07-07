import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useFormAutoSave } from '../hooks/useFormAutoSave';
import { createWorkflowEditor, WorkflowEditor } from 'wayflow';
import { createLocalStoragePersistence, createFirestorePersistence } from '../lib/workflow-persistence';
import { ATLAS_NODE_TYPES, ATLAS_ICONS } from '../lib/workflow-nodes';
import { loadTemplates, saveTemplates, getEnabledTemplates, WorkflowTemplate } from '../lib/workflow-templates';
import { TemplateManager } from '../components/TemplateManager';
import { useAuth } from '../lib/auth-context';
import { Button } from '@/components/ui/button';
import { Network, Save, Trash2, Settings } from 'lucide-react';
import { toast } from 'sonner';

const LOCAL_STORAGE_KEY = 'wayflow-workflow-autosave';
const WORKFLOW_ID = 'default';

export function WorkflowDesigner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<WorkflowEditor | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(() => loadTemplates());
  const [showManager, setShowManager] = useState(false);
  const { user } = useAuth();

  const [workflowMeta, setWorkflowMeta, clearAutoSave] = useFormAutoSave('workflow-designer-meta', {
    name: 'Untitled Workflow',
    description: '',
  });

  // Initialize Wayflow editor
  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const persistence = user?.uid
      ? createFirestorePersistence(user.uid, WORKFLOW_ID)
      : createLocalStoragePersistence(LOCAL_STORAGE_KEY);

    const editor = createWorkflowEditor(containerRef.current, {
      nodeTypes: ATLAS_NODE_TYPES,
      icons: ATLAS_ICONS,
      persistence,
      llm: {
        models: ['gpt-4o-mini'],
      },
      onRun: ({ inputs, signal }) => {
        console.log('Workflow run requested with inputs:', inputs);
        toast.info('Workflow execution will be connected to Atlas backend.');
      },
      onReady: () => {
        console.log('Wayflow editor ready');
      },
    });

    editor.on('metadataChange', ({ metadata }) => {
      if (metadata.name) setWorkflowMeta(prev => ({ ...prev, name: metadata.name || prev.name }));
      if (metadata.description) setWorkflowMeta(prev => ({ ...prev, description: metadata.description || prev.description }));
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  const loadTemplate = useCallback((templateId: string) => {
    if (!editorRef.current || !templateId) return;
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    editorRef.current.import(JSON.stringify(template.graph));
    setWorkflowMeta({ name: template.name, description: template.description });
    toast.success(`Loaded template: ${template.name}`);
    setSelectedTemplate('');
  }, [templates, setWorkflowMeta]);

  const clearCanvas = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.import(JSON.stringify({ nodes: {}, edges: {} }));
    setWorkflowMeta({ name: 'Untitled Workflow', description: '' });
    toast.success('Canvas cleared');
  }, [setWorkflowMeta]);

  const handleManualSave = useCallback(async () => {
    if (!editorRef.current) return;
    await editorRef.current.save();
    toast.success('Workflow saved successfully!');
  }, []);

  const exportWorkflow = useCallback(() => {
    if (!editorRef.current) return;
    const json = editorRef.current.export();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowMeta.name.replace(/\s+/g, '-').toLowerCase() || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Workflow exported');
  }, [workflowMeta.name]);

  const enabledTemplates = getEnabledTemplates(templates);

  return (
    <div className="h-full w-full flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Workflow Designer</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManager(true)}
            className="gap-1"
          >
            <Settings className="h-3 w-3" /> Manage Templates
          </Button>
          <Button variant="outline" onClick={clearAutoSave} className="text-muted-foreground">
            Clear Auto-Save Form
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground">
        Automate your procurement processes by designing custom approval hierarchies and PO generation workflows.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Workflow Name</label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={workflowMeta.name}
            onChange={(e) => setWorkflowMeta({ ...workflowMeta, name: e.target.value })}
            placeholder="e.g. IT Hardware Approval"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={workflowMeta.description}
            onChange={(e) => setWorkflowMeta({ ...workflowMeta, description: e.target.value })}
            placeholder="Brief description of this workflow"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={selectedTemplate}
          onChange={(e) => {
            setSelectedTemplate(e.target.value);
            if (e.target.value) loadTemplate(e.target.value);
          }}
        >
          <option value="">Load Template...</option>
          {enabledTemplates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={clearCanvas} className="gap-1">
          <Trash2 className="h-3 w-3" /> Clear
        </Button>
        <Button variant="outline" size="sm" onClick={exportWorkflow} className="gap-1">
          Export JSON
        </Button>
        <Button size="sm" onClick={handleManualSave} className="gap-1">
          <Save className="h-3 w-3" /> Save
        </Button>
      </div>

      <div className="flex-1 rounded-xl border bg-card text-card-foreground shadow overflow-hidden h-[600px] min-h-[600px] mt-2">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {showManager && (
        <TemplateManager
          templates={templates}
          onTemplatesChange={(updated) => {
            setTemplates(updated);
            saveTemplates(updated);
          }}
          onClose={() => setShowManager(false)}
        />
      )}
    </div>
  );
}
