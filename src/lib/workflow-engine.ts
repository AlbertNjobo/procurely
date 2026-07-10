/**
 * Enterprise Workflow Execution Engine
 * Supports: rich conditions, multi-level approvals, manual step-through, execution logging
 */
import { Node, Edge } from '@xyflow/react';
import { apiFetch } from './api';

// ===== Types =====

export interface WorkflowStep {
  node_id: string;
  type: string;
  label: string;
  status: 'completed' | 'pending_approval' | 'error' | 'skipped' | 'manually_completed';
  result?: unknown;
  evaluation?: string;
  error?: string;
  assignedTo?: string;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
}

export interface WorkflowResult {
  workflow_id: string;
  workflow_name?: string;
  execution_id: string;
  execution_path: WorkflowStep[];
  total_steps: number;
  status: 'executed' | 'awaiting_approval' | 'error' | 'paused';
  message: string;
  startedAt: string;
  completedAt?: string;
}

export interface ExecutionLog {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  steps: WorkflowStep[];
  triggeredBy: string;
  startedAt: string;
  completedAt?: string;
  requisitionId?: string;
}

interface WorkflowData {
  amount?: number;
  department?: string;
  category?: string;
  vendor?: string;
  riskLevel?: string;
  priority?: string;
  [key: string]: unknown;
}

// ===== Execution Log Store =====

const LOG_KEY = 'workflow-execution-logs';

export function getExecutionLogs(): ExecutionLog[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}

export function saveExecutionLog(log: ExecutionLog) {
  const logs = getExecutionLogs();
  logs.unshift(log);
  localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, 100)));
}

// ===== Condition Evaluator =====

function evaluateCondition(node: Node, data: WorkflowData): boolean {
  const condType = (node.data?.conditionType as string) || 'amount_threshold';

  switch (condType) {
    case 'amount_threshold': {
      const threshold = parseFloat(String(node.data?.threshold || '0'));
      const amount = data.amount || 0;
      const op = (node.data?.operator as string) || '>';
      if (op === '>') return amount > threshold;
      if (op === '<') return amount < threshold;
      if (op === '>=') return amount >= threshold;
      if (op === '<=') return amount <= threshold;
      if (op === '==') return amount === threshold;
      return amount > threshold;
    }
    case 'department_match': {
      const target = (node.data?.departmentMatch as string || '').toLowerCase();
      const actual = (data.department || '').toLowerCase();
      return actual.includes(target);
    }
    case 'category_match': {
      const target = (node.data?.categoryMatch as string || '').toLowerCase();
      const actual = (data.category || '').toLowerCase();
      return actual.includes(target);
    }
    case 'risk_level': {
      const maxRisk = (node.data?.maxRiskLevel as string) || 'Medium';
      const riskOrder = { 'Low': 1, 'Medium': 2, 'High': 3, 'Critical': 4 };
      const actual = riskOrder[(data.riskLevel as keyof typeof riskOrder)] || 1;
      const max = riskOrder[maxRisk as keyof typeof riskOrder] || 2;
      return actual <= max;
    }
    case 'vendor_check': {
      const targetVendor = (node.data?.vendorMatch as string || '').toLowerCase();
      const actualVendor = (data.vendor || '').toLowerCase();
      return actualVendor.includes(targetVendor);
    }
    case 'priority_check': {
      const minPriority = (node.data?.minPriority as string) || 'Medium';
      const priorityOrder = { 'Low': 1, 'Medium': 2, 'High': 3, 'Urgent': 4 };
      const actual = priorityOrder[(data.priority as keyof typeof priorityOrder)] || 1;
      const min = priorityOrder[minPriority as keyof typeof priorityOrder] || 2;
      return actual >= min;
    }
    case 'composite': {
      // All conditions must match (AND logic)
      const conditions = (node.data?.conditions as Array<{ type: string; field: string; op: string; value: string }>) || [];
      return conditions.every(c => {
        const fieldValue = String((data as any)[c.field] || '').toLowerCase();
        const compareValue = c.value.toLowerCase();
        if (c.op === '==') return fieldValue === compareValue;
        if (c.op === 'contains') return fieldValue.includes(compareValue);
        if (c.op === '>') return parseFloat(fieldValue) > parseFloat(compareValue);
        if (c.op === '<') return parseFloat(fieldValue) < parseFloat(compareValue);
        return true;
      });
    }
    default:
      return true;
  }
}

// ===== Multi-Level Approval Handler =====

function getApprovalChain(node: Node): string[] {
  const chain = node.data?.approvalChain as string[] | undefined;
  if (chain?.length) return chain;
  // Default: single approver
  return [String(node.data?.assignee || 'manager')];
}

// ===== Main Execution Engine =====

let executionCounter = 0;

export async function executeWorkflow(
  nodes: Node[],
  edges: Edge[],
  inputs: WorkflowData,
  context?: { userId?: string; userName?: string; requisitionId?: string },
  options?: { maxSteps?: number; workflowId?: string; workflowName?: string }
): Promise<WorkflowResult> {
  const maxSteps = options?.maxSteps ?? 30;
  const workflowId = options?.workflowId ?? 'manual';
  const executionId = `exec_${Date.now()}_${++executionCounter}`;
  const startedAt = new Date().toISOString();

  const startNode = nodes.find(n => n.type === 'input' || n.type === 'trigger');
  if (!startNode) {
    return { workflow_id: workflowId, execution_id: executionId, execution_path: [], total_steps: 0, status: 'error', message: 'No trigger node found', startedAt };
  }

  const executionPath: WorkflowStep[] = [];
  let currentNodeId = startNode.id;
  let stepsRemaining = maxSteps;
  let currentData: WorkflowData = { ...inputs };
  let approvalIndex = 0;

  while (currentNodeId && stepsRemaining > 0) {
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node) break;

    const step: WorkflowStep = {
      node_id: node.id,
      type: node.type || 'unknown',
      label: (node.data?.label as string) || node.id,
      status: 'completed',
      completedBy: 'system',
      completedAt: new Date().toISOString(),
    };

    try {
      switch (node.type) {
        case 'input':
        case 'trigger':
          step.result = currentData;
          currentNodeId = getNextNode(edges, currentNodeId);
          break;

        case 'condition':
          const condResult = evaluateCondition(node, currentData);
          step.result = condResult;
          step.evaluation = buildEvaluationText(node, currentData, condResult);
          currentNodeId = getNextNode(edges, currentNodeId, condResult ? 'true' : 'false');
          break;

        case 'humanReview': {
          const chain = getApprovalChain(node);
          const currentApprover = chain[approvalIndex % chain.length];

          // If we've gone through all approvers, complete
          if (approvalIndex >= chain.length) {
            step.status = 'completed';
            step.assignedTo = chain.join(' → ');
            step.completedBy = context?.userName || 'system';
            approvalIndex = 0;
            currentNodeId = getNextNode(edges, currentNodeId, 'approved');
          } else {
            // Pause for this approver
            step.status = 'pending_approval';
            step.assignedTo = currentApprover;
            step.result = {
              instructions: node.data?.instructions,
              approvalChain: chain,
              currentApprover,
              approvalIndex,
              totalApprovers: chain.length,
              data: currentData,
            };
            executionPath.push(step);

            // Log the execution
            const log: ExecutionLog = {
              id: executionId,
              workflowId,
              workflowName: options?.workflowName || workflowId,
              status: 'awaiting_approval',
              steps: [...executionPath],
              triggeredBy: context?.userName || 'system',
              startedAt,
              requisitionId: context?.requisitionId,
            };
            saveExecutionLog(log);

            return {
              workflow_id: workflowId,
              workflow_name: options?.workflowName,
              execution_id: executionId,
              execution_path: executionPath,
              total_steps: executionPath.length,
              status: 'awaiting_approval',
              message: `Waiting for ${currentApprover} to approve (step ${approvalIndex + 1} of ${chain.length})`,
              startedAt,
            };
          }
          break;
        }

        case 'generatePO':
          step.result = {
            po_number: `PO-${Date.now()}`,
            template: node.data?.template || 'Standard',
            amount: currentData.amount,
            vendor: currentData.vendor,
            status: 'created',
          };
          currentNodeId = getNextNode(edges, currentNodeId);
          break;

        case 'notifyVendor': {
          // Send email via server endpoint
          let emailSent = false;
          let emailError = '';
          try {
            const res = await apiFetch('/api/email/send', {
              method: 'POST',
              body: JSON.stringify({
                type: 'po_notification',
                to: [currentData.vendorEmail || 'vendor@example.com'],
                data: {
                  poNumber: `PO-${Date.now()}`,
                  amount: currentData.amount || 0,
                  items: currentData.items || 'Procurement items',
                },
              }),
            });
            const result = await res.json();
            emailSent = result.success;
            emailError = result.error || '';
          } catch (e) {
            emailError = (e as Error).message;
          }
          step.result = {
            sent: emailSent,
            method: node.data?.method || 'Email',
            vendor: currentData.vendor,
            error: emailError || undefined,
            timestamp: new Date().toISOString(),
          };
          currentNodeId = getNextNode(edges, currentNodeId);
          break;
        }

        case 'action':
          step.result = {
            completed: true,
            actionType: node.data?.actionType || 'custom',
            description: node.data?.description,
          };
          currentNodeId = getNextNode(edges, currentNodeId);
          break;

        case 'output':
          step.result = currentData;
          currentNodeId = null;
          break;

        default:
          step.status = 'skipped';
          currentNodeId = getNextNode(edges, currentNodeId);
      }
    } catch (e) {
      step.status = 'error';
      step.error = (e as Error).message;
      currentNodeId = null;
    }

    executionPath.push(step);
    stepsRemaining--;
  }

  const completedAt = new Date().toISOString();
  const hasError = executionPath.some(s => s.status === 'error');

  const finalLog: ExecutionLog = {
    id: executionId,
    workflowId,
    workflowName: options?.workflowName || workflowId,
    status: hasError ? 'error' : 'executed',
    steps: executionPath,
    triggeredBy: context?.userName || 'system',
    startedAt,
    completedAt,
    requisitionId: context?.requisitionId,
  };
  saveExecutionLog(finalLog);

  return {
    workflow_id: workflowId,
    workflow_name: options?.workflowName,
    execution_id: executionId,
    execution_path: executionPath,
    total_steps: executionPath.length,
    status: hasError ? 'error' : 'executed',
    message: hasError
      ? `Failed at step ${executionPath.findIndex(s => s.status === 'error') + 1}`
      : `Completed ${executionPath.length} steps`,
    startedAt,
    completedAt,
  };
}

// ===== Resume after approval =====

export async function resumeWorkflow(
  nodes: Node[],
  edges: Edge[],
  executionPath: WorkflowStep[],
  decision: 'approved' | 'rejected',
  notes?: string
): Promise<WorkflowResult> {
  const lastStep = executionPath[executionPath.length - 1];
  if (!lastStep || lastStep.status !== 'pending_approval') {
    return {
      workflow_id: 'unknown', execution_id: 'unknown',
      execution_path: executionPath, total_steps: executionPath.length,
      status: 'error', message: 'No pending approval to resume', startedAt: new Date().toISOString(),
    };
  }

  // Mark the approval as completed
  lastStep.status = decision === 'approved' ? 'completed' : 'error';
  lastStep.completedBy = 'manual';
  lastStep.completedAt = new Date().toISOString();
  lastStep.notes = notes;

  // Find the output handle for the decision
  const handleId = decision === 'approved' ? 'approved' : 'rejected';
  let nextNodeId = getNextNode(edges, lastStep.node_id, handleId)
    || getNextNode(edges, lastStep.node_id);

  // Continue execution from next node
  let stepsRemaining = 20;
  let currentData: Record<string, unknown> = {};

  while (nextNodeId && stepsRemaining > 0) {
    const node = nodes.find(n => n.id === nextNodeId);
    if (!node) break;

    const step: WorkflowStep = {
      node_id: node.id,
      type: node.type || 'unknown',
      label: (node.data?.label as string) || node.id,
      status: 'completed',
      completedBy: 'system',
      completedAt: new Date().toISOString(),
    };

    if (node.type === 'condition') {
      const condResult = evaluateCondition(node, currentData as WorkflowData);
      step.result = condResult;
      step.evaluation = buildEvaluationText(node, currentData as WorkflowData, condResult);
      nextNodeId = getNextNode(edges, node.id, condResult ? 'true' : 'false');
    } else if (node.type === 'output') {
      step.result = currentData;
      nextNodeId = null;
    } else {
      step.result = { completed: true };
      nextNodeId = getNextNode(edges, node.id);
    }

    executionPath.push(step);
    stepsRemaining--;
  }

  return {
    workflow_id: 'resumed',
    execution_id: `resume_${Date.now()}`,
    execution_path: executionPath,
    total_steps: executionPath.length,
    status: 'executed',
    message: `Workflow ${decision} and completed`,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

// ===== Helpers =====

function getNextNode(edges: Edge[], nodeId: string, handleId?: string): string | null {
  if (handleId) {
    const edge = edges.find(e => e.source === nodeId && e.sourceHandle === handleId);
    return edge?.target || null;
  }
  return edges.find(e => e.source === nodeId)?.target || null;
}

function buildEvaluationText(node: Node, data: WorkflowData, result: boolean): string {
  const condType = (node.data?.conditionType as string) || 'amount_threshold';
  switch (condType) {
    case 'amount_threshold': {
      const threshold = node.data?.threshold || '0';
      const op = node.data?.operator || '>';
      return `$${data.amount || 0} ${op} $${threshold} → ${result}`;
    }
    case 'department_match':
      return `Department "${data.department}" matches "${node.data?.departmentMatch}" → ${result}`;
    case 'category_match':
      return `Category "${data.category}" matches "${node.data?.categoryMatch}" → ${result}`;
    case 'risk_level':
      return `Risk "${data.riskLevel}" ≤ "${node.data?.maxRiskLevel}" → ${result}`;
    default:
      return `Condition → ${result}`;
  }
}
