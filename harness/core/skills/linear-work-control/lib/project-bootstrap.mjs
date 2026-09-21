// Pure Project enrollment planner. It validates caller-supplied evidence and
// returns a deterministic create/reuse proposal; it never calls Linear or Git.
// Input: { request:{productKey,productName,explicitEnrollment,stream?:{requested,key,name?}},
// policy:{workspaceId,teamId,defaultProjectId?}, rootEvidence:{canonicalRoot,gitCommonDir},
// catalog:{complete,paginationComplete,projectOwnershipComplete,workspaceId,teams[],projects[]} }.
// Projects and teams must be complete, fullyRead records; rootEvidence is
// independently measured by the caller and is only checked for known absolute paths.

const ACTIVE = new Set(['backlog', 'planned', 'started']);
const KEY = /^[a-z0-9][a-z0-9-]*$/;
const MARKER = /^productKey: ([a-z0-9][a-z0-9-]*); projectKey: ([a-z0-9][a-z0-9-]*)$/;
const ABSOLUTE = /^\//;
const text = v => typeof v === 'string' && v.trim() !== '';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = (...errors) => ({ ok: false, errors });

/**
 * Plan one product Project enrollment from a complete workspace snapshot.
 * The planner has no side effects and intentionally does not verify Git itself.
 */
export function planProjectBootstrap(input = {}) {
  const errors = [];
  const request = input.request, policy = input.policy, root = input.rootEvidence, catalog = input.catalog;
  if (!object(request) || !KEY.test(request.productKey || '') || !text(request.productName)) errors.push('request productKey/productName invalid');
  if (request?.explicitEnrollment !== true) errors.push('explicit enrollment required');
  if (!object(policy) || !text(policy.workspaceId) || !text(policy.teamId)) errors.push('policy workspace/team required');
  if (!object(root) || !ABSOLUTE.test(root.canonicalRoot || '') || !ABSOLUTE.test(root.gitCommonDir || '') || root.canonicalRoot === 'unknown' || root.gitCommonDir === 'unknown') errors.push('root evidence must be known absolute paths');
  if (!object(catalog) || catalog.complete !== true || catalog.paginationComplete !== true || catalog.projectOwnershipComplete !== true) errors.push('complete project catalog required');
  if (!Array.isArray(catalog?.projects) || !Array.isArray(catalog?.teams)) errors.push('catalog projects/teams required');
  if (catalog?.workspaceId !== policy?.workspaceId) errors.push('catalog workspace mismatch');
  const team = catalog?.teams?.find(t => t?.id === policy?.teamId);
  if (!team || team.fullyRead !== true || team.workspaceId !== policy.workspaceId) errors.push('validated team membership required');
  if (errors.length) return fail(...errors);

  const projects = catalog.projects;
  const ids = new Set();
  const matches = [];
  const ownership = [];
  for (const project of projects) {
    if (!object(project) || !text(project.id) || ids.has(project.id)) { errors.push('project catalog contains duplicate or invalid project'); continue; }
    ids.add(project.id);
    if (project.fullyRead !== true || project.workspaceId !== policy.workspaceId || typeof project.description !== 'string') {
      errors.push('project catalog contains partial, foreign, or invalid project'); continue;
    }
    const firstLine = project.description.split('\n')[0];
    const marker = MARKER.exec(firstLine);
    if (marker) ownership.push({ project, productKey: marker[1], projectKey: marker[2] });
    if (project.teamId === policy.teamId && marker && marker[1] === request.productKey) matches.push({ project, projectKey: marker[2] });
  }
  const stream = request.stream;
  if (stream !== undefined && stream?.requested !== true) return fail('stream enrollment must be explicit');
  if (stream?.requested === true && !KEY.test(stream.key || '')) return fail('requested stream key required');
  const requestedKey = stream?.requested === true ? stream.key : null;
  // Foreign-team ownership is checked across every marker for this product, not
  // only the requested stream: otherwise an explicit stream request would hide an
  // existing ownership under another team and split one product across two teams.
  const productOwnership = ownership.filter(entry => entry.productKey === request.productKey);
  const relevantOwnership = requestedKey === null ? productOwnership : productOwnership.filter(entry => entry.projectKey === requestedKey);
  const duplicateKeys = new Set(relevantOwnership.map(entry => entry.projectKey).filter((key, index, keys) => keys.indexOf(key) !== index));
  if (duplicateKeys.size) errors.push('duplicate ownership key across catalog');
  if (productOwnership.some(entry => entry.project.teamId !== policy.teamId)) errors.push('product ownership exists under another team');
  if (policy.defaultProjectId) {
    const defaultProject = projects.find(project => project.id === policy.defaultProjectId);
    if (!defaultProject || defaultProject.teamId !== policy.teamId || !ownership.some(entry => entry.project.id === policy.defaultProjectId && entry.productKey === request.productKey)) errors.push('policy default Project is foreign or unowned');
  }
  if (policy.defaultProjectId && !projects.some(project => project?.id === policy.defaultProjectId)) errors.push('policy default Project is absent from catalog');
  if (errors.length) return fail(...errors);
  const defaultMatch = !stream?.requested && matches.find(x => x.project.id === policy.defaultProjectId);
  const key = stream?.requested ? stream.key : defaultMatch?.projectKey || 'main';
  const selected = defaultMatch && !stream?.requested ? [defaultMatch] : matches.filter(x => x.projectKey === key);
  if (selected.length > 1) return fail('duplicate or conflicting ownership');
  if (selected.length === 1 && (!ACTIVE.has(String(selected[0].project.statusType || '').toLowerCase()) || selected[0].project.archived === true)) return fail('selected Project is not active');
  if (selected.length === 1) return { ok: true, action: 'reuse', projectId: selected[0].project.id, projectKey: key, write: { api: false, rootRegistration: false } };
  if (matches.length > 0 && !stream?.requested) return fail('existing product Project requires explicit stream for another Project');
  return { ok: true, action: 'create', projectKey: key, name: stream?.name || `${request.productName} — Work`, description: `productKey: ${request.productKey}; projectKey: ${key}`, workspaceId: policy.workspaceId, teamId: policy.teamId, write: { api: false, rootRegistration: false } };
}
