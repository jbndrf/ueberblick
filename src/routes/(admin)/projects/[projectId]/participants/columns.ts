import * as m from '$lib/paraglide/messages';

export type Participant = {
	id: string;
	name: string;
	email?: string | null;
	phone?: string | null;
	token: string;
	is_active: boolean;
	role_id?: string[] | null;
	participant_roles?: Array<{ id: string; name: string }>;
	project_id: string;
	created: string;
	metadata?: Record<string, any>;
};

export const participantsColumnHeaders = {
	name: m.participantsName?.() ?? 'Name',
	email: m.participantsEmail?.() ?? 'Email',
	phone: m.participantsPhone?.() ?? 'Phone',
	token: m.participantsToken?.() ?? 'Access Token',
	roles: m.participantsRoles?.() ?? 'Roles',
	status: m.participantsStatus?.() ?? 'Status',
	lastActive: m.participantsLastActive?.() ?? 'Last Active'
};
