/** Pure lifecycle proposals. Caller must run workspace/root/target guards before MCP writes. */
const runtime = new Set(['nightly','agent-ready','agent-running','ready-review','waiting-human','blocked','agent-failed']);
const terminal = new Set(['completed','canceled','cancelled']);
const need = (condition,message) => {if(!condition) throw new Error(message);};
const same = (a,b) => ['issueId','projectId','teamId'].every(key=>typeof a?.[key]==='string' && a[key] && a[key]===b?.[key]);
export function planLifecycle({event,task,expected,observed,project,childrenComplete,children}={}) {
 try {
  need(event?.eventId && ['close','archive','reopen'].includes(event.event),'invalid lifecycle event');
  need(task?.taskId===event.taskId,'stable task identity mismatch');
  need(same(expected,observed) && observed.fullyRead===true,'issue identity/coverage mismatch');
  need(Array.isArray(observed.labels) && observed.labels.every(x=>typeof x==='string'),'label coverage unknown');
  let state;
  if(event.event==='reopen') {
   need(task.status==='active','reopen requires active Trio');
   need(['triage','backlog','unstarted','started','completed','canceled','cancelled'].includes(observed.statusType),'observed issue state unknown');
   need(project?.id===expected.projectId && project.fullyRead===true && project.archived!==true && ['backlog','planned','started'].includes(project.statusType),'closed/unknown project requires explicit setup repair');
   state='Backlog';
  } else {
   need(task.status==='closed','close/archive requires closed Trio');
   need(childrenComplete===true && Array.isArray(children),'child coverage unknown');
   need(children.every(child=>child.fullyRead===true && terminal.has(child.statusType)),'unfinished children require separate scoped reconciliation');
   if(task.outcome==='canceled') state='Canceled';
   else {
    need(task.outcome==='done' && task.validationState==='passed' && task.doneWhenSatisfied===true && task.unresolvedBlockers===0,'completion evidence missing');
    state='Done';
   }
  }
  return {ok:true,planOnly:true,eventId:event.eventId,event:event.event,taskId:event.taskId,...expected,state,labels:observed.labels.filter(label=>!runtime.has(label)),projectMutation:false};
 } catch(error) {return {ok:false,error:error.message};}
}
export function verifyLifecycleReceipt({plan,pendingEvent,observed}={}) {
 try {
  need(plan?.ok===true && pendingEvent?.eventId===plan.eventId && pendingEvent.taskId===plan.taskId && pendingEvent.event===plan.event,'stale lifecycle receipt');
  need(same(plan,observed) && observed.fullyRead===true,'receipt identity/coverage mismatch');
  need(observed.statusName===plan.state,'state readback mismatch');
  need(Array.isArray(observed.labels) && JSON.stringify([...observed.labels].sort())===JSON.stringify([...plan.labels].sort()),'label readback mismatch');
  return {ok:true,eventId:plan.eventId};
 } catch(error) {return {ok:false,error:error.message};}
}
