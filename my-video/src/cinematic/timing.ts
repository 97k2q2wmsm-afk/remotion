// Timing shared by the renderer (visuals) and the studio server (sound design), so a
// sound and the picture event it belongs to always land on the same frame.
import type {EnvironmentId} from './schema';

/** How many explosion spots each procedural environment provides. */
export const EXPLOSION_SPOTS: Record<EnvironmentId, number> = {
	forest: 2,
	mountains: 1,
	city: 1,
	medieval_village: 1,
	ancient_roman_city: 1,
	modern_street: 1,
	futuristic_city: 1,
	battlefield: 3,
	interior: 1,
	ocean_coast: 1,
};

/** Seconds (scene-relative) at which explosions detonate. */
export const explosionTimes = (duration: number, count: number) => Array.from({length: count}, (_, i) => duration * (0.22 + (i * 0.6) / Math.max(1, count)));
