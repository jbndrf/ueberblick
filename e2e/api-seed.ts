import PocketBase from 'pocketbase';
import {
	ADMIN_CREDENTIALS,
	TEST_PROJECT,
	TEST_ROLES,
	TEST_PARTICIPANTS
} from './fixtures/test-data';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://localhost:8090';

interface SeedResult {
	projectId: string;
	roles: Array<{ id: string; name: string }>;
	participants: Array<{ id: string; name: string; token: string }>;
}

function generateToken(): string {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export async function seedDatabase(): Promise<SeedResult> {
	const pb = new PocketBase(PB_URL);

	// Authenticate as admin
	await pb.collection('users').authWithPassword(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);

	const userId = pb.authStore.record?.id;
	if (!userId) {
		throw new Error('Failed to get authenticated user ID');
	}

	// Create project with unique name
	const uniqueName = `${TEST_PROJECT.name} ${Date.now().toString().slice(-6)}`;
	const project = await pb.collection('projects').create({
		name: uniqueName,
		description: TEST_PROJECT.description,
		owner_id: userId,
		is_active: true
	});
	console.log(`Created project: ${project.id} (${uniqueName})`);

	// Create roles
	const createdRoles: Array<{ id: string; name: string }> = [];
	for (const role of TEST_ROLES) {
		const created = await pb.collection('roles').create({
			project_id: project.id,
			name: role.name,
			description: role.description
		});
		createdRoles.push({ id: created.id, name: created.name });
		console.log(`Created role: ${created.name}`);
	}

	// Create participants with role assignments
	const createdParticipants: Array<{ id: string; name: string; token: string }> = [];
	const timestamp = Date.now().toString().slice(-6); // For unique emails

	for (const participant of TEST_PARTICIPANTS) {
		// Find role IDs for this participant
		const roleIds = participant.roles
			.map(roleName => createdRoles.find(r => r.name === roleName)?.id)
			.filter((id): id is string => !!id);

		const token = generateToken();
		// Make email unique by adding timestamp before @
		const uniqueEmail = participant.email.replace('@', `+${timestamp}@`);

		try {
			const created = await pb.collection('participants').create({
				project_id: project.id,
				name: participant.name,
				email: uniqueEmail,
				password: token, // Token is used as both identity AND password for login
				passwordConfirm: token,
				token: token,
				is_active: true,
				role_id: roleIds
			});
			createdParticipants.push({ id: created.id, name: created.name, token });
			console.log(`Created participant: ${created.name} (roles: ${participant.roles.join(', ')})`);
		} catch (error: any) {
			console.error(`Failed to create participant ${participant.name}:`, error.response?.data || error.message);
			throw error;
		}
	}

	return {
		projectId: project.id,
		roles: createdRoles,
		participants: createdParticipants
	};
}

export async function cleanupProject(projectId: string): Promise<void> {
	const pb = new PocketBase(PB_URL);

	await pb.collection('users').authWithPassword(
		ADMIN_CREDENTIALS.email,
		ADMIN_CREDENTIALS.password
	);

	// Delete participants first (due to foreign key constraints)
	const participants = await pb.collection('participants').getFullList({
		filter: `project_id = "${projectId}"`
	});
	for (const p of participants) {
		await pb.collection('participants').delete(p.id);
	}

	// Delete roles
	const roles = await pb.collection('roles').getFullList({
		filter: `project_id = "${projectId}"`
	});
	for (const r of roles) {
		await pb.collection('roles').delete(r.id);
	}

	// Delete project
	await pb.collection('projects').delete(projectId);
	console.log(`Cleaned up project: ${projectId}`);
}

// Run if called directly: npx tsx e2e/api-seed.ts
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
	seedDatabase()
		.then((result) => {
			console.log('\nSeeding complete!');
			console.log(`Project ID: ${result.projectId}`);
			console.log(`Roles: ${result.roles.length}`);
			console.log(`Participants: ${result.participants.length}`);
			process.exit(0);
		})
		.catch((error) => {
			console.error('Seeding failed:', error);
			process.exit(1);
		});
}
