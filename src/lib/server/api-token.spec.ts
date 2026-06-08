import { describe, it, expect } from 'vitest';
import { hashToken, generateRawToken } from './api-token';
import { createHash } from 'node:crypto';

describe('hashToken', () => {
	it('is sha256 hex of the raw token (deterministic, 64 chars)', () => {
		const raw = 'ubk_example';
		const h = hashToken(raw);
		expect(h).toBe(createHash('sha256').update(raw, 'utf8').digest('hex'));
		expect(h).toHaveLength(64);
		expect(hashToken(raw)).toBe(h);
	});
});

describe('generateRawToken', () => {
	it('produces a ubk_-prefixed token whose hash and last_four match', () => {
		const { raw, hash, lastFour } = generateRawToken();
		expect(raw.startsWith('ubk_')).toBe(true);
		expect(raw.length).toBeGreaterThan(20);
		expect(hash).toBe(hashToken(raw));
		expect(lastFour).toBe(raw.slice(-4));
	});

	it('is unique across calls', () => {
		const a = generateRawToken();
		const b = generateRawToken();
		expect(a.raw).not.toBe(b.raw);
		expect(a.hash).not.toBe(b.hash);
	});
});
