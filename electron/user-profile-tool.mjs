export const USER_PROFILE_TOOL_NAME = "get_user_profile";

function populatedProfile(profile) {
  const result = {};
  if (typeof profile?.avatar === "string" && profile.avatar.trim()) result.avatar = profile.avatar.trim();
  if (typeof profile?.name === "string" && profile.name.trim()) result.name = profile.name.trim();
  if (typeof profile?.about === "string" && profile.about.trim()) result.about = profile.about.trim();
  return result;
}

export function createUserProfileTool(readProfile) {
  if (typeof readProfile !== "function") throw new Error("A user profile reader is required.");
  return {
    name: USER_PROFILE_TOOL_NAME,
    label: "User profile",
    description: "Read the current app-owned profile for the person using Pi Bot. This tool cannot change the profile.",
    promptSnippet: "Read the user's current app-owned profile",
    promptGuidelines: [
      "Use get_user_profile when you need to confirm the user's current name, avatar, background, goals, preferences, or working style.",
    ],
    parameters: { type: "object", properties: {}, additionalProperties: false },
    executionMode: "parallel",
    async execute() {
      const profile = populatedProfile(readProfile());
      const hasProfile = Object.keys(profile).length > 0;
      return {
        content: [{ type: "text", text: hasProfile ? JSON.stringify(profile, null, 2) : "No user profile has been set." }],
        details: { profile },
      };
    },
  };
}
