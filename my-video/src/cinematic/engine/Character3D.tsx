// Consistent 3D characters. The rig, proportions and materials derive ONLY from the
// character record (palette, build, hair style, scale) — never from the scene — so a
// recurring character looks identical in every shot. A user-supplied .glb in
// `model_reference` replaces the procedural body and is reused the same way.
import {useGLTF} from '@react-three/drei';
import React, {useMemo} from 'react';
import * as THREE from 'three';
import type {Character} from '../schema';

/** Metres per second; the scene compositor moves the camera subject at the same speed. */
export const WALK_SPEED = 0.55;

const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (color: string, roughness = 0.8) => {
	const k = `${color}-${roughness}`;
	if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({color, roughness}));
	return mats.get(k)!;
};

const Limb: React.FC<{len: number; r: number; material: THREE.Material; rot: number; pos: [number, number, number]}> = ({len, r, material, rot, pos}) => (
	<group position={pos} rotation={[rot, 0, 0]}>
		<mesh position={[0, -len / 2, 0]} material={material} castShadow>
			<capsuleGeometry args={[r, len - r * 2, 4, 10]} />
		</mesh>
	</group>
);

const ProceduralBody: React.FC<{c: Character; t: number; walking: boolean}> = ({c, t, walking}) => {
	const w = c.build === 'slim' ? 0.85 : c.build === 'broad' ? 1.2 : 1;
	const skin = mat(c.palette.skin, 0.6);
	const top = mat(c.palette.top, 0.85);
	const bottom = mat(c.palette.bottom, 0.9);
	const hair = mat(c.palette.hair, 0.7);
	const accent = mat(c.palette.accent, 0.5);
	const gait = walking ? Math.sin(t * 6.2) : 0;
	const breathe = Math.sin(t * 1.6) * 0.008;
	const bob = walking ? Math.abs(Math.cos(t * 6.2)) * 0.03 : 0;
	// Proportions for a 1.0-unit tall figure, scaled by c.scale.
	return (
		<group position={[0, bob, 0]}>
			<Limb len={0.47} r={0.055 * w} material={bottom} rot={gait * 0.45} pos={[-0.065 * w, 0.49, 0]} />
			<Limb len={0.47} r={0.055 * w} material={bottom} rot={-gait * 0.45} pos={[0.065 * w, 0.49, 0]} />
			<mesh position={[0, 0.69, 0]} material={top} scale={[w, 1 + breathe, w * 0.75]} castShadow>
				<capsuleGeometry args={[0.105, 0.22, 4, 12]} />
			</mesh>
			<mesh position={[0, 0.79, 0.07 * w]} material={accent} castShadow>
				<boxGeometry args={[0.06, 0.05, 0.02]} />
			</mesh>
			<Limb len={0.36} r={0.038 * w} material={top} rot={-gait * 0.5 + 0.05} pos={[-0.15 * w, 0.83, 0]} />
			<Limb len={0.36} r={0.038 * w} material={top} rot={gait * 0.5 + 0.05} pos={[0.15 * w, 0.83, 0]} />
			<mesh position={[0, 0.89, 0]} material={skin} castShadow>
				<cylinderGeometry args={[0.035, 0.04, 0.06, 10]} />
			</mesh>
			<group position={[0, 0.965, 0]} rotation={[Math.sin(t * 0.7) * 0.04, Math.sin(t * 0.43) * 0.12, 0]}>
				<mesh material={skin} scale={[0.92, 1.05, 1]} castShadow>
					<sphereGeometry args={[0.068, 20, 16]} />
				</mesh>
				{[-0.024, 0.024].map((x) => (
					<mesh key={x} position={[x, 0.008, 0.062]} material={mat('#1a1410', 0.3)}>
						<sphereGeometry args={[0.008, 8, 6]} />
					</mesh>
				))}
				{c.hair_style === 'short' && (
					<mesh position={[0, 0.02, -0.006]} material={hair} scale={[1, 0.8, 1.05]} castShadow>
						<sphereGeometry args={[0.072, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
					</mesh>
				)}
				{(c.hair_style === 'long' || c.hair_style === 'ponytail') && (
					<>
						<mesh position={[0, 0.02, -0.006]} material={hair} castShadow>
							<sphereGeometry args={[0.074, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
						</mesh>
						{c.hair_style === 'long' ? (
							<mesh position={[0, -0.07, -0.04]} material={hair} castShadow>
								<boxGeometry args={[0.13, 0.16, 0.05]} />
							</mesh>
						) : (
							<mesh position={[0, -0.04, -0.085]} rotation={[0.4 + Math.sin(t * 6.2) * (walking ? 0.15 : 0.03), 0, 0]} material={hair} castShadow>
								<capsuleGeometry args={[0.018, 0.1, 4, 8]} />
							</mesh>
						)}
					</>
				)}
				{c.hair_style === 'helmet' && (
					<mesh position={[0, 0.015, 0]} material={accent} castShadow>
						<sphereGeometry args={[0.079, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
					</mesh>
				)}
			</group>
		</group>
	);
};

const GltfBody: React.FC<{url: string}> = ({url}) => {
	const {scene} = useGLTF(url);
	const clone = useMemo(() => {
		const s = scene.clone(true);
		// Normalise to 1 unit tall, feet on the ground.
		const box = new THREE.Box3().setFromObject(s);
		const h = box.max.y - box.min.y || 1;
		s.scale.setScalar(1 / h);
		s.position.y = -box.min.y / h;
		s.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
		});
		return s;
	}, [scene]);
	return <primitive object={clone} />;
};

export const Character3D: React.FC<{
	character: Character;
	position: [number, number, number];
	facing: number;
	t: number;
	walking: boolean;
	modelUrl: string | null;
}> = ({character, position, facing, t, walking, modelUrl}) => {
	const walkOffset = walking ? t * WALK_SPEED : 0;
	return (
		<group position={[position[0] + Math.sin(facing) * walkOffset, position[1], position[2] + Math.cos(facing) * walkOffset]} rotation={[0, facing, 0]} scale={character.scale}>
			{modelUrl ? <GltfBody url={modelUrl} /> : <ProceduralBody c={character} t={t} walking={walking} />}
		</group>
	);
};
