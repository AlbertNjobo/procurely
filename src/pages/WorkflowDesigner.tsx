import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  Edge,
  Node,
  Panel,
  Handle,
  Position,
  useReactFlow,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import {
  Play, FileText, GitFork, Save, Network, Plus, Trash2, Square,
  Users, Send, CheckCircle, Briefcase, Zap, Shield, X, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth-context';
import { executeWorkflow, getExecutionLogs, type ExecutionLog } from '../lib/workflow-engine';
import { TriggerManager } from '../components/TriggerManager';
import { loadTriggers, saveTriggers, type WorkflowTrigger } from '../lib/workflow-triggers';

// ===== Node Components with Config Support =====

function InputNode({ data, selected }: NodeProps) {
  const eventType = (data.eventType as string) || 'on_submit';
  const eventLabel: Record<string, string> = {
    on_submit: 'On Submit',
    on_approve: 'On Approve',
    scheduled: 'Scheduled',
    manual: 'Manual',
    on_requisition: 'New Requisition',
    on_invoice: 'Invoice Received',
  };
  return (
    <div className={`bg-background border-2 rounded-lg shadow-md p-3 min-w-[170px] transition-all ${selected ? 'border-primary ring-2 ring-primary/30' : 'border-primary'}`}>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-primary" />
      <div className="flex items-center gap-2 mb-1 font-bold text-sm text-primary">
        <Play className="h-4 w-4" /> {data.label as string}
      </div>
      <div className="text-[10px] text-primary/70 bg-primary/5 rounded px-1.5 py-0.5 mb-1 inline-block">
        {eventLabel[eventType] || eventType}
      </div>
      <div className="text-xs text-muted-foreground">{(data.description as string) || 'Entry point'}</div>
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps) {
  const condType = (data.conditionType as string) || 'amount_threshold';
  const condLabel = {
    amount_threshold: `Amount ${data.operator || '>'} $${data.threshold || '0'}`,
    department_match: `Dept contains "${data.departmentMatch || ''}"`,
    category_match: `Category contains "${data.categoryMatch || ''}"`,
    risk_level: `Risk ≤ ${data.maxRiskLevel || 'Medium'}`,
    vendor_check: `Vendor matches "${data.vendorMatch || ''}"`,
    priority_check: `Priority ≥ ${data.minPriority || 'Medium'}`,
    composite: 'Multiple conditions (AND)',
  }[condType] || 'Check condition';

  return (
    <div className={`bg-background border-2 rounded-lg shadow-md p-3 min-w-[170px] transition-all ${selected ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-amber-500'}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-amber-500" />
      <div className="flex items-center gap-2 mb-1 font-bold text-sm text-amber-600">
        <GitFork className="h-4 w-4" /> {data.label as string}
      </div>
      <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mb-1">{condLabel}</div>
      <Handle type="source" position={Position.Bottom} id="true" className="w-3 h-3 bg-green-500" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="false" className="w-3 h-3 bg-red-500" style={{ left: '70%' }} />
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1 px-2"><span>Yes</span><span>No</span></div>
    </div>
  );
}

function HumanReviewNode({ data, selected }: NodeProps) {
  const chain = (data.approvalChain as string[]) || [];
  return (
    <div className={`bg-background border-2 rounded-lg shadow-md p-3 min-w-[170px] transition-all ${selected ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-purple-500'}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-purple-500" />
      <div className="flex items-center gap-2 mb-1 font-bold text-sm text-purple-600">
        <Users className="h-4 w-4" /> {data.label as string}
      </div>
      {chain.length > 1 && (
        <div className="text-[10px] text-purple-700 bg-purple-50 rounded px-1.5 py-0.5 mb-1">
          Chain: {chain.join(' → ')}
        </div>
      )}
      <div className="text-xs text-muted-foreground line-clamp-2">{(data.instructions as string) || 'Requires approval'}</div>
      <Handle type="source" position={Position.Bottom} id="approved" className="w-3 h-3 bg-green-500" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="rejected" className="w-3 h-3 bg-red-500" style={{ left: '70%' }} />
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1 px-2"><span>Approved</span><span>Rejected</span></div>
    </div>
  );
}

function GeneratePONode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-background border-2 rounded-lg shadow-md p-3 min-w-[160px] transition-all ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-emerald-500'}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-emerald-500" />
      <div className="flex items-center gap-2 mb-1 font-bold text-sm text-emerald-600">
        <CheckCircle className="h-4 w-4" /> {data.label as string}
      </div>
      <div className="text-xs text-muted-foreground">Template: {String(data.template || 'Standard')}</div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-emerald-500" />
    </div>
  );
}

function NotifyVendorNode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-background border-2 rounded-lg shadow-md p-3 min-w-[160px] transition-all ${selected ? 'border-cyan-500 ring-2 ring-cyan-500/30' : 'border-cyan-500'}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-cyan-500" />
      <div className="flex items-center gap-2 mb-1 font-bold text-sm text-cyan-600">
        <Send className="h-4 w-4" /> {data.label as string}
      </div>
      <div className="text-xs text-muted-foreground">Via: {String(data.method || 'Email')}</div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-cyan-500" />
    </div>
  );
}

function OutputNode({ data, selected }: NodeProps) {
  return (
    <div className={`bg-background border-2 rounded-lg shadow-md p-3 min-w-[160px] transition-all ${selected ? 'border-slate-400 ring-2 ring-slate-400/30' : 'border-slate-400'}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />
      <div className="flex items-center gap-2 mb-1 font-bold text-sm text-slate-600">
        <Zap className="h-4 w-4" /> {String(data.label || 'Result')}
      </div>
      <div className="text-xs text-muted-foreground">Workflow output</div>
    </div>
  );
}

const nodeTypes = {
  input: InputNode,
  condition: ConditionNode,
  humanReview: HumanReviewNode,
  generatePO: GeneratePONode,
  notifyVendor: NotifyVendorNode,
  output: OutputNode,
  action: InputNode, // reuse for generic actions
};

// ===== Palette =====

const PALETTE_ITEMS = [
  { type: 'input', label: 'Trigger', icon: Play, color: 'primary', desc: 'Entry point' },
  { type: 'condition', label: 'Condition', icon: GitFork, color: 'amber-500', desc: 'Branch on amount' },
  { type: 'humanReview', label: 'Approval', icon: Users, color: 'purple-500', desc: 'Human review gate' },
  { type: 'output', label: 'Output', icon: Zap, color: 'slate-400', desc: 'Final result' },
  { type: 'generatePO', label: 'Generate PO', icon: CheckCircle, color: 'emerald-500', desc: 'Create PO' },
  { type: 'notifyVendor', label: 'Notify Vendor', icon: Send, color: 'cyan-500', desc: 'Send notification' },
  { type: 'action', label: 'Action', icon: FileText, color: 'blue-500', desc: 'Generic step' },
];

function PaletteItem({ type, label, icon: Icon, color, desc }: typeof PALETTE_ITEMS[0]) {
  return (
    <div
      className={`border border-${color}/40 bg-${color}/5 rounded-md p-2 cursor-grab text-xs font-medium flex items-center gap-2 hover:bg-${color}/15 transition-colors active:cursor-grabbing`}
      onDragStart={(e) => { e.dataTransfer.setData('application/reactflow', type); e.dataTransfer.effectAllowed = 'move'; }}
      draggable
      title={desc}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
    </div>
  );
}

// ===== Properties Panel =====

function PropertiesPanel({ node, onUpdate, onDelete }: { node: Node | null; onUpdate: (id: string, data: Record<string, unknown>) => void; onDelete: (id: string) => void }) {
  if (!node) {
    return (
      <div className="w-72 border-l bg-background p-4 flex flex-col items-center justify-center text-center">
        <div className="text-muted-foreground text-sm">Select a node to configure</div>
        <div className="text-muted-foreground text-xs mt-1">Click any node on the canvas</div>
      </div>
    );
  }

  const update = (key: string, value: unknown) => onUpdate(node.id, { ...node.data, [key]: value });

  return (
    <div className="w-72 border-l bg-background flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <div className="font-semibold text-sm truncate">{String(node.data?.label || node.type)}</div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(node.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Label */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Label</label>
          <input className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.label || '')} onChange={(e) => update('label', e.target.value)} />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <textarea className="w-full min-h-[60px] rounded border border-input bg-background px-2 py-1.5 text-sm resize-y" value={String(node.data?.description || '')} onChange={(e) => update('description', e.target.value)} />
        </div>

        {/* Trigger-specific fields */}
        {node.type === 'input' && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Event Type</label>
              <select className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.eventType || 'on_submit')} onChange={(e) => update('eventType', e.target.value)}>
                <option value="on_submit">On Request Submit</option>
                <option value="on_requisition">New Requisition</option>
                <option value="on_approve">On Request Approved</option>
                <option value="on_invoice">Invoice Received</option>
                <option value="scheduled">Scheduled (Cron)</option>
                <option value="manual">Manual Trigger</option>
              </select>
            </div>
            {(node.data?.eventType || 'on_submit') === 'scheduled' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Schedule (Cron)</label>
                <input className="w-full h-8 rounded border border-input bg-background px-2 text-sm font-mono" value={String(node.data?.cron || '0 9 * * 1-5')} onChange={(e) => update('cron', e.target.value)} placeholder="0 9 * * 1-5" />
                <div className="text-[10px] text-muted-foreground">e.g. "0 9 * * 1-5" = weekdays at 9am</div>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Input Fields (one per line)</label>
              <textarea className="w-full min-h-[60px] rounded border border-input bg-background px-2 py-1.5 text-sm resize-y font-mono text-xs" value={String(node.data?.inputFields || 'amount\ndepartment\ncategory\nvendor')} onChange={(e) => update('inputFields', e.target.value)} placeholder={"amount\ndepartment\ncategory"} />
              <div className="text-[10px] text-muted-foreground">Data this workflow receives</div>
            </div>
          </>
        )}

        {/* Type-specific fields */}
        {node.type === 'condition' && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Condition Type</label>
              <select className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.conditionType || 'amount_threshold')} onChange={(e) => update('conditionType', e.target.value)}>
                <option value="amount_threshold">Amount Threshold</option>
                <option value="department_match">Department Match</option>
                <option value="category_match">Category Match</option>
                <option value="risk_level">Risk Level</option>
                <option value="vendor_check">Vendor Check</option>
                <option value="priority_check">Priority Check</option>
              </select>
            </div>

            {(node.data?.conditionType || 'amount_threshold') === 'amount_threshold' && (
              <div className="flex gap-2">
                <div className="space-y-1 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Operator</label>
                  <select className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.operator || '>')} onChange={(e) => update('operator', e.target.value)}>
                    <option value=">">&gt; Greater than</option>
                    <option value="<">&lt; Less than</option>
                    <option value=">=">&gt;= Greater or equal</option>
                    <option value="<=">&lt;= Less or equal</option>
                    <option value="==">== Equal to</option>
                  </select>
                </div>
                <div className="space-y-1 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Threshold ($)</label>
                  <input type="number" className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.threshold || '')} onChange={(e) => update('threshold', e.target.value)} placeholder="10000" />
                </div>
              </div>
            )}

            {(node.data?.conditionType) === 'department_match' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Department Contains</label>
                <input className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.departmentMatch || '')} onChange={(e) => update('departmentMatch', e.target.value)} placeholder="e.g. IT, Finance, Legal" />
              </div>
            )}

            {(node.data?.conditionType) === 'category_match' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Category Contains</label>
                <input className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.categoryMatch || '')} onChange={(e) => update('categoryMatch', e.target.value)} placeholder="e.g. Hardware, Software, Services" />
              </div>
            )}

            {(node.data?.conditionType) === 'risk_level' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Max Risk Level</label>
                <select className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.maxRiskLevel || 'Medium')} onChange={(e) => update('maxRiskLevel', e.target.value)}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            )}

            {(node.data?.conditionType) === 'vendor_check' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Vendor Name Contains</label>
                <input className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.vendorMatch || '')} onChange={(e) => update('vendorMatch', e.target.value)} placeholder="e.g. Dell, Amazon" />
              </div>
            )}

            {(node.data?.conditionType) === 'priority_check' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Minimum Priority</label>
                <select className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.minPriority || 'Medium')} onChange={(e) => update('minPriority', e.target.value)}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            )}
          </>
        )}

        {node.type === 'humanReview' && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Review Instructions</label>
              <textarea className="w-full min-h-[80px] rounded border border-input bg-background px-2 py-1.5 text-sm resize-y" value={String(node.data?.instructions || '')} onChange={(e) => update('instructions', e.target.value)} placeholder="What should the reviewer check?" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Approval Chain (one per line)</label>
              <textarea className="w-full min-h-[60px] rounded border border-input bg-background px-2 py-1.5 text-sm resize-y font-mono text-xs" value={((node.data?.approvalChain as string[]) || []).join('\n')} onChange={(e) => update('approvalChain', e.target.value.split('\n').filter(Boolean))} placeholder={"manager\ndirector\nvp"} />
              <div className="text-[10px] text-muted-foreground">Sequential approvals. Leave empty for single approver.</div>
            </div>
          </>
        )}

        {node.type === 'generatePO' && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">PO Template</label>
            <select className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.template || 'Standard')} onChange={(e) => update('template', e.target.value)}>
              <option value="Standard">Standard</option>
              <option value="Blanket">Blanket</option>
              <option value="Capital Equipment">Capital Equipment</option>
              <option value="Services">Services</option>
            </select>
          </div>
        )}

        {node.type === 'notifyVendor' && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Notification Method</label>
            <select className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.method || 'Email')} onChange={(e) => update('method', e.target.value)}>
              <option value="Email">Email</option>
              <option value="EDI">EDI</option>
              <option value="Portal">Portal</option>
              <option value="API">API</option>
            </select>
          </div>
        )}

        {node.type === 'action' && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Action Type</label>
            <select className="w-full h-8 rounded border border-input bg-background px-2 text-sm" value={String(node.data?.actionType || 'custom')} onChange={(e) => update('actionType', e.target.value)}>
              <option value="custom">Custom Action</option>
              <option value="sendEmail">Send Email</option>
              <option value="updateRecord">Update Record</option>
              <option value="callApi">Call API</option>
            </select>
          </div>
        )}

        {/* Node info */}
        <div className="pt-2 border-t">
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <div>Type: {node.type}</div>
            <div>ID: {node.id}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Workflow List =====

const STORAGE_KEY = 'workflow-list';

interface WorkflowMeta {
  id: string;
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  active: boolean;
  trigger: string;
  createdAt: string;
  updatedAt: string;
}

function loadWorkflows(): WorkflowMeta[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveWorkflows(list: WorkflowMeta[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ===== Default Templates =====

function getDefaultNodes(): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: [
      { id: 'n1', type: 'input', position: { x: 350, y: 80 }, data: { label: 'New Request', description: 'When a request is submitted', eventType: 'on_requisition', inputFields: 'amount\ndepartment\ncategory\nvendor' } },
      { id: 'n2', type: 'condition', position: { x: 350, y: 220 }, data: { label: 'Amount > $10,000?', description: 'Check request total', threshold: '10000' } },
      { id: 'n3', type: 'generatePO', position: { x: 150, y: 380 }, data: { label: 'Generate PO', description: 'Auto-create Purchase Order', template: 'Standard' } },
      { id: 'n4', type: 'humanReview', position: { x: 550, y: 380 }, data: { label: 'Manager Approval', description: 'Route to manager', instructions: 'Review and approve this purchase requisition.' } },
      { id: 'n5', type: 'output', position: { x: 350, y: 540 }, data: { label: 'Result', description: 'Workflow complete' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'false', label: 'No' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'true', label: 'Yes' },
      { id: 'e4', source: 'n3', target: 'n5' },
      { id: 'e5', source: 'n4', target: 'n5', sourceHandle: 'approved' },
    ],
  };
}

// ===== Main Designer =====

const Designer = ({ workflowId, onSave }: { workflowId: string | null; onSave: (nodes: Node[], edges: Edge[]) => void }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const { screenToFlowPosition } = useReactFlow();
  const simulationRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved workflow or default
  useEffect(() => {
    if (workflowId) {
      // Check if a template was requested
      const tmpl = (window as any).__loadTemplate;
      if (tmpl) {
        delete (window as any).__loadTemplate;
        setNodes(tmpl.nodes);
        setEdges(tmpl.edges);
        return;
      }

      const list = loadWorkflows();
      const wf = list.find(w => w.id === workflowId);
      if (wf && wf.nodes?.length) {
        setNodes(wf.nodes);
        setEdges(wf.edges);
      } else {
        const def = getDefaultNodes();
        setNodes(def.nodes);
        setEdges(def.edges);
      }
    }
  }, [workflowId]);

  // Fit view after nodes load
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (nodes.length) {
      const timer = setTimeout(() => fitView({ padding: 0.2 }), 150);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, fitView]);

  // Track selection
  useEffect(() => {
    const sel = nodes.find(n => n.selected);
    setSelectedNode(sel || null);
  }, [nodes]);

  // Auto-save
  useEffect(() => {
    if (workflowId && nodes.length) onSave(nodes, edges);
  }, [nodes, edges]);

  const onConnect = useCallback((params: Connection | Edge) => setEdges(eds => addEdge(params, eds)), [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const defaults: Record<string, any> = {
      input: { label: 'Trigger', description: 'Event trigger' },
      condition: { label: 'Condition?', description: 'Check a condition', threshold: '1000' },
      humanReview: { label: 'Approval', description: 'Requires approval', instructions: 'Review and approve.' },
      generatePO: { label: 'Generate PO', description: 'Create purchase order', template: 'Standard' },
      notifyVendor: { label: 'Notify Vendor', description: 'Send notification', method: 'Email' },
      output: { label: 'Result', description: 'Workflow output' },
      action: { label: 'Action', description: 'Perform an action' },
    };
    setNodes(nds => [...nds, { id: `n_${Date.now()}`, type, position: pos, data: defaults[type] || { label: type } }]);
  }, [screenToFlowPosition, setNodes]);

  const updateNodeData = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data } : n));
  }, [setNodes]);

  const deleteNode = useCallback((id: string) => {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  const handleRun = useCallback(async () => {
    if (isRunning) {
      if (simulationRef.current) clearTimeout(simulationRef.current);
      setIsRunning(false);
      setNodes(nds => nds.map(n => ({ ...n, className: '' })));
      setEdges(eds => eds.map(e => ({ ...e, animated: false })));
      return;
    }

    if (!nodes.find(n => n.type === 'input')) {
      toast.error('Add a Trigger node first');
      return;
    }

    setIsRunning(true);

    try {
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, inputs: { amount: '5000' } }),
      });
      const result = await res.json();

      if (result.execution_path?.length) {
        const ids = result.execution_path.map((s: any) => s.node_id);
        let i = 0;
        const anim = () => {
          if (i >= ids.length) { setIsRunning(false); toast.success(result.message); return; }
          setNodes(nds => nds.map(n => ({ ...n, className: ids.slice(0, i + 1).includes(n.id) ? 'ring-2 ring-green-500 ring-offset-1' : '' })));
          i++;
          simulationRef.current = setTimeout(anim, 500);
        };
        anim();
      } else {
        setIsRunning(false);
        toast.error(result.message || 'Execution failed');
      }
    } catch {
      // Visual-only fallback
      const startIds = nodes.filter(n => n.type === 'input').map(n => n.id);
      let step = 0;
      const anim = (ids: string[]) => {
        setNodes(nds => nds.map(n => ({ ...n, className: ids.includes(n.id) ? 'ring-2 ring-primary ring-offset-1' : '' })));
        setEdges(eds => eds.map(e => ({ ...e, animated: ids.includes(e.source) })));
        const next = edges.filter(e => ids.includes(e.source)).map(e => e.target);
        if (!next.length || step++ > 10) { setIsRunning(false); toast.success('Simulation complete'); return; }
        simulationRef.current = setTimeout(() => anim(next), 800);
      };
      anim(startIds);
    }
  }, [nodes, edges, isRunning, setNodes, setEdges]);

  useEffect(() => () => { if (simulationRef.current) clearTimeout(simulationRef.current); }, []);

  return (
    <div className="flex flex-1 min-h-0" style={{ height: '100%' }}>
      {/* Canvas */}
      <div className="flex-1 relative bg-muted/20" style={{ height: '100%', minHeight: 0 }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
          onNodeClick={onNodeClick} onPaneClick={onPaneClick}
          nodeTypes={nodeTypes} fitView deleteKeyCode="Delete"
        >
          <Background />
          <Controls />

          {/* Palette */}
          <Panel position="top-left" className="bg-background border rounded-lg shadow-md p-2.5 m-2 w-[170px]">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-1.5">Nodes</div>
            <div className="flex flex-col gap-1">
              {PALETTE_ITEMS.map(item => <PaletteItem key={item.type} {...item} />)}
            </div>
          </Panel>

          {/* Run/Save buttons */}
          <Panel position="top-right" className="flex gap-2 m-2">
            <Button variant={isRunning ? 'secondary' : 'default'} size="sm" onClick={handleRun} className="gap-1 text-xs h-8">
              {isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isRunning ? 'Stop' : 'Run'}
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Properties Panel */}
      <PropertiesPanel node={selectedNode} onUpdate={updateNodeData} onDelete={deleteNode} />
    </div>
  );
};

// ===== Execution Log Viewer =====

function ExecutionLogViewer() {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { setLogs(getExecutionLogs()); }, []);

  if (!logs.length) {
    return (
      <div className="border-b bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No execution logs yet. Run a workflow to see results here.
      </div>
    );
  }

  return (
    <div className="border-b bg-muted/30 max-h-[250px] overflow-y-auto">
      <div className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b sticky top-0 bg-muted/50">
        Execution History ({logs.length})
      </div>
      {logs.map(log => (
        <div key={log.id} className="border-b last:border-b-0">
          <div
            className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-background/50 text-xs"
            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
          >
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              log.status === 'executed' ? 'bg-green-100 text-green-700' :
              log.status === 'awaiting_approval' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>{log.status}</span>
            <span className="font-medium">{log.workflowName}</span>
            <span className="text-muted-foreground">{log.steps.length} steps</span>
            <span className="text-muted-foreground ml-auto">{new Date(log.startedAt).toLocaleString()}</span>
          </div>
          {expandedId === log.id && (
            <div className="px-4 pb-2 space-y-1">
              {log.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] pl-4">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    step.status === 'completed' ? 'bg-green-500' :
                    step.status === 'pending_approval' ? 'bg-yellow-500' :
                    step.status === 'error' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <span className="font-medium">{step.label}</span>
                  <span className="text-muted-foreground">({step.type})</span>
                  {step.evaluation && <span className="text-muted-foreground italic">{step.evaluation}</span>}
                  {step.assignedTo && <span className="text-purple-600">→ {step.assignedTo}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ===== Page =====

export function WorkflowDesigner() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>(() => loadWorkflows());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showTriggers, setShowTriggers] = useState(false);
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>(() => loadTriggers());
  const designerRef = useRef<any>(null);

  const activeWorkflow = useMemo(() => workflows.find(w => w.id === activeId), [workflows, activeId]);

  const createNew = useCallback(() => {
    const id = `wf_${Date.now()}`;
    const def = getDefaultNodes();
    const wf: WorkflowMeta = {
      id, name: 'Untitled Workflow', description: '',
      nodes: def.nodes, edges: def.edges,
      active: true, trigger: 'manual',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const updated = [...workflows, wf];
    setWorkflows(updated);
    saveWorkflows(updated);
    setActiveId(id);
    toast.success('New workflow created');
  }, [workflows]);

  const deleteWorkflow = useCallback((id: string) => {
    const updated = workflows.filter(w => w.id !== id);
    setWorkflows(updated);
    saveWorkflows(updated);
    if (activeId === id) setActiveId(updated[0]?.id || null);
    toast.success('Workflow deleted');
  }, [workflows, activeId]);

  const renameWorkflow = useCallback((id: string, name: string) => {
    const updated = workflows.map(w => w.id === id ? { ...w, name, updatedAt: new Date().toISOString() } : w);
    setWorkflows(updated);
    saveWorkflows(updated);
  }, [workflows]);

  const toggleWorkflowActive = useCallback((id: string) => {
    const updated = workflows.map(w => w.id === id ? { ...w, active: !w.active, updatedAt: new Date().toISOString() } : w);
    setWorkflows(updated);
    saveWorkflows(updated);
    const wf = updated.find(w => w.id === id);
    toast.success(`Workflow ${wf?.active ? 'activated' : 'deactivated'}`);
  }, [workflows]);

  const setWorkflowTrigger = useCallback((id: string, trigger: string) => {
    const updated = workflows.map(w => w.id === id ? { ...w, trigger, updatedAt: new Date().toISOString() } : w);
    setWorkflows(updated);
    saveWorkflows(updated);
  }, [workflows]);

  const saveWorkflow = useCallback((nodes: Node[], edges: Edge[]) => {
    if (!activeId) return;
    const updated = workflows.map(w => w.id === activeId ? { ...w, nodes, edges, updatedAt: new Date().toISOString() } : w);
    setWorkflows(updated);
    saveWorkflows(updated);
  }, [activeId, workflows]);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden" style={{ height: '100%' }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background shrink-0">
        <Network className="h-5 w-5 text-primary shrink-0" />
        <h1 className="text-lg font-bold shrink-0">Workflows</h1>

        {/* Workflow tabs */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto min-w-0">
          {workflows.map(w => (
            <div
              key={w.id}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs cursor-pointer shrink-0 transition-colors ${w.id === activeId ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted hover:bg-muted/80'} ${!w.active ? 'opacity-50' : ''}`}
              onClick={() => setActiveId(w.id)}
            >
              <button
                className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${w.active ? 'bg-green-500 border-green-500' : 'bg-gray-300 border-gray-300'}`}
                onClick={(e) => { e.stopPropagation(); toggleWorkflowActive(w.id); }}
                title={w.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
              />
              <input
                className="bg-transparent border-none outline-none w-24 text-xs p-0"
                value={w.name}
                onChange={(e) => renameWorkflow(w.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <button className="ml-1 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteWorkflow(w.id); }}>
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={createNew} className="h-7 px-2 gap-1 text-xs shrink-0">
            <Plus className="h-3 w-3" /> New
          </Button>
          <select
            className="h-7 rounded border border-input bg-background px-2 text-xs shrink-0 cursor-pointer"
            value=""
            onChange={(e) => {
              if (!e.target.value || !activeId) return;
              const templates: Record<string, { nodes: Node[]; edges: Edge[] }> = {
                standard: getDefaultNodes(),
                capex: {
                  nodes: [
                    { id: 'n1', type: 'input', position: { x: 300, y: 50 }, data: { label: 'CapEx Request', description: 'Capital expenditure', eventType: 'on_requisition' } },
                    { id: 'n2', type: 'humanReview', position: { x: 300, y: 180 }, data: { label: 'Dept Head', description: 'Initial review', instructions: 'Department head review.' } },
                    { id: 'n3', type: 'condition', position: { x: 300, y: 310 }, data: { label: 'Over $50K?', description: 'Budget check', threshold: '50000', conditionType: 'amount_threshold' } },
                    { id: 'n4', type: 'humanReview', position: { x: 120, y: 440 }, data: { label: 'Finance Director', description: 'Final review', instructions: 'Final financial review.', approvalChain: ['finance_director'] } },
                    { id: 'n5', type: 'generatePO', position: { x: 480, y: 440 }, data: { label: 'Generate CapEx PO', template: 'Capital Equipment' } },
                    { id: 'n6', type: 'output', position: { x: 300, y: 570 }, data: { label: 'Result' } },
                  ],
                  edges: [
                    { id: 'e1', source: 'n1', target: 'n2' },
                    { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'approved' },
                    { id: 'e3', source: 'n3', target: 'n4', sourceHandle: 'true', label: 'Yes' },
                    { id: 'e4', source: 'n3', target: 'n5', sourceHandle: 'false', label: 'No' },
                    { id: 'e5', source: 'n4', target: 'n5', sourceHandle: 'approved' },
                    { id: 'e6', source: 'n5', target: 'n6' },
                  ],
                },
              };
              const tmpl = templates[e.target.value];
              if (tmpl) {
                // Store to window so Designer can pick it up
                (window as any).__loadTemplate = tmpl;
                // Force re-render by toggling activeId
                const currentId = activeId;
                setActiveId(null);
                setTimeout(() => setActiveId(currentId), 10);
                toast.success('Template loaded');
              }
              e.target.value = '';
            }}
          >
            <option value="">Load Template...</option>
            <option value="standard">Standard Purchase</option>
            <option value="capex">Capital Expenditure</option>
          </select>

          {/* Trigger selector for active workflow */}
          {activeWorkflow && (
            <select
              className="h-7 rounded border border-input bg-background px-2 text-xs shrink-0 cursor-pointer"
              value={activeWorkflow.trigger || 'manual'}
              onChange={(e) => setWorkflowTrigger(activeId!, e.target.value)}
              title="When this workflow fires"
            >
              <option value="manual">Manual Only</option>
              <option value="on_requisition">On Requisition</option>
              <option value="on_approve">On Approval</option>
              <option value="on_invoice">On Invoice</option>
              <option value="scheduled">Scheduled</option>
            </select>
          )}

          <Button variant={showLogs ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowLogs(!showLogs)} className="h-7 px-2 gap-1 text-xs shrink-0">
            Logs
          </Button>
          <Button variant={showTriggers ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowTriggers(true)} className="h-7 px-2 gap-1 text-xs shrink-0">
            Triggers
          </Button>
        </div>
      </div>

      {/* Execution Logs Panel */}
      {showLogs && <ExecutionLogViewer />}

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        {activeId ? (
          <ReactFlowProvider>
            <Designer key={activeId} workflowId={activeId} onSave={saveWorkflow} />
          </ReactFlowProvider>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Network className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <div className="text-sm">No workflow selected</div>
              <Button variant="outline" size="sm" onClick={createNew} className="mt-3 gap-1">
                <Plus className="h-3 w-3" /> Create Workflow
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Trigger Manager Modal */}
      {showTriggers && (
        <TriggerManager
          triggers={triggers}
          templates={workflows.map(w => ({ id: w.id, name: w.name, description: w.description, enabled: true, builtIn: false, createdAt: w.createdAt, updatedAt: w.updatedAt }))}
          onTriggersChange={(updated) => { setTriggers(updated); saveTriggers(updated); }}
          onClose={() => setShowTriggers(false)}
        />
      )}
    </div>
  );
}
