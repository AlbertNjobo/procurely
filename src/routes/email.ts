import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware";

export function registerEmailRoutes(app: Router) {
  app.post("/api/email/send", requireAuth, async (req, res) => {
    try {
      const { to, subject, html, type, data } = req.body;
      if (!to || !subject) {
        return res.status(400).json({ error: "to and subject are required" });
      }

      const { sendEmail, sendPONotification, sendApprovalRequest, sendInvoiceNotification } = await import("../lib/email-sender");

      let result;
      if (type === "po_notification") {
        result = await sendPONotification(to[0], data.poNumber, data.amount, data.items);
      } else if (type === "approval_request") {
        result = await sendApprovalRequest(to[0], data.requesterName, data.title, data.amount, data.requisitionId);
      } else if (type === "invoice_notification") {
        result = await sendInvoiceNotification(to[0], data.vendorName, data.invoiceNumber, data.amount, data.poNumber);
      } else {
        result = await sendEmail({ to, subject, html });
      }

      res.json(result);
    } catch (error) {
      console.error("Email send error:", error);
      res.status(500).json({ error: "Failed to send email", details: (error as Error).message });
    }
  });
}
