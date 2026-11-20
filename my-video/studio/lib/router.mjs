// Hybrid scene router (spec §5). Picks the best available production method per
// scene, in priority order, and records WHY. A user-locked method is never changed;
// if its provider is missing the scene is reported as blocked instead of being
// silently swapped for something else.
import {VISUAL_TYPES} from '../../src/cinematic/schema.ts';

export const methodAvailability = (method, caps, scene) => {
	switch (method) {
		case 'ai_video':
			return caps.video.available ? {ok: true} : {ok: false, why: 'no AI video provider is available (ComfyUI Wan 2.2 / LTX or an official repo CLI)'};
		case 'ai_image_animated':
			return caps.image.available ? {ok: true} : {ok: false, why: 'no AI image provider is available (ComfyUI checkpoint or A1111)'};
		case 'procedural_3d':
			return {ok: true};
		case 'blender_3d':
			return caps.blender.available ? {ok: true} : {ok: false, why: 'Blender is not installed / not found'};
		case 'user_asset':
			return scene.asset && scene.asset.source === 'upload' ? {ok: true} : {ok: false, why: 'no asset has been imported for this scene'};
		default:
			return {ok: false, why: `unknown method ${method}`};
	}
};

/** @returns {{visual_type: string, reason: string, blocked: string|null}} */
export const routeScene = (scene, caps, characters = []) => {
	if (scene.visual_type_locked) {
		const a = methodAvailability(scene.visual_type, caps, scene);
		return {visual_type: scene.visual_type, reason: `Chosen by you (${VISUAL_TYPES[scene.visual_type].label}).`, blocked: a.ok ? null : `Locked method unavailable: ${a.why}.`};
	}
	const why = [];
	// 1. AI video — only if a model can produce this shot.
	if (caps.video.available) {
		const tooLong = scene.duration > caps.video.max_seconds + 0.01;
		const needsRef = scene.characters.some((id) => characters.find((c) => c.id === id)?.reference_images?.length);
		const canStartFromImage = caps.video.i2v && caps.image.available;
		if (tooLong) why.push(`AI video skipped: scene is ${scene.duration}s but ${caps.video.provider} makes ≤${caps.video.max_seconds}s clips (shorten the scene to use it).`);
		else if (!caps.video.t2v && !canStartFromImage) why.push('AI video skipped: provider is image-to-video only and no image provider is available for the start frame.');
		else if (needsRef && !canStartFromImage) why.push('AI video skipped: recurring characters need a reference-conditioned start frame, which needs an image provider.');
		else return {visual_type: 'ai_video', reason: `AI video via ${caps.video.provider}${needsRef || (!caps.video.t2v && canStartFromImage) ? ' (image-to-video from a consistent start frame)' : ''}.`, blocked: null};
	} else why.push('AI video: no provider available.');
	// 2. AI image + 3D camera.
	if (caps.image.available) return {visual_type: 'ai_image_animated', reason: `${why.join(' ')} AI image via ${caps.image.provider}, animated with the 3D camera rig.`.trim(), blocked: null};
	why.push('AI image: no provider available.');
	// 3. Procedural 3D — always available for every registered environment.
	return {visual_type: 'procedural_3d', reason: `${why.join(' ')} Procedural 3D environment "${scene.environment}" rendered by the Three.js engine.`.trim(), blocked: null};
};
