// Reusable procedural 3D building blocks. Real geometry, PBR materials, instancing
// for anything numerous. All animation is a pure function of `t` (seconds).
import React, {useLayoutEffect, useMemo, useRef} from 'react';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {fbm, rng} from './noise';

// ─── Procedural textures (generated in the browser, nothing downloaded) ─────

const canvasTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true) => {
	const cv = document.createElement('canvas');
	cv.width = w;
	cv.height = h;
	draw(cv.getContext('2d')!);
	const t = new THREE.CanvasTexture(cv);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 4;
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	return t;
};

const texCache = new Map<string, THREE.Texture>();
const cached = (key: string, make: () => THREE.Texture) => {
	let t = texCache.get(key);
	if (!t) {
		t = make();
		texCache.set(key, t);
	}
	return t;
};

export const softDotTexture = () =>
	cached('dot', () =>
		canvasTex(64, 64, (c) => {
			const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
			g.addColorStop(0, 'rgba(255,255,255,1)');
			g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
			g.addColorStop(1, 'rgba(255,255,255,0)');
			c.fillStyle = g;
			c.fillRect(0, 0, 64, 64);
		}),
	);

/** Soft, lumpy puff for smoke & clouds. */
export const puffTexture = () =>
	cached('puff', () =>
		canvasTex(128, 128, (c) => {
			const r = rng(9);
			for (let i = 0; i < 26; i++) {
				const x = 64 + (r() - 0.5) * 56;
				const y = 64 + (r() - 0.5) * 56;
				const rad = 18 + r() * 26;
				const g = c.createRadialGradient(x, y, 0, x, y, rad);
				g.addColorStop(0, 'rgba(255,255,255,0.22)');
				g.addColorStop(1, 'rgba(255,255,255,0)');
				c.fillStyle = g;
				c.fillRect(0, 0, 128, 128);
			}
		}),
	);

export type FacadeStyle = 'modern' | 'glass' | 'stone' | 'plaster' | 'future';

/** Facade with windows; `lit` = emissive mask of lit windows (night). */
export const facadeTextures = (style: FacadeStyle) => {
	const make = (lit: boolean) =>
		canvasTex(256, 256, (c) => {
			const r = rng(style.length * 131 + (lit ? 7 : 3));
			const base = {modern: '#8e8a84', glass: '#4b5e70', stone: '#c9b99a', plaster: '#d8ccb4', future: '#262c38'}[style];
			c.fillStyle = lit ? '#000' : base;
			c.fillRect(0, 0, 256, 256);
			if (!lit) {
				for (let i = 0; i < 900; i++) {
					c.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
					c.fillRect(r() * 256, r() * 256, 2 + r() * 6, 2 + r() * 6);
				}
			}
			// 4×4 windows per tile. Bottom-left 32px corner stays window-free (used by roofs).
			const cols = style === 'glass' ? 8 : 4;
			const rows = style === 'glass' ? 8 : 4;
			const cw = 256 / cols;
			const ch = 256 / rows;
			for (let y = 0; y < rows; y++) {
				for (let x = 0; x < cols; x++) {
					if (x === 0 && y === rows - 1) continue;
					const wx = x * cw + cw * 0.22;
					const wy = y * ch + ch * 0.2;
					const ww = cw * (style === 'glass' ? 0.9 : 0.56);
					const wh = ch * (style === 'stone' ? 0.45 : 0.6);
					if (lit) {
						const on = r() < (style === 'future' ? 0.6 : 0.42);
						c.fillStyle = on ? ['#ffd9a0', '#ffe9c4', '#bfe3ff', '#ffc070'][Math.floor(r() * 4)] : '#000';
						if (style === 'future' && on) c.fillStyle = ['#36e6ff', '#ff3fb0', '#9cf', '#fff'][Math.floor(r() * 4)];
					} else {
						c.fillStyle = style === 'glass' ? '#22303d' : style === 'stone' ? '#3a3026' : '#2b3138';
					}
					c.fillRect(wx, wy, ww, wh);
				}
			}
			if (style === 'future') {
				c.fillStyle = lit ? '#2ff' : '#1b2030';
				for (let y = 0; y < 256; y += 64) c.fillRect(0, y, 256, 3);
			}
		});
	return {map: cached(`fac-${style}`, () => make(false)), emissive: cached(`fac-${style}-lit`, () => make(true))};
};

export const groundDetailTexture = (seed: number) =>
	cached(`gd${seed}`, () =>
		canvasTex(256, 256, (c) => {
			const img = c.createImageData(256, 256);
			for (let y = 0; y < 256; y++) {
				for (let x = 0; x < 256; x++) {
					const v = 170 + fbm(x / 18, y / 18, 4, seed) * 85 - 40 * fbm(x / 4, y / 4, 2, seed + 5);
					const i = (y * 256 + x) * 4;
					img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
					img.data[i + 3] = 255;
				}
			}
			c.putImageData(img, 0, 0);
		}),
	);

export const plankTexture = () =>
	cached('planks', () =>
		canvasTex(256, 256, (c) => {
			const r = rng(4);
			for (let i = 0; i < 8; i++) {
				const g = 90 + r() * 40;
				c.fillStyle = `rgb(${g + 40},${g},${g * 0.6})`;
				c.fillRect(0, i * 32, 256, 31);
				for (let k = 0; k < 40; k++) {
					c.fillStyle = `rgba(40,20,5,${r() * 0.15})`;
					c.fillRect(r() * 256, i * 32 + r() * 30, 30 + r() * 80, 1);
				}
			}
		}),
	);

// ─── Terrain ────────────────────────────────────────────────────────────────

export const Terrain: React.FC<{
	size: number;
	segments: number;
	heightAt: (x: number, z: number) => number;
	colorAt: (x: number, z: number, h: number, slope: number) => THREE.Color;
	roughness?: number;
	center?: [number, number];
	detailSeed?: number;
}> = ({size, segments, heightAt, colorAt, roughness = 0.95, center = [0, 0], detailSeed = 1}) => {
	// Height/colour functions are usually inline lambdas: keep the latest in a ref and
	// rebuild only when the mesh parameters change (never per frame).
	const fns = useRef({heightAt, colorAt});
	fns.current = {heightAt, colorAt};
	const [cx, cz] = center;
	const geo = useMemo(() => {
		const {heightAt, colorAt} = fns.current;
		const g = new THREE.PlaneGeometry(size, size, segments, segments);
		g.rotateX(-Math.PI / 2);
		g.translate(cx, 0, cz);
		const p = g.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
		g.computeVertexNormals();
		const n = g.attributes.normal as THREE.BufferAttribute;
		const col = new Float32Array(p.count * 3);
		for (let i = 0; i < p.count; i++) {
			const c = colorAt(p.getX(i), p.getZ(i), p.getY(i), 1 - n.getY(i));
			col.set([c.r, c.g, c.b], i * 3);
		}
		g.setAttribute('color', new THREE.BufferAttribute(col, 3));
		const uv = g.attributes.uv as THREE.BufferAttribute;
		for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 6, uv.getY(i) * size / 6);
		return g;
	}, [size, segments, cx, cz, detailSeed]);
	const map = groundDetailTexture(detailSeed);
	return (
		<mesh geometry={geo} receiveShadow>
			<meshStandardMaterial vertexColors map={map} roughness={roughness} metalness={0} />
		</mesh>
	);
};

// ─── Generic instancing ─────────────────────────────────────────────────────

const _o = new THREE.Object3D();
const _c = new THREE.Color();

/**
 * One InstancedMesh; `place(i, obj)` positions instance i (called every render,
 * so animated sets just read `t` inside `place`).
 */
export const Instanced: React.FC<{
	count: number;
	geometry: THREE.BufferGeometry;
	material: THREE.Material;
	place: (i: number, o: THREE.Object3D) => void;
	color?: (i: number) => string;
	castShadow?: boolean;
	receiveShadow?: boolean;
}> = ({count, geometry, material, place, color, castShadow = true, receiveShadow = true}) => {
	const ref = useRef<THREE.InstancedMesh>(null);
	useLayoutEffect(() => {
		const m = ref.current;
		if (!m) return;
		for (let i = 0; i < count; i++) {
			_o.position.set(0, 0, 0);
			_o.rotation.set(0, 0, 0);
			_o.scale.set(1, 1, 1);
			place(i, _o);
			_o.updateMatrix();
			m.setMatrixAt(i, _o.matrix);
			if (color) m.setColorAt(i, _c.set(color(i)));
		}
		m.instanceMatrix.needsUpdate = true;
		if (m.instanceColor) m.instanceColor.needsUpdate = true;
		m.computeBoundingSphere();
	});
	if (count <= 0) return null;
	return <instancedMesh ref={ref} args={[geometry, material, count]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={false} />;
};

// Shared geometries (created once per bundle).
const G = {
	box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
	cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0),
	trunk: new THREE.CylinderGeometry(0.28, 0.42, 1, 7).translate(0, 0.5, 0),
	cone: new THREE.ConeGeometry(1, 1, 9).translate(0, 0.5, 0),
	blob: new THREE.IcosahedronGeometry(1, 1),
	rock: new THREE.DodecahedronGeometry(1, 0),
	sphere: new THREE.SphereGeometry(1, 14, 10),
	capsule: new THREE.CapsuleGeometry(0.22, 0.95, 4, 8).translate(0, 0.7, 0),
	head: new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.5, 0),
	// Gable roof prism, 1×1 footprint, height 1, ridge along X.
	roof: (() => {
		const s = new THREE.Shape();
		s.moveTo(-0.5, 0);
		s.lineTo(0.5, 0);
		s.lineTo(0, 1);
		s.lineTo(-0.5, 0);
		const g = new THREE.ExtrudeGeometry(s, {depth: 1, bevelEnabled: false});
		g.translate(0, 0, -0.5);
		g.rotateY(Math.PI / 2);
		return g;
	})(),
};
export const GEO = G;

const matCache = new Map<string, THREE.Material>();
export const stdMat = (color: string, roughness = 0.85, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => {
	const key = `${color}|${roughness}|${metalness}|${JSON.stringify(Object.keys(extra))}`;
	if (Object.keys(extra).length) return new THREE.MeshStandardMaterial({color, roughness, metalness, ...extra});
	let m = matCache.get(key);
	if (!m) {
		m = new THREE.MeshStandardMaterial({color, roughness, metalness});
		matCache.set(key, m);
	}
	return m;
};

// ─── Vegetation ─────────────────────────────────────────────────────────────

export type TreeKind = 'conifer' | 'broadleaf' | 'cypress';
export type TreeSpec = {x: number; y: number; z: number; s: number; kind: TreeKind; phase: number};

export const scatter = (count: number, seed: number, area: (r: () => number) => [number, number] | null) => {
	const r = rng(seed);
	const out: [number, number, number][] = [];
	let guard = 0;
	while (out.length < count && guard++ < count * 30) {
		const p = area(r);
		if (p) out.push([p[0], p[1], r()]);
	}
	return out;
};

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** Instanced forest with wind sway pivoting at the trunk base. */
export const Trees: React.FC<{trees: TreeSpec[]; t: number; wind: number; foliage?: string[]}> = ({trees, t, wind, foliage = ['#2f5a2a', '#3b6b2f', '#28492a', '#4a6f35']}) => {
	const sway = (tr: TreeSpec) => Math.sin(t * (1.1 + tr.phase) + tr.phase * 9) * 0.035 * wind + Math.sin(t * 3.1 + tr.phase * 5) * 0.012 * wind;
	const layers = useMemo(() => {
		// Foliage pieces: [treeIndex, geometry kind, local y, local scale xyz]
		const out: {ti: number; geo: 'cone' | 'blob'; y: number; sx: number; sy: number}[] = [];
		trees.forEach((tr, ti) => {
			if (tr.kind === 'conifer') {
				out.push({ti, geo: 'cone', y: 1.6, sx: 2.2, sy: 3.4}, {ti, geo: 'cone', y: 3.3, sx: 1.7, sy: 2.9}, {ti, geo: 'cone', y: 4.9, sx: 1.1, sy: 2.4});
			} else if (tr.kind === 'cypress') {
				out.push({ti, geo: 'cone', y: 0.8, sx: 0.75, sy: 6.5});
			} else {
				out.push({ti, geo: 'blob', y: 4.1, sx: 2.4, sy: 2.0}, {ti, geo: 'blob', y: 5.2, sx: 1.7, sy: 1.5});
			}
		});
		return {cones: out.filter((o) => o.geo === 'cone'), blobs: out.filter((o) => o.geo === 'blob')};
	}, [trees]);
	const placeFoliage = (list: typeof layers.cones) => (i: number, o: THREE.Object3D) => {
		const l = list[i];
		const tr = trees[l.ti];
		const a = sway(tr);
		// base · rotZ(sway) · up(y·s) · scale
		_e.set(a * 0.6, 0, a);
		_q.setFromEuler(_e);
		const local = new THREE.Vector3(0, l.y * tr.s, 0).applyQuaternion(_q);
		o.position.set(tr.x + local.x, tr.y + local.y, tr.z + local.z);
		o.quaternion.copy(_q);
		o.scale.set(l.sx * tr.s, l.sy * tr.s, l.sx * tr.s);
	};
	const trunkMat = stdMat('#3a3029', 0.95);
	const coneMat = useMemo(() => new THREE.MeshStandardMaterial({roughness: 0.9, flatShading: true}), []);
	const blobMat = useMemo(() => new THREE.MeshStandardMaterial({roughness: 0.85, flatShading: true}), []);
	const shade = (i: number) => foliage[Math.floor((trees[i]?.phase ?? 0) * foliage.length) % foliage.length];
	return (
		<>
			<Instanced
				count={trees.length}
				geometry={G.trunk}
				material={trunkMat}
				place={(i, o) => {
					const tr = trees[i];
					o.position.set(tr.x, tr.y - 0.2, tr.z);
					o.rotation.set(sway(tr) * 0.3, 0, sway(tr) * 0.5);
					const tall = tr.kind === 'broadleaf' ? 4.2 : tr.kind === 'cypress' ? 1.2 : 2;
					o.scale.set(tr.s * (tr.kind === 'broadleaf' ? 1.3 : 0.9), tall * tr.s, tr.s * (tr.kind === 'broadleaf' ? 1.3 : 0.9));
				}}
			/>
			<Instanced count={layers.cones.length} geometry={G.cone} material={coneMat} place={placeFoliage(layers.cones)} color={(i) => (trees[layers.cones[i].ti].kind === 'cypress' ? '#22401f' : shade(layers.cones[i].ti))} />
			<Instanced count={layers.blobs.length} geometry={G.blob} material={blobMat} place={placeFoliage(layers.blobs)} color={(i) => shade(layers.blobs[i].ti)} />
		</>
	);
};

export const Rocks: React.FC<{rocks: {x: number; y: number; z: number; s: number; r: number}[]; color?: string}> = ({rocks, color = '#77736c'}) => {
	const mat = useMemo(() => new THREE.MeshStandardMaterial({color, roughness: 0.95, flatShading: true}), [color]);
	return (
		<Instanced
			count={rocks.length}
			geometry={G.rock}
			material={mat}
			place={(i, o) => {
				const k = rocks[i];
				o.position.set(k.x, k.y, k.z);
				o.rotation.set(k.r * 3, k.r * 7, k.r * 2);
				o.scale.set(k.s * (1 + k.r * 0.6), k.s * (0.55 + k.r * 0.3), k.s);
			}}
		/>
	);
};

// ─── Architecture ───────────────────────────────────────────────────────────

export type BuildingSpec = {x: number; y: number; z: number; w: number; d: number; h: number; rot: number; tint: string};

/**
 * Merged building blocks with per-building UV scaling so window size stays constant
 * (≈ 3 m floors), plus emissive lit windows that switch on with `night`.
 */
export const Buildings: React.FC<{buildings: BuildingSpec[]; style: FacadeStyle; night: number; metalness?: number; roughness?: number}> = ({buildings, style, night, metalness = 0.05, roughness = 0.82}) => {
	const geo = useMemo(() => {
		if (!buildings.length) return null;
		const parts = buildings.map((b) => {
			const g = new THREE.BoxGeometry(b.w, b.h, b.d);
			const uv = g.attributes.uv as THREE.BufferAttribute;
			// Box faces: +x,-x,+y,-y,+z,-z, 4 verts each.
			for (let f = 0; f < 6; f++) {
				for (let k = 0; k < 4; k++) {
					const i = f * 4 + k;
					if (f === 2 || f === 3) uv.setXY(i, 0.02, 0.02); // roofs → window-free corner
					else {
						const width = f < 2 ? b.d : b.w;
						uv.setXY(i, (uv.getX(i) * width) / 12, (uv.getY(i) * b.h) / 12);
					}
				}
			}
			const c = new THREE.Color(b.tint);
			const col = new Float32Array(g.attributes.position.count * 3);
			for (let i = 0; i < g.attributes.position.count; i++) col.set([c.r, c.g, c.b], i * 3);
			g.setAttribute('color', new THREE.BufferAttribute(col, 3));
			g.rotateY(b.rot);
			g.translate(b.x, b.y + b.h / 2, b.z);
			return g;
		});
		return mergeGeometries(parts, false);
	}, [buildings]);
	const tex = facadeTextures(style);
	const mat = useMemo(
		() => new THREE.MeshStandardMaterial({map: tex.map, emissiveMap: tex.emissive, emissive: new THREE.Color('#ffffff'), vertexColors: true, roughness, metalness}),
		[tex, roughness, metalness],
	);
	mat.emissiveIntensity = 0.05 + night * (style === 'future' ? 2.6 : 1.6);
	if (!geo) return null;
	return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
};

export const Roofs: React.FC<{roofs: {x: number; y: number; z: number; w: number; d: number; h: number; rot: number}[]; color: string}> = ({roofs, color}) => {
	const mat = useMemo(() => new THREE.MeshStandardMaterial({color, roughness: 0.9, flatShading: true}), [color]);
	return (
		<Instanced
			count={roofs.length}
			geometry={G.roof}
			material={mat}
			place={(i, o) => {
				const r = roofs[i];
				o.position.set(r.x, r.y, r.z);
				o.rotation.set(0, r.rot, 0);
				o.scale.set(r.w * 1.08, r.h, r.d * 1.08);
			}}
		/>
	);
};

export const Columns: React.FC<{cols: {x: number; y: number; z: number; h: number; r: number}[]; color?: string}> = ({cols, color = '#e6dcc6'}) => {
	const mat = stdMat(color, 0.7);
	return (
		<>
			<Instanced count={cols.length} geometry={G.cyl} material={mat} place={(i, o) => {
				const c = cols[i];
				o.position.set(c.x, c.y, c.z);
				o.scale.set(c.r * 2, c.h, c.r * 2);
			}} />
			<Instanced count={cols.length} geometry={G.box} material={mat} place={(i, o) => {
				const c = cols[i];
				o.position.set(c.x, c.y + c.h, c.z);
				o.scale.set(c.r * 2.8, c.r * 0.6, c.r * 2.8);
			}} />
		</>
	);
};

// ─── People ─────────────────────────────────────────────────────────────────

export type Agent = {x: number; z: number; dir: number; speed: number; range: number; color: string; head: string; s: number; phase: number};

/** Instanced crowd: capsule bodies + heads, walking back and forth with a gait bob. */
export const Crowd: React.FC<{agents: Agent[]; t: number; groundAt: (x: number, z: number) => number; moving: boolean}> = ({agents, t, groundAt, moving}) => {
	const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({roughness: 0.9}), []);
	const headMat = useMemo(() => new THREE.MeshStandardMaterial({roughness: 0.7}), []);
	const pos = (a: Agent) => {
		if (!moving || a.speed === 0) return {x: a.x, z: a.z, face: a.dir, bob: 0};
		// Ping-pong along heading within ±range.
		const travel = a.speed * t + a.phase * a.range * 2;
		const period = a.range * 2;
		const k = ((travel % (period * 2)) + period * 2) % (period * 2);
		const back = k > period;
		const off = (back ? period * 2 - k : k) - a.range;
		return {x: a.x + Math.sin(a.dir) * off, z: a.z + Math.cos(a.dir) * off, face: a.dir + (back ? Math.PI : 0), bob: Math.abs(Math.sin(t * a.speed * 4.2 + a.phase * 6)) * 0.05};
	};
	const place = (i: number, o: THREE.Object3D) => {
		const a = agents[i];
		const p = pos(a);
		o.position.set(p.x, groundAt(p.x, p.z) + p.bob, p.z);
		o.rotation.set(0, p.face, Math.sin(t * 4 + a.phase * 9) * (moving ? 0.03 : 0.01));
		o.scale.setScalar(a.s);
	};
	return (
		<>
			<Instanced count={agents.length} geometry={G.capsule} material={bodyMat} place={place} color={(i) => agents[i].color} />
			<Instanced count={agents.length} geometry={G.head} material={headMat} place={place} color={(i) => agents[i].head} />
		</>
	);
};

export const makeAgents = (n: number, seed: number, area: (r: () => number) => [number, number], palette: string[], skin: string[], speed = 1.2, range = 6): Agent[] => {
	const r = rng(seed);
	return Array.from({length: n}, () => {
		const [x, z] = area(r);
		return {x, z, dir: r() * Math.PI * 2, speed: speed * (0.6 + r() * 0.8), range: range * (0.4 + r()), color: palette[Math.floor(r() * palette.length)], head: skin[Math.floor(r() * skin.length)], s: 0.9 + r() * 0.2, phase: r()};
	});
};

// ─── Flags / banners (cloth waving in wind) ─────────────────────────────────

export const Flags: React.FC<{flags: {x: number; y: number; z: number; pole: number; w: number; h: number; color: string; rot: number}[]; t: number; wind: number}> = ({flags, t, wind}) => {
	const geos = useMemo(() => flags.map((f) => new THREE.PlaneGeometry(f.w, f.h, 14, 6).translate(f.w / 2, 0, 0)), [flags]);
	const base = useMemo(() => geos.map((g) => Float32Array.from(g.attributes.position.array)), [geos]);
	useLayoutEffect(() => {
		geos.forEach((g, gi) => {
			const p = g.attributes.position as THREE.BufferAttribute;
			const b = base[gi];
			const f = flags[gi];
			for (let i = 0; i < p.count; i++) {
				const x = b[i * 3];
				const y = b[i * 3 + 1];
				const k = x / f.w;
				const wave = Math.sin(x * 2.2 - t * (5 + wind * 3) + gi) * 0.18 + Math.sin(x * 4.1 - t * 8.3 + y * 2) * 0.05;
				p.setXYZ(i, x, y - k * k * 0.15 * (1 - wind * 0.5), wave * k * (0.6 + wind) * f.w * 0.35);
			}
			p.needsUpdate = true;
			g.computeVertexNormals();
		});
	});
	const pole = stdMat('#3c3127', 0.8);
	return (
		<>
			{flags.map((f, i) => (
				<group key={i} position={[f.x, f.y, f.z]} rotation={[0, f.rot, 0]}>
					<mesh geometry={G.cyl} material={pole} scale={[0.08, f.pole, 0.08]} castShadow />
					<mesh geometry={geos[i]} position={[0.04, f.pole - f.h / 2 - 0.1, 0]} castShadow>
						<meshStandardMaterial color={f.color} side={THREE.DoubleSide} roughness={0.85} />
					</mesh>
				</group>
			))}
		</>
	);
};

// ─── Birds ──────────────────────────────────────────────────────────────────

const birdGeo = (() => {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.25, -0.9, 0.35, 0, 0, 0, -0.2, 0, 0, 0.25, 0.9, 0.35, 0, 0, 0, -0.2]), 3));
	g.computeVertexNormals();
	return g;
})();

export const Birds: React.FC<{count: number; center: [number, number, number]; radius: number; t: number; seed?: number; color?: string}> = ({count, center, radius, t, seed = 3, color = '#1b1b1d'}) => {
	const birds = useMemo(() => {
		const r = rng(seed);
		return Array.from({length: count}, () => ({a0: r() * Math.PI * 2, rr: radius * (0.5 + r() * 0.6), h: (r() - 0.5) * radius * 0.25, sp: 0.12 + r() * 0.08, ph: r() * 10, s: 0.8 + r() * 0.6}));
	}, [count, radius, seed]);
	const mat = useMemo(() => new THREE.MeshStandardMaterial({color, side: THREE.DoubleSide, roughness: 1}), [color]);
	return (
		<Instanced
			count={count}
			geometry={birdGeo}
			material={mat}
			castShadow={false}
			place={(i, o) => {
				const b = birds[i];
				const a = b.a0 + t * b.sp;
				o.position.set(center[0] + Math.cos(a) * b.rr, center[1] + b.h + Math.sin(t * 0.7 + b.ph) * 1.5, center[2] + Math.sin(a) * b.rr);
				o.rotation.set(0, -a, Math.sin(t * 0.5 + b.ph) * 0.2);
				o.scale.set(b.s * 1.4, b.s * (0.4 + Math.sin(t * 9 + b.ph) * 0.9), b.s * 1.4);
			}}
		/>
	);
};

// ─── Water (CPU Gerstner-ish waves so boats can sample the same surface) ────

export const waveHeight = (x: number, z: number, t: number, amp: number) =>
	amp *
	(Math.sin(x * 0.11 + t * 0.9) * 0.5 +
		Math.sin(z * 0.17 - t * 1.3 + x * 0.05) * 0.32 +
		Math.sin((x + z) * 0.31 + t * 1.9) * 0.12 +
		Math.sin((x - z) * 0.63 - t * 2.7) * 0.05);

export const Water: React.FC<{size: number; segments: number; y: number; t: number; amp: number; color: string; deep: string; center?: [number, number]}> = ({size, segments, y, t, amp, color, deep, center = [0, 0]}) => {
	const [cx, cz] = center;
	const geo = useMemo(() => {
		const g = new THREE.PlaneGeometry(size, size, segments, segments);
		g.rotateX(-Math.PI / 2);
		g.translate(cx, y, cz);
		g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
		return g;
	}, [size, segments, y, cx, cz]);
	const c1 = useMemo(() => new THREE.Color(deep), [deep]);
	const c2 = useMemo(() => new THREE.Color(color), [color]);
	useLayoutEffect(() => {
		const p = geo.attributes.position as THREE.BufferAttribute;
		const col = geo.attributes.color as THREE.BufferAttribute;
		const tmp = new THREE.Color();
		for (let i = 0; i < p.count; i++) {
			const h = waveHeight(p.getX(i), p.getZ(i), t, amp);
			p.setY(i, y + h);
			const crest = Math.max(0, h / Math.max(amp, 0.001) - 0.55) * 1.6;
			tmp.copy(c1).lerp(c2, 0.5 + h / Math.max(amp, 0.001) * 0.4).lerp(new THREE.Color('#e8f2f4'), Math.min(1, crest * crest));
			col.setXYZ(i, tmp.r, tmp.g, tmp.b);
		}
		p.needsUpdate = true;
		col.needsUpdate = true;
		geo.computeVertexNormals();
	});
	return (
		<mesh geometry={geo} receiveShadow>
			<meshPhysicalMaterial vertexColors roughness={0.12} metalness={0.05} clearcoat={0.8} clearcoatRoughness={0.15} envMapIntensity={1.2} />
		</mesh>
	);
};
