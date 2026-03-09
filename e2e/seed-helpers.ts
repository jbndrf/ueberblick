import PocketBase from 'pocketbase';

export const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

export function generateToken(): string {
	const timestamp = Date.now().toString(36);
	const randomPart = Math.random().toString(36).substring(2, 15);
	const additionalRandom = Math.random().toString(36).substring(2, 8);
	const array = new Uint8Array(4);
	crypto.getRandomValues(array);
	const cryptoRandom = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${timestamp}-${randomPart}-${additionalRandom}-${cryptoRandom}`;
}

/**
 * Create a PocketBase client authenticated as a participant.
 * Participants auth with their token as both identity and password.
 */
export async function createParticipantClient(token: string): Promise<PocketBase> {
	const pb = new PocketBase(PB_URL);
	await pb.collection('participants').authWithPassword(token, token);
	return pb;
}

/**
 * Replicate the real app's entry flow:
 * 1. Create workflow_instances at the start stage
 * 2. Create workflow_instance_tool_usage with action='instance_created'
 * 3. Create workflow_instance_field_values one by one (triggers on_field_change hooks)
 *
 * Field values are created in the order given -- put trigger fields last
 * so dependent automations have their inputs available.
 */
export async function submitEntryForm(
	pb: PocketBase,
	opts: {
		workflowId: string;
		startStageId: string;
		participantId: string;
		location: { lat: number; lon: number };
		fieldValues: Array<{ key: string; value: string }>;
	}
): Promise<{ instanceId: string; toolUsageId: string }> {
	const instance = await pb.collection('workflow_instances').create({
		workflow_id: opts.workflowId,
		current_stage_id: opts.startStageId,
		status: 'active',
		created_by: opts.participantId,
		location: opts.location,
		files: []
	});

	const toolUsage = await pb.collection('workflow_instance_tool_usage').create({
		instance_id: instance.id,
		stage_id: opts.startStageId,
		executed_by: opts.participantId,
		executed_at: new Date().toISOString(),
		metadata: {
			action: 'instance_created',
			location: opts.location,
			created_fields: opts.fieldValues.map((fv) => fv.key)
		}
	});

	for (const fv of opts.fieldValues) {
		await pb.collection('workflow_instance_field_values').create({
			instance_id: instance.id,
			field_key: fv.key,
			value: fv.value,
			stage_id: opts.startStageId,
			created_by_action: toolUsage.id
		});
	}

	return { instanceId: instance.id, toolUsageId: toolUsage.id };
}

/**
 * Replicate the real app's transition flow:
 * 1. If formFields provided: create tool_usage with action='form_fill',
 *    then create field_values for each form field
 * 2. Create tool_usage with action='stage_transition'
 * 3. Update workflow_instances.current_stage_id (triggers on_transition hooks)
 */
export async function executeTransition(
	pb: PocketBase,
	opts: {
		instanceId: string;
		fromStageId: string;
		toStageId: string;
		connectionId: string;
		participantId: string;
		formFields?: Array<{ key: string; value: string }>;
	}
): Promise<void> {
	if (opts.formFields && opts.formFields.length > 0) {
		const formUsage = await pb.collection('workflow_instance_tool_usage').create({
			instance_id: opts.instanceId,
			stage_id: opts.toStageId,
			executed_by: opts.participantId,
			executed_at: new Date().toISOString(),
			metadata: {
				action: 'form_fill',
				created_fields: opts.formFields.map((fv) => fv.key)
			}
		});

		for (const fv of opts.formFields) {
			await pb.collection('workflow_instance_field_values').create({
				instance_id: opts.instanceId,
				field_key: fv.key,
				value: fv.value,
				stage_id: opts.toStageId,
				created_by_action: formUsage.id
			});
		}
	}

	await pb.collection('workflow_instance_tool_usage').create({
		instance_id: opts.instanceId,
		stage_id: opts.fromStageId,
		executed_by: opts.participantId,
		executed_at: new Date().toISOString(),
		metadata: {
			action: 'stage_transition',
			from_stage_id: opts.fromStageId,
			to_stage_id: opts.toStageId,
			connection_id: opts.connectionId
		}
	});

	await pb.collection('workflow_instances').update(opts.instanceId, {
		current_stage_id: opts.toStageId
	});
}

/**
 * Replicate the real app's stage form fill (no transition):
 * 1. Create tool_usage with action='form_fill'
 * 2. Create workflow_instance_field_values one by one (triggers on_field_change hooks)
 */
export async function fillStageForm(
	pb: PocketBase,
	opts: {
		instanceId: string;
		stageId: string;
		participantId: string;
		fieldValues: Array<{ key: string; value: string }>;
	}
): Promise<void> {
	const toolUsage = await pb.collection('workflow_instance_tool_usage').create({
		instance_id: opts.instanceId,
		stage_id: opts.stageId,
		executed_by: opts.participantId,
		executed_at: new Date().toISOString(),
		metadata: {
			action: 'form_fill',
			created_fields: opts.fieldValues.map((fv) => fv.key)
		}
	});

	for (const fv of opts.fieldValues) {
		await pb.collection('workflow_instance_field_values').create({
			instance_id: opts.instanceId,
			field_key: fv.key,
			value: fv.value,
			stage_id: opts.stageId,
			created_by_action: toolUsage.id
		});
	}
}
