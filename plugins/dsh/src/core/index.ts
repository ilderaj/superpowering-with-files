// swf-dsh decision core public surface (Slice 0).
//
// Pure TypeScript port of the SWF Trio v2 decision core
// (harness/trio/core/routing.mjs + read/store read logic at HEAD 275345d),
// plus the feasibility-report additions: three-state evidence (decision 8)
// and non-SWF session passthrough detection (decision 12).

export * from './constants.js';
export * from './binding.js';
export * from './storeRead.js';
export * from './evidence.js';
export * from './passthrough.js';
export * from './routing.js';
export * from './dispatch.js';
export * from './corleone.js';
