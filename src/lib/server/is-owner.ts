import { env } from '$env/dynamic/private';

export function isInstanceOwner(user: { email?: string } | null | undefined): boolean {
	const ownerEmail = env.POCKETBASE_ADMIN_EMAIL;
	if (!user?.email || !ownerEmail) return false;
	return user.email.toLowerCase() === ownerEmail.toLowerCase();
}
