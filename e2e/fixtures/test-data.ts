export const ADMIN_CREDENTIALS = {
	email: 'admin@example.com',
	password: 'changeme123'
};

export const TEST_PROJECT = {
	name: 'E2E Test Project',
	description: 'Automated test project for seeding'
};

export const TEST_ROLES = [
	{ name: 'Field Worker', description: 'Collects data in the field' },
	{ name: 'Supervisor', description: 'Reviews and approves submissions' },
	{ name: 'Analyst', description: 'Analyzes collected data' }
];

export const TEST_PARTICIPANTS = [
	{ name: 'Alice Johnson', email: 'alice@example.com', roles: ['Field Worker'] },
	{ name: 'Bob Smith', email: 'bob@example.com', roles: ['Supervisor'] },
	{ name: 'Carol Davis', email: 'carol@example.com', roles: ['Analyst'] }
];

export const TEST_WORKFLOW = {
	name: 'Incident Reporting',
	description: 'Complete incident reporting workflow',
	type: 'incident' as const,
	stages: [
		{ type: 'start' as const, name: 'Report Incident', x: 150, y: 200 },
		{ type: 'intermediate' as const, name: 'Review', x: 450, y: 200 },
		{ type: 'intermediate' as const, name: 'Investigate', x: 750, y: 200 },
		{ type: 'end' as const, name: 'Resolved', x: 1050, y: 200 }
	],
	connections: [
		{ from: 'Report Incident', to: 'Review' },
		{ from: 'Review', to: 'Investigate' },
		{ from: 'Review', to: 'Review' }, // Self-loop for edit
		{ from: 'Investigate', to: 'Resolved' }
	],
	forms: [
		{
			connection: { from: null, to: 'Report Incident' }, // Entry connection
			name: 'Incident Report Form',
			fields: [
				{ type: 'short_text', label: 'Incident Title', required: true },
				{ type: 'long_text', label: 'Description', required: true },
				{
					type: 'dropdown',
					label: 'Severity',
					options: ['Low', 'Medium', 'High', 'Critical']
				},
				{ type: 'date', label: 'Incident Date', required: true }
			]
		},
		{
			connection: { from: 'Report Incident', to: 'Review' },
			name: 'Review Notes',
			fields: [
				{ type: 'long_text', label: 'Review Comments', required: true },
				{
					type: 'dropdown',
					label: 'Status',
					options: ['Approved', 'Needs Changes', 'Rejected']
				}
			]
		},
		{
			connection: { from: 'Investigate', to: 'Resolved' },
			name: 'Resolution Form',
			fields: [
				{ type: 'long_text', label: 'Resolution Summary', required: true },
				{ type: 'short_text', label: 'Root Cause', required: false },
				{
					type: 'dropdown',
					label: 'Resolution Type',
					options: ['Fixed', "Won't Fix", 'Duplicate', 'Invalid']
				}
			]
		}
	],
	editTools: [
		{
			connection: { from: 'Review', to: 'Review' }, // Self-loop
			name: 'Edit Incident Details',
			editableFields: ['Incident Title', 'Description', 'Severity']
		}
	]
};
