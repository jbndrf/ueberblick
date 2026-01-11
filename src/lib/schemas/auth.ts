/**
 * Authentication form schemas
 */

import { z } from 'zod';

export const loginSchema = z.object({
	email: z.string().email('Invalid email address'),
	password: z.string().min(6, 'Password must be at least 6 characters'),
	remember: z.boolean().default(false)
});

export type LoginSchema = typeof loginSchema;

export const participantLoginSchema = z.object({
	token: z.string().min(1, 'Token is required').trim()
});

export type ParticipantLoginSchema = typeof participantLoginSchema;
