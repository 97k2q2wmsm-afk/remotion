// Procedural environments. Each entry builds real 3D geometry with PBR materials and
// tells the camera rig where the subject is (Stage) and the effects system where
// smoke/fire/explosions can originate. Keyed by the schema's ENVIRONMENTS table,
// so adding an environment id without an implementation fails the typecheck.
import React, {useMemo} from 'react';
import * as THREE from 'three';
import type {AnimationId, EnvironmentId} from '../schema';
import type {Stage, Vec3} from './camera';
import type {LightState} from './Lighting';
import {clamp, fbm, rng, ridged, smoothstep} from './noise';
import {
	Birds,
	BuildingSpec,
	Buildings,
	Columns,
	Crowd,
	Flags,
	GEO,
	Instanced,
	makeAgents,
	plankTexture,
	Rocks,
	Roofs,
	scatter,
	stdMat,
	Terrain,
	TreeSpec,
	Trees,
	Water,
	waveHeight,
} from './primitives';

export type EnvProps = {t: number; light: LightState; wind: number; q: number; anim: ReadonlySet<AnimationId>; wet: boolean; stormy: boolean};

export type EnvDef = {
	stage: Stage;
	smokeAt: Vec3[];
	fireAt: Vec3[];
	explosionAt: Vec3[];
	dustColor: string;
	/** Fog multiplier (interiors want much less). */
	fogScale: number;
	shadowRadius: number;
	/** Shafts centre + spread for god rays. */
	shafts: {center: Vec3; spread: number; length: number};
	cloudHeight: number;
	Component: React.FC<EnvProps>;
};

const col = (hex: string) => new THREE.Color(hex);
const mixC = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, clamp(t));

// Car stream along a lane: deterministic positions, wraps around the lane length.
const Traffic: React.FC<{lanes: {x0: number; z0: number; x1: number; z1: number; y: number; n: number; speed: number}[]; t: number; night: number; palette: string[]; flying?: boolean}> = ({lanes, t, night, palette, flying}) => {
	const cars = useMemo(() => {
		const r = rng(lanes.length * 17 + (flying ? 5 : 0));
		return lanes.flatMap((l, li) => Array.from({length: l.n}, (_, i) => ({li, off: i / l.n + r() * 0.3 / l.n, c: palette[Math.floor(r() * palette.length)], s: 0.9 + r() * 0.25})));
	}, [lanes, palette, flying]);
	const pos = (k: (typeof cars)[number]) => {
		const l = lanes[k.li];
		const len = Math.hypot(l.x1 - l.x0, l.z1 - l.z0);
		const u = (((k.off + (t * l.speed) / len) % 1) + 1) % 1;
		return {x: l.x0 + (l.x1 - l.x0) * u, z: l.z0 + (l.z1 - l.z0) * u, y: l.y, rot: Math.atan2(l.x1 - l.x0, l.z1 - l.z0)};
	};
	const body = useMemo(() => new THREE.MeshStandardMaterial({roughness: 0.35, metalness: 0.6}), []);
	const glass = stdMat('#1a2229', 0.15, 0.4);
	const lights = useMemo(() => new THREE.MeshBasicMaterial({color: flying ? '#55f0ff' : '#fff1c9'}), [flying]);
	const tail = useMemo(() => new THREE.MeshBasicMaterial({color: '#ff2a2a'}), []);
	return (
		<>
			<Instanced count={cars.length} geometry={GEO.box} material={body} color={(i) => cars[i].c} place={(i, o) => {
				const p = pos(cars[i]);
				o.position.set(p.x, p.y + 0.3, p.z);
				o.rotation.y = p.rot;
				o.scale.set(1.8 * cars[i].s, 0.75, 4.2 * cars[i].s);
			}} />
			<Instanced count={cars.length} geometry={GEO.box} material={glass} place={(i, o) => {
				const p = pos(cars[i]);
				o.position.set(p.x, p.y + 1.05, p.z);
				o.rotation.y = p.rot;
				o.scale.set(1.6 * cars[i].s, 0.6, 2.2 * cars[i].s);
			}} />
			{night > 0.3 && (
				<>
					<Instanced count={cars.length} geometry={GEO.box} material={lights} castShadow={false} place={(i, o) => {
						const p = pos(cars[i]);
						o.position.set(p.x + Math.sin(p.rot) * 2.15, p.y + 0.55, p.z + Math.cos(p.rot) * 2.15);
						o.rotation.y = p.rot;
						o.scale.set(1.5, 0.18, 0.08);
					}} />
					<Instanced count={cars.length} geometry={GEO.box} material={tail} castShadow={false} place={(i, o) => {
						const p = pos(cars[i]);
						o.position.set(p.x - Math.sin(p.rot) * 2.15, p.y + 0.6, p.z - Math.cos(p.rot) * 2.15);
						o.rotation.y = p.rot;
						o.scale.set(1.5, 0.14, 0.08);
					}} />
				</>
			)}
		</>
	);
};

const StreetLamps: React.FC<{at: Vec3[]; night: number; color?: string; realLights?: number}> = ({at, night, color = '#ffd28a', realLights = 4}) => {
	const pole = stdMat('#2a2d31', 0.5, 0.6);
	const bulb = useMemo(() => new THREE.MeshStandardMaterial({color: '#333', emissive: new THREE.Color(color)}), [color]);
	bulb.emissiveIntensity = night * 6;
	return (
		<>
			<Instanced count={at.length} geometry={GEO.cyl} material={pole} place={(i, o) => {
				o.position.set(at[i][0], at[i][1], at[i][2]);
				o.scale.set(0.16, 6, 0.16);
			}} />
			<Instanced count={at.length} geometry={GEO.sphere} material={bulb} castShadow={false} place={(i, o) => {
				o.position.set(at[i][0], at[i][1] + 6.1, at[i][2]);
				o.scale.setScalar(0.32);
			}} />
			{night > 0.3 && at.slice(0, realLights).map((p, i) => <pointLight key={i} position={[p[0], p[1] + 5.6, p[2]]} color={color} intensity={60 * night} distance={22} decay={2} />)}
		</>
	);
};

// ════════════════════════════════════════════════════════════════════════════
// FOREST
const forestH = (x: number, z: number) => {
	const r = Math.hypot(x, z);
	return (fbm(x / 70, z / 70, 5, 3) * 18 - 6) * smoothstep(6, 40, r) + fbm(x / 8, z / 8, 2, 9) * 0.6;
};
const forest: EnvDef = {
	stage: {subject: [0, forestH(0, 0), 0], subjectSize: 13, heading: 0.3, groundAt: forestH, radius: 220},
	smokeAt: [[2.5, forestH(2.5, 3), 3]],
	fireAt: [[2.5, forestH(2.5, 3), 3]],
	explosionAt: [[18, forestH(18, -25), -25], [-22, forestH(-22, -14), -14]],
	dustColor: '#ffe7b0',
	fogScale: 0.9,
	shadowRadius: 70,
	shafts: {center: [0, 0, -10], spread: 60, length: 60},
	cloudHeight: 140,
	Component: ({t, wind, q, anim}) => {
		const trees = useMemo<TreeSpec[]>(() => {
			const r = rng(101);
			return scatter(Math.floor(2400 * q) + 500, 102, (g) => {
				const a = g() * Math.PI * 2;
				const d = 11 + Math.sqrt(g()) * 240;
				const x = Math.cos(a) * d;
				const z = Math.sin(a) * d;
				if (Math.abs(x - z * 0.3) < 3 && z > 0) return null; // path
				return [x, z];
			}).map(([x, z, k]) => ({x, z, y: forestH(x, z), s: 1.6 + k * 1.5, kind: r() < 0.65 ? 'conifer' : 'broadleaf', phase: r()}));
		}, [q]);
		const rocks = useMemo(() => scatter(50, 7, (g) => [(g() - 0.5) * 160, (g() - 0.5) * 160]).map(([x, z, k]) => ({x, z, y: forestH(x, z), s: 0.4 + k * 1.6, r: k})), []);
		const ferns = useMemo(() => scatter(Math.floor(900 * q) + 150, 8, (g) => [(g() - 0.5) * 70, (g() - 0.5) * 70]).map(([x, z, k]) => ({x, z, y: forestH(x, z), k})), [q]);
		const fernMat = useMemo(() => new THREE.MeshStandardMaterial({color: '#3f5e2a', roughness: 0.95, flatShading: true}), []);
		const sway = anim.has('swaying_trees') ? 1 + wind * 2 : 0.25 + wind;
		return (
			<>
				<Terrain size={560} segments={Math.floor(110 + 90 * q)} heightAt={forestH} detailSeed={3} colorAt={(x, z, h, slope) => mixC(mixC(col('#3d5a26'), col('#5b6f2c'), fbm(x / 30, z / 30, 3, 4)), col('#5e5240'), slope * 3 + (Math.abs(x - z * 0.3) < 2.4 && z > 0 ? 1 : 0))} />
				<Trees trees={trees} t={t} wind={sway} />
				<Rocks rocks={rocks} color="#5d5a55" />
				<Instanced count={ferns.length} geometry={GEO.cone} material={fernMat} place={(i, o) => {
					const f = ferns[i];
					o.position.set(f.x, f.y, f.z);
					o.rotation.set(Math.sin(t * 2 + f.k * 9) * 0.08 * sway, f.k * 6, 0);
					o.scale.set(0.12 + f.k * 0.1, 0.5 + f.k * 0.7, 0.12 + f.k * 0.1); // tall grass blades
				}} />
				<mesh position={[-4, forestH(-4, -2) + 0.3, -2]} rotation={[0, 0.7, Math.PI / 2]} castShadow receiveShadow>
					<cylinderGeometry args={[0.35, 0.45, 7, 10]} />
					<meshStandardMaterial color="#4b3a2a" roughness={0.95} />
				</mesh>
				{anim.has('flying_birds') && <Birds count={14} center={[0, 45, -40]} radius={50} t={t} />}
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// MOUNTAINS
const mountainH = (x: number, z: number) => {
	const r = Math.hypot(x * 0.8, z + 60);
	const peaks = ridged(x / 220, z / 220, 6, 12) * 210 * smoothstep(170, 460, r);
	return peaks + fbm(x / 40, z / 40, 4, 13) * 9 - 4;
};
const mountains: EnvDef = {
	stage: {subject: [0, mountainH(0, 0), 0], subjectSize: 26, heading: 0.15, groundAt: mountainH, radius: 650},
	smokeAt: [[6, mountainH(6, 4), 4]],
	fireAt: [[6, mountainH(6, 4), 4]],
	explosionAt: [[40, mountainH(40, -80), -80]],
	dustColor: '#ffffff',
	fogScale: 0.55,
	shadowRadius: 260,
	shafts: {center: [0, 40, -150], spread: 200, length: 160},
	cloudHeight: 150,
	Component: ({t, wind, q, anim}) => {
		const trees = useMemo<TreeSpec[]>(() => {
			const r = rng(201);
			return scatter(Math.floor(700 * q) + 100, 202, (g) => {
				const x = (g() - 0.5) * 700;
				const z = (g() - 0.5) * 700;
				const h = mountainH(x, z);
				if (h > 40 || h < 1.2 || Math.hypot(x, z) < 8) return null;
				return [x, z];
			}).map(([x, z, k]) => ({x, z, y: mountainH(x, z), s: 1 + k * 0.8, kind: 'conifer', phase: r()}));
		}, [q]);
		return (
			<>
				<Terrain
					size={1500}
					segments={Math.floor(150 + 110 * q)}
					heightAt={mountainH}
					detailSeed={12}
					roughness={0.9}
					colorAt={(x, z, h, slope) => {
						let c = mixC(col('#4f6a33'), col('#6b6a4a'), fbm(x / 50, z / 50, 3, 5));
						c = mixC(c, col('#6d655c'), smoothstep(25, 70, h) + slope * 2.2);
						c = mixC(c, col('#f2f5f8'), smoothstep(85, 125, h + fbm(x / 20, z / 20, 3, 6) * 30) * (1 - smoothstep(0.35, 0.6, slope)));
						return c;
					}}
				/>
				<Water size={260} segments={Math.floor(30 + 40 * q)} y={0.4} t={t} amp={anim.has('flowing_water') ? 0.12 : 0.04} color="#3a6676" deep="#14303b" center={[-70, -40]} />
				<Trees trees={trees} t={t} wind={0.3 + wind} foliage={['#23402a', '#2c4b2e', '#1e3524']} />
				{anim.has('flying_birds') && <Birds count={6} center={[0, 70, -60]} radius={70} t={t} />}
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// CITY SKYLINE
const cityBuildings = (seed: number, half: number, block: number, road: number, tallness: number, skipCenter: number) => {
	const r = rng(seed);
	const out: BuildingSpec[] = [];
	for (let bx = -half; bx < half; bx += block) {
		for (let bz = -half; bz < half; bz += block) {
			const cx = bx + block / 2;
			const cz = bz + block / 2;
			if (Math.hypot(cx, cz) < skipCenter) continue;
			const centerBoost = Math.exp(-Math.hypot(cx, cz) / (half * 0.45));
			const inner = block - road;
			const n = r() < 0.5 ? 1 : 2;
			for (let k = 0; k < n; k++) {
				const w = n === 1 ? inner * (0.7 + r() * 0.25) : inner * 0.45;
				const d = inner * (0.6 + r() * 0.35);
				const h = 10 + r() * 30 + centerBoost * tallness * (0.4 + r() * 0.8);
				const off = n === 1 ? 0 : (k - 0.5) * inner * 0.5;
				const g = 0.7 + r() * 0.35;
				out.push({x: cx + off, y: 0, z: cz, w, d, h, rot: 0, tint: `rgb(${Math.floor(g * 230)},${Math.floor(g * 228)},${Math.floor(g * 222)})`});
			}
		}
	}
	return out;
};
const flat = () => 0;
const city: EnvDef = {
	stage: {subject: [0, 0, 0], subjectSize: 62, heading: 0.65, groundAt: flat, radius: 620},
	smokeAt: [[30, 40, -40]],
	fireAt: [[12, 0, -12]],
	explosionAt: [[40, 0, -60]],
	dustColor: '#ffe9c8',
	fogScale: 0.8,
	shadowRadius: 220,
	shafts: {center: [0, 40, -60], spread: 200, length: 140},
	cloudHeight: 220,
	Component: ({t, light, q, anim, wet}) => {
		const glass = useMemo(() => cityBuildings(301, 280, 44, 12, 170, 22).filter((_, i) => i % 3 === 0), []);
		const concrete = useMemo(() => cityBuildings(301, 280, 44, 12, 170, 22).filter((_, i) => i % 3 !== 0), []);
		const lanes = useMemo(() => {
			const L: {x0: number; z0: number; x1: number; z1: number; y: number; n: number; speed: number}[] = [];
			for (let v = -264; v <= 264; v += 44) {
				L.push({x0: v - 3, z0: -300, x1: v - 3, z1: 300, y: 0, n: Math.floor(10 * q) + 3, speed: 13});
				L.push({x0: v + 3, z0: 300, x1: v + 3, z1: -300, y: 0, n: Math.floor(10 * q) + 3, speed: 12});
			}
			return L;
		}, [q]);
		const lamps = useMemo<Vec3[]>(() => Array.from({length: 24}, (_, i) => [-7.5 + (i % 2) * 15, 0, -120 + Math.floor(i / 2) * 22]), []);
		return (
			<>
				<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
					<planeGeometry args={[1400, 1400]} />
					<meshStandardMaterial color="#2a2c30" roughness={wet ? 0.18 : 0.9} metalness={wet ? 0.3 : 0} />
				</mesh>
				<Buildings buildings={glass} style="glass" night={light.night} metalness={0.5} roughness={0.25} />
				<Buildings buildings={concrete} style="modern" night={light.night} />
				{anim.has('traffic') || anim.has('moving_crowds') ? <Traffic lanes={lanes} t={t} night={light.night} palette={['#9a1b1b', '#e8e8e8', '#1b1b1d', '#2d4b7a', '#c9a227', '#6d6f72']} /> : null}
				<StreetLamps at={lamps} night={light.night} />
				{anim.has('flying_birds') && <Birds count={10} center={[0, 60, -20]} radius={60} t={t} />}
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// MODERN STREET
const modernStreet: EnvDef = {
	stage: {subject: [0, 0, 0], subjectSize: 7, heading: 0, groundAt: flat, radius: 160},
	smokeAt: [[6.5, 0.2, -18]],
	fireAt: [[6.5, 0, -18]],
	explosionAt: [[0, 0, -45]],
	dustColor: '#fff0d8',
	fogScale: 1,
	shadowRadius: 60,
	shafts: {center: [0, 10, -30], spread: 20, length: 50},
	cloudHeight: 160,
	Component: ({t, light, q, anim, wet}) => {
		const rows = useMemo(() => {
			const r = rng(401);
			const out: BuildingSpec[] = [];
			for (const side of [-1, 1]) {
				let z = 60;
				while (z > -200) {
					const w = 9 + r() * 9;
					const g = 0.75 + r() * 0.3;
					const hue = r();
					const tint = hue < 0.3 ? `rgb(${Math.floor(g * 235)},${Math.floor(g * 210)},${Math.floor(g * 180)})` : hue < 0.6 ? `rgb(${Math.floor(g * 200)},${Math.floor(g * 205)},${Math.floor(g * 210)})` : `rgb(${Math.floor(g * 225)},${Math.floor(g * 190)},${Math.floor(g * 170)})`;
					out.push({x: side * (13 + 6), y: 0, z: z - w / 2, w: 12, d: w - 0.4, h: 12 + r() * 26, rot: 0, tint});
					z -= w;
				}
			}
			return out;
		}, []);
		const shops = useMemo(() => rows.map((b, i) => ({x: b.x - Math.sign(b.x) * 6.05, z: b.z, w: b.d * 0.8, c: ['#ff5a3c', '#3cc4ff', '#ffd23c', '#7cff6b', '#ff3cc8'][i % 5]})), [rows]);
		const signMat = useMemo(() => new THREE.MeshStandardMaterial({color: '#222', emissive: new THREE.Color('#ffffff')}), []);
		signMat.emissiveIntensity = 0.15 + light.night * 2.4;
		const lanes = useMemo(() => [
			{x0: -2.6, z0: 80, x1: -2.6, z1: -220, y: 0, n: Math.floor(9 * q) + 3, speed: 11},
			{x0: 2.6, z0: -220, x1: 2.6, z1: 80, y: 0, n: Math.floor(9 * q) + 3, speed: 9},
		], [q]);
		const people = useMemo(() => makeAgents(Math.floor(70 * q) + 16, 402, (r) => [(r() < 0.5 ? -1 : 1) * (7 + r() * 3), 40 - r() * 200], ['#1f2a3a', '#7a2a2a', '#c9c3b5', '#3b4d2f', '#5a4a6a', '#d6a032', '#202020'], ['#e0b49a', '#b07a5a', '#7a4f37', '#f1cdb4'], 1.3, 18).map((a) => ({...a, dir: a.dir > Math.PI ? 0 : Math.PI})), [q]);
		const lamps = useMemo<Vec3[]>(() => Array.from({length: 16}, (_, i) => [(i % 2 ? 1 : -1) * 6.8, 0.15, 20 - Math.floor(i / 2) * 22]), []);
		const trees = useMemo<TreeSpec[]>(() => Array.from({length: 10}, (_, i) => ({x: (i % 2 ? 1 : -1) * 6.6, y: 0.15, z: 9 - Math.floor(i / 2) * 22, s: 0.65, kind: 'broadleaf', phase: i / 10})), []);
		return (
			<>
				<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, -70]}>
					<planeGeometry args={[11, 320]} />
					<meshStandardMaterial color="#2b2d30" roughness={wet ? 0.12 : 0.85} metalness={wet ? 0.35 : 0} />
				</mesh>
				{[-1, 1].map((s) => (
					<mesh key={s} position={[s * 9.5, 0.075, -70]} receiveShadow>
						<boxGeometry args={[8, 0.15, 320]} />
						<meshStandardMaterial color="#8b8781" roughness={wet ? 0.3 : 0.9} />
					</mesh>
				))}
				<Instanced count={60} geometry={GEO.box} material={stdMat('#d9d4c4', 0.6)} castShadow={false} place={(i, o) => {
					o.position.set(0, 0.01, 60 - i * 5);
					o.scale.set(0.15, 0.02, 2.4);
				}} />
				<Buildings buildings={rows} style="plaster" night={light.night} />
				<Instanced count={shops.length} geometry={GEO.box} material={signMat} castShadow={false} color={(i) => shops[i].c} place={(i, o) => {
					const s = shops[i];
					o.position.set(s.x, 3.6, s.z);
					o.scale.set(0.12, 0.8, s.w);
				}} />
				<Trees trees={trees} t={t} wind={0.5} />
				<StreetLamps at={lamps} night={light.night} realLights={6} />
				{(anim.has('traffic') || anim.has('moving_crowds')) && <Traffic lanes={lanes} t={t} night={light.night} palette={['#9a1b1b', '#e8e8e8', '#141416', '#2d4b7a', '#f2c230', '#6d6f72']} />}
				<Crowd agents={people} t={t} groundAt={() => 0.15} moving={anim.has('moving_crowds')} />
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// FUTURISTIC CITY
const futuristic: EnvDef = {
	stage: {subject: [0, 0, 0], subjectSize: 46, heading: 0.4, groundAt: flat, radius: 560},
	smokeAt: [[20, 1, -30]],
	fireAt: [[20, 0, -30]],
	explosionAt: [[30, 0, -50]],
	dustColor: '#9fe8ff',
	fogScale: 1.1,
	shadowRadius: 180,
	shafts: {center: [0, 50, -60], spread: 120, length: 120},
	cloudHeight: 260,
	Component: ({t, light, q, anim}) => {
		const towers = useMemo(() => cityBuildings(501, 240, 48, 16, 260, 26).filter((_, i) => i % 5 < 3).map((b) => ({...b, w: b.w * 0.62, d: b.d * 0.62, tint: '#c8d2e6'})), []);
		const strips = useMemo(() => towers.filter((_, i) => i % 2 === 0).flatMap((b, i) => [-1, 1].map((s) => ({x: b.x + (s * b.w) / 2, z: b.z + b.d / 2, h: b.h, c: i % 3 === 0 ? '#ff2fb0' : '#2ff0ff'}))), [towers]);
		const neon = useMemo(() => new THREE.MeshStandardMaterial({color: '#000', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 3, toneMapped: false}), []);
		const rings = useMemo(() => towers.filter((b) => b.h > 150).slice(0, 8), [towers]);
		const air = useMemo(() => {
			const r = rng(502);
			return Array.from({length: 10}, (_, i) => {
				const a = r() * Math.PI;
				const R = 260;
				return {x0: Math.cos(a) * R, z0: Math.sin(a) * R, x1: -Math.cos(a) * R, z1: -Math.sin(a) * R, y: 30 + i * 9, n: Math.floor(6 * q) + 2, speed: 25 + r() * 15};
			});
		}, [q]);
		return (
			<>
				<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
					<planeGeometry args={[1200, 1200]} />
					<meshStandardMaterial color="#14171d" roughness={0.22} metalness={0.55} />
				</mesh>
				<Buildings buildings={towers} style="future" night={Math.max(0.55, light.night)} metalness={0.6} roughness={0.3} />
				<Instanced count={strips.length} geometry={GEO.box} material={neon} castShadow={false} color={(i) => strips[i].c} place={(i, o) => {
					const s = strips[i];
					o.position.set(s.x, 0, s.z);
					o.scale.set(0.5, s.h, 0.5);
				}} />
				{rings.map((b, i) => (
					<mesh key={i} position={[b.x, b.h * (0.55 + 0.15 * Math.sin(t * 0.6 + i)), b.z]} rotation={[Math.PI / 2, 0, t * 0.3 + i]}>
						<torusGeometry args={[Math.max(b.w, b.d) * 0.85, 0.5, 8, 48]} />
						<meshBasicMaterial color={i % 2 ? '#2ff0ff' : '#ff2fb0'} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
					</mesh>
				))}
				{(anim.has('traffic') || anim.has('moving_crowds')) && <Traffic lanes={air} t={t} night={1} flying palette={['#e9eef5', '#30343c', '#7a8496']} />}
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// MEDIEVAL VILLAGE
const medievalH = (x: number, z: number) => {
	const r = Math.hypot(x, z);
	// Flat-topped motte so the 44 m keep sits on solid ground.
	const castleHill = 24 * smoothstep(52, 30, Math.hypot(x - 10, z + 95));
	return (fbm(x / 90, z / 90, 4, 21) * 14 - 5) * smoothstep(30, 110, r) + castleHill + fbm(x / 10, z / 10, 2, 22) * 0.4;
};
const medieval: EnvDef = {
	stage: {subject: [0, medievalH(0, 0), 0], subjectSize: 14, heading: 0.25, groundAt: medievalH, radius: 260},
	smokeAt: [[-14, 9, -12], [16, 9, 6], [-5, 9, 20]],
	fireAt: [[3, medievalH(3, 6), 6]],
	explosionAt: [[25, medievalH(25, -30), -30]],
	dustColor: '#ffe2b5',
	fogScale: 1.1,
	shadowRadius: 110,
	shafts: {center: [0, 10, -20], spread: 70, length: 70},
	cloudHeight: 150,
	Component: ({t, light, wind, q, anim}) => {
		const houses = useMemo(() => {
			// Organic village: rejection-sampled plots, each house turned to face the square.
			const r = rng(601);
			const out: (BuildingSpec & {roofH: number})[] = [];
			let guard = 0;
			while (out.length < 46 && guard++ < 4000) {
				const a = r() * Math.PI * 2;
				const ring = 17 + Math.sqrt(r()) * 40;
				const x = Math.cos(a) * ring;
				const z = Math.sin(a) * ring;
				if (z > 40 && Math.abs(x) < 7) continue; // gate road
				if (out.some((h) => Math.hypot(h.x - x, h.z - z) < 10.5)) continue;
				const w = 6 + r() * 4;
				const d = 5 + r() * 3;
				const g = 0.82 + r() * 0.18;
				out.push({x, z, y: medievalH(x, z) - 0.3, w, d, h: 3.5 + r() * 3.5, rot: Math.atan2(-x, -z) + (r() - 0.5) * 0.5, tint: `rgb(${Math.floor(g * 236)},${Math.floor(g * 222)},${Math.floor(g * 196)})`, roofH: 3 + r() * 2});
			}
			return out;
		}, []);
		const castleY = medievalH(10, -95);
		const towers: Vec3[] = [[-12, castleY, -107], [32, castleY, -107], [-12, castleY, -83], [32, castleY, -83]];
		const stone = stdMat('#8f877b', 0.92);
		const palisade = useMemo(() => Array.from({length: 150}, (_, i) => {
			const a = (i / 150) * Math.PI * 2;
			const x = Math.cos(a) * 62;
			const z = Math.sin(a) * 62;
			return {x, z, y: medievalH(x, z)};
		}).filter((p) => !(p.z > 50 && Math.abs(p.x) < 6)), []);
		const trees = useMemo<TreeSpec[]>(() => {
			const r = rng(603);
			return scatter(Math.floor(450 * q) + 80, 604, (g) => {
				const x = (g() - 0.5) * 460;
				const z = (g() - 0.5) * 460;
				const d = Math.hypot(x, z);
				if (d < 72 || Math.hypot(x - 10, z + 95) < 45) return null;
				return [x, z];
			}).map(([x, z, k]) => ({x, z, y: medievalH(x, z), s: 0.9 + k * 0.7, kind: r() < 0.5 ? 'conifer' : 'broadleaf', phase: r()}));
		}, [q]);
		const people = useMemo(() => makeAgents(Math.floor(40 * q) + 12, 605, (r) => [(r() - 0.5) * 26, (r() - 0.5) * 26], ['#5b4636', '#7a6a4f', '#3f4a2f', '#6e2f2a', '#8a7d64'], ['#e3b996', '#c99a78'], 0.9, 5), [q]);
		const stalls = [[-6, 5], [6, 6], [-7, -5], [7, -6]];
		const flags = useMemo(() => towers.map((p, i) => ({x: p[0], y: p[1] + 16, z: p[2], pole: 5, w: 2.6, h: 1.6, color: i % 2 ? '#7d1d1d' : '#1d3f7d', rot: 0.3})), [castleY]);
		return (
			<>
				<Terrain size={600} segments={Math.floor(110 + 80 * q)} heightAt={medievalH} detailSeed={21} colorAt={(x, z, h, slope) => {
					const d = Math.hypot(x, z);
					let c = mixC(col('#55702f'), col('#6e7a38'), fbm(x / 40, z / 40, 3, 23));
					c = mixC(c, col('#7a6448'), 1 - smoothstep(14, 22, d)); // trodden square
					return mixC(c, col('#6a6255'), slope * 3);
				}} />
				<Buildings buildings={houses} style="plaster" night={light.night * 0.6} />
				<Roofs roofs={houses.map((h) => ({x: h.x, y: h.y + h.h, z: h.z, w: h.w, d: h.d, h: h.roofH, rot: h.rot}))} color="#6b4a2e" />
				<mesh position={[10, castleY + 1, -95]} castShadow receiveShadow>
					<boxGeometry args={[44, 22, 24]} />
					<primitive object={stone} attach="material" />
				</mesh>
				<mesh position={[10, castleY + 13, -95]} castShadow>
					<boxGeometry args={[18, 14, 12]} />
					<primitive object={stone} attach="material" />
				</mesh>
				{towers.map((p, i) => (
					<group key={i} position={p}>
						<mesh position={[0, 4, 0]} castShadow receiveShadow>
							<cylinderGeometry args={[3.4, 3.8, 24, 16]} />
							<primitive object={stone} attach="material" />
						</mesh>
						<mesh position={[0, 19, 0]} castShadow>
							<coneGeometry args={[4.2, 6, 16]} />
							<meshStandardMaterial color="#3c3f55" roughness={0.8} />
						</mesh>
					</group>
				))}
				<Instanced count={palisade.length} geometry={GEO.trunk} material={stdMat('#5a4330', 0.95)} place={(i, o) => {
					const p = palisade[i];
					o.position.set(p.x, p.y - 0.5, p.z);
					o.scale.set(0.9, 4.2 + (i % 3) * 0.3, 0.9);
				}} />
				<mesh position={[0, medievalH(0, 0) + 0.6, 0]} castShadow receiveShadow>
					<cylinderGeometry args={[1.4, 1.5, 1.2, 18]} />
					<primitive object={stone} attach="material" />
				</mesh>
				{stalls.map(([x, z], i) => (
					<group key={i} position={[x, medievalH(x, z), z]} rotation={[0, Math.atan2(x, z), 0]}>
						<mesh position={[0, 0.5, 0]} castShadow receiveShadow>
							<boxGeometry args={[3, 1, 1.6]} />
							<meshStandardMaterial color="#6a4b30" />
						</mesh>
						<mesh position={[0, 2.4, 0]} rotation={[0.2, 0, 0]} castShadow>
							<boxGeometry args={[3.4, 0.08, 2.2]} />
							<meshStandardMaterial color={['#a33b2b', '#d0b25a', '#3b6aa3', '#e6e0cc'][i]} roughness={0.9} />
						</mesh>
					</group>
				))}
				<Trees trees={trees} t={t} wind={anim.has('swaying_trees') ? 1 + wind * 2 : 0.4 + wind} />
				<Crowd agents={people} t={t} groundAt={medievalH} moving={anim.has('moving_crowds')} />
				{anim.has('flags_in_wind') && <Flags flags={flags} t={t} wind={0.5 + wind} />}
				{anim.has('flying_birds') && <Birds count={12} center={[10, 60, -70]} radius={40} t={t} />}
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// ANCIENT ROMAN CITY
const romeH = (x: number, z: number) => {
	const r = Math.hypot(x, z);
	return (fbm(x / 120, z / 120, 4, 31) * 40 - 8) * smoothstep(170, 330, r) + fbm(x / 12, z / 12, 2, 32) * 0.25;
};
const rome: EnvDef = {
	stage: {subject: [0, 0, -6], subjectSize: 18, heading: 0, groundAt: romeH, radius: 320},
	smokeAt: [[-30, 12, 30], [46, 10, -10]],
	fireAt: [[-4, 3.2, -14], [4, 3.2, -14]],
	explosionAt: [[40, 0, 30]],
	dustColor: '#ffd9a0',
	fogScale: 0.9,
	shadowRadius: 150,
	shafts: {center: [0, 20, -40], spread: 120, length: 90},
	cloudHeight: 200,
	Component: ({t, light, wind, q, anim}) => {
		const marble = stdMat('#e9e0cd', 0.55);
		const travertine = stdMat('#cdbb98', 0.85);
		// Temple: podium + peristyle + pediment.
		const templeCols = useMemo(() => {
			const out: {x: number; y: number; z: number; h: number; r: number}[] = [];
			for (let i = 0; i < 8; i++) for (const zz of [-22, -48]) out.push({x: -14 + i * 4, y: 4, z: zz, h: 15, r: 0.85});
			for (let j = 1; j < 6; j++) for (const xx of [-14, 14]) out.push({x: xx, y: 4, z: -22 - j * 4.33, h: 15, r: 0.85});
			// Forum colonnades
			for (let k = 0; k < 14; k++) for (const xx of [-28, 28]) out.push({x: xx, y: 0, z: 14 - k * 4, h: 8, r: 0.5});
			return out;
		}, []);
		// Colosseum: elliptical arcades, three tiers.
		const colos = useMemo(() => {
			const piers: {x: number; y: number; z: number; rot: number; h: number}[] = [];
			const N = 64;
			for (let tier = 0; tier < 3; tier++) for (let i = 0; i < N; i++) {
				const a = (i / N) * Math.PI * 2;
				piers.push({x: -110 + Math.cos(a) * 50, z: -130 + Math.sin(a) * 41, y: tier * 10, rot: -a, h: 10});
			}
			return piers;
		}, []);
		const insulae = useMemo(() => {
			const r = rng(701);
			const out: BuildingSpec[] = [];
			for (let i = 0; i < 160; i++) {
				const x = (r() - 0.5) * 380;
				const z = (r() - 0.5) * 380;
				if (Math.abs(x) < 36 && z > -60 && z < 30) continue; // forum
				if (Math.hypot((x + 110) / 62, (z + 130) / 52) < 1) continue; // colosseum
				if (Math.abs(x - 85) < 8) continue; // aqueduct
				const w = 8 + r() * 10;
				const g = 0.8 + r() * 0.2;
				out.push({x, z, y: romeH(x, z) - 0.2, w, d: 8 + r() * 10, h: 5 + r() * 12, rot: Math.round(r()) * Math.PI / 2, tint: `rgb(${Math.floor(g * 236)},${Math.floor(g * 214)},${Math.floor(g * 176)})`});
			}
			return out;
		}, []);
		const aqueduct = useMemo(() => Array.from({length: 40}, (_, i) => ({z: 160 - i * 9})), []);
		const people = useMemo(() => makeAgents(Math.floor(110 * q) + 24, 702, (r) => [(r() - 0.5) * 48, 20 - r() * 34], ['#efe9dc', '#e8e1d0', '#8f2a24', '#b98b3b', '#6c5a8a', '#d9cfb8'], ['#d7a582', '#b98563', '#e6c0a0'], 0.8, 6), [q]);
		const trees = useMemo<TreeSpec[]>(() => {
			const r = rng(703);
			return scatter(Math.floor(220 * q) + 40, 704, (g) => {
				const x = (g() - 0.5) * 520;
				const z = (g() - 0.5) * 520;
				if (Math.hypot(x, z) < 60 || Math.hypot((x + 110) / 62, (z + 130) / 52) < 1.1) return null;
				return [x, z];
			}).map(([x, z, k]) => ({x, z, y: romeH(x, z), s: 1 + k * 0.6, kind: r() < 0.7 ? 'cypress' : 'broadleaf', phase: r()}));
		}, [q]);
		const banners = useMemo(() => [-10, -3, 3, 10].map((x, i) => ({x, y: 0, z: 8, pole: 9, w: 1.6, h: 3.2, color: i % 2 ? '#8f1d1d' : '#a3261f', rot: Math.PI / 2})), []);
		return (
			<>
				<Terrain size={900} segments={Math.floor(100 + 80 * q)} heightAt={romeH} detailSeed={31} colorAt={(x, z, h, slope) => {
					const forum = Math.abs(x) < 34 && z > -62 && z < 26;
					let c = mixC(col('#8c8a52'), col('#a29660'), fbm(x / 40, z / 40, 3, 33));
					if (forum) c = mixC(col('#cbbd9e'), col('#b8a988'), fbm(x / 3, z / 3, 2, 34));
					return mixC(c, col('#7b7060'), slope * 3);
				}} />
				{/* Temple of the forum */}
				<mesh position={[0, 2, -35]} castShadow receiveShadow>
					<boxGeometry args={[34, 4, 34]} />
					<primitive object={travertine} attach="material" />
				</mesh>
				<mesh position={[0, 11, -38]} castShadow receiveShadow>
					<boxGeometry args={[22, 14, 18]} />
					<primitive object={marble} attach="material" />
				</mesh>
				<mesh position={[0, 20, -35]} castShadow>
					<boxGeometry args={[31, 2.2, 31]} />
					<primitive object={marble} attach="material" />
				</mesh>
				<mesh position={[0, 21, -35]} scale={[31, 5, 31]} rotation={[0, Math.PI / 2, 0]} castShadow geometry={GEO.roof}>
					<meshStandardMaterial color="#b0603d" roughness={0.8} />
				</mesh>
				{[0, 1, 2].map((s) => (
					<mesh key={s} position={[0, 0.6 + s * 0.6, -16 - s * 0.8]} receiveShadow castShadow>
						<boxGeometry args={[22, 1.2 + s * 1.2, 2]} />
						<primitive object={travertine} attach="material" />
					</mesh>
				))}
				<Columns cols={templeCols} />
				{/* Colosseum */}
				<Instanced count={colos.length} geometry={GEO.box} material={travertine} place={(i, o) => {
					const p = colos[i];
					o.position.set(p.x, p.y, p.z);
					o.rotation.y = p.rot;
					o.scale.set(1.6, p.h * 0.72, 2.2);
				}} />
				{[0, 1, 2, 3].map((tier) => (
					<mesh key={tier} position={[-110, tier * 10 + (tier === 3 ? 4 : 7.6), -130]} scale={[50, 1, 41]} castShadow receiveShadow>
						<cylinderGeometry args={[1, 1, tier === 3 ? 8 : 2.6, 64, 1, true]} />
						<meshStandardMaterial color="#c9b690" roughness={0.9} side={THREE.DoubleSide} />
					</mesh>
				))}
				<mesh position={[-110, 0.3, -130]} scale={[40, 1, 31]} receiveShadow>
					<cylinderGeometry args={[1, 1, 0.6, 48]} />
					<meshStandardMaterial color="#d8c39a" roughness={1} />
				</mesh>
				{/* Aqueduct */}
				<Instanced count={aqueduct.length * 2} geometry={GEO.box} material={travertine} place={(i, o) => {
					const a = aqueduct[i % aqueduct.length];
					const tier = Math.floor(i / aqueduct.length);
					o.position.set(85, tier * 11 + romeH(85, a.z), a.z);
					o.scale.set(3, 9, 2.4);
				}} />
				<mesh position={[85, 21, -20]} castShadow receiveShadow>
					<boxGeometry args={[3.4, 2.4, 364]} />
					<primitive object={travertine} attach="material" />
				</mesh>
				<Buildings buildings={insulae} style="stone" night={light.night * 0.5} />
				<Roofs roofs={insulae.map((b) => ({x: b.x, y: b.y + b.h, z: b.z, w: b.w, d: b.d, h: 2.4, rot: b.rot}))} color="#a5573a" />
				<Trees trees={trees} t={t} wind={0.4 + wind} foliage={['#3d5a2c', '#4a6a34']} />
				<Crowd agents={people} t={t} groundAt={romeH} moving={anim.has('moving_crowds')} />
				{anim.has('flags_in_wind') && <Flags flags={banners} t={t} wind={0.5 + wind} />}
				{anim.has('flying_birds') && <Birds count={12} center={[0, 50, -40]} radius={60} t={t} />}
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// BATTLEFIELD
const craters: [number, number, number][] = [[12, -8, 5], [-18, 10, 4], [30, 20, 6], [-6, -32, 5], [24, -40, 4], [-34, -12, 5]];
const battleH = (x: number, z: number) => {
	let h = fbm(x / 80, z / 80, 4, 41) * 16 - 6 + fbm(x / 6, z / 6, 2, 42) * 0.5;
	for (const [cx, cz, r] of craters) {
		const d = Math.hypot(x - cx, z - cz) / r;
		if (d < 1.4) h += -1.6 * Math.exp(-d * d * 2.2) + 0.5 * Math.exp(-((d - 1) ** 2) * 18);
	}
	return h * smoothstep(0, 1, 1);
};
const battlefield: EnvDef = {
	stage: {subject: [0, battleH(0, 0), 0], subjectSize: 20, heading: 0.9, groundAt: battleH, radius: 260},
	smokeAt: craters.map(([x, z]) => [x, battleH(x, z), z] as Vec3).concat([[-50, battleH(-50, -60), -60], [60, battleH(60, -40), -40]]),
	fireAt: [[30, battleH(30, 20), 20], [-34, battleH(-34, -12), -12], [24, battleH(24, -40), -40]],
	explosionAt: [[16, battleH(16, -14), -14], [-20, battleH(-20, -26), -26], [8, battleH(8, 24), 24]],
	dustColor: '#d9c09a',
	fogScale: 0.65,
	shadowRadius: 120,
	shafts: {center: [0, 20, -30], spread: 100, length: 80},
	cloudHeight: 130,
	Component: ({t, wind, q, anim}) => {
		const army = (seed: number, x0: number, dir: number, color: string) =>
			Array.from({length: Math.floor(70 * q) + 24}, (_, i) => {
				const r = rng(seed + i);
				const row = Math.floor(i / 12);
				const x = x0 - Math.sin(dir) * row * 2.2 + (r() - 0.5) * 0.6;
				const z = ((i % 12) - 6) * 2.6 + (r() - 0.5) * 0.8;
				return {x, z, dir, speed: 2.4 + r() * 0.6, range: 40, color, head: '#8a8f96', s: 1, phase: 0};
			});
		const red = useMemo(() => army(801, -48, Math.PI / 2, '#7a1f1c'), [q]);
		const blue = useMemo(() => army(851, 48, -Math.PI / 2, '#2b3e5c'), [q]);
		const stakes = useMemo(() => scatter(160, 802, (g) => [(g() - 0.5) * 140, (g() - 0.5) * 140]).map(([x, z, k]) => ({x, z, k})), []);
		const wrecks = useMemo(() => scatter(14, 803, (g) => [(g() - 0.5) * 90, (g() - 0.5) * 90]).map(([x, z, k]) => ({x, z, k})), []);
		const flags = useMemo(() => [
			{x: -56, y: battleH(-56, -6), z: -6, pole: 7, w: 2.6, h: 1.8, color: '#8a1c17', rot: Math.PI / 2},
			{x: -56, y: battleH(-56, 8), z: 8, pole: 7, w: 2.6, h: 1.8, color: '#8a1c17', rot: Math.PI / 2},
			{x: 56, y: battleH(56, -6), z: -6, pole: 7, w: 2.6, h: 1.8, color: '#1f3b6e', rot: -Math.PI / 2},
			{x: 56, y: battleH(56, 8), z: 8, pole: 7, w: 2.6, h: 1.8, color: '#1f3b6e', rot: -Math.PI / 2},
		], []);
		const wood = stdMat('#3a2c20', 0.95);
		return (
			<>
				<Terrain size={560} segments={Math.floor(130 + 90 * q)} heightAt={battleH} detailSeed={41} colorAt={(x, z, h, slope) => {
					let c = mixC(col('#4d4232'), col('#5d5a3a'), fbm(x / 30, z / 30, 3, 43));
					for (const [cx, cz, r] of craters) if (Math.hypot(x - cx, z - cz) < r * 1.2) c = mixC(c, col('#1f1a16'), 0.7);
					return mixC(c, col('#3b332a'), slope * 2);
				}} />
				<Instanced count={stakes.length} geometry={GEO.cyl} material={wood} place={(i, o) => {
					const s = stakes[i];
					o.position.set(s.x, battleH(s.x, s.z) - 0.2, s.z);
					o.rotation.set((s.k - 0.5) * 0.9, s.k * 6, (s.k - 0.5) * 0.7);
					o.scale.set(0.09, 2.4 + s.k * 1.5, 0.09);
				}} />
				{wrecks.map((w, i) => (
					<group key={i} position={[w.x, battleH(w.x, w.z) + 0.4, w.z]} rotation={[w.k * 0.4, w.k * 6, (w.k - 0.5) * 0.6]}>
						<mesh castShadow receiveShadow>
							<boxGeometry args={[3, 0.8, 1.6]} />
							<primitive object={wood} attach="material" />
						</mesh>
						<mesh position={[1.2, -0.1, 0.9]} rotation={[Math.PI / 2, 0, 0]} castShadow>
							<torusGeometry args={[0.55, 0.09, 6, 14]} />
							<primitive object={wood} attach="material" />
						</mesh>
						{i % 3 === 0 && (
							<mesh position={[0, 0.6, 0]} rotation={[0, 0, Math.PI / 2 - 0.15]} castShadow>
								<cylinderGeometry args={[0.28, 0.36, 3.2, 12]} />
								<meshStandardMaterial color="#2b2b2b" metalness={0.8} roughness={0.4} />
							</mesh>
						)}
					</group>
				))}
				<Crowd agents={red} t={t} groundAt={battleH} moving={anim.has('moving_crowds')} />
				<Crowd agents={blue} t={t} groundAt={battleH} moving={anim.has('moving_crowds')} />
				<Flags flags={flags} t={t} wind={anim.has('flags_in_wind') ? 0.6 + wind : 0.25} />
				{anim.has('flying_birds') && <Birds count={16} center={[0, 35, -10]} radius={35} t={t} />}
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// INTERIOR (study / hall with sunlit windows)
const interior: EnvDef = {
	stage: {subject: [0, 0.85, 0], subjectSize: 2.4, heading: 0.35, groundAt: () => 0, radius: 9, bounds: {min: [-6.4, 0.4, -4.6], max: [6.4, 4.0, 5.0]}},
	smokeAt: [[0, 0.9, 0]],
	fireAt: [[-5.4, 0.2, -3.4]],
	explosionAt: [[0, 0, -4]],
	dustColor: '#ffe6b8',
	fogScale: 0.05,
	shadowRadius: 14,
	shafts: {center: [0, 2.4, -4.9], spread: 5, length: 9},
	cloudHeight: 200,
	Component: () => {
		const W = 14;
		const D = 11;
		const H = 4.4;
		const plaster = stdMat('#d9cdb5', 0.95);
		const beam = stdMat('#4a3423', 0.9);
		const floorTex = plankTexture();
		const books = useMemo(() => {
			const r = rng(901);
			const out: {x: number; y: number; w: number; h: number; c: string}[] = [];
			for (let shelf = 0; shelf < 5; shelf++) {
				let x = -2.4;
				while (x < 2.3) {
					const w = 0.06 + r() * 0.08;
					out.push({x: x + w / 2, y: 0.25 + shelf * 0.62, w, h: 0.36 + r() * 0.16, c: ['#6e2a22', '#2a3e5a', '#3c5a2e', '#7a5a2a', '#2b2b2b', '#8a7a5a'][Math.floor(r() * 6)]});
					x += w + 0.01;
				}
			}
			return out;
		}, []);
		const bookMat = useMemo(() => new THREE.MeshStandardMaterial({roughness: 0.8}), []);
		// Back wall (z = -D/2) with two window openings, built from blocks so sunlight casts real window-shaped light.
		const wz = -D / 2;
		const winX = [-3, 3];
		const winW = 2.2;
		const sill = 1.2;
		const top = 3.5;
		const segs: [number, number, number, number][] = []; // x center, width, y center, height
		const edges = [-W / 2, winX[0] - winW / 2, winX[0] + winW / 2, winX[1] - winW / 2, winX[1] + winW / 2, W / 2];
		for (let i = 0; i < edges.length - 1; i++) {
			const x0 = edges[i];
			const x1 = edges[i + 1];
			const isWin = i === 1 || i === 3;
			if (!isWin) segs.push([(x0 + x1) / 2, x1 - x0, H / 2, H]);
			else {
				segs.push([(x0 + x1) / 2, x1 - x0, sill / 2, sill]);
				segs.push([(x0 + x1) / 2, x1 - x0, (top + H) / 2, H - top]);
			}
		}
		return (
			<>
				<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
					<planeGeometry args={[W, D]} />
					<meshStandardMaterial map={floorTex} roughness={0.55} />
				</mesh>
				<mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
					<planeGeometry args={[W, D]} />
					<primitive object={plaster} attach="material" />
				</mesh>
				{segs.map(([x, w, y, h], i) => (
					<mesh key={i} position={[x, y, wz]} castShadow receiveShadow>
						<boxGeometry args={[w, h, 0.4]} />
						<primitive object={plaster} attach="material" />
					</mesh>
				))}
				{winX.map((x) => (
					<group key={x}>
						<mesh position={[x, (sill + top) / 2, wz]} castShadow>
							<boxGeometry args={[0.08, top - sill, 0.12]} />
							<primitive object={beam} attach="material" />
						</mesh>
						<mesh position={[x, (sill + top) / 2, wz]} castShadow>
							<boxGeometry args={[winW, 0.08, 0.12]} />
							<primitive object={beam} attach="material" />
						</mesh>
					</group>
				))}
				{[-W / 2, W / 2].map((x) => (
					<mesh key={x} position={[x, H / 2, 0]} castShadow receiveShadow>
						<boxGeometry args={[0.4, H, D]} />
						<primitive object={plaster} attach="material" />
					</mesh>
				))}
				<mesh position={[0, H / 2, D / 2]} receiveShadow>
					<boxGeometry args={[W, H, 0.4]} />
					<primitive object={plaster} attach="material" />
				</mesh>
				{[-4.5, -1.5, 1.5, 4.5].map((x) => (
					<mesh key={x} position={[x, H - 0.15, 0]} castShadow>
						<boxGeometry args={[0.3, 0.3, D]} />
						<primitive object={beam} attach="material" />
					</mesh>
				))}
				{/* Outside: a few tree silhouettes beyond the windows */}
				{[-6, -2, 2.5, 7].map((x, i) => (
					<mesh key={i} position={[x, 3 + i * 0.4, wz - 9 - i * 2]}>
						<icosahedronGeometry args={[2.6, 1]} />
						<meshStandardMaterial color="#4f6b3b" flatShading />
					</mesh>
				))}
				{/* Table + chairs */}
				<mesh position={[0, 0.82, 0]} castShadow receiveShadow>
					<boxGeometry args={[2.6, 0.08, 1.3]} />
					<meshStandardMaterial color="#5b3b22" roughness={0.45} />
				</mesh>
				{[[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]].map(([x, z], i) => (
					<mesh key={i} position={[x, 0.39, z]} castShadow>
						<boxGeometry args={[0.08, 0.78, 0.08]} />
						<meshStandardMaterial color="#4a2f1a" />
					</mesh>
				))}
				{[-0.7, 0.7].map((x) => (
					<group key={x} position={[x, 0, 1.1]}>
						<mesh position={[0, 0.48, 0]} castShadow>
							<boxGeometry args={[0.5, 0.06, 0.5]} />
							<meshStandardMaterial color="#4a2f1a" />
						</mesh>
						<mesh position={[0, 0.95, 0.23]} castShadow>
							<boxGeometry args={[0.5, 0.9, 0.05]} />
							<meshStandardMaterial color="#4a2f1a" />
						</mesh>
					</group>
				))}
				{/* Open book, candle, globe on the table */}
				<mesh position={[-0.3, 0.87, 0.05]} rotation={[-Math.PI / 2, 0, 0.2]} receiveShadow>
					<planeGeometry args={[0.6, 0.42]} />
					<meshStandardMaterial color="#efe6cf" roughness={0.9} side={THREE.DoubleSide} />
				</mesh>
				<mesh position={[0.7, 0.98, -0.2]} castShadow>
					<sphereGeometry args={[0.15, 24, 16]} />
					<meshStandardMaterial color="#3b6d8a" roughness={0.4} />
				</mesh>
				<mesh position={[0.3, 0.95, 0.25]} castShadow>
					<cylinderGeometry args={[0.03, 0.035, 0.18, 10]} />
					<meshStandardMaterial color="#f4ecd8" emissive="#ffb060" emissiveIntensity={0.2} />
				</mesh>
				{/* Rug */}
				<mesh position={[0, 0.005, 0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
					<planeGeometry args={[4.6, 3.2]} />
					<meshStandardMaterial color="#6e2420" roughness={1} />
				</mesh>
				{/* Bookshelf (right wall) */}
				<group position={[W / 2 - 0.5, 0, -1]} rotation={[0, -Math.PI / 2, 0]}>
					<mesh position={[0, 1.6, -0.15]} castShadow receiveShadow>
						<boxGeometry args={[5, 3.2, 0.1]} />
						<primitive object={beam} attach="material" />
					</mesh>
					{[0, 1, 2, 3, 4, 5].map((s) => (
						<mesh key={s} position={[0, 0.2 + s * 0.62, 0]} castShadow receiveShadow>
							<boxGeometry args={[5, 0.05, 0.36]} />
							<primitive object={beam} attach="material" />
						</mesh>
					))}
					<Instanced count={books.length} geometry={GEO.box} material={bookMat} color={(i) => books[i].c} place={(i, o) => {
						const b = books[i];
						o.position.set(b.x, b.y, 0);
						o.scale.set(b.w, b.h, 0.28);
					}} />
				</group>
				{/* Fireplace (left wall) */}
				<group position={[-W / 2 + 0.5, 0, -3.4]}>
					<mesh position={[0.2, 0.8, 0]} castShadow receiveShadow>
						<boxGeometry args={[0.8, 1.6, 2.4]} />
						<meshStandardMaterial color="#6d655b" roughness={0.95} />
					</mesh>
					<mesh position={[0.62, 0.6, 0]}>
						<boxGeometry args={[0.05, 1, 1.4]} />
						<meshStandardMaterial color="#120e0b" />
					</mesh>
				</group>
			</>
		);
	},
};

// ════════════════════════════════════════════════════════════════════════════
// OCEAN & COASTLINE
const coastH = (x: number, z: number) => {
	const shore = -z - 30 + fbm(x / 60, 0, 3, 51) * 25; // >0 = inland (towards -z)
	const land = smoothstep(-20, 50, shore) * (6 + fbm(x / 70, z / 70, 4, 52) * 24);
	const cliffs = smoothstep(-40, 10, -x) * smoothstep(-10, 30, shore) * ridged(x / 50, z / 50, 4, 53) * 45;
	return -6 + shore * 0.12 + land + cliffs;
};
const lighthouseAt: Vec3 = [-70, coastH(-70, -80), -80];
const coast: EnvDef = {
	stage: {subject: [0, 1, -32], subjectSize: 16, heading: 1.9, groundAt: (x, z) => Math.max(coastH(x, z), 0.3), radius: 400},
	smokeAt: [[20, coastH(20, -70), -70]],
	fireAt: [[8, coastH(8, -42), -42]],
	explosionAt: [[60, 0, 40]],
	dustColor: '#ffffff',
	fogScale: 0.8,
	shadowRadius: 160,
	shafts: {center: [0, 30, -60], spread: 140, length: 120},
	cloudHeight: 160,
	Component: ({t, light, q, anim, stormy}) => {
		const amp = (anim.has('flowing_water') ? 0.7 : 0.35) * (stormy ? 2.4 : 1);
		const boats = useMemo(() => [{x: 40, z: 40, r: 0.3}, {x: -30, z: 90, r: 2}, {x: 90, z: 140, r: 1.1}], []);
		const rocks = useMemo(() => scatter(60, 54, (g) => [(g() - 0.5) * 240, -30 + (g() - 0.5) * 30]).map(([x, z, k]) => ({x, z, y: coastH(x, z) + 0.2, s: 0.8 + k * 2.6, r: k})), []);
		const trees = useMemo<TreeSpec[]>(() => {
			const r = rng(55);
			return scatter(Math.floor(220 * q) + 40, 56, (g) => {
				const x = (g() - 0.5) * 500;
				const z = -60 - g() * 240;
				return coastH(x, z) > 6 ? [x, z] : null;
			}).map(([x, z, k]) => ({x, z, y: coastH(x, z), s: 0.9 + k * 0.6, kind: r() < 0.7 ? 'conifer' : 'broadleaf', phase: r()}));
		}, [q]);
		const beamAngle = t * 1.4;
		return (
			<>
				<Terrain size={900} segments={Math.floor(120 + 90 * q)} heightAt={coastH} center={[0, -150]} detailSeed={51} colorAt={(x, z, h, slope) => {
					let c = mixC(col('#d9c79a'), col('#c8b382'), fbm(x / 20, z / 20, 2, 57));
					c = mixC(c, col('#55702f'), smoothstep(2.5, 7, h));
					c = mixC(c, col('#6f6a62'), slope * 2.6 + smoothstep(18, 40, h) * 0.6);
					return mixC(c, col('#8a7a5c'), 1 - smoothstep(-1, 1, h));
				}} />
				<Water size={1000} segments={Math.floor(70 + 90 * q)} y={0} t={t} amp={amp} color={stormy ? '#5a6d72' : '#2f7d8f'} deep={stormy ? '#1a2a30' : '#0d3447'} center={[0, 250]} />
				<Rocks rocks={rocks} color="#5f5a55" />
				<Trees trees={trees} t={t} wind={0.6} />
				{/* Lighthouse */}
				<group position={lighthouseAt}>
					{[0, 1, 2, 3].map((k) => (
						<mesh key={k} position={[0, 3 + k * 6, 0]} castShadow receiveShadow>
							<cylinderGeometry args={[2.6 - k * 0.3, 2.9 - k * 0.3, 6, 24]} />
							<meshStandardMaterial color={k % 2 ? '#b8312a' : '#f2f0ea'} roughness={0.6} />
						</mesh>
					))}
					<mesh position={[0, 25.5, 0]}>
						<cylinderGeometry args={[1.6, 1.6, 3, 16]} />
						<meshStandardMaterial color="#222" emissive="#ffe7a8" emissiveIntensity={0.5 + light.night * 6} transparent opacity={0.9} />
					</mesh>
					<mesh position={[0, 28, 0]} castShadow>
						<coneGeometry args={[2.2, 2.4, 16]} />
						<meshStandardMaterial color="#202326" metalness={0.6} roughness={0.4} />
					</mesh>
					{light.night > 0.3 && (
						<mesh position={[Math.cos(beamAngle) * 40, 25.5, Math.sin(beamAngle) * 40]} rotation={[0, -beamAngle, Math.PI / 2]}>
							<coneGeometry args={[6, 80, 24, 1, true]} />
							<meshBasicMaterial color="#fff2c4" transparent opacity={0.12 * light.night} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
						</mesh>
					)}
				</group>
				{/* Sailboats riding the same wave function as the water */}
				{boats.map((b, i) => {
					const y = waveHeight(b.x, b.z, t, amp);
					const pitch = (waveHeight(b.x, b.z + 2, t, amp) - waveHeight(b.x, b.z - 2, t, amp)) * 0.25;
					const roll = (waveHeight(b.x + 1, b.z, t, amp) - waveHeight(b.x - 1, b.z, t, amp)) * 0.35;
					return (
						<group key={i} position={[b.x + t * 0.8, y, b.z]} rotation={[pitch, b.r, roll]}>
							<mesh castShadow>
								<boxGeometry args={[2.2, 1, 7]} />
								<meshStandardMaterial color="#5a3d26" roughness={0.7} />
							</mesh>
							<mesh position={[0, 4.8, 0]} castShadow>
								<cylinderGeometry args={[0.08, 0.1, 9, 8]} />
								<meshStandardMaterial color="#3a2a1d" />
							</mesh>
							<mesh position={[0, 5, -1.6]} rotation={[0, Math.PI / 2, 0]} castShadow>
								<planeGeometry args={[3.2, 7]} />
								<meshStandardMaterial color="#efe8d8" side={THREE.DoubleSide} roughness={0.9} />
							</mesh>
						</group>
					);
				})}
				{anim.has('flying_birds') && <Birds count={10} center={[0, 25, -10]} radius={40} t={t} color="#f2f2f2" />}
			</>
		);
	},
};

export const ENV_DEFS: Record<EnvironmentId, EnvDef> = {
	forest,
	mountains,
	city,
	medieval_village: medieval,
	ancient_roman_city: rome,
	modern_street: modernStreet,
	futuristic_city: futuristic,
	battlefield,
	interior,
	ocean_coast: coast,
};
