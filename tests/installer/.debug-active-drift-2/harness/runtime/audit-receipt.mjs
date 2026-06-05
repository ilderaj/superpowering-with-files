import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function stamp() {
  return new Date().toISOString().replace(/[:]/g, '-');
}

export async function writeAuditReceipt(rootDir, receipt) {
  const receiptDir = path.join(rootDir, '.harness/mcp/receipts');
  await mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `${stamp()}-${receipt.operation}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receiptPath;
}
