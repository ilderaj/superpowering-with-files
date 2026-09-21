import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {guardTarget} from '../../../harness/core/skills/linear-work-control/lib/project-routing.mjs';
import {planLifecycle,verifyLifecycleReceipt} from '../../../harness/core/skills/linear-work-control/lib/linear-lifecycle.mjs';
const [mode,prefix]=process.argv.slice(2), base='reports/audits/project-lifecycle-20260921/', bindingPath='reports/linear/project-lifecycle-repair-20260921/linear.json';
const read=p=>JSON.parse(fs.readFileSync(p));const binding=read(bindingPath), policy=read('.harness/linear/routing.json');
const norm=i=>({issueId:i.uuid,projectId:i.projectId,teamId:i.teamId,workspaceId:policy.workspaceId,fullyRead:true,parent:null,statusType:i.statusType,statusName:i.status,labels:i.labels});
if(mode==='plan') {
 const live=read(base+prefix+'-before.json');if(live.workspace.id!==policy.workspaceId || live.children.hasNextPage!==false || live.children.issues.length) throw Error('workspace/child guard');
 const observed=norm(live.issue),expected={issueId:binding.goalIssue.id,projectId:binding.project.id,teamId:binding.team.id};
 const guard=await guardTarget({policy,expected,observed,repoPath:process.cwd()});if(!guard.ok)throw Error(JSON.stringify(guard));
 const event=binding.sync.lifecycle,md=fs.readFileSync(event.trioPath+'/task_plan.md','utf8');const current=md.match(/^## Current State\s*$([\s\S]*?)(?=^## |$)/m); // use full section below
 const section=md.split('## Current State')[1]?.split('\n## ')[0];const status=section?.match(/^Status:\s*(\w+)/m)?.[1];
 const task={taskId:event.taskId,status,outcome:'done',validationState:'passed',doneWhenSatisfied:true,unresolvedBlockers:0};
 const plan=planLifecycle({event,task,expected,observed,project:{id:live.project.id,fullyRead:true,statusType:live.project.status.type,archived:!!live.project.archivedAt},childrenComplete:true,children:[]});
 if(!plan.ok)throw Error(JSON.stringify(plan));fs.writeFileSync(base+prefix+'-plan.json',JSON.stringify(plan,null,2));console.log(JSON.stringify(plan));
} else {
 const plan=read(base+prefix+'-plan.json'),observed=norm(read(base+prefix+'-after.json'));const result=verifyLifecycleReceipt({plan,pendingEvent:binding.sync.lifecycle,observed});if(!result.ok)throw Error(JSON.stringify(result));
 const python="import sys,json,os;sys.path.insert(0,os.path.expanduser('~/.agents/skills/planning-with-files/scripts'));from linear_lifecycle_sync import ack_lifecycle_sync;print(json.dumps(ack_lifecycle_sync(sys.argv[1],sys.argv[2],sys.argv[3])))";
 const ack=JSON.parse(execFileSync('python3',['-c',python,process.cwd(),plan.taskId,plan.eventId],{encoding:'utf8'}));if(!ack.ok)throw Error(JSON.stringify(ack));
 const updated=read(bindingPath);updated.taskMap[plan.taskId].state=plan.state==='Done'?'done':'planned';fs.writeFileSync(bindingPath,JSON.stringify(updated,null,2)+'\n');console.log(JSON.stringify({receipt:result,ack}));
}
