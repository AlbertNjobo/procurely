import React, { useState } from 'react';
import {
  WorkflowTrigger,
  TriggerEvent,
  TRIGGER_EVENTS,
  addTrigger,
  deleteTrigger,
  toggleTrigger,
  saveTriggers,
  getExecutionLogs,
} from '../lib/workflow-triggers';
import { WorkflowTemplate } from '../lib/workflow-templates';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Zap, Plus, Trash2, ToggleLeft, ToggleRight, Clock, History, X } from 'lucide-react';

interface TriggerManagerProps {
  triggers: WorkflowTrigger[];
  templates: WorkflowTemplate[];
  onTriggersChange: (triggers: WorkflowTrigger[]) => void;
  onClose: () => void;
}

export function TriggerManager({ triggers, templates, onTriggersChange, onClose }: TriggerManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEvent, setNewEvent] = useState<TriggerEvent>('manual');
  const [newWorkflowId, setNewWorkflowId] = useState('');

  const enabledTemplates = templates.filter(t => t.enabled);
  const logs = getExecutionLogs();

  const handleAdd = () => {
    if (!newName.trim() || !newWorkflowId) {
      toast.error('Name and workflow are required');
      return;
    }
    const updated = addTrigger(triggers, {
      name: newName.trim(),
      event: newEvent,
      workflowId: newWorkflowId,
      enabled: true,
    });
    onTriggersChange(updated);
    saveTriggers(updated);
    setNewName('');
    setNewEvent('manual');
    setNewWorkflowId('');
    setShowAddForm(false);
    toast.success('Trigger created');
  };

  const handleToggle = (id: string) => {
    const updated = toggleTrigger(triggers, id);
    onTriggersChange(updated);
    saveTriggers(updated);
    const t = updated.find(t => t.id === id);
    toast.success(`Trigger ${t?.enabled ? 'enabled' : 'disabled'}`);
  };

  const handleDelete = (id: string) => {
    const updated = deleteTrigger(triggers, id);
    onTriggersChange(updated);
    saveTriggers(updated);
    toast.success('Trigger deleted');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Workflow Triggers</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowLogs(!showLogs)} className="gap-1">
              <History className="h-3 w-3" /> Logs
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {showLogs ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium mb-2">Execution Logs</h3>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No executions yet.</p>
              ) : (
                logs.slice(0, 20).map((log, i) => (
                  <div key={i} className="p-2 rounded border text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{log.workflow_id}</span>
                      <span className={`px-1.5 py-0.5 rounded ${
                        log.status === 'executed' ? 'bg-green-100 text-green-700' :
                        log.status === 'awaiting_approval' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1">
                      {log.total_steps} steps · {log.message}
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(log.executedAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {triggers.length === 0 && !showAddForm && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No triggers configured. Add a trigger to auto-run workflows on events.
                </p>
              )}

              {triggers.map((t) => (
                <div key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border ${t.enabled ? 'bg-background' : 'bg-muted/50 opacity-60'}`}>
                  <button onClick={() => handleToggle(t.id)} className="shrink-0">
                    {t.enabled ? (
                      <ToggleRight className="h-6 w-6 text-primary" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {TRIGGER_EVENTS[t.event]?.label || t.event}
                      <span>→</span>
                      {templates.find(te => te.id === t.workflowId)?.name || t.workflowId}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(t.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {showAddForm && (
                <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                  <input
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Trigger name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={newEvent}
                    onChange={(e) => setNewEvent(e.target.value as TriggerEvent)}
                  >
                    {Object.entries(TRIGGER_EVENTS).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={newWorkflowId}
                    onChange={(e) => setNewWorkflowId(e.target.value)}
                  >
                    <option value="">Select workflow...</option>
                    {enabledTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAdd}>Create</Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          {!showLogs && (
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="gap-1">
              <Plus className="h-3 w-3" /> Add Trigger
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
