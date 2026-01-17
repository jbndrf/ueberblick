import PocketBase from 'pocketbase';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

export interface WorkflowSeedResult {
	workflowId: string;
	stages: Map<string, string>; // name -> id
	connections: Map<string, string>; // "from->to" -> id
	forms: Map<string, string>; // name -> id
	entryConnectionId: string;
}

export async function seedWorkflow(
	pb: PocketBase,
	projectId: string,
	roles: { id: string; name: string }[]
): Promise<WorkflowSeedResult> {
	// Get role IDs by name
	const getRoleId = (name: string) => roles.find((r) => r.name === name)?.id;

	// 1. Create workflow (entry_allowed_roles starts empty - will sync later)
	const workflow = await pb.collection('workflows').create({
		project_id: projectId,
		name: 'Permission Test Workflow',
		description: 'Tests role-based access control',
		workflow_type: 'incident',
		is_active: true,
		entry_allowed_roles: []
	});
	console.log(`Created workflow: ${workflow.id}`);

	// 2. Create stages
	const stages = new Map<string, string>();

	const startStage = await pb.collection('workflow_stages').create({
		workflow_id: workflow.id,
		stage_name: 'Submit Report',
		stage_type: 'start',
		position_x: 150,
		position_y: 200,
		visible_to_roles: [] // All roles can see
	});
	stages.set('Submit Report', startStage.id);
	console.log(`Created stage: Submit Report (${startStage.id})`);

	const reviewStage = await pb.collection('workflow_stages').create({
		workflow_id: workflow.id,
		stage_name: 'Review',
		stage_type: 'intermediate',
		position_x: 450,
		position_y: 200,
		visible_to_roles: [getRoleId('Supervisor'), getRoleId('Analyst')].filter(Boolean) // Field Worker can't see
	});
	stages.set('Review', reviewStage.id);
	console.log(`Created stage: Review (${reviewStage.id}) - visible to Supervisor, Analyst only`);

	const endStage = await pb.collection('workflow_stages').create({
		workflow_id: workflow.id,
		stage_name: 'Resolved',
		stage_type: 'end',
		position_x: 750,
		position_y: 200,
		visible_to_roles: []
	});
	stages.set('Resolved', endStage.id);
	console.log(`Created stage: Resolved (${endStage.id})`);

	// 3. Create connections
	const connections = new Map<string, string>();

	// Entry connection (from_stage_id = null) - Supervisor only initially
	const supervisorRoleId = getRoleId('Supervisor');
	const entryConn = await pb.collection('workflow_connections').create({
		workflow_id: workflow.id,
		from_stage_id: null, // This makes it an entry connection
		to_stage_id: startStage.id,
		action_name: 'entry',
		allowed_roles: supervisorRoleId ? [supervisorRoleId] : [] // Only Supervisor can create initially
	});
	connections.set('entry->Submit Report', entryConn.id);
	console.log(`Created entry connection (${entryConn.id}) - Supervisor only`);

	// Start -> Review
	const submitToReview = await pb.collection('workflow_connections').create({
		workflow_id: workflow.id,
		from_stage_id: startStage.id,
		to_stage_id: reviewStage.id,
		action_name: 'submit-to-review',
		allowed_roles: [] // All can trigger
	});
	connections.set('Submit Report->Review', submitToReview.id);
	console.log(`Created connection: Submit Report -> Review`);

	// Review -> Resolved
	const reviewToResolved = await pb.collection('workflow_connections').create({
		workflow_id: workflow.id,
		from_stage_id: reviewStage.id,
		to_stage_id: endStage.id,
		action_name: 'review-to-resolved',
		allowed_roles: [getRoleId('Supervisor'), getRoleId('Analyst')].filter(Boolean) // Not Field Worker
	});
	connections.set('Review->Resolved', reviewToResolved.id);
	console.log(`Created connection: Review -> Resolved - Supervisor, Analyst only`);

	// 4. Sync entry_allowed_roles to workflow
	await pb.collection('workflows').update(workflow.id, {
		entry_allowed_roles: entryConn.allowed_roles
	});
	console.log(`Synced entry_allowed_roles to workflow`);

	// 5. Create entry form
	const forms = new Map<string, string>();

	const entryForm = await pb.collection('tools_forms').create({
		workflow_id: workflow.id,
		connection_id: entryConn.id,
		name: 'Initial Report Form',
		description: 'Fill out to start a report'
	});
	forms.set('Initial Report Form', entryForm.id);
	console.log(`Created form: Initial Report Form (${entryForm.id})`);

	// 6. Add form fields
	await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Report Title',
		field_type: 'short_text',
		is_required: true,
		field_order: 1
	});
	console.log(`Created field: Report Title`);

	await pb.collection('tools_form_fields').create({
		form_id: entryForm.id,
		field_label: 'Description',
		field_type: 'long_text',
		is_required: true,
		field_order: 2
	});
	console.log(`Created field: Description`);

	return {
		workflowId: workflow.id,
		stages,
		connections,
		forms,
		entryConnectionId: entryConn.id
	};
}

// Helper to update entry connection roles and sync to workflow
export async function updateEntryRoles(
	pb: PocketBase,
	workflowId: string,
	entryConnectionId: string,
	roleIds: string[]
): Promise<void> {
	await pb.collection('workflow_connections').update(entryConnectionId, {
		allowed_roles: roleIds
	});
	await pb.collection('workflows').update(workflowId, {
		entry_allowed_roles: roleIds
	});
	console.log(`Updated entry roles to: ${roleIds.join(', ')}`);
}

// Helper to update stage visibility
export async function updateStageVisibility(
	pb: PocketBase,
	stageId: string,
	roleIds: string[]
): Promise<void> {
	await pb.collection('workflow_stages').update(stageId, {
		visible_to_roles: roleIds
	});
	console.log(`Updated stage ${stageId} visibility to: ${roleIds.join(', ') || 'all'}`);
}
