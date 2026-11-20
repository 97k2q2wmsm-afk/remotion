// Remotion entry for ONE scene of a studio project. The studio renders each scene
// separately (scene-level cache), then FFmpeg joins them with transitions and audio.
//
// Production methods:
//   procedural_3d     → real-time Three.js world (engine/World.tsx)
//   ai_image_animated → generated/imported still on a 3D plane, filmed by the same camera
//                       rig, with 3D atmosphere particles in front for real parallax
//   ai_video / blender_3d / user_asset(video) → the produced clip, conformed to length
//
// A scene whose method needs an asset that does not exist FAILS the render with a
// clear message. It never substitutes placeholder footage.
import {useTexture} from '@react-three/drei';
import {useThree} from '@react-three/fiber';
import {ThreeCanvas} from '@remotion/three';
import React, {useLayoutEffect} from 'react';
import {AbsoluteFill, CalculateMetadataFunction, Freeze, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import * as THREE from 'three';
import {CAPTION_FONT} from '../engine/fonts';
import type {Character, FormatId, RenderQuality, Scene, StyleId} from './schema';
import {FORMATS, STYLES} from './schema';
import {cameraPose} from './engine/camera';
import {Dust, Rain, Snow} from './engine/effects';
import {World} from './engine/World';

export type CinematicSceneProps = {
	scene: Scene;
	characters: Character[];
	format: FormatId;
	fps: number;
	style: StyleId;
	quality: RenderQuality;
	/** Base URL that project-relative asset paths resolve against (studio file server). */
	assetBaseUrl: string | null;
	/** Burn this scene's subtitle cues into the picture. */
	burnSubtitles: boolean;
};

export const calculateSceneMetadata: CalculateMetadataFunction<CinematicSceneProps> = ({props}) => {
	const f = FORMATS[props.format];
	return {width: f.width, height: f.height, fps: props.fps, durationInFrames: Math.max(1, Math.round(props.scene.duration * props.fps))};
};

const resolveAsset = (base: string | null, path: string) => {
	if (/^(https?:|data:|blob:)/.test(path)) return path;
	if (!base) throw new Error(`Asset "${path}" cannot be resolved: no assetBaseUrl was passed (render through the studio server).`);
	return base.replace(/\/$/, '') + '/' + path.split('/').map(encodeURIComponent).join('/');
};

// ─── AI image with a real 3D camera move ───────────────────────────────────
const ImagePlane: React.FC<{url: string; scene: Scene; t: number; duration: number; width: number; height: number; q: number}> = ({url, scene, t, duration, width, height, q}) => {
	const tex = useTexture(url);
	tex.colorSpace = THREE.SRGBColorSpace;
	const img = tex.image as {width: number; height: number};
	const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
	const D = 10;
	// Stage the plane like a set: subject 10 m away, small subjectSize so moves stay subtle.
	const stage = {subject: [0, 0, 0] as [number, number, number], subjectSize: 2.2, heading: 0, groundAt: () => -100, radius: 50};
	const spec = {...scene.camera, shot: 'medium' as const};
	const pose = cameraPose(spec, stage, Math.min(1, t / duration), t, {width, height});
	// Normalise the move to stay within the overscanned plate.
	const k = 0.22;
	const pos: [number, number, number] = [pose.position[0] * k, pose.position[1] * k - 0.25, D + (pose.position[2] - stage.subjectSize * 1.9) * k * 0.8];
	const fov = pose.fov;
	const viewH = 2 * D * Math.tan((fov * Math.PI) / 360) * 1.3;
	const aspect = img.width / img.height;
	const frameAspect = width / height;
	const planeH = aspect > frameAspect ? viewH : (viewH * frameAspect) / aspect;
	useLayoutEffect(() => {
		camera.position.set(...pos);
		camera.lookAt(pose.target[0] * k, pose.target[1] * k - 0.25, 0);
		camera.fov = fov;
		camera.updateProjectionMatrix();
	});
	const atm = new Set(scene.atmosphere);
	return (
		<>
			<mesh>
				<planeGeometry args={[planeH * aspect, planeH]} />
				<meshBasicMaterial map={tex} toneMapped={false} />
			</mesh>
			{atm.has('dust_particles') && <Dust cam={[0, 0, 6]} t={t} q={q} color="#ffe2b0" wind={0.3} />}
			{atm.has('snow') && <Snow cam={[0, 0, 6]} t={t} q={q} wind={0.3} />}
			{atm.has('rain') && <Rain cam={[0, 0, 6]} t={t} q={q} wind={0.3} />}
		</>
	);
};

const AssetVideo: React.FC<{url: string; clipSeconds: number | null}> = ({url, clipSeconds}) => {
	const {fps, durationInFrames} = useVideoConfig();
	const clipFrames = clipSeconds ? Math.floor(clipSeconds * fps) : durationInFrames;
	const style: React.CSSProperties = {width: '100%', height: '100%', objectFit: 'cover'};
	if (clipFrames >= durationInFrames) return <OffthreadVideo src={url} style={style} muted />;
	// Shorter clip than the scene: play it, then hold its last frame (no looping, no filler).
	return (
		<>
			<Sequence durationInFrames={clipFrames}>
				<OffthreadVideo src={url} style={style} muted />
			</Sequence>
			<Sequence from={clipFrames}>
				<Freeze frame={clipFrames - 1}>
					<OffthreadVideo src={url} style={style} muted />
				</Freeze>
			</Sequence>
		</>
	);
};

const Overlays: React.FC<{scene: Scene; t: number; height: number; burnSubtitles: boolean}> = ({scene, t, height, burnSubtitles}) => {
	const u = height / 1080;
	const cue = burnSubtitles ? scene.subtitles.find((c) => t >= c.start && t < c.end) : undefined;
	return (
		<AbsoluteFill style={{fontFamily: CAPTION_FONT}}>
			{scene.overlays
				.filter((o) => t >= o.start && t < o.end)
				.map((o) => {
					const fade = Math.min(interpolate(t, [o.start, o.start + 0.4], [0, 1], {extrapolateRight: 'clamp'}), interpolate(t, [o.end - 0.4, o.end], [1, 0], {extrapolateLeft: 'clamp'}));
					const pos: React.CSSProperties =
						o.position === 'top' ? {top: '9%'} : o.position === 'center' ? {top: '50%', transform: 'translateY(-50%)'} : {bottom: '18%'};
					return (
						<div key={o.id} style={{position: 'absolute', left: '6%', right: '6%', textAlign: o.position === 'lower_third' ? 'left' : 'center', opacity: fade, ...pos}}>
							<span style={{color: '#fff', fontWeight: 800, fontSize: 64 * u, letterSpacing: 2 * u, textShadow: `0 ${4 * u}px ${24 * u}px rgba(0,0,0,0.7)`, textTransform: o.position === 'lower_third' ? 'none' : 'uppercase'}}>{o.text}</span>
						</div>
					);
				})}
			{cue && (
				<div style={{position: 'absolute', left: '8%', right: '8%', bottom: '8%', textAlign: 'center'}}>
					<span style={{color: '#fff', fontWeight: 700, fontSize: 44 * u, lineHeight: 1.25, background: 'rgba(0,0,0,0.45)', padding: `${6 * u}px ${16 * u}px`, borderRadius: 8 * u, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'}}>{cue.text}</span>
				</div>
			)}
		</AbsoluteFill>
	);
};

export const CinematicScene: React.FC<CinematicSceneProps> = ({scene, characters, style, quality, assetBaseUrl, burnSubtitles}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const t = frame / fps;
	const final = quality === 'final';
	const q = {particles: final ? 1 : 0.35, shadowMap: final ? 2048 : 1024, dofResolution: final ? 0.5 : 0.35, final};
	const grade = STYLES[style];
	const method = scene.visual_type;
	const needsAsset = method === 'ai_video' || method === 'ai_image_animated' || method === 'blender_3d' || method === 'user_asset';
	if (needsAsset && !scene.asset) {
		throw new Error(`Scene ${scene.scene_id}: production method "${method}" has no generated or imported asset yet. Generate or import it first — the studio does not substitute placeholder footage.`);
	}
	const assetUrl = scene.asset ? resolveAsset(assetBaseUrl, scene.asset.path) : null;
	const modelUrl = (p: string) => resolveAsset(assetBaseUrl, p);

	let picture: React.ReactNode;
	if (method === 'procedural_3d') {
		picture = (
			<ThreeCanvas width={width} height={height} shadows gl={{antialias: !final, preserveDrawingBuffer: true, powerPreference: 'high-performance'}} dpr={1} camera={{fov: 40, near: 0.05, far: 2500}}>
				<World scene={scene} characters={characters} style={style} t={t} duration={scene.duration} width={width} height={height} quality={q} modelUrl={modelUrl} />
			</ThreeCanvas>
		);
	} else if (scene.asset?.kind === 'image') {
		picture = (
			<ThreeCanvas width={width} height={height} gl={{antialias: true, preserveDrawingBuffer: true}} dpr={1} camera={{fov: 40}}>
				<color attach="background" args={['#000']} />
				<ImagePlane url={assetUrl!} scene={scene} t={t} duration={scene.duration} width={width} height={height} q={q.particles} />
			</ThreeCanvas>
		);
	} else {
		picture = <AssetVideo url={assetUrl!} clipSeconds={scene.asset?.duration ?? null} />;
	}

	const barH = grade.letterbox && width > height ? Math.round((height - width / 2.39) / 2) : 0;
	return (
		<AbsoluteFill style={{background: '#000'}}>
			{picture}
			{/* Colour grade warmth (teal-orange split) as a soft-light wash over the picture. */}
			<AbsoluteFill style={{background: grade.warmth >= 0 ? `rgba(255,150,60,${grade.warmth * 0.5})` : `rgba(40,140,255,${-grade.warmth * 0.5})`, mixBlendMode: 'soft-light'}} />
			{barH > 0 && (
				<>
					<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: barH, background: '#000'}} />
					<div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: barH, background: '#000'}} />
				</>
			)}
			<Overlays scene={scene} t={t} height={height} burnSubtitles={burnSubtitles} />
		</AbsoluteFill>
	);
};
