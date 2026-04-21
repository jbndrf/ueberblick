import { env } from '$env/dynamic/private';

export function isInstanceOwner(user: Record<string, unknown> | null | undefined): boolean {
	const ownerEmail = env.POCKETBASE_ADMIN_EMAIL;
	const email = user && typeof user === 'object' ? (user.email as string | undefined) : undefined;
	if (!email || !ownerEmail) return false;
	return email.toLowerCase() === ownerEmail.toLowerCase();
}
