// Physically-inspired lighting rig: key sun + cinematic rim/back light + sky
// hemisphere bounce (GI approximation) + procedural HDR environment (Lightformers,
// no downloads) + gradient sky dome with sun disc + exponential fog + stars.
import {Environment, Lightformer} from '@react-three/drei';
import {useThree} from '@react-three/fiber';
import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import type {LightingId} from '../schema';
import {clamp, lerp, rng} from './noise';

export type LightState = {
	/** Sun elevation / azimuth in degrees. */
	elevation: number;
	azimuth: number;
	sunColor: string;
	sunIntensity: number;
	skyTop: string;
	skyHorizon: string;
	groundColor: string;
	hemiIntensity: number;
	fogColor: string;
	fogDensity: number;
	rimColor: string;
	rimIntensity: number;
	exposure: number;
	/** 0 = full day, 1 = full night (drives emissive windows, stars, lamps). */
	night: number;
	bloom: number;
};

export const LIGHT_PRESETS: Record<Exclude<LightingId, 'day_to_night'>, LightState> = {
	cinematic_sunset: {elevation: 5, azimuth: 200, sunColor: '#ff9a4d', sunIntensity: 3.2, skyTop: '#3b4f86', skyHorizon: '#ff9b5e', groundColor: '#3a2a22', hemiIntensity: 0.55, fogColor: '#d98d68', fogDensity: 0.0065, rimColor: '#ffb27a', rimIntensity: 1.6, exposure: 1.05, night: 0.25, bloom: 0.9},
	golden_hour: {elevation: 14, azimuth: 215, sunColor: '#ffc27a', sunIntensity: 3.4, skyTop: '#5d86c4', skyHorizon: '#f6c58f', groundColor: '#4a3b2a', hemiIntensity: 0.7, fogColor: '#e2c09a', fogDensity: 0.0045, rimColor: '#ffd59a', rimIntensity: 1.3, exposure: 1.0, night: 0.05, bloom: 0.6},
	noon_sun: {elevation: 62, azimuth: 160, sunColor: '#fff6e8', sunIntensity: 3.6, skyTop: '#3d7fd6', skyHorizon: '#bcd8f2', groundColor: '#5a5040', hemiIntensity: 0.9, fogColor: '#c4d8ec', fogDensity: 0.0028, rimColor: '#ffffff', rimIntensity: 0.4, exposure: 0.95, night: 0, bloom: 0.3},
	overcast_day: {elevation: 40, azimuth: 180, sunColor: '#dfe5ea', sunIntensity: 1.1, skyTop: '#8c98a4', skyHorizon: '#c3cad0', groundColor: '#4b4d4a', hemiIntensity: 1.5, fogColor: '#b3bcc4', fogDensity: 0.006, rimColor: '#dfe5ea', rimIntensity: 0.3, exposure: 1.0, night: 0, bloom: 0.2},
	blue_hour: {elevation: -4, azimuth: 230, sunColor: '#7d8ccf', sunIntensity: 0.7, skyTop: '#101c44', skyHorizon: '#5b6aa8', groundColor: '#141826', hemiIntensity: 0.7, fogColor: '#3a4776', fogDensity: 0.007, rimColor: '#ff9e6b', rimIntensity: 0.9, exposure: 1.2, night: 0.75, bloom: 1.1},
	moonlit_night: {elevation: 35, azimuth: 120, sunColor: '#9fb4ff', sunIntensity: 0.55, skyTop: '#03060f', skyHorizon: '#16223f', groundColor: '#0b0e16', hemiIntensity: 0.35, fogColor: '#121b33', fogDensity: 0.008, rimColor: '#8fb0ff', rimIntensity: 0.8, exposure: 1.35, night: 1, bloom: 1.3},
	stormy: {elevation: 25, azimuth: 190, sunColor: '#c4ccd4', sunIntensity: 1.4, skyTop: '#39424b', skyHorizon: '#6f7b84', groundColor: '#2a2e33', hemiIntensity: 1.35, fogColor: '#58646d', fogDensity: 0.009, rimColor: '#c8d6e0', rimIntensity: 0.6, exposure: 1.25, night: 0.35, bloom: 0.4},
};

const mixColor = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

/** Resolve a preset at shot time t (only day_to_night actually varies). */
export const lightAt = (id: LightingId, t: number): LightState => {
	if (id !== 'day_to_night') return LIGHT_PRESETS[id];
	const keys: [number, LightState][] = [
		[0, LIGHT_PRESETS.golden_hour],
		[0.45, LIGHT_PRESETS.cinematic_sunset],
		[0.75, LIGHT_PRESETS.blue_hour],
		[1, LIGHT_PRESETS.moonlit_night],
	];
	let i = 0;
	while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
	const [t0, a] = keys[i];
	const [t1, b] = keys[i + 1];
	const k = clamp((t - t0) / (t1 - t0));
	const out = {} as LightState;
	for (const key of Object.keys(a) as (keyof LightState)[]) {
		const va = a[key];
		const vb = b[key];
		(out as Record<string, unknown>)[key] = typeof va === 'number' ? lerp(va, vb as number, k) : mixColor(va, vb as string, k);
	}
	return out;
};

export const sunDirection = (l: LightState) => {
	const el = (l.elevation * Math.PI) / 180;
	const az = (l.azimuth * Math.PI) / 180;
	return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
};

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFragment = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; uniform float night;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, ground, smoothstep(0.0, -0.08, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 900.0) * 6.0 * (1.0 - night * 0.6) + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);
  gl_FragColor = vec4(col, 1.0);
}`;

const SkyDome: React.FC<{light: LightState}> = ({light}) => {
	const mat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				vertexShader: skyVertex,
				fragmentShader: skyFragment,
				side: THREE.BackSide,
				depthWrite: false,
				fog: false,
				uniforms: {
					top: {value: new THREE.Color()},
					horizon: {value: new THREE.Color()},
					ground: {value: new THREE.Color()},
					sunDir: {value: new THREE.Vector3()},
					sunColor: {value: new THREE.Color()},
					night: {value: 0},
				},
			}),
		[],
	);
	mat.uniforms.top.value.set(light.skyTop);
	mat.uniforms.horizon.value.set(light.skyHorizon);
	mat.uniforms.ground.value.set(light.fogColor);
	mat.uniforms.sunDir.value.copy(sunDirection(light));
	mat.uniforms.sunColor.value.set(light.sunColor);
	mat.uniforms.night.value = light.night;
	return (
		<mesh material={mat} renderOrder={-10} frustumCulled={false}>
			<sphereGeometry args={[900, 32, 16]} />
		</mesh>
	);
};

const Stars: React.FC<{opacity: number}> = ({opacity}) => {
	const geo = useMemo(() => {
		const r = rng(77);
		const pos = new Float32Array(1500 * 3);
		for (let i = 0; i < 1500; i++) {
			const u = r() * 2 - 1;
			const th = r() * Math.PI * 2;
			const y = Math.abs(u) * 0.95 + 0.05;
			const s = Math.sqrt(1 - y * y);
			pos.set([Math.cos(th) * s * 800, y * 800, Math.sin(th) * s * 800], i * 3);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		return g;
	}, []);
	if (opacity <= 0.01) return null;
	return (
		<points geometry={geo} frustumCulled={false}>
			<pointsMaterial color="#dfe8ff" size={1.6} sizeAttenuation={false} transparent opacity={opacity} fog={false} depthWrite={false} />
		</points>
	);
};

/**
 * Procedural HDR environment (image-based reflections & bounce, no HDRI download).
 * Memoised on quantised light values: drei re-renders the cube map whenever its
 * children change, which would otherwise happen on every frame.
 */
const ImageLight = React.memo<{skyTop: string; skyHorizon: string; sunColor: string; groundColor: string; night: number; sun: [number, number, number]; sunAbove: number}>(
	({skyTop, skyHorizon, sunColor, groundColor, night, sun, sunAbove}) => (
		<Environment resolution={64} frames={1} environmentIntensity={0.35 + 0.4 * (1 - night)}>
			<mesh scale={100}>
				<sphereGeometry args={[1, 16, 8]} />
				<meshBasicMaterial color={skyHorizon} side={THREE.BackSide} />
			</mesh>
			<Lightformer form="rect" intensity={2 + 2 * (1 - night)} color={skyTop} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
			<Lightformer form="circle" intensity={4 * sunAbove} color={sunColor} position={[sun[0] * 9, sun[1] * 9, sun[2] * 9]} scale={3} />
			<Lightformer form="rect" intensity={0.8} color={groundColor} position={[0, -10, 0]} rotation-x={-Math.PI / 2} scale={[20, 20, 1]} />
		</Environment>
	),
	(a, b) => a.skyTop === b.skyTop && a.skyHorizon === b.skyHorizon && a.sunColor === b.sunColor && a.groundColor === b.groundColor && a.night === b.night && a.sunAbove === b.sunAbove && a.sun.every((v, i) => v === b.sun[i]),
);

export const Lighting: React.FC<{
	light: LightState;
	focus: [number, number, number];
	shadowSize: number;
	shadowRadius: number;
	fogBoost: number;
	/** Distance (m) at which a preset's default haze reaches ~1/3 — scales fog to the set. */
	visibility: number;
}> = ({light, focus, shadowSize, shadowRadius, fogBoost, visibility}) => {
	const {scene, gl} = useThree();
	const sun = sunDirection(light);
	const sunPos = new THREE.Vector3(...focus).addScaledVector(sun, 180);
	// Rim / back light: opposite the sun, low, coloured — separates subjects from background.
	const rimPos = new THREE.Vector3(...focus).add(new THREE.Vector3(-sun.x, 0.35, -sun.z).normalize().multiplyScalar(60));

	useLayoutEffect(() => {
		// Presets express haze relative to 0.005 ("normal air"); FogExp2 is squared, so
		// density = k / visibility gives the same look on a 10 m room or a 600 m valley.
		scene.fog = new THREE.FogExp2(light.fogColor, ((light.fogDensity / 0.005) * fogBoost * 0.62) / visibility);
		gl.toneMappingExposure = light.exposure;
	}, [scene, gl, light.fogColor, light.fogDensity, light.exposure, fogBoost, visibility]);

	const sunAbove = clamp((light.elevation + 6) / 12);
	return (
		<>
			<SkyDome light={light} />
			<Stars opacity={clamp((light.night - 0.4) / 0.6)} />
			<hemisphereLight args={[light.skyTop, light.groundColor, light.hemiIntensity]} />
			<ambientLight intensity={0.06 + light.night * 0.05} color={light.skyHorizon} />
			<directionalLight
				position={sunPos.toArray()}
				intensity={light.sunIntensity * (0.25 + 0.75 * sunAbove)}
				color={light.sunColor}
				castShadow
				shadow-mapSize={[shadowSize, shadowSize]}
				shadow-bias={-0.0004}
				shadow-normalBias={0.04}
				shadow-camera-left={-shadowRadius}
				shadow-camera-right={shadowRadius}
				shadow-camera-top={shadowRadius}
				shadow-camera-bottom={-shadowRadius}
				shadow-camera-near={1}
				shadow-camera-far={420}
			>
				<object3D attach="target" position={focus} />
			</directionalLight>
			<directionalLight position={rimPos.toArray()} intensity={light.rimIntensity} color={light.rimColor}>
				<object3D attach="target" position={focus} />
			</directionalLight>
			<ImageLight skyTop={light.skyTop} skyHorizon={light.skyHorizon} sunColor={light.sunColor} groundColor={light.groundColor} night={Math.round(light.night * 20) / 20} sun={sun.toArray().map((v) => Math.round(v * 20) / 20) as [number, number, number]} sunAbove={Math.round(sunAbove * 20) / 20} />
		</>
	);
};
