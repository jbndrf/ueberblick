let unzipper: typeof import('unzipper') | null = null;

export async function getUnzipper() {
	if (!unzipper) {
		unzipper = await import('unzipper');
	}
	return unzipper;
}
