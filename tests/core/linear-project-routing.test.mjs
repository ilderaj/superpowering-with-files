import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { planIntake, guardTarget, auditInventory } from '../../harness/core/skills/linear-work-control/lib/project-routing.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const policy = { schemaVersion: 1, workspaceId: id(1), teamId: id(2), productKey: 'swf', canonicalRoot: '/repo', gitCommonDir: '/repo/.git', defaultProjectId: id(3), projects: [{id:id(3),key:'core',workstreamLabel:'workstream:core'},{id:id(4),key:'ops',workstreamLabel:'workstream:ops'}], managedLabel:'swf-managed', executorLabel:'executor:codex-local' };
const issue = (extra={}) => ({issueId:id(5),workspaceId:id(1),teamId:id(2),projectId:id(3),fullyRead:true,parent:null,taskMarker:'harness-task: swf/a',statusType:'started',queued:false,...extra});
const snapshot = (issues=[], projects=[{id:id(3),workspaceId:id(1),teamId:id(2),fullyRead:true,statusType:'started'},{id:id(4),workspaceId:id(1),teamId:id(2),fullyRead:true,statusType:'started'}]) => { if (projects.length===1 && projects[0].id===id(3) && projects[0].workspaceId===id(1) && projects[0].teamId===id(2)) projects=[projects[0],{id:projects[0].id===id(3)?id(4):id(3),workspaceId:id(1),teamId:id(2),fullyRead:true,statusType:'started'}]; return {workspaceId:id(1),teamId:id(2),complete:true,paginationComplete:true,markerSearchComplete:true,projectOwnershipComplete:true,projectCatalog:policy.projects.map(p=>({id:p.id,workspaceId:id(1),fullyRead:true,description:`productKey: swf; projectKey: ${p.key}`})),issues,projects:projects.map(project=>({fullyRead:true,description:project.id===id(4)?'productKey: swf; projectKey: ops':'productKey: swf; projectKey: core',...project}))}; };
const input = (extra={}) => ({policy,snapshot:snapshot(),taskId:'a',taskMarker:'harness-task: swf/a',...extra});
test('marker segments allow live WP/LMP/camelCase forms and reject dot segments', () => {
 assert.equal(planIntake(input({taskId:'WP-01',taskMarker:'harness-task: swf/WP-01'})).ok,true);
 assert.equal(planIntake(input({taskId:'phase3RealConsumption',sliceKey:'LMP-03',taskMarker:'harness-task: swf/phase3RealConsumption/LMP-03'})).ok,true);
 for (const taskId of ['.','..']) assert.equal(planIntake(input({taskId,taskMarker:`harness-task: swf/${taskId}`})).ok,false);
});
test('intake defaults, exact keys and conflicting mappings', () => {
 assert.equal(planIntake(input()).projectId,id(3));
 assert.equal(planIntake(input({projectKey:'ops',snapshot:snapshot([], [{id:id(4),workspaceId:id(1),teamId:id(2),statusType:'started'},{id:id(3),workspaceId:id(1),teamId:id(2),statusType:'started'}])})).projectId,id(4));
 assert.equal(planIntake(input({snapshot:snapshot(),taskMarker:'harness-task: swf/a',taskId:'a'})).ok,true);
 for(const extra of [{projectKey:'OPS'},{projectId:id(9)},{projectKey:'ops',binding:{issueId:id(5),teamId:id(2),projectId:id(3)}}]) assert.equal(planIntake(input(extra)).ok,false);
 assert.equal(planIntake(input({parent:issue({projectId:id(4)}),snapshot:snapshot([], [{id:id(4),workspaceId:id(1),teamId:id(2),statusType:'started'},{id:id(3),workspaceId:id(1),teamId:id(2),statusType:'started'}])})).projectId,id(4));
});
test('exact marker reuse and complete unique coverage', () => {
 assert.equal(planIntake(input({snapshot:snapshot([issue()], [{id:id(3),workspaceId:id(1),teamId:id(2),statusType:'started'}])})).action,'reuse');
 assert.equal(planIntake(input({snapshot:snapshot([issue({taskMarker:'harness-task: swf/aa'})], [{id:id(3),workspaceId:id(1),teamId:id(2),statusType:'started'}])})).action,'create');
 for(const snap of [snapshot([issue(),issue({issueId:id(6)})]),{...snapshot(),complete:false},snapshot([issue({fullyRead:false})]),snapshot([issue({projectId:id(99)})])]) assert.equal(planIntake(input({snapshot:snap})).ok,false);
 assert.equal(planIntake(input({projectKey:'ops',snapshot:snapshot([issue()])})).ok,false);
});
test('closed projects deny new intake; labels never route; terminal never queues', () => {
 for(const state of ['completed','canceled','archived','unknown','paused']) assert.equal(planIntake(input({snapshot:snapshot([], [{id:id(3),workspaceId:id(1),teamId:id(2),statusType:state}])})).ok,false);
 assert.equal(auditInventory({policy,snapshot:snapshot([issue({labels:['workstream:ops']})], [{id:id(3),workspaceId:id(1),teamId:id(2),statusType:'started'}])}).issues[0].workstreamLabel,'workstream:core');
 assert.equal(auditInventory({policy,snapshot:snapshot([issue({statusType:'completed',queued:true})], [{id:id(3),workspaceId:id(1),teamId:id(2),statusType:'started'}])}).ok,false);
 assert.equal(auditInventory({policy,snapshot:snapshot([issue({statusType:'completed',labels:['nightly']})], [{id:id(3),workspaceId:id(1),teamId:id(2),statusType:'started'}])}).ok,false);
 assert.equal(auditInventory({policy,snapshot:snapshot([issue({parent:issue({issueId:id(6),projectId:id(4)})})], [{id:id(3),workspaceId:id(1),teamId:id(2),statusType:'started'}])}).ok,false);
});
test('policy ambiguity and missing issue evidence fail closed', () => {
 for(const p of [{...policy,projects:[policy.projects[0],policy.projects[0]]},{...policy,workspaceId:'name'},{...policy,projects:[policy.projects[0],{...policy.projects[1],key:'core'}]}]) assert.equal(planIntake(input({policy:p})).ok,false);
 for(const extra of [{parent:undefined},{statusType:undefined},{queued:undefined},{teamId:id(9)}]) assert.equal(auditInventory({policy,snapshot:snapshot([issue(extra)])}).ok,false);
});
test('creation requires known matching active project metadata', () => {
 for (const projects of [[], [{id:id(3),workspaceId:id(9),teamId:id(2),statusType:'started'}], [{id:id(3),workspaceId:id(1),teamId:id(9),statusType:'started'}], [{id:id(4),workspaceId:id(1),teamId:id(2),statusType:'started'}], [{id:id(3),workspaceId:id(1),teamId:id(2)}]]) {
  assert.equal(planIntake(input({snapshot:snapshot([],projects)})).ok,false);
 }
 assert.equal(planIntake(input({snapshot:snapshot([], [{id:id(3),workspaceId:id(1),teamId:id(2),fullyRead:true,statusType:'started'},{id:id(4),workspaceId:id(1),teamId:id(2),fullyRead:true,statusType:'started'}])})).ok,true);
});
test('policy may omit descriptions, but live snapshot ownership is required', () => {
 const noDescriptionPolicy={...policy,projects:policy.projects.map(({description,...project})=>project)};
 assert.equal(planIntake({...input(),policy:noDescriptionPolicy}).ok,true);
 for (const description of [undefined,'productKey: swf; projectKey: render','productKey: swf; projectKey: core\nstale']) {
  const projects=snapshot().projects.map(project=>project.id===id(3)?{...project,description}:project);
  assert.equal(planIntake({...input({snapshot:{...snapshot(),projects}}),policy:noDescriptionPolicy}).ok, description === 'productKey: swf; projectKey: core\nstale');
 }
 assert.equal(planIntake({...input({snapshot:{...snapshot(),complete:false}})}).ok,false);
 assert.equal(planIntake({...input({snapshot:{...snapshot(),paginationComplete:false}})}).ok,false);
 assert.equal(planIntake({...input({snapshot:{...snapshot(),markerSearchComplete:false}})}).ok,false);
 assert.equal(planIntake({...input({snapshot:{...snapshot(),projects:snapshot().projects.slice(0,1)}})}).ok,false);
});
test('missing or wrong marker cannot reuse or create', () => {
 assert.equal(planIntake(input({taskMarker:null})).ok,false);
 assert.equal(planIntake(input({taskMarker:'harness-task: swf/other'})).ok,false);
 assert.equal(planIntake(input({taskMarker:'harness-task: swf/a',snapshot:snapshot([issue({taskMarker:'harness-task: swf/other'})])})).ok,true);
});
test('comment mutation requires exact fully-read issue-linked comment', async () => {
 const base={policy,expected:{issueId:id(5),projectId:id(3),teamId:id(2),commentId:id(7)},observed:issue(),repoPath:'/missing'};
 for (const observedComment of [undefined,{id:id(8),issueId:id(5),fullyRead:true},{id:id(7),issueId:id(6),fullyRead:true},{id:id(7),issueId:id(5),fullyRead:false}]) {
  const result=await guardTarget({...base,observedComment}); assert.equal(result.ok,false);
 }
});
test('registry policy validation rejects project overlap but permits shared team', () => {
 const shared={...policy,productKey:'other',defaultProjectId:id(6),projects:[{id:id(6),key:'other',workstreamLabel:'workstream:other',description:'productKey: other; projectKey: other'}]};
 assert.equal(planIntake({...input(),registryPolicies:[shared]}).ok,true);
 assert.equal(planIntake({...input(),registryPolicies:[{...shared,projects:[{id:id(3),key:'other',workstreamLabel:'workstream:other',description:'productKey: other; projectKey: other'}]}]}).ok,false);
});
test('guard verifies exact issue/project and independent real Git family', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'routing-'));
 const git=(...args)=>execFileSync('git',args,{stdio:'pipe'});
 try {
 const root=path.join(dir,'root'),other=path.join(dir,'other'),worktree=path.join(dir,'worktree');
 git('init',root); git('-C',root,'-c','user.name=Test','-c','user.email=test@example.com','commit','--allow-empty','-m','init');
 git('-C',root,'worktree','add','--detach',worktree); git('init',other);
 const p={...policy,canonicalRoot:root,gitCommonDir:path.join(root,'.git')};
 const args={policy:p,expected:{issueId:id(5),projectId:id(3),teamId:id(2)},observed:issue(),repoPath:root};
 assert.equal((await guardTarget(args)).ok,true);
 assert.equal((await guardTarget({...args,expected:{...args.expected,commentId:id(7)},observedComment:{id:id(7),issueId:id(5),fullyRead:true}})).ok,true);
 assert.equal((await guardTarget({...args,repoPath:worktree})).ok,true);
 for(const change of [{repoPath:other},{policy:{...p,canonicalRoot:other}},{observed:issue({projectId:id(4)})},{observed:issue({issueId:id(6)})},{observed:issue({workspaceId:id(9)})},{observed:issue({parent:issue({issueId:id(6),projectId:id(4)})})}]) assert.equal((await guardTarget({...args,...change})).ok,false);
 const cli=spawnSync(process.execPath,['scripts/project-routing.mjs','guard-target','--repo',worktree],{input:JSON.stringify(args),encoding:'utf8'});
 assert.equal(cli.status,0,cli.stdout); assert.equal(JSON.parse(cli.stdout).ok,true);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('preflight ALLOW then a moved issue denies the next write, and the caller stops writing', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'routing-drift-'));
 const git=(...args)=>execFileSync('git',args,{stdio:'pipe'});
 try {
 const root=path.join(dir,'root'); git('init',root); git('-C',root,'-c','user.name=Test','-c','user.email=test@example.com','commit','--allow-empty','-m','init');
 const p={...policy,canonicalRoot:root,gitCommonDir:path.join(root,'.git')};
 const expected={issueId:id(5),projectId:id(3),teamId:id(2)};
 assert.equal((await guardTarget({policy:p,expected,observed:issue(),repoPath:root})).ok,true);
 const moved=issue({projectId:id(4)});
 const second=await guardTarget({policy:p,expected,observed:moved,repoPath:root});
 assert.equal(second.ok,false); assert.match(second.error,/observed projectId differs from expected binding/);
 assert.equal((await guardTarget({policy:p,expected:{...expected,projectId:id(4)},observed:moved,repoPath:root})).ok,true);
 assert.equal((await guardTarget({policy:p,expected:{...expected,projectId:id(99)},observed:moved,repoPath:root})).ok,false);
 assert.equal((await guardTarget({policy:p,expected,observed:moved,repoPath:root})).ok,false);
 const ledger=[];
 const write=async observedNow=>{const gate=await guardTarget({policy:p,expected,observed:observedNow,repoPath:root}); if(!gate.ok){ledger.push('stopped: '+gate.error); return false;} ledger.push('wrote'); return true;};
 assert.equal(await write(issue()),true);
 assert.equal(await write(moved),false);
 assert.equal(await write(moved),false);
 assert.deepEqual(ledger,['wrote','stopped: observed projectId differs from expected binding','stopped: observed projectId differs from expected binding']);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('post-write readback reports drift on moved issue or reassigned comment', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'routing-readback-'));
 const git=(...args)=>execFileSync('git',args,{stdio:'pipe'});
 try {
 const root=path.join(dir,'root'); git('init',root); git('-C',root,'-c','user.name=Test','-c','user.email=test@example.com','commit','--allow-empty','-m','init');
 const p={...policy,canonicalRoot:root,gitCommonDir:path.join(root,'.git')};
 const expected={issueId:id(5),projectId:id(3),teamId:id(2),commentId:id(7)};
 const own=id(7),foreign=id(8);
 assert.equal((await guardTarget({policy:p,expected,observed:issue(),observedComment:{id:own,issueId:id(5),fullyRead:true},repoPath:root})).ok,true);
 const reassigned=await guardTarget({policy:p,expected,observed:issue(),observedComment:{id:foreign,issueId:id(5),fullyRead:true},repoPath:root});
 assert.equal(reassigned.ok,false); assert.match(reassigned.error,/observed comment does not match expected fully-read issue comment/);
 const movedAfterWrite=await guardTarget({policy:p,expected,observed:issue({projectId:id(4)}),observedComment:{id:own,issueId:id(5),fullyRead:true},repoPath:root});
 assert.equal(movedAfterWrite.ok,false); assert.match(movedAfterWrite.error,/projectId/);
 const unread=await guardTarget({policy:p,expected,observed:issue(),observedComment:{id:own,issueId:id(5),fullyRead:false},repoPath:root});
 assert.equal(unread.ok,false);
 assert.equal((await guardTarget({policy:p,expected:{...expected,projectId:id(4)},observed:issue({projectId:id(4)}),observedComment:{id:own,issueId:id(5),fullyRead:true},repoPath:root})).ok,true);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('CLI prints JSON denial and documents inputs', () => {
 const run=(args,value)=>spawnSync(process.execPath,['scripts/project-routing.mjs',...args],{input:value,encoding:'utf8'});
 assert.equal(run(['--help']).status,0);
 for(const [args,value] of [[['plan-intake'],'{'],[['unknown'],'{}'],[['plan-intake'],JSON.stringify(input({projectKey:'unknown'}))]]) {const result=run(args,value);assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).ok,false);}
});

test('workspace project catalog rejects duplicate ownership outside configured project list',()=>{
 const a=input(); a.snapshot.projectCatalog.push({...a.snapshot.projectCatalog[0],id:id(99)});assert.equal(planIntake(a).ok,false);
 const b=input();delete b.snapshot.projectOwnershipComplete;assert.equal(planIntake(b).ok,false);
 const c=input();c.snapshot.projectCatalog[0].fullyRead=false;assert.equal(planIntake(c).ok,false);
 const d=input();d.snapshot.projectCatalog.push({id:id(99),workspaceId:id(1),fullyRead:true,description:'productKey: other; projectKey: core'});assert.equal(planIntake(d).ok,true);
});
test('closed projects deny reused task intake as well as creation',()=>{
 for(const statusType of ['completed','canceled','unknown',undefined]) {
  const snap=snapshot([issue()]);snap.projects[0].statusType=statusType;
  assert.equal(planIntake(input({snapshot:snap})).ok,false);
 }
});
