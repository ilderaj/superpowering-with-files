import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProjectBinding as norm} from '../../harness/core/skills/linear-work-control/lib/project-binding-normalize.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const policy={workspaceId:id(1),workspaceSlug:'example',teamId:id(2),productKey:'swf',projects:[{id:id(3)}]};
const main={issueId:id(4),identifier:'SUP-5',workspaceId:id(1),teamId:id(2),projectId:id(3),fullyRead:true,parent:null,taskMarker:null};
const child={...main,issueId:id(5),identifier:'SUP-6',parent:main,taskMarker:'harness-task: swf/task/slice'};
const binding={schemaVersion:1,enabled:true,workspace:{name:'example'},team:{id:id(2)},project:{id:id(3)},goalIssue:{id:id(4),identifier:'SUP-5'},statusComment:{id:id(6)},executor:'executor:codex-local',taskMap:{task:{issueId:'SUP-5',subIssues:{slice:'SUP-6'},subIssueIds:{slice:id(5)}}},sync:{lastResult:'ok',pendingRetry:false}};
const args=()=>({binding:structuredClone(binding),policy,issues:structuredClone([main,child]),selector:{taskId:'task'}});
test('legacy identifier and UUID maps preserve parent and child, without inheriting comment',()=>{
 const a=args(),r=norm(a);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.mappings.length,2);assert.equal(r.selected.expected.commentId,id(6));assert.equal(r.selected.markerReady,false);assert.equal(r.mappings[1].markerReady,true);assert.equal(r.mappings[1].expected.commentId,undefined);
 a.selector.sliceKey='slice';assert.equal(norm(a).selected.expected.issueId,id(5));assert.deepEqual(a.binding,binding);
});
test('legacy map-only UUID and identifier-only forms are supported with exact live lookup',()=>{
 for(const kind of ['subIssues','subIssueIds']){const a=args();a.binding.taskMap.task={issueId:'SUP-5',[kind]:{slice:kind==='subIssues'?'SUP-6':id(5)}};assert.equal(norm(a).ok,true);}
 const a=args();delete a.binding.statusComment;assert.equal(norm(a).ok,true);assert.equal(norm(a).selected.expected.commentId,undefined);
});
test('missing/ambiguous/drifting identity and loss-prone maps fail closed',()=>{
 const mutations=[a=>a.issues.pop(),a=>a.issues.push({...child}),a=>a.issues[1].projectId=id(9),a=>a.issues[1].parent=null,a=>a.binding.taskMap.task.subIssueIds.slice=id(4),a=>a.binding.taskMap.task.subIssues.other='SUP-6',a=>a.selector.sliceKey='unknown',a=>a.selector.issueId=id(9),a=>a.issues[0].fullyRead=false,a=>a.binding.workspace.name='other',a=>a.binding.enabled=false,a=>a.binding.statusComment.id='invalid'];
 for(const mutate of mutations){const a=args();mutate(a);assert.equal(norm(a).ok,false,mutate.toString());}
});
test('non-goal task cannot inherit goal status comment',()=>{
 const a=args();a.binding.taskMap.other={issueId:id(5)};a.selector={taskId:'other'};const r=norm(a);assert.equal(r.ok,true);assert.equal(r.selected.expected.commentId,undefined);
});
test('v2 reuses canonical schema validation and still requires live marker/readback',()=>{
 const productConfig={schemaVersion:2,kind:'product-config',productKey:'swf',workspaceId:id(1),teamId:id(2),allowedProjectIds:[id(3)],hostProjectId:null,executionMode:'manual'};
 const b={schemaVersion:2,kind:'task-binding',productKey:'swf',taskId:'task',configVersion:2,workspaceId:id(1),teamId:id(2),projectId:id(3),issueId:id(4),statusCommentId:id(6),rootRegistrationId:'root'};
 const a={...args(),binding:b,productConfig};assert.equal(norm(a).ok,true);assert.equal(norm(a).selected.markerReady,false);
 for(const change of [{allowedProjectIds:undefined},{allowedProjectIds:[id(9)]}])assert.equal(norm({...a,productConfig:{...productConfig,...change}}).ok,false);
 assert.equal(norm({...a,binding:{...b,issueId:'fake'}}).ok,false);
});
