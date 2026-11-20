// Assembles one procedural 3D shot: environment + lighting + characters + effects +
// animated camera + cinematic post-processing. Everything derives from the scene
// record and the current frame.
import {Bloom, BrightnessContrast, DepthOfField, EffectComposer, HueSaturation, Noise, ToneMapping, Vignette} from '@react-three/postprocessing';
import {useThree} from '@react-three/fiber';
import {useCurrentFrame, useDelayRender} from 'remotion';
import {ToneMappingMode} from 'postprocessing';
import React, {useLayoutEffect, useRef} from 'react';
import type {Character, Scene, StyleId} from '../schema';
import {STYLES} from '../schema';
import {cameraPose, Stage, Vec3} from './camera';
import {Character3D, WALK_SPEED} from './Character3D';
import {Clouds, Dust, Explosions, Fire, GroundFog, LightShafts, Rain, Smoke, Snow, Sparks} from './effects';
import {ENV_DEFS} from './environments';
import {Lighting, lightAt, sunDirection} from './Lighting';
import {EXPLOSION_SPOTS, explosionTimes} from '../timing';

export type Quality = {particles: number; shadowMap: number; dofResolution: number; final: boolean};

const CameraRig: React.FC<{position: Vec3; target: Vec3; fov: number; roll: number}> = ({position, target, fov, roll}) => {
	const camera = useThree((s) => s.camera) as import('three').PerspectiveCamera;
	useLayoutEffect(() => {
		camera.position.set(...position);
		camera.up.set(Math.sin(roll), Math.cos(roll), 0);
		camera.lookAt(...target);
		camera.fov = fov;
		camera.near = 0.05;
		camera.far = 2500;
		camera.updateProjectionMatrix();
	});
	return null;
};

/**
 * The post-processing composer draws nothing on the very first advance of a fresh
 * WebGL context, so the first frame each render tab produces would be black.
 * Only that first frame is held until two extra advances have flushed through the
 * composer; every later frame renders exactly once.
 */
const SettleFirstFrame: React.FC = () => {
	const frame = useCurrentFrame();
	const advance = useThree((s) => s.advance);
	const {delayRender, continueRender} = useDelayRender();
	const settled = useRef(false);
	useLayoutEffect(() => {
		if (settled.current) return;
		settled.current = true;
		const handle = delayRender(`Settling post-processing (first frame ${frame})`);
		let done = false;
		const finish = () => {
			if (!done) {
				done = true;
				continueRender(handle);
			}
		};
		let raf = requestAnimationFrame(() => {
			advance(performance.now());
			raf = requestAnimationFrame(() => {
				advance(performance.now());
				finish();
			});
		});
		return () => {
			cancelAnimationFrame(raf);
			finish();
		};
	}, [frame, advance, delayRender, continueRender]);
	return null;
};

export const World: React.FC<{
	scene: Scene;
	characters: Character[];
	style: StyleId;
	t: number;
	duration: number;
	width: number;
	height: number;
	quality: Quality;
	modelUrl: (path: string) => string | null;
}> = ({scene, characters, style, t, duration, width, height, quality, modelUrl}) => {
	const env = ENV_DEFS[scene.environment];
	const u = Math.min(1, Math.max(0, t / duration));
	const light = lightAt(scene.lighting, u);
	const atm = new Set(scene.atmosphere);
	const anim = new Set(scene.animation);
	const stormy = scene.lighting === 'stormy';
	const wind = (atm.has('wind') ? 1 : 0.2) + (stormy ? 0.6 : 0);
	const q = quality.particles;

	// Characters stand in a shallow arc at the subject, facing the camera side.
	const cast = scene.characters.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => Boolean(c));
	const walking = anim.has('character_walk');
	const base = env.stage;
	// The set's focal point is often a prop (a well, a table): stand the cast 3 m in front of it.
	const charPos = (i: number): Vec3 => {
		const spread = (i - (cast.length - 1) / 2) * 1.1;
		const x = base.subject[0] + Math.sin(base.heading) * 3 + Math.cos(base.heading) * spread;
		const z = base.subject[2] + Math.cos(base.heading) * 3 - Math.sin(base.heading) * spread;
		return [x, base.groundAt(x, z), z];
	};
	// Close framings re-target the human subject (and follow a walking character).
	const humanShot = cast.length > 0 && scene.camera.shot !== 'aerial_establishing' && scene.camera.shot !== 'wide';
	const walk = walking ? t * WALK_SPEED : 0;
	const stage: Stage = humanShot
		? // Frame people at chest height with a body-height subject size, so a medium shot is
			// waist-up and a close-up is head-and-shoulders (shot table heights then sit at eye level).
			// Close-ups and over-the-shoulder shots single out the lead; other shots frame the group.
			(() => {
				const single = scene.camera.shot === 'close_up' || scene.camera.shot === 'over_shoulder';
				const lead = charPos(0);
				const last = charPos(cast.length - 1);
				const [ax, az] = single ? [lead[0], lead[2]] : [(lead[0] + last[0]) / 2, (lead[2] + last[2]) / 2];
				return {...base, subject: [ax + Math.sin(base.heading) * walk, base.groundAt(ax, az) + 0.72 * (cast[0]?.scale ?? 1.75), az + Math.cos(base.heading) * walk] as Vec3, subjectSize: cast[0]?.scale ?? 1.75};
			})()
		: base;

	const booms = atm.has('explosions') ? explosionTimes(duration, EXPLOSION_SPOTS[scene.environment]).map((time, i) => ({at: env.explosionAt[i], time, size: scene.environment === 'interior' ? 0.15 : 1})) : [];
	const boomShake = booms.reduce((s, b) => (t >= b.time ? Math.max(s, Math.exp(-(t - b.time) * 2.5)) : s), 0);
	const pose = cameraPose({...scene.camera, shake: Math.min(1, scene.camera.shake + boomShake * 0.9)}, stage, u, t, {width, height});

	const grade = STYLES[style];
	const sun = sunDirection(light);
	const fogBoost = env.fogScale * (atm.has('volumetric_fog') ? 1.5 : 1) * (stormy || atm.has('rain') ? 1.25 : 1);

	return (
		<>
			<SettleFirstFrame />
			<CameraRig position={pose.position} target={pose.target} fov={pose.fov} roll={pose.roll} />
			<Lighting light={light} focus={stage.subject} shadowSize={quality.shadowMap} shadowRadius={env.shadowRadius} fogBoost={fogBoost} visibility={env.stage.radius * 1.6} />
			<env.Component t={t} light={light} wind={wind} q={q} anim={anim} wet={atm.has('rain') || stormy} stormy={stormy} />
			{cast.map((c, i) => (
				<Character3D key={c.id} character={c} position={charPos(i)} facing={base.heading} t={t} walking={walking} modelUrl={c.model_reference ? modelUrl(c.model_reference) : null} />
			))}

			{atm.has('rain') && <Rain cam={pose.position} t={t} q={q} wind={wind} intensity={stormy ? 1.5 : 1} />}
			{atm.has('snow') && <Snow cam={pose.position} t={t} q={q} wind={wind} />}
			{atm.has('dust_particles') && <Dust cam={pose.position} t={t} q={q} color={env.dustColor} wind={wind} />}
			{atm.has('smoke') && env.smokeAt.map((p, i) => <Smoke key={i} at={p} t={t} q={q} wind={wind} seed={i + 1} scale={scene.environment === 'interior' ? 0.12 : 1.2} />)}
			{atm.has('fire') && env.fireAt.map((p, i) => <Fire key={i} at={p} t={t} q={q} seed={i + 1} scale={scene.environment === 'interior' ? 0.35 : 1} />)}
			{atm.has('sparks') && <Sparks at={env.fireAt[0]} t={t} q={q} spread={scene.environment === 'interior' ? 0.6 : 3} />}
			{atm.has('clouds') && <Clouds center={stage.subject} t={t} q={q} height={env.cloudHeight} spread={env.stage.radius * 2.2} color={light.night > 0.6 ? '#4a5470' : '#f4efe8'} wind={wind} opacity={stormy ? 0.95 : 0.7} />}
			{atm.has('volumetric_fog') && <GroundFog center={stage.subject} t={t} color={light.fogColor} radius={Math.min(160, env.stage.radius)} density={scene.environment === 'interior' ? 0.3 : 1} />}
			{(atm.has('god_rays') || atm.has('volumetric_fog')) && light.elevation > -3 && (
				<LightShafts center={env.shafts.center} sunDir={sun} color={light.sunColor} t={t} count={Math.floor(10 + 14 * q)} spread={env.shafts.spread} length={env.shafts.length} intensity={atm.has('god_rays') ? 1 : 0.5} />
			)}
			{booms.length > 0 && <Explosions events={booms} t={t} q={q} wind={wind} />}

			<EffectComposer multisampling={quality.final ? 4 : 0} enableNormalPass={false}>
				{[
					scene.camera.depth_of_field ? (
						<DepthOfField key="dof" worldFocusDistance={pose.focusDistance} worldFocusRange={Math.max(0.6, pose.focusDistance * 0.35)} bokehScale={quality.final ? 4.5 : 3} resolutionScale={quality.dofResolution} />
					) : null,
					<Bloom key="bloom" intensity={light.bloom * 0.6} luminanceThreshold={0.82} luminanceSmoothing={0.2} mipmapBlur />,
					<HueSaturation key="sat" saturation={grade.saturation - 1} />,
					<BrightnessContrast key="con" contrast={(grade.contrast - 1) * 0.9} />,
					<ToneMapping key="tm" mode={ToneMappingMode.ACES_FILMIC} />,
					<Vignette key="vig" offset={0.32} darkness={0.55} />,
					<Noise key="grain" opacity={grade.grain} premultiply />,
				].filter((x): x is React.ReactElement => x !== null)}
			</EffectComposer>
		</>
	);
};
