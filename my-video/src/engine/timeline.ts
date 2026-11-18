export type TransitionType = 'none' | 'fade' | 'whip' | 'flash' | 'smoke' | 'zoom';

export type TimelineScene = {
	id: string;
	anchor: string;
	transition: TransitionType;
	intensity: number;
	chord: number[];
	from: number;
	to: number;
};

export type TimelineHit = {id: string; word: string; kind: string; frame: number};

export type TimelineWord = {text: string; startMs: number; endMs: number};

export type Timeline = {
	storyId: string;
	fps: number;
	durationInFrames: number;
	voiceStartFrame: number;
	scenes: TimelineScene[];
	hits: TimelineHit[];
	words: TimelineWord[];
};

/** Props every scene component receives. Frames are LOCAL: 0 = first visible frame of the scene (incl. transition-in). */
export type SceneProps = {
	/** Visible length of the scene, including transition overlaps. */
	durationInFrames: number;
	/** Local frame of a named story hit, or null if the hit is in another scene. */
	hit: (id: string) => number | null;
	/** Local frame at which a given word is spoken inside this scene (first match), or null. */
	word: (text: string) => number | null;
};

export const TRANSITION_FRAMES: Record<TransitionType, number> = {
	none: 0,
	fade: 16,
	whip: 14,
	flash: 12,
	smoke: 24,
	zoom: 16,
};
