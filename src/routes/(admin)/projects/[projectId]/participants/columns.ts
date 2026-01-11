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
