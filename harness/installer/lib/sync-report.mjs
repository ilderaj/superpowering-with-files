export function renderSyncReport(baseReport, extras = {}) {
  return {
    ...baseReport,
    warnings: extras.warnings ?? [],
    details: {
      mode: extras.mode ?? 'apply',
      projections: extras.details?.projections ?? [],
      hooks: extras.details?.hooks ?? []
    }
  };
}
