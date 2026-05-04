// Participant-tools availability helper.
//
// Tools are extra surfaces (chat, future: notifications, search) that hang
// off the participant nav under a single "Tools" entry. The entry — and its
// aggregate badge — are derived from the project config and the participant's
// roles. When no tool is available the Tools entry hides entirely.
//
// MVP has exactly one tool (project chat). Additional tools should add a
// `ToolDescriptor` here so the bottom-nav and ToolsSheet pick them up
// automatically.

export interface ToolDescriptor {
	id: 'chat';
	label: string;
	href: string;
	soft: boolean;
	hard: number;
}

interface ProjectChatConfig {
	chat_enabled?: boolean;
	chat_visible_to_roles?: string[] | null;
}

export function isChatMember(
	project: ProjectChatConfig | null | undefined,
	roleIds: string[]
): boolean {
	if (!project || !project.chat_enabled) return false;
	const allowed = Array.isArray(project.chat_visible_to_roles)
		? project.chat_visible_to_roles
		: [];
	if (allowed.length === 0) return true;
	for (const r of roleIds) if (allowed.includes(r)) return true;
	return false;
}
