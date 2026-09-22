import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const text = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const deny = error => ({ok:false,decision:'DENY',error:error.message});
const terminal = new Set(['completed','canceled','cancelled','archived']);
const states = new Set(['triage','backlog','unstarted','started',...terminal]);
const queueLabels = new Set(['agent-ready','nightly','agent-running']);
const slug = value => typeof value === 'string' && value !== '.' && value !== '..' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
const markerFor = (productKey, taskId, sliceKey) => `harness-task: ${productKey}/${taskId}${sliceKey ? `/${sliceKey}` : ''}`;

function validatePolicy(p) {
 requireThat(p?.schemaVersion === 1, 'policy schemaVersion must be 1');
 for (const key of ['workspaceId','teamId','defaultProjectId']) requireThat(uuid(p[key]), `policy ${key} must be a lowercase UUID`);
 requireThat(slug(p.productKey), 'policy productKey must be a safe slug');
 for (const key of ['canonicalRoot','gitCommonDir']) requireThat(text(p[key]) && path.isAbsolute(p[key]), `policy ${key} must be absolute`);
 requireThat(p.managedLabel === 'swf-managed' && p.executorLabel === 'executor:codex-local', 'policy managed/executor labels invalid');
 requireThat(Array.isArray(p.projects) && p.projects.length > 0, 'policy projects required');
 for (const project of p.projects) requireThat(uuid(project?.id) && slug(project.key) && text(project.workstreamLabel), 'invalid project mapping');
 for (const key of ['id','key','workstreamLabel']) requireThat(new Set(p.projects.map(project=>project[key])).size === p.projects.length, `ambiguous project ${key}`);
 requireThat(p.projects.some(project=>project.id === p.defaultProjectId), 'default project not allowed');
 return p;
}
function binding(p, b) {
 requireThat(uuid(b?.issueId) && uuid(b.projectId) && uuid(b.teamId), 'normalized binding UUIDs required');
 requireThat(b.teamId === p.teamId && p.projects.some(project=>project.id === b.projectId), 'binding outside policy');
 return b;
}
function identity(p, issue) {
 binding(p,issue);
 requireThat(issue.workspaceId === p.workspaceId, 'workspace mismatch');
 requireThat(issue.fullyRead === true, 'issue not fully read');
}
function parentMatches(p, issue) {
 requireThat(Object.hasOwn(issue,'parent') && issue.parent !== undefined, 'parent coverage unknown; use null for no parent');
 if (issue.parent === null) return;
 identity(p,issue.parent);
 requireThat(issue.parent.issueId !== issue.issueId, 'self parent rejected');
 requireThat(issue.parent.projectId === issue.projectId, 'cross-project parent rejected');
}
function validateRegistryPolicies(p, registries) {
 if (registries === undefined) return;
 requireThat(Array.isArray(registries), 'registryPolicies must be an array');
 const ids = new Set(p.projects.map(project => project.id));
 for (const registry of registries) {
  validatePolicy(registry);
  for (const project of registry.projects) { requireThat(!ids.has(project.id), 'project overlaps another registry policy'); ids.add(project.id); }
 }
}
function inventory(p, snapshot) {
 requireThat(snapshot?.complete === true && snapshot.paginationComplete === true && snapshot.markerSearchComplete === true && snapshot.workspaceId === p.workspaceId && Array.isArray(snapshot.issues), 'inventory coverage/pagination/marker search unknown');
 requireThat(Array.isArray(snapshot.projects), 'project snapshot array required');
 requireThat(snapshot.projectOwnershipComplete === true && Array.isArray(snapshot.projectCatalog), 'workspace project ownership coverage unknown');
 const catalogIds = new Set();
 for (const item of snapshot.projectCatalog) {
  requireThat(uuid(item.id) && !catalogIds.has(item.id) && item.fullyRead === true && item.workspaceId === p.workspaceId && typeof item.description === 'string', 'invalid/partial project catalog');
  catalogIds.add(item.id);
 }
 for (const configured of p.projects) {
  const marker = `productKey: ${p.productKey}; projectKey: ${configured.key}`;
  const matches = snapshot.projectCatalog.filter(item => item.description.split('\n',1)[0] === marker);
  requireThat(matches.length === 1 && matches[0].id === configured.id, 'missing/duplicate/conflicting project ownership');
 }
 requireThat(snapshot.teamId === p.teamId, 'project snapshot team mismatch');
 const seenProjects = new Set();
 requireThat(snapshot.projects.length === p.projects.length, 'full policy project coverage required');
 for (const project of snapshot.projects) {
  requireThat(uuid(project?.id) && !seenProjects.has(project.id) && p.projects.some(item=>item.id === project.id), 'unknown/duplicate project snapshot');
  requireThat(project.workspaceId === p.workspaceId && project.teamId === p.teamId && project.fullyRead === true, 'project snapshot destination/fully-read mismatch');
  const policyProject = p.projects.find(item => item.id === project.id);
  requireThat(text(project.description) && project.description.split('\n', 1)[0] === `productKey: ${p.productKey}; projectKey: ${policyProject.key}`, 'project ownership description first line mismatch');
  seenProjects.add(project.id);
  requireThat(project.archived === undefined || typeof project.archived === 'boolean', 'invalid project archived flag');
  requireThat(project.statusType === undefined || text(project.statusType), 'invalid project statusType');
 }
 const ids = new Set(), markers = new Set();
 return snapshot.issues.map(issue => {
  identity(p,issue); parentMatches(p,issue);
  requireThat(!ids.has(issue.issueId), 'duplicate issue coverage'); ids.add(issue.issueId);
  requireThat(issue.taskMarker === null || text(issue.taskMarker), 'task marker coverage unknown; use null for none');
  if (issue.taskMarker !== null) {requireThat(!markers.has(issue.taskMarker), 'duplicate task marker'); markers.add(issue.taskMarker);}
  requireThat(states.has(issue.statusType) && typeof issue.queued === 'boolean', 'status/queue coverage unknown');
  requireThat(issue.labels === undefined || (Array.isArray(issue.labels) && issue.labels.every(text)), 'invalid labels');
  const queued = issue.queued || (issue.labels || []).some(label=>queueLabels.has(label));
  requireThat(!(terminal.has(issue.statusType) && queued), 'terminal issue cannot queue');
  return {issueId:issue.issueId,projectId:issue.projectId,workstreamLabel:p.projects.find(project=>project.id === issue.projectId).workstreamLabel,terminal:terminal.has(issue.statusType),nonTerminal:!terminal.has(issue.statusType)};
 });
}

/** Pure, caller-attested complete snapshot audit. Labels never supply identity. */
export function auditInventory({policy,snapshot} = {}) {
 try {validatePolicy(policy); return {ok:true,issues:inventory(policy,snapshot)};} catch(error) {return deny(error);}
}

/** Pure proposal only. No Linear write, state store, or legacy-map migration. */
export function planIntake({policy,snapshot,taskMarker,taskId,sliceKey,projectId,projectKey,parent,binding:expected,registryPolicies} = {}) {
 try {
  const p=validatePolicy(policy); validateRegistryPolicies(p, registryPolicies); inventory(p,snapshot);
  requireThat(slug(taskId) && (sliceKey === undefined || slug(sliceKey)), 'taskId/sliceKey must be safe slugs');
  const expectedMarker=markerFor(p.productKey,taskId,sliceKey); requireThat(taskMarker === expectedMarker, 'taskMarker does not match exact ownership syntax');
  const candidates=[];
  if (projectId !== undefined) {requireThat(p.projects.some(project=>project.id===projectId), 'unknown explicit project'); candidates.push(projectId);}
  if (projectKey !== undefined) {const project=p.projects.find(project=>project.key===projectKey); requireThat(project, 'unknown exact project key'); candidates.push(project.id);}
  if (parent !== undefined && parent !== null) {identity(p,parent); candidates.push(parent.projectId);}
  if (expected !== undefined) candidates.push(binding(p,expected).projectId);
  requireThat(new Set(candidates).size <= 1, 'conflicting project mappings');
  const target=candidates[0] || p.defaultProjectId;
  const admissionProject=snapshot.projects.find(project=>project.id===target);
  requireThat(admissionProject?.archived !== true && ['backlog','planned','started'].includes(admissionProject?.statusType), 'closed project disallows intake or execution reuse');
  const existing=snapshot.issues.find(issue=>issue.taskMarker===taskMarker);
  if (expected) requireThat(existing?.issueId === expected.issueId, 'binding does not match marker coverage');
  if (existing) {
   requireThat(existing.projectId===target, 'marker belongs to a different project');
   if (parent) requireThat(existing.parent?.issueId === parent.issueId, 'marker parent conflict');
   return {ok:true,planOnly:true,action:'reuse',issueId:existing.issueId,projectId:target,taskMarker};
  }
  return {ok:true,planOnly:true,action:'create',workspaceId:p.workspaceId,teamId:p.teamId,projectId:target,taskMarker,parentId:parent?.issueId || null,labels:[p.managedLabel,p.executorLabel,p.projects.find(project=>project.id===target).workstreamLabel]};
 } catch(error) {return deny(error);}
}

async function gitFamily(repoPath) {
 requireThat(text(repoPath) && path.isAbsolute(repoPath), 'absolute repoPath required');
 // Ignore ambient Git overrides: identity must be measured from the supplied path.
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')));
 const run=async flag=>(await exec('git',['-C',repoPath,'rev-parse',flag],{env,timeout:10000})).stdout.trim();
 const root=await realpath(await run('--show-toplevel'));
 const common=await realpath(path.resolve(repoPath,await run('--git-common-dir')));
 return {root,common};
}

/** Async read-only filesystem inspection; expected is caller-normalized v1 or v2. */
export async function guardTarget({policy,expected,observed,observedComment,repoPath} = {}) {
 try {
  const p=validatePolicy(policy); binding(p,expected); identity(p,observed); parentMatches(p,observed);
  if (expected.commentId !== undefined) { requireThat(uuid(expected.commentId), 'expected commentId must be UUID'); requireThat(observedComment?.id === expected.commentId && observedComment.issueId === expected.issueId && observedComment.fullyRead === true, 'observed comment does not match expected fully-read issue comment'); }
  for (const key of ['issueId','teamId','projectId']) requireThat(observed[key]===expected[key], `observed ${key} differs from expected binding`);
  const [current,canonical,root,common]=await Promise.all([gitFamily(repoPath),gitFamily(p.canonicalRoot),realpath(p.canonicalRoot),realpath(p.gitCommonDir)]);
  requireThat(canonical.root===root && canonical.common===common, 'policy canonical root/Git family mismatch');
  requireThat(current.common===common, 'repository outside registered Git family');
  return {ok:true,decision:'ALLOW',issueId:observed.issueId,projectId:observed.projectId,gitFamily:common};
 } catch(error) {return deny(error);}
}
