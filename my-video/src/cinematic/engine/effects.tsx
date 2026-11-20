// Atmospheric effects. Each particle's state is a closed-form function of time,
// so any frame can be rendered in isolation (Remotion renders frames in parallel).
// `q` scales particle counts (preview ≈ 0.35, final = 1).
import React, {useLayoutEffect, useMemo} from 'react';
import * as THREE from 'three';
import type {Vec3} from './camera';
import {noise1, rng} from './noise';
import {Instanced, puffTexture, softDotTexture} from './primitives';

const pointsGeo = (n: number) => {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
	return g;
};

/** Particles living in a box that follows the camera (rain, snow, dust always surround the lens). */
const useCameraBox = (n: number, seed: number) =>
	useMemo(() => {
		const r = rng(seed);
		return Array.from({length: n}, () => [r(), r(), r(), r()] as const);
	}, [n, seed]);

export const Rain: React.FC<{cam: Vec3; t: number; q: number; wind: number; intensity?: number}> = ({cam, t, q, wind, intensity = 1}) => {
	const n = Math.floor(5000 * q * intensity);
	const seeds = useCameraBox(n, 11);
	const geo = useMemo(() => {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
		return g;
	}, [n]);
	useLayoutEffect(() => {
		const p = geo.attributes.position as THREE.BufferAttribute;
		const W = 60;
		const H = 40;
		const speed = 22;
		const slant = 0.15 + wind * 0.25;
		for (let i = 0; i < n; i++) {
			const [a, b, c, d] = seeds[i];
			const y = H - (((t * speed * (0.85 + d * 0.3) + b * H) % H) + H) % H;
			const x = cam[0] + (a - 0.5) * W + y * slant;
			const z = cam[2] + (c - 0.5) * W;
			const yy = cam[1] - H * 0.35 + y;
			p.setXYZ(i * 2, x, yy, z);
			p.setXYZ(i * 2 + 1, x - slant * 0.9, yy - 0.9, z);
		}
		p.needsUpdate = true;
	});
	return (
		<lineSegments geometry={geo} frustumCulled={false}>
			<lineBasicMaterial color="#aebdcc" transparent opacity={0.38} depthWrite={false} />
		</lineSegments>
	);
};

const FloatingPoints: React.FC<{
	cam: Vec3;
	t: number;
	n: number;
	seed: number;
	size: number;
	color: string;
	opacity: number;
	box: [number, number, number];
	fall: number;
	drift: number;
	additive?: boolean;
}> = ({cam, t, n, seed, size, color, opacity, box, fall, drift, additive}) => {
	const seeds = useCameraBox(n, seed);
	const geo = useMemo(() => pointsGeo(n), [n]);
	useLayoutEffect(() => {
		const p = geo.attributes.position as THREE.BufferAttribute;
		const [W, H, D] = box;
		for (let i = 0; i < n; i++) {
			const [a, b, c, d] = seeds[i];
			const y = (((b * H - t * fall * (0.7 + d * 0.6)) % H) + H) % H;
			const x = (((a * W + t * drift + noise1(t * 0.3 + d * 10, i) * 1.5) % W) + W) % W;
			const z = c * D + noise1(t * 0.25 + a * 10, i + 99) * 1.2;
			p.setXYZ(i, cam[0] + x - W / 2, cam[1] + y - H * 0.45, cam[2] + z - D / 2);
		}
		p.needsUpdate = true;
	});
	return (
		<points geometry={geo} frustumCulled={false}>
			<pointsMaterial
				map={softDotTexture()}
				color={color}
				size={size}
				transparent
				opacity={opacity}
				depthWrite={false}
				blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
			/>
		</points>
	);
};

export const Snow: React.FC<{cam: Vec3; t: number; q: number; wind: number}> = ({cam, t, q, wind}) => (
	<FloatingPoints cam={cam} t={t} n={Math.floor(4000 * q)} seed={21} size={0.16} color="#ffffff" opacity={0.9} box={[50, 30, 50]} fall={1.4} drift={0.6 + wind * 3} />
);

export const Dust: React.FC<{cam: Vec3; t: number; q: number; color: string; wind: number}> = ({cam, t, q, color, wind}) => (
	<FloatingPoints cam={cam} t={t} n={Math.floor(1600 * q)} seed={31} size={0.07} color={color} opacity={0.55} box={[24, 12, 24]} fall={-0.08} drift={0.25 + wind} additive />
);

/** Billboarded smoke column from an emitter; puffs rise, grow, drift and fade. */
export const Smoke: React.FC<{at: Vec3; t: number; q: number; wind: number; color?: string; scale?: number; seed?: number}> = ({at, t, q, wind, color = '#5f5a55', scale = 1, seed = 1}) => {
	const n = Math.max(6, Math.floor(28 * q));
	const life = 7;
	const r = useMemo(() => {
		const g = rng(seed * 7 + 3);
		return Array.from({length: n}, () => [g(), g(), g()]);
	}, [n, seed]);
	const tex = puffTexture();
	return (
		<group>
			{r.map(([a, b, c], i) => {
				const age = (((t + (i / n) * life + a) % life) + life) % life;
				const k = age / life;
				const fade = Math.min(1, age * 1.5) * (1 - k);
				return (
					<sprite
						key={i}
						position={[at[0] + (b - 0.5) * scale + k * wind * 6 * scale, at[1] + k * 9 * scale, at[2] + (c - 0.5) * scale]}
						scale={[(1.5 + k * 6) * scale, (1.5 + k * 6) * scale, 1]}
					>
						<spriteMaterial map={tex} color={color} transparent opacity={0.55 * fade} depthWrite={false} rotation={a * 6 + k * 1.5} />
					</sprite>
				);
			})}
		</group>
	);
};

/** Fire: additive flame sprites + flickering point light (casts real light on surroundings). */
export const Fire: React.FC<{at: Vec3; t: number; q: number; scale?: number; seed?: number; light?: boolean}> = ({at, t, q, scale = 1, seed = 1, light = true}) => {
	const n = Math.max(8, Math.floor(26 * q));
	const life = 0.9;
	const r = useMemo(() => {
		const g = rng(seed * 13 + 1);
		return Array.from({length: n}, () => [g(), g(), g()]);
	}, [n, seed]);
	const tex = softDotTexture();
	const flicker = 0.75 + noise1(t * 7, seed) * 0.2 + noise1(t * 17, seed + 1) * 0.1;
	return (
		<group position={at}>
			{light && <pointLight color="#ff8a3a" intensity={30 * scale * flicker} distance={14 * scale} decay={2} position={[0, 0.8 * scale, 0]} />}
			{r.map(([a, b, c], i) => {
				const age = (((t + (i / n) * life + a * 0.3) % life) + life) % life;
				const k = age / life;
				const col = new THREE.Color('#ffd27a').lerp(new THREE.Color('#ff4a12'), k);
				return (
					<sprite key={i} position={[(b - 0.5) * 0.6 * scale * (1 - k), k * 2.1 * scale, (c - 0.5) * 0.6 * scale * (1 - k)]} scale={[(1.1 - k * 0.7) * scale, (1.4 - k * 0.8) * scale, 1]}>
						<spriteMaterial map={tex} color={col} transparent opacity={(1 - k) * 0.85} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
					</sprite>
				);
			})}
		</group>
	);
};

export const Sparks: React.FC<{at: Vec3; t: number; q: number; seed?: number; spread?: number}> = ({at, t, q, seed = 5, spread = 3}) => {
	const n = Math.floor(260 * q) + 30;
	const life = 2.4;
	const geo = useMemo(() => pointsGeo(n), [n]);
	const s = useMemo(() => {
		const g = rng(seed);
		return Array.from({length: n}, () => [g(), g(), g(), g()]);
	}, [n, seed]);
	useLayoutEffect(() => {
		const p = geo.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < n; i++) {
			const [a, b, c, d] = s[i];
			const age = (((t + d * life) % life) + life) % life;
			const vx = (a - 0.5) * spread;
			const vz = (c - 0.5) * spread;
			const vy = 2.5 + b * 4;
			p.setXYZ(i, at[0] + vx * age + noise1(age * 3, i) * 0.3, at[1] + vy * age - 0.9 * age * age, at[2] + vz * age);
		}
		p.needsUpdate = true;
	});
	return (
		<points geometry={geo} frustumCulled={false}>
			<pointsMaterial map={softDotTexture()} color="#ffb455" size={0.18} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
		</points>
	);
};

/** Layer of large soft cloud sprites in the sky, drifting with the wind. */
export const Clouds: React.FC<{center: Vec3; t: number; q: number; height: number; spread: number; color: string; wind: number; opacity?: number}> = ({center, t, q, height, spread, color, wind, opacity = 0.75}) => {
	const n = Math.floor(40 * q) + 10;
	const clouds = useMemo(() => {
		const r = rng(41);
		return Array.from({length: n}, () => ({x: (r() - 0.5) * spread, z: (r() - 0.5) * spread, y: height + (r() - 0.5) * height * 0.25, s: spread * (0.12 + r() * 0.16), rot: r() * 6}));
	}, [n, spread, height]);
	const tex = puffTexture();
	return (
		<group>
			{clouds.map((c, i) => (
				<sprite key={i} position={[center[0] + c.x + t * (1 + wind * 4), c.y, center[2] + c.z]} scale={[c.s, c.s * 0.45, 1]}>
					<spriteMaterial map={tex} color={color} transparent opacity={opacity} depthWrite={false} rotation={c.rot * 0.05} fog={false} />
				</sprite>
			))}
		</group>
	);
};

/** Low-lying volumetric fog: stacked soft sheets scrolling slowly (cheap volumetric look). */
export const GroundFog: React.FC<{center: Vec3; t: number; color: string; radius: number; density: number}> = ({center, t, color, radius, density}) => {
	const tex = puffTexture();
	const sheets = useMemo(() => {
		const r = rng(51);
		return Array.from({length: 18}, () => ({x: (r() - 0.5) * radius * 1.6, z: (r() - 0.5) * radius * 1.6, y: 0.5 + r() * 4, s: radius * (0.35 + r() * 0.4), sp: 0.2 + r() * 0.5}));
	}, [radius]);
	return (
		<group>
			{sheets.map((s, i) => (
				<mesh key={i} position={[center[0] + s.x + Math.sin(t * 0.05 * s.sp + i) * 4, center[1] + s.y, center[2] + s.z]} rotation={[-Math.PI / 2, 0, t * 0.01 * s.sp + i]}>
					<planeGeometry args={[s.s, s.s]} />
					<meshBasicMaterial map={tex} color={color} transparent opacity={0.22 * density} depthWrite={false} side={THREE.DoubleSide} />
				</mesh>
			))}
		</group>
	);
};

/**
 * Volumetric light shafts: additive tapered beams aligned with the sun, broken by
 * noise so they read as light through gaps (forest canopy, windows, clouds).
 */
export const LightShafts: React.FC<{center: Vec3; sunDir: THREE.Vector3; color: string; t: number; count: number; spread: number; length: number; intensity: number}> = ({center, sunDir, color, t, count, spread, length, intensity}) => {
	const geo = useMemo(() => new THREE.CylinderGeometry(1, 0.35, 1, 12, 1, true).translate(0, -0.5, 0), []);
	const mat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide,
				uniforms: {color: {value: new THREE.Color(color)}, strength: {value: intensity}},
				vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
				fragmentShader: 'uniform vec3 color; uniform float strength; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float along = smoothstep(-1.0, -0.6, vY) * smoothstep(0.0, -0.15, vY); gl_FragColor = vec4(color * strength * edge * along * 0.16, 1.0); }',
			}),
		[color, intensity],
	);
	const shafts = useMemo(() => {
		const r = rng(61);
		return Array.from({length: count}, () => ({x: (r() - 0.5) * spread, z: (r() - 0.5) * spread, w: 0.6 + r() * 2.2, ph: r() * 10}));
	}, [count, spread]);
	const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir.clone().normalize());
	return (
		<Instanced
			count={shafts.length}
			geometry={geo}
			material={mat}
			castShadow={false}
			receiveShadow={false}
			place={(i, o) => {
				const s = shafts[i];
				const top = new THREE.Vector3(center[0] + s.x, center[1], center[2] + s.z).addScaledVector(sunDir, length);
				o.position.copy(top);
				o.quaternion.copy(q);
				const pulse = 0.75 + 0.25 * Math.sin(t * 0.4 + s.ph);
				o.scale.set(s.w * pulse, length * 1.05, s.w * pulse);
			}}
		/>
	);
};

/** Scheduled explosions: fireball + shock ring + debris + flash light + lingering smoke. */
export const Explosions: React.FC<{events: {at: Vec3; time: number; size: number}[]; t: number; q: number; wind: number}> = ({events, t, q, wind}) => {
	const tex = softDotTexture();
	return (
		<>
			{events.map((ev, i) => {
				const age = t - ev.time;
				if (age < 0) return null;
				const s = ev.size;
				const k = Math.min(1, age / 1.2);
				const flash = Math.max(0, 1 - age / 0.5);
				return (
					<group key={i}>
						{flash > 0 && <pointLight position={[ev.at[0], ev.at[1] + 2 * s, ev.at[2]]} color="#ffb060" intensity={900 * flash * s} distance={60 * s} decay={2} />}
						{age < 1.6 && (
							<mesh position={[ev.at[0], ev.at[1] + 1.5 * s * k, ev.at[2]]} scale={(0.5 + 3.2 * Math.sqrt(k)) * s}>
								<sphereGeometry args={[1, 18, 12]} />
								<meshBasicMaterial color={new THREE.Color('#fff2c0').lerp(new THREE.Color('#ff5a1a'), k)} transparent opacity={Math.max(0, 1 - age / 1.6)} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
							</mesh>
						)}
						{age < 1 && (
							<mesh position={[ev.at[0], ev.at[1] + 0.2, ev.at[2]]} rotation={[-Math.PI / 2, 0, 0]} scale={(1 + age * 14) * s}>
								<ringGeometry args={[0.8, 1, 48]} />
								<meshBasicMaterial color="#ffe8c8" transparent opacity={0.6 * (1 - age)} depthWrite={false} side={THREE.DoubleSide} />
							</mesh>
						)}
						{age < 3 &&
							Array.from({length: Math.floor(30 * q) + 8}, (_, j) => {
								const a = (j * 2.399) % (Math.PI * 2);
								const v = 6 + (j % 5) * 2;
								const up = 6 + (j % 7) * 1.6;
								return (
									<sprite key={j} position={[ev.at[0] + Math.cos(a) * v * age * s * 0.6, ev.at[1] + (up * age - 4.9 * age * age) * s * 0.6 + 0.2, ev.at[2] + Math.sin(a) * v * age * s * 0.6]} scale={[0.35 * s, 0.35 * s, 1]}>
										<spriteMaterial map={tex} color="#ffa040" transparent opacity={Math.max(0, 1 - age / 3)} blending={THREE.AdditiveBlending} depthWrite={false} />
									</sprite>
								);
							})}
						<Smoke at={ev.at} t={Math.max(0, age - 0.3)} q={q} wind={wind} color="#3d3734" scale={1.6 * s} seed={i + 40} />
					</group>
				);
			})}
		</>
	);
};

/** Debris instanced (used by battlefield). Exported for completeness of the effect set. */
export const Debris: React.FC<{items: {x: number; y: number; z: number; s: number; r: number}[]; color: string}> = ({items, color}) => {
	const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
	const mat = useMemo(() => new THREE.MeshStandardMaterial({color, roughness: 0.95}), [color]);
	return <Instanced count={items.length} geometry={geo} material={mat} place={(i, o) => {
		const d = items[i];
		o.position.set(d.x, d.y, d.z);
		o.rotation.set(d.r * 5, d.r * 9, d.r * 3);
		o.scale.set(d.s, d.s * 0.4, d.s * 1.6);
	}} />;
};
