export function decideWatchdogAction({
  deadlineMissed,
  probeSent = false,
  graceExpired = false,
  workerResponsive = false,
  sessionAvailable = true,
  bindingProbe = 'unknown',
  contextProbe = 'unknown',
  rebindAttempted = false,
  credibleMilestone = false,
  extensionAlreadyGranted = false
}) {
  if (!deadlineMissed) {
    return { action: 'none' };
  }

  if (!probeSent) {
    return { action: 'probe' };
  }

  if (!graceExpired) {
    return { action: 'wait_grace' };
  }

  if (!sessionAvailable) {
    return { action: 'respawn_recommended', reason: 'session_unavailable' };
  }

  if (workerResponsive
      && bindingProbe === 'passed'
      && contextProbe === 'passed'
      && credibleMilestone
      && !extensionAlreadyGranted) {
    return { action: 'extend_deadline' };
  }

  if (bindingProbe === 'failed' || contextProbe === 'failed') {
    return rebindAttempted
      ? { action: 'respawn_recommended', reason: 'integrity_probe_failed_after_rebind' }
      : { action: 'restore_rebind', reason: 'integrity_probe_failed' };
  }

  if (workerResponsive && !credibleMilestone) {
    return { action: 'stale', reason: 'credible_milestone_missing' };
  }

  if (workerResponsive && extensionAlreadyGranted) {
    return { action: 'stale', reason: 'extension_already_granted' };
  }

  return { action: 'stale', reason: 'worker_unresponsive_after_grace' };
}
