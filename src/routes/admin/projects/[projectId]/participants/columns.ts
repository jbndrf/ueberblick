import {
	participantsEmail,
	participantsLastActive,
	participantsName,
	participantsPhone,
	participantsRoles,
	participantsStatus,
	participantsToken
} from '$lib/paraglide/messages';

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
	name: participantsName?.() ?? 'Name',
	email: participantsEmail?.() ?? 'Email',
	phone: participantsPhone?.() ?? 'Phone',
	token: participantsToken?.() ?? 'Access Token',
	roles: participantsRoles?.() ?? 'Roles',
	status: participantsStatus?.() ?? 'Status',
	lastActive: participantsLastActive?.() ?? 'Last Active'
};
