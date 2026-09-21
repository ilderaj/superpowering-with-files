import { validateBinding } from './linear-work-control.mjs';
import { validateProductConfig, validateTaskBinding } from './linear-product-binding.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const demand = (ok, why) => { if (!ok) throw new Error(why); };
const slug = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

/** Read-only identity adapter. Authenticated normalized issues resolve legacy identifiers.
 * It preserves every mapped child, and never treats a parent comment as a child comment.
 * Marker readiness is measured from fresh full issue reads, never inferred from labels.
 */
export function normalizeProjectBinding({binding, productConfig, policy, issues, selector} = {}) {
 try {
  demand(policy && Array.isArray(policy.projects) && Array.isArray(issues), 'policy and authenticated issues required');
  demand(slug(selector?.taskId), 'explicit taskId required');
  const resolve = (...refs) => {
   const values = refs.filter(v => v !== undefined && v !== null);
   demand(values.length > 0 && values.every(v=>typeof v==='string' && v.length>0), 'issue reference required');
   const matches = values.map(ref => {
    const found=issues.filter(i=>i.issueId===ref || i.identifier===ref);
    demand(found.length===1, 'issue reference missing or ambiguous: '+ref);
    const i=found[0];
    demand(uuid(i.issueId) && i.fullyRead===true && i.workspaceId===policy.workspaceId && i.teamId===policy.teamId, 'issue identity/coverage mismatch');
    return i;
   });
   demand(new Set(matches.map(i=>i.issueId)).size===1, 'conflicting issue references');
   return matches[0];
  };
  let projectId, main, commentId, children=[];
  if (binding?.schemaVersion===1) {
   const checked=validateBinding(binding); demand(checked.ok, 'invalid v1 binding: '+checked.errors.join('; '));
   demand(binding.enabled===true && binding.team.id===policy.teamId, 'disabled or foreign legacy binding');
   demand(binding.workspace.name===policy.workspaceSlug, 'legacy workspace slug mismatch');
   projectId=binding.project?.id;
   const entry=binding.taskMap?.[selector.taskId]; demand(entry, 'unknown taskId');
   main=resolve(entry.issueId,entry.uuid,entry.identifier);
   const goal=resolve(binding.goalIssue?.id,binding.goalIssue?.identifier);
   const own=entry.statusCommentId;
   commentId=own || (main.issueId===goal.issueId ? binding.statusComment?.id : undefined);
   if (own && main.issueId===goal.issueId && binding.statusComment?.id) demand(own===binding.statusComment.id,'conflicting status comments');
   const keys=new Set([...Object.keys(entry.subIssues||{}),...Object.keys(entry.subIssueIds||{})]);
   for(const key of keys) {
    demand(slug(key), 'invalid slice key');
    const raw=entry.subIssues?.[key];
    const refs=typeof raw==='object' && raw!==null ? [raw.issueId,raw.id,raw.uuid,raw.identifier] : [raw];
    children.push({sliceKey:key,issue:resolve(...refs,entry.subIssueIds?.[key]),commentId:undefined});
   }
  } else {
   const pc=validateProductConfig(productConfig), tb=validateTaskBinding(binding);
   demand(pc.ok && tb.ok,'invalid v2 product/task schema');
   demand(binding.productKey===policy.productKey && productConfig.productKey===policy.productKey && binding.taskId===selector.taskId,'v2 product/task mismatch');
   for(const field of ['workspaceId','teamId']) demand(binding[field]===policy[field] && productConfig[field]===policy[field],'v2 scope mismatch');
   demand(productConfig.allowedProjectIds.includes(binding.projectId),'v2 project outside config');
   projectId=binding.projectId; main=resolve(binding.issueId); commentId=binding.statusCommentId;
  }
  demand(uuid(projectId) && policy.projects.some(p=>p.id===projectId),'project outside policy');
  const all=[{issue:main,commentId},...children], ids=new Set();
  const mappings=all.map(({issue,sliceKey,commentId})=>{
   demand(issue.projectId===projectId,'bound issue moved to another project');
   demand(!ids.has(issue.issueId),'duplicate parent/child UUID'); ids.add(issue.issueId);
   if(sliceKey) demand(issue.parent?.issueId===main.issueId,'child parent mismatch');
   if(commentId!==undefined) demand(uuid(commentId),'invalid comment UUID');
   const taskMarker=`harness-task: ${policy.productKey}/${selector.taskId}${sliceKey?'/'+sliceKey:''}`;
   const markerReady=issue.taskMarker===taskMarker;
   const expected={issueId:issue.issueId,projectId,teamId:policy.teamId,...(commentId?{commentId}:{})};
   return {taskId:selector.taskId,...(sliceKey?{sliceKey}:{}),expected,taskMarker,markerReady,recoverable:true};
  });
  const chosen=selector.sliceKey===undefined ? mappings[0] : mappings.find(m=>m.sliceKey===selector.sliceKey);
  demand(chosen,'unknown sliceKey');
  if(selector.issueId!==undefined) demand(chosen.expected.issueId===selector.issueId,'explicit issue selection mismatch');
  return {ok:true,selected:chosen,mappings};
 } catch(error) {return {ok:false,decision:'DENY',error:error.message};}
}
