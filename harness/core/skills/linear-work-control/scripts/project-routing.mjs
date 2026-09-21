#!/usr/bin/env node
import { planIntake, guardTarget, auditInventory } from '../lib/project-routing.mjs';
import { normalizeProjectBinding } from '../lib/project-binding-normalize.mjs';
import { planProjectBootstrap } from '../lib/project-bootstrap.mjs';
import { readFile } from 'node:fs/promises';

const help = `Usage: node scripts/project-routing.mjs <plan-intake|guard-target|audit-inventory|normalize-binding> < snapshot.json
       node scripts/project-routing.mjs bootstrap-project --input /path/input.json
Pure JSON proposals/audits; guard adds read-only async Git inspection. No external writes.
stdout: JSON {ok,...}; exit 0 success, exit 1 denial or invalid input.
Policy: {schemaVersion:1, workspaceId, workspaceSlug, teamId, productKey, canonicalRoot,
 gitCommonDir, defaultProjectId, projects:[{id,key,workstreamLabel}],
 managedLabel:"swf-managed", executorLabel:"executor:codex-local"}.
All IDs are lowercase UUIDs. Project IDs, keys and workstream labels are unique.
Shared team is supported. Roots are absolute; linked worktrees in the Git family pass.
Issue: {issueId,workspaceId,teamId,projectId,fullyRead:true,parent:null|Parent,
 taskMarker:string|null,statusType,queued:boolean,labels?:string[]}.
Parent: {issueId,workspaceId,teamId,projectId,fullyRead:true}; must share project.
No cross-project parent exception. Omitted parent/marker/status/queue fails audit.
Issue statusType: triage|backlog|unstarted|started|completed|canceled|cancelled|archived.
Terminal issues cannot queue (including agent-ready/nightly/agent-running labels).
Snapshot: {workspaceId,teamId,complete:true,paginationComplete:true,markerSearchComplete:true,
 issues:Issue[],projects:[{id,workspaceId,teamId,fullyRead:true,description,statusType?,archived?}]}.
Also requires projectOwnershipComplete:true and projectCatalog:[{id,workspaceId,fullyRead:true,description}]
from a fully paginated workspace Project inventory, including archived Projects.
All policy Projects must be present; description first line must exactly match
productKey: <policy.productKey>; projectKey: <configured project key>.
complete:true attests exhaustive fully-read inventory for the policy, including marker search;
partial, duplicate, unknown-project or ambiguous coverage denies. Caller owns freshness.
Project statusType is required and completed/canceled/cancelled/archived or archived:true denies creation;
omitted project status means unknown and does not imply active. Labels only present routing; nonTerminal is descriptive and grants no runtime eligibility.
plan-intake input: {policy,snapshot,taskId,sliceKey?,taskMarker,projectId?,projectKey?,parent?,binding?}.
Exact explicit ID/key, parent and binding must agree; otherwise use defaultProjectId.
binding: {issueId,projectId,teamId}, returned as selected.expected by normalize-binding (v1 supported, never migrated).
normalize-binding input: {binding,productConfig?,policy,issues,selector:{taskId,sliceKey?,issueId?}}.
issues adds identifier to the normalized live Issue shape. Output preserves mappings,
selected.expected and markerReady; absent marker is recoverable but not unattended-ready.
Exact unique marker reuses the issue; binding must match it. No title guessing.
audit-inventory input: {policy,snapshot}.
guard-target input: {policy,expected:{issueId,projectId,teamId,commentId?},observed:Issue,observedComment?}.
guard-target requires --repo; JSON repoPath cannot override it. Verifies policy, expected
and observed UUID identities and independently inspects canonical and current Git family.
observedComment: {id,issueId,fullyRead:true}; mandatory when expected.commentId is supplied.
Chief controls MCP execution and acceptance; these outputs authorize no external write.
bootstrap-project input: {request:{productKey,productName,explicitEnrollment,stream?:{requested,key,name?}},
policy:{workspaceId,teamId,defaultProjectId?},rootEvidence:{canonicalRoot,gitCommonDir},
catalog:{complete:true,paginationComplete:true,projectOwnershipComplete:true,workspaceId,
teams:[{id,workspaceId,fullyRead:true}],projects:[{id,workspaceId,teamId,fullyRead:true,
description,statusType,archived?}]}}. Reads a JSON file and emits a pure create/reuse proposal.
`;
try {
 const [command,...args]=process.argv.slice(2);
 if (command==='--help' && args.length===0) {process.stdout.write(help);}
 else {
  if (!['plan-intake','guard-target','audit-inventory','normalize-binding','bootstrap-project'].includes(command)) throw new Error('unknown command; use --help');
  const bootstrap = command==='bootstrap-project';
  if (bootstrap ? args.length!==2 || args[0]!=='--input' : command==='guard-target' ? args.length!==2 || args[0]!=='--repo' : args.length!==0) throw new Error(bootstrap ? 'invalid arguments; bootstrap-project requires --input /path/input.json' : 'invalid arguments; guard-target requires --repo /absolute/repo');
  let raw='';
  if (bootstrap) raw=await readFile(args[1], 'utf8');
  else for await (const chunk of process.stdin) raw+=chunk;
  const input=JSON.parse(raw);
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('input must be a JSON object');
  const result=bootstrap ? planProjectBootstrap(input) : command==='guard-target' ? await guardTarget({...input,repoPath:args[1]}) : command==='plan-intake' ? planIntake(input) : command==='normalize-binding' ? normalizeProjectBinding(input) : auditInventory(input);
  process.stdout.write(JSON.stringify(result)+'\n'); process.exitCode=result.ok ? 0 : 1;
 }
} catch(error) {process.stdout.write(JSON.stringify({ok:false,decision:'DENY',error:error.message})+'\n');process.exitCode=1;}
