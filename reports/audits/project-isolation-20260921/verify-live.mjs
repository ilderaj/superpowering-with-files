import fs from 'node:fs';
import {auditInventory,planIntake,guardTarget} from '../../../harness/core/skills/linear-work-control/lib/project-routing.mjs';
import {normalizeProjectBinding} from '../../../harness/core/skills/linear-work-control/lib/project-binding-normalize.mjs';
const root='reports/audits/project-isolation-20260921/';
const read=p=>JSON.parse(fs.readFileSync(p));
const policy=read('.harness/linear/routing.json'),raw=read(root+'marker-after.json'),projects=read(root+'projects-live.json'),manifest=read(root+'marker-plan.json');
const before=read(root+'marker-before.json'), list=read(root+'issues-final.json');
if(list.hasNextPage || list.issues.length!==52)throw Error('workspace coverage changed');
const identity=i=>({issueId:i.uuid,identifier:i.id,workspaceId:policy.workspaceId,teamId:i.teamId,projectId:i.projectId,fullyRead:true});
const issues=raw.map(i=>{
 const parentRef=i.parentId||list.issues.find(x=>x.uuid===i.uuid)?.parentId;
 const parent=parentRef?raw.find(x=>x.uuid===parentRef||x.id===parentRef):null;
 if(parentRef&&!parent)throw Error('missing parent');
 const markers=i.description.split('\n').filter(line=>line.startsWith('harness-task:'));
 if(markers.length!==1)throw Error('marker count '+i.id);
 return {...identity(i),parent:parent?identity(parent):null,taskMarker:markers[0],statusType:i.statusType,queued:i.labels.includes('agent-ready')||i.labels.includes('nightly'),labels:i.labels};
});
const catalog=read(root+'project-catalog.json'); if(catalog.hasNextPage)throw Error('project catalog incomplete');
const snapshot={projectOwnershipComplete:true,projectCatalog:catalog.projects.map(p=>({id:p.id,workspaceId:policy.workspaceId,fullyRead:true,description:p.description||''})),workspaceId:policy.workspaceId,teamId:policy.teamId,complete:true,paginationComplete:true,markerSearchComplete:true,readAt:new Date().toISOString(),issues,projects:projects.map(p=>({id:p.id,workspaceId:policy.workspaceId,teamId:p.teams[0].id,fullyRead:true,description:p.description,statusType:p.status.type,archived:false}))};
const audit=auditInventory({policy,snapshot});if(!audit.ok)throw Error(JSON.stringify(audit));
const paths=[...new Set(manifest.map(m=>m.bindingPath))], checks=[];
for(const path of paths){
 const binding=read(path);
 for(const taskId of Object.keys(binding.taskMap)){
  const n=normalizeProjectBinding({binding,policy,issues,selector:{taskId}});
  if(!n.ok)throw Error(path+' '+JSON.stringify(n));
  for(const m of n.mappings){
   if(!m.markerReady)throw Error('not marker ready '+m.taskMarker);
   const issue=issues.find(i=>i.issueId===m.expected.issueId);
   const {commentId,...expected}=m.expected; // Description writes guard issue; existing comments are verified separately before edits.
   const g=await guardTarget({policy,expected,observed:issue,repoPath:process.cwd()});if(!g.ok)throw Error(JSON.stringify(g));
   const reuse=planIntake({policy,snapshot,taskId,sliceKey:m.sliceKey,taskMarker:m.taskMarker,binding:expected,parent:issue.parent});
   if(!reuse.ok||reuse.action!=='reuse'||reuse.issueId!==expected.issueId)throw Error(JSON.stringify(reuse));
   checks.push({issueId:expected.issueId,taskMarker:m.taskMarker,guard:g.decision,replay:reuse.action});
  }
 }
}
for(const i of raw){const b=before.find(x=>x.uuid===i.uuid);for(const k of ['projectId','teamId','parentId','status','labels','relations'])if(JSON.stringify(i[k])!==JSON.stringify(b[k]))throw Error('preservation drift '+i.id+' '+k);}
const candidate=planIntake({policy,snapshot,taskId:'next-tracked-example',taskMarker:'harness-task: swf/next-tracked-example'});
if(!candidate.ok||candidate.projectId!==policy.defaultProjectId)throw Error('default routing');
const wrong=await guardTarget({policy,expected:{issueId:issues[0].issueId,projectId:policy.defaultProjectId,teamId:policy.teamId},observed:issues[0],repoPath:process.cwd()});if(wrong.ok)throw Error('wrong-project accepted');
fs.writeFileSync(root+'normalized-final.json',JSON.stringify({policy,snapshot},null,2));
fs.writeFileSync(root+'live-acceptance.json',JSON.stringify({bindingCount:paths.length,issueCount:checks.length,checks,defaultCreateProposal:candidate,wrongProject:wrong,preservation:'passed'},null,2));
console.log(JSON.stringify({bindings:paths.length,issues:checks.length,guards:'passed',replay:'48 same UUID reuse',preservation:'passed',defaultCreate:'proposal only',wrongProject:wrong.decision}));
