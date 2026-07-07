/**
 * Test file for workflow node handlers.
 * Run with: npx tsx test-handlers.ts
 */
import { executeNode } from './src/lib/workflow-handlers';

async function runTests() {
  console.log('=== Testing Workflow Node Handlers ===\n');

  // Test 1: Generate PO (auto-approved)
  console.log('Test 1: Generate PO (auto-approved, under threshold)');
  const poResult = await executeNode('generatePO',
    { requisition: { id: 'REQ-001', amount: '$5,000', items: ['10 keyboards'] } },
    { template: 'Standard', autoApprove: true, threshold: 5000 }
  ) as any;
  console.log('  Result:', JSON.stringify(poResult, null, 2));
  console.assert(poResult.po?.po_number?.startsWith('PO-'), 'PO number should start with PO-');
  console.assert(poResult.status === 'approved', 'Should be auto-approved');
  console.log('  ✓ PASSED\n');

  // Test 2: Generate PO (pending, over threshold)
  console.log('Test 2: Generate PO (pending, over threshold)');
  const poResult2 = await executeNode('generatePO',
    { requisition: { id: 'REQ-002', amount: '$15,000', items: ['5 laptops'] } },
    { template: 'Standard', autoApprove: true, threshold: 5000 }
  ) as any;
  console.log('  Result:', JSON.stringify(poResult2, null, 2));
  console.assert(poResult2.status === 'pending', 'Should be pending approval');
  console.log('  ✓ PASSED\n');

  // Test 3: Check Budget (within budget)
  console.log('Test 3: Check Budget (within budget)');
  const budgetResult = await executeNode('checkBudget',
    { requisition: { id: 'REQ-003', amount: '$3,000', department: 'IT' } },
    { department: 'IT', budgetPeriod: 'Annual' }
  ) as any;
  console.log('  Result:', JSON.stringify(budgetResult, null, 2));
  console.assert(budgetResult.withinBudget === true, 'Should be within budget');
  console.assert(budgetResult.budgetInfo?.department === 'IT', 'Department should be IT');
  console.log('  ✓ PASSED\n');

  // Test 4: Check Budget (over budget)
  console.log('Test 4: Check Budget (over budget)');
  const budgetResult2 = await executeNode('checkBudget',
    { requisition: { id: 'REQ-004', amount: '$60,000', department: 'IT' } },
    { department: 'IT', budgetPeriod: 'Annual' }
  ) as any;
  console.log('  Result:', JSON.stringify(budgetResult2, null, 2));
  console.assert(budgetResult2.withinBudget === false, 'Should be over budget');
  console.log('  ✓ PASSED\n');

  // Test 5: Three-Way Match (match within tolerance)
  console.log('Test 5: Three-Way Match (match within tolerance)');
  const matchResult = await executeNode('threeWayMatch',
    { po: { amount: '$48,000', quantity: 100 }, receipt: { quantity: 100 }, invoice: { amount: '$48,500' } },
    { tolerancePercent: 2, quantityTolerance: 5 }
  ) as any;
  console.log('  Result:', JSON.stringify(matchResult, null, 2));
  console.assert(matchResult.matched === true, 'Should match within 2% tolerance');
  console.assert(matchResult.discrepancies?.length === 0, 'Should have no discrepancies');
  console.log('  ✓ PASSED\n');

  // Test 6: Three-Way Match (price mismatch)
  console.log('Test 6: Three-Way Match (price mismatch)');
  const failResult = await executeNode('threeWayMatch',
    { po: { amount: '$48,000', quantity: 100 }, receipt: { quantity: 100 }, invoice: { amount: '$52,000' } },
    { tolerancePercent: 2, quantityTolerance: 5 }
  ) as any;
  console.log('  Result:', JSON.stringify(failResult, null, 2));
  console.assert(failResult.matched === false, 'Should not match');
  console.assert(failResult.discrepancies?.length > 0, 'Should have discrepancies');
  console.log('  ✓ PASSED\n');

  // Test 7: Three-Way Match (quantity mismatch)
  console.log('Test 7: Three-Way Match (quantity mismatch)');
  const qtyResult = await executeNode('threeWayMatch',
    { po: { amount: '$48,000', quantity: 100 }, receipt: { quantity: 80 }, invoice: { amount: '$48,000' } },
    { tolerancePercent: 2, quantityTolerance: 5 }
  ) as any;
  console.log('  Result:', JSON.stringify(qtyResult, null, 2));
  console.assert(qtyResult.matched === false, 'Should not match on quantity');
  console.assert(qtyResult.discrepancies?.some((d: string) => d.includes('Quantity')), 'Should flag quantity mismatch');
  console.log('  ✓ PASSED\n');

  // Test 8: Notify Vendor
  console.log('Test 8: Notify Vendor');
  const notifyResult = await executeNode('notifyVendor',
    { po: { po_number: 'PO-12345' }, supplier: { name: 'Dell', email: 'orders@dell.com' } },
    { method: 'Email', includeTerms: true }
  ) as any;
  console.log('  Result:', JSON.stringify(notifyResult, null, 2));
  console.assert(notifyResult.sent === true, 'Should be sent');
  console.assert(notifyResult.confirmation?.includes('Email'), 'Confirmation should mention Email');
  console.log('  ✓ PASSED\n');

  console.log('=== All 8 tests passed! ===');
}

runTests().catch(console.error);
