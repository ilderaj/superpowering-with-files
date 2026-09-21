import test from 'node:test';
import assert from 'node:assert/strict';
import { planLifecycle, verifyLifecycleReceipt } from '../../harness/core/skills/linear-work-control/lib/linear-lifecycle.mjs';
const event={eventId:'e1',taskId:'task',event:'close',trioPath:'/repo/planning/active/task',recordedAt:'2026-09-21'};
const input=()=>({event,task:{taskId:'task',status:'closed',outcome:'done',validationState:'passed',doneWhenSatisfied:true,unresolvedBlockers:0},expected:{issueId:'i',projectId:'p',teamId:'t'},observed:{issueId:'i',projectId:'p',teamId:'t',fullyRead:true,statusType:'started',labels:['nightly','agent-ready','workstream:core']},project:{id:'p',fullyRead:true,statusType:'started',archived:false},childrenComplete:true,children:[]});
test('close removes execution labels and requires completion evidence',()=>{
 const x=input(),r=planLifecycle(x);assert.equal(r.ok,true);assert.equal(r.state,'Done');assert.deepEqual(r.labels,['workstream:core']);
 for(const task of [{...x.task,validationState:'unknown'},{...x.task,unresolvedBlockers:1},{...x.task,status:'active'}]) assert.equal(planLifecycle({...x,task}).ok,false);
 assert.equal(planLifecycle({...x,childrenComplete:false}).ok,false);
 assert.equal(planLifecycle({...x,children:[{fullyRead:true,statusType:'started'}]}).ok,false);
});
test('reopen reuses identity without requeue and closed projects deny',()=>{
 const x=input();x.event={...event,event:'reopen'};x.task={taskId:'task',status:'active'};x.observed.statusType='completed';
 const r=planLifecycle(x);assert.equal(r.issueId,'i');assert.equal(r.state,'Backlog');assert.deepEqual(r.labels,['workstream:core']);
 for(const statusType of ['completed','unknown',undefined]) assert.equal(planLifecycle({...x,project:{...x.project,statusType}}).ok,false);
 assert.equal(planLifecycle({...x,observed:{...x.observed,issueId:'wrong'}}).ok,false);
});
test('archive never reopens or deletes a project; readback must match exact event',()=>{
 const x=input();x.event={...event,event:'archive'};const r=planLifecycle(x);assert.equal(r.ok,true);assert.equal(r.projectMutation,false);
 const observed={...x.observed,statusName:'Done',labels:r.labels};
 assert.equal(verifyLifecycleReceipt({plan:r,pendingEvent:x.event,observed}).ok,true);
 assert.equal(verifyLifecycleReceipt({plan:r,pendingEvent:{...x.event,eventId:'later'},observed}).ok,false);
 assert.equal(verifyLifecycleReceipt({plan:r,pendingEvent:x.event,observed:{...observed,labels:['nightly']}}).ok,false);
});
test('latest local reopen reconciles a close that never reached Linear',()=>{
 const x=input();x.event={...event,event:'reopen'};x.task={taskId:'task',status:'active'};
 assert.equal(planLifecycle(x).state,'Backlog');
 assert.equal(planLifecycle({...x,observed:{...x.observed,statusType:undefined}}).ok,false);
});
