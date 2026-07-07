import React, { useState, useRef } from 'react';
import { WorkflowTemplate, toggleTemplate, updateTemplate, deleteTemplate, duplicateTemplate, exportTemplates, importTemplates, saveTemplates } from '../lib/workflow-templates';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Settings, Trash2, Copy, Download, Upload, ToggleLeft, ToggleRight, Edit3, X } from 'lucide-react';

interface TemplateManagerProps {
  templates: WorkflowTemplate[];
  onTemplatesChange: (templates: WorkflowTemplate[]) => void;
  onClose: () => void;
}

export function TemplateManager({ templates, onTemplatesChange, onClose }: TemplateManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggle = (id: string) => {
    const updated = toggleTemplate(templates, id);
    onTemplatesChange(updated);
    saveTemplates(updated);
    const t = updated.find(t => t.id === id);
    toast.success(`Template ${t?.enabled ? 'enabled' : 'disabled'}`);
  };

  const handleStartEdit = (t: WorkflowTemplate) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDesc(t.description);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const updated = updateTemplate(templates, editingId, { name: editName, description: editDesc });
    onTemplatesChange(updated);
    saveTemplates(updated);
    setEditingId(null);
    toast.success('Template updated');
  };

  const handleDelete = (id: string) => {
    const t = templates.find(t => t.id === id);
    if (t?.builtIn) {
      toast.error('Cannot delete built-in templates');
      return;
    }
    const updated = deleteTemplate(templates, id);
    onTemplatesChange(updated);
    saveTemplates(updated);
    toast.success('Template deleted');
  };

  const handleDuplicate = (id: string) => {
    const updated = duplicateTemplate(templates, id);
    onTemplatesChange(updated);
    saveTemplates(updated);
    toast.success('Template duplicated');
  };

  const handleExport = () => {
    const json = exportTemplates(templates);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow-templates.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Templates exported');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = importTemplates(event.target?.result as string);
        const updated = [...templates, ...imported];
        onTemplatesChange(updated);
        saveTemplates(updated);
        toast.success(`Imported ${imported.length} templates`);
      } catch {
        toast.error('Invalid template file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Manage Templates</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  t.enabled ? 'bg-background' : 'bg-muted/50 opacity-60'
                }`}
              >
                <button
                  onClick={() => handleToggle(t.id)}
                  className="shrink-0"
                  title={t.enabled ? 'Disable template' : 'Enable template'}
                >
                  {t.enabled ? (
                    <ToggleRight className="h-6 w-6 text-primary" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  {editingId === t.id ? (
                    <div className="space-y-1">
                      <input
                        className="w-full h-7 rounded border border-input bg-background px-2 text-sm"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                      <input
                        className="w-full h-7 rounded border border-input bg-background px-2 text-xs text-muted-foreground"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Description"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="font-medium text-sm flex items-center gap-1">
                        {t.name}
                        {t.builtIn && (
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            Built-in
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{t.description}</div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {editingId === t.id ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveEdit}>
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleStartEdit(t)}
                        title="Edit name"
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDuplicate(t.id)}
                        title="Duplicate"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {!t.builtIn && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(t.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1">
              <Download className="h-3 w-3" /> Export All
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1">
              <Upload className="h-3 w-3" /> Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {templates.filter(t => t.enabled).length} of {templates.length} enabled
          </div>
        </div>
      </div>
    </div>
  );
}
