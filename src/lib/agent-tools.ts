import { ChatCompletionTool } from "openai/resources/index.mjs";

// ============================================================================
// Autopilot Agent Tools
// These tools define the function signatures the Qwen Agent can call to 
// interact with the Intake and Supplier management system.
// ============================================================================

export const agentTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_procurement_catalog",
      description: "Search the procurement catalog for items, hardware, or software that are already approved or available for purchase.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query (e.g., 'laptop', 'software', 'monitor')",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_intake_requests",
      description: "Retrieve a list of procurement intake requests, optionally filtered by status or department.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter intakes by status (e.g., 'Approved', 'Pending Review', 'Draft', 'In Risk Assessment')",
          },
          department: {
            type: "string",
            description: "Filter intakes by department (e.g., 'Engineering', 'Sales')",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_suppliers",
      description: "Retrieve a list of active or onboarding suppliers in the system.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter suppliers by category (e.g., 'IT Software', 'Financial Services', 'Hardware')",
          },
          risk_level: {
            type: "string",
            description: "Filter by risk level ('Low', 'Medium', 'High')",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluate_supplier_risk",
      description: "Trigger a risk compliance assessment for a specific supplier by ID. Simulates invoking external risk APIs.",
      parameters: {
        type: "object",
        properties: {
          supplier_id: {
            type: "string",
            description: "The unique ID of the supplier (e.g., 'SUP-001')",
          },
        },
        required: ["supplier_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_bid_matrix",
      description: "Analyze multiple suppliers and generate a comparative bid matrix analysis based on their intake proposals.",
      parameters: {
        type: "object",
        properties: {
          intake_id: {
            type: "string",
            description: "The intake request ID (e.g., 'REQ-001')",
          },
          supplier_ids: {
            type: "array",
            items: {
              type: "string"
            },
            description: "List of supplier IDs to compare in the bid matrix.",
          },
        },
        required: ["intake_id", "supplier_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_intake_status",
      description: "Update the status of an intake request to progress the workflow.",
      parameters: {
        type: "object",
        properties: {
          intake_id: {
            type: "string",
            description: "The ID of the intake request.",
          },
          new_status: {
            type: "string",
            description: "The new status (e.g., 'Approved', 'Pending Review', 'In Risk Assessment')",
          },
        },
        required: ["intake_id", "new_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_intake_request",
      description: "Create a new procurement intake request after gathering all required details from the user.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "A short, descriptive title for the request (e.g., 'Q3 AWS Hosting').",
          },
          department: {
            type: "string",
            description: "The department making the request (e.g., 'Engineering', 'Marketing', 'Sales').",
          },
          amount: {
            type: "string",
            description: "The estimated amount or budget (e.g., '$10,000').",
          },
          description: {
            type: "string",
            description: "A brief justification or detailed description of the request.",
          },
        },
        required: ["title", "department", "amount", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_supplier",
      description: "Create a new supplier profile after gathering the required information.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the supplier company.",
          },
          category: {
            type: "string",
            description: "The primary category of goods or services (e.g., 'IT Services', 'Office Supplies').",
          },
          contact_email: {
            type: "string",
            description: "The contact email address for the supplier.",
          },
          risk_level: {
            type: "string",
            description: "The initial risk level assessment ('Low', 'Medium', 'High'). Defaults to 'Pending' if unknown.",
          },
        },
        required: ["name", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_vendors",
      description: "Suggest a list of vendor options to the user visually as cards. Use this when the user describes requirements.",
      parameters: {
        type: "object",
        properties: {
          vendors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                category: { type: "string" },
                risk_level: { type: "string" }
              }
            }
          }
        },
        required: ["vendors"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggest_procurement_items",
      description: "Suggest a list of specific products/items to the user visually as selection cards. Use this when you have narrowed down the user's requirements and want to present 2-4 concrete product options (e.g., specific laptop models).",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Specific product name (e.g. 'Lenovo ThinkPad X1 Carbon Gen 11')" },
                description: { type: "string", description: "Short description of the specs/features" },
                estimated_price: { type: "string", description: "Estimated price range" },
                image_query: { type: "string", description: "A very specific search query to find an image of this exact product model (e.g., 'Lenovo ThinkPad X1 Carbon Gen 11 laptop product shot')" },
                badges: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "Badge text (e.g. 'Best Value', 'Fast Shipping')" },
                      variant: { type: "string", enum: ["default", "secondary", "destructive", "outline"], description: "Badge visual style" }
                    },
                    required: ["text", "variant"]
                  },
                  description: "Optional badges highlighting key selling points or risks"
                }
              },
              required: ["name", "description", "estimated_price", "image_query"]
            }
          }
        },
        required: ["items"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_form_questions",
      description: "Ask the user questions using an interactive form. Use this ONLY during the 'Intake' phase (e.g. gathering department, budget, approvals) AFTER a specific product has been selected. Do NOT use this tool during the 'Qualifying' phase when you are trying to figure out what the user needs; ask those questions conversationally in plain text instead.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field_id: { type: "string", description: "A unique identifier for the field (e.g. 'department')" },
                label: { type: "string", description: "The question or label for the field" },
                type: { type: "string", enum: ["text", "select", "number"], description: "The type of input" },
                options: { type: "array", items: { type: "string" }, description: "Required if type is 'select'" },
              },
              required: ["field_id", "label", "type"]
            }
          }
        },
        required: ["questions"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_product_images",
      description: "Search for product images to help the user visualize a SPECIFIC requested item. IMPORTANT: The query MUST be a specific product model (e.g., 'HP EliteBook 845 G11', 'Dell XPS 15 9530'). DO NOT use generic queries like 'HP laptop' or 'best laptops' as this will return low-quality results like website screenshots.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The specific product model name to find images for (e.g., 'HP EliteBook 845 G11')"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_approval",
      description: "PAUSE the workflow and request human approval before proceeding with a critical action. Use this before creating purchase orders, sending RFQs, approving supplier onboarding, or any irreversible action. The agent MUST stop and wait for user approval.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Description of the action requiring approval (e.g., 'Create Purchase Order for Dell XPS 15')"
          },
          details: {
            type: "object",
            description: "Key details about the action for the reviewer (amount, supplier, items, etc.)"
          },
          risk_level: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Risk level of the action"
          }
        },
        required: ["action", "details", "risk_level"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "confirm_action",
      description: "Confirm that a critical action should proceed after user approval. Use this ONLY after the user has explicitly approved a request_approval action.",
      parameters: {
        type: "object",
        properties: {
          action_id: {
            type: "string",
            description: "The ID of the action being confirmed"
          },
          action_type: {
            type: "string",
            description: "Type of action (e.g., 'create_po', 'send_rfq', 'approve_supplier')"
          },
          parameters: {
            type: "object",
            description: "The parameters for the confirmed action"
          }
        },
        required: ["action_id", "action_type", "parameters"]
      }
    }
  },
  // ============================================================================
  // Memory Tools - Cross-session agent memory
  // ============================================================================
  {
    type: "function",
    function: {
      name: "recall_memory",
      description: "Search the agent's memory for relevant past interactions, user preferences, and procurement patterns. Use this at the start of conversations or when you need context from previous sessions.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to search for in memory (e.g., 'laptop preferences', 'budget limits for engineering', 'previous supplier issues')"
          },
          memory_type: {
            type: "string",
            enum: ["preference", "decision", "fact", "pattern", "all"],
            description: "Filter by memory type. 'all' searches everything."
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "store_memory",
      description: "Store an important fact, preference, or decision in long-term memory for future reference. Use this after learning something significant about the user or their procurement needs.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The key insight or fact to remember (e.g., 'User prefers ThinkPad series for engineering department')"
          },
          memory_type: {
            type: "string",
            enum: ["preference", "decision", "fact", "pattern"],
            description: "Type of memory: preference (user likes/dislikes), decision (approved/rejected), fact (objective info), pattern (recurring behavior)"
          },
          metadata: {
            type: "object",
            description: "Additional context (e.g., {department: 'Engineering', category: 'Hardware', budget: '$5000'})"
          }
        },
        required: ["content", "memory_type"]
      }
    }
  },
  // ============================================================================
  // End-to-End Procurement Tools
  // ============================================================================
  {
    type: "function",
    function: {
      name: "create_rfq",
      description: "Create a Request for Quotation (RFQ) to solicit bids from suppliers. Use after identifying what needs to be procured and which suppliers to approach.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "RFQ title (e.g., 'Q3 Laptop Procurement')"
          },
          description: {
            type: "string",
            description: "Detailed description of requirements"
          },
          supplier_ids: {
            type: "array",
            items: { type: "string" },
            description: "List of supplier IDs to send the RFQ to"
          },
          due_date: {
            type: "string",
            description: "Bid submission deadline (e.g., '2026-07-20')"
          },
          budget_range: {
            type: "string",
            description: "Expected budget range (e.g., '$10,000 - $15,000')"
          }
        },
        required: ["title", "description", "supplier_ids"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "select_bid",
      description: "Select a winning bid from an RFQ and create a purchase order. Use after analyzing bid responses and deciding on a supplier.",
      parameters: {
        type: "object",
        properties: {
          rfq_id: {
            type: "string",
            description: "The RFQ ID this bid is responding to"
          },
          bid_id: {
            type: "string",
            description: "The winning bid ID"
          },
          supplier_id: {
            type: "string",
            description: "The supplier ID of the winning bid"
          },
          amount: {
            type: "string",
            description: "The bid amount (e.g., '$12,500')"
          },
          reasoning: {
            type: "string",
            description: "Why this bid was selected"
          }
        },
        required: ["rfq_id", "bid_id", "supplier_id", "amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_purchase_order",
      description: "Create a formal Purchase Order (PO) from an approved requisition or selected bid. This is an irreversible action that commits budget.",
      parameters: {
        type: "object",
        properties: {
          requisition_id: {
            type: "string",
            description: "The purchase requisition ID (if from a requisition)"
          },
          supplier_id: {
            type: "string",
            description: "The supplier fulfilling the order"
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "string" }
              }
            },
            description: "Line items for the purchase order"
          },
          total_amount: {
            type: "string",
            description: "Total PO amount (e.g., '$12,500')"
          }
        },
        required: ["supplier_id", "items", "total_amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "track_delivery",
      description: "Track the delivery status of a purchase order. Returns current shipment status and estimated delivery date.",
      parameters: {
        type: "object",
        properties: {
          po_id: {
            type: "string",
            description: "The Purchase Order ID to track"
          }
        },
        required: ["po_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "process_payment",
      description: "Process payment for a completed purchase order after goods receipt and invoice validation. Triggers 3-way match.",
      parameters: {
        type: "object",
        properties: {
          po_id: {
            type: "string",
            description: "The Purchase Order ID to process payment for"
          },
          invoice_id: {
            type: "string",
            description: "The invoice ID for payment"
          },
          amount: {
            type: "string",
            description: "Payment amount (e.g., '$12,500')"
          }
        },
        required: ["po_id", "invoice_id", "amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "process_invoice",
      description: "Process an uploaded invoice using OCR. Extracts vendor, amounts, line items, and PO number for automatic matching and 3-way validation.",
      parameters: {
        type: "object",
        properties: {
          invoice_data: {
            type: "string",
            description: "Base64-encoded invoice image or PDF content"
          },
          file_type: {
            type: "string",
            enum: ["image", "pdf"],
            description: "Type of file uploaded"
          }
        },
        required: ["invoice_data", "file_type"]
      }
    }
  },
  // ============================================================================
  // Multi-Agent Orchestration Tools
  // ============================================================================
  {
    type: "function",
    function: {
      name: "delegate_to_specialist",
      description: "Delegate a complex task to a specialized sub-agent for deeper analysis. Available specialists: 'risk_analyst' (supplier risk assessment), 'bid_optimizer' (bid comparison), 'compliance_checker' (policy validation).",
      parameters: {
        type: "object",
        properties: {
          specialist: {
            type: "string",
            enum: ["risk_analyst", "bid_optimizer", "compliance_checker"],
            description: "Which specialist agent to delegate to"
          },
          task: {
            type: "string",
            description: "The specific task or question for the specialist"
          },
          context: {
            type: "object",
            description: "Relevant data for the specialist to work with"
          }
        },
        required: ["specialist", "task"]
      }
    }
  }
];

// Example type signatures for the backend handlers
export type GetIntakeRequestsArgs = {
  status?: string;
  department?: string;
};

export type GetSuppliersArgs = {
  category?: string;
  risk_level?: string;
};

export type EvaluateSupplierRiskArgs = {
  supplier_id: string;
};

export type GenerateBidMatrixArgs = {
  intake_id: string;
  supplier_ids: string[];
};

export type UpdateIntakeStatusArgs = {
  intake_id: string;
  new_status: string;
};

export type CreateIntakeRequestArgs = {
  title: string;
  department: string;
  amount: string;
  description: string;
};

export type CreateSupplierArgs = {
  name: string;
  category: string;
  contact_email?: string;
  risk_level?: string;
};

export type SearchProductImagesArgs = {
  query: string;
};

export type RecallMemoryArgs = {
  query: string;
  memory_type?: "preference" | "decision" | "fact" | "pattern" | "all";
};

export type StoreMemoryArgs = {
  content: string;
  memory_type: "preference" | "decision" | "fact" | "pattern";
  metadata?: Record<string, any>;
};

export type CreateRfqArgs = {
  title: string;
  description: string;
  supplier_ids: string[];
  due_date?: string;
  budget_range?: string;
};

export type SelectBidArgs = {
  rfq_id: string;
  bid_id: string;
  supplier_id: string;
  amount: string;
  reasoning?: string;
};

export type CreatePurchaseOrderArgs = {
  requisition_id?: string;
  supplier_id: string;
  items: Array<{ name: string; quantity: number; unit_price: string }>;
  total_amount: string;
};

export type TrackDeliveryArgs = {
  po_id: string;
};

export type ProcessPaymentArgs = {
  po_id: string;
  invoice_id: string;
  amount: string;
};

export type ProcessInvoiceArgs = {
  invoice_data: string;
  file_type: "image" | "pdf";
};

export type DelegateToSpecialistArgs = {
  specialist: "risk_analyst" | "bid_optimizer" | "compliance_checker";
  task: string;
  context?: Record<string, any>;
};
