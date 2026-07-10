import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware";

export function registerWorkflowRoutes(app: Router) {
  app.post("/api/workflows/run", requireAuth, async (req, res) => {
    try {
      const { nodes, inputs, userId, workflowId } = req.body;
      if (!nodes?.length) {
        return res.status(400).json({ error: "nodes array is required" });
      }
      const { executeWorkflow } = await import("../lib/workflow-engine");
      const result = await executeWorkflow(nodes, req.body.edges || [], inputs || {}, { userId }, { workflowId });
      res.json(result);
    } catch (error) {
      console.error("Workflow execution error:", error);
      res.status(500).json({ error: "Execution failed", details: (error as Error).message });
    }
  });

  app.post("/api/workflows/run-saved", requireAuth, async (req, res) => {
    try {
      const { savedWorkflow, inputs, userId } = req.body;
      if (!savedWorkflow?.nodes?.length) {
        return res.status(400).json({ error: "savedWorkflow with nodes is required" });
      }
      const { executeWorkflow } = await import("../lib/workflow-engine");
      const result = await executeWorkflow(savedWorkflow.nodes, savedWorkflow.edges || [], inputs || {}, { userId });
      res.json(result);
    } catch (error) {
      console.error("Saved workflow execution error:", error);
      res.status(500).json({ error: "Execution failed", details: (error as Error).message });
    }
  });
}
