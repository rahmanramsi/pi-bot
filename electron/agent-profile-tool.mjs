export const agentProfileToolName = "get_agent_profile";

export function createAgentProfileTool(profile) {
  const agent = {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    instructions: profile.instructions,
  };

  return {
    name: agentProfileToolName,
    label: "Agent profile",
    description: "Get your own agent ID, name, description, and instructions.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      return {
        content: [{ type: "text", text: JSON.stringify(agent, null, 2) }],
        details: agent,
      };
    },
  };
}
