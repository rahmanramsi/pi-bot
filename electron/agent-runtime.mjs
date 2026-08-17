export async function refreshAgentRuntime({
  agentId,
  currentWorkspace,
  activeRuntime,
  closeAgentSessions,
  createSession,
  bootstrap,
}) {
  const activeRuntimeForAgent = activeRuntime?.agentId === agentId ? activeRuntime : undefined;
  const workspaceOverride = activeRuntimeForAgent && activeRuntimeForAgent.workspace !== currentWorkspace
    ? activeRuntimeForAgent.workspace
    : undefined;

  await closeAgentSessions(agentId);
  if (!activeRuntimeForAgent) return bootstrap();

  const options = { agentId };
  if (workspaceOverride !== undefined) options.workspaceOverride = workspaceOverride;
  return createSession(options);
}
