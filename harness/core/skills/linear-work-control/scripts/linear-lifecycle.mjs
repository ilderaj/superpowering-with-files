#!/usr/bin/env node
import { planLifecycle, verifyLifecycleReceipt } from '../lib/linear-lifecycle.mjs';
try {
 const [command,...args]=process.argv.slice(2);
 if(command==='--help') console.log('Usage: linear-lifecycle.mjs <plan|verify-receipt> < input.json\nPure proposal/readback check only. Workspace/root/target guards and authenticated MCP reads required separately. See lifecycle.md.');
 else {
  if(args.length || !['plan','verify-receipt'].includes(command)) throw new Error('invalid command; use --help');
  let raw='';for await(const c of process.stdin) raw+=c;
  const result=(command==='plan'?planLifecycle:verifyLifecycleReceipt)(JSON.parse(raw));
  console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;
 }
} catch(error) {console.log(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
