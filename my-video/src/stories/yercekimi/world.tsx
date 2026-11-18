import React, {createContext, useContext} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {BODY_FONT, BRAND, HEAD_FONT} from '../../channels/basina-gelseydi/brand';
import {Apartment, Car, CarKind, Cat, Cloud, Lamp, Prop, PropKind, Seagull, Simit, SimitCart, SkyGrad, Skyline, Street, Sun, TeaGlass, Tree} from '../../engine/modern/City';
import {CAST, CastName, Face, INK, Person, Pose, POSES, mixPose, wobblePose} from '../../engine/modern/Person';
import {
	BALCONY_FLOOR,
	FLOOR_H,
	G_Y,
	GRAB_FRAME,
	gravityG,
	HERO_SCALE,
	heroHeight,
	heroX,
	heroY,
	Item,
	ITEMS,
	itemState,
	JUMP_START,
	OFF_FRAME,
	ON_FRAME,
	storySec,
} from './physics';

/** Global frame of the first visible frame of the current scene (set by index.tsx). */
export const SceneStart = createContext(0);
export const useGlobalFrame = () => useCurrentFrame() + useContext(SceneStart);

export type Cam = {x: number; y: number; zoom: number; rot?: number; shake?: number};

/**
 * Parallax plane. A world point w on a plane of depth d is drawn at
 *   C + (w − (C + (cam − C)·d)) · (1 + (zoom − 1)·d)
 * so d = 1 is the focal plane (cam point sits at screen centre) and d → 0 stays put.
 */
export const Plane: React.FC<{cam: Cam; depth: number; children: React.ReactNode; frame: number}> = ({cam, depth, children, frame}) => {
	const z = 1 + (cam.zoom - 1) * depth;
	const ox = 540 + (cam.x - 540) * depth;
	const oy = 960 + (cam.y - 960) * depth;
	const sh = cam.shake ?? 0;
	const sx = sh * (Math.sin(frame * 1.9) * 0.6 + Math.sin(frame * 4.3 + 1.2) * 0.4) * Math.min(1, depth);
	const sy = sh * (Math.cos(frame * 2.3) * 0.6 + Math.sin(frame * 5.1 + 0.4) * 0.4) * Math.min(1, depth);
	return <g transform={`translate(${540 + sx} ${960 + sy}) rotate(${(cam.rot ?? 0) * Math.min(1, depth)}) scale(${z}) translate(${-ox} ${-oy})`}>{children}</g>;
};

export const Svg: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
	<svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0, overflow: 'hidden', ...style}}>
		{children}
	</svg>
);

export const BUILDINGS = [
	{x: -1480, w: 520, floors: 7, color: '#e9b48a', shade: '#c98d66', trim: '#fff1de', shop: 'FIRIN', awning: '#3f86c9'},
	{x: -900, w: 480, floors: 9, color: '#9ccfb8', shade: '#78ad97', trim: '#f4fff8', shop: 'BAKKAL', awning: '#e8453c'},
	{x: -360, w: 600, floors: 8, color: '#f2d27a', shade: '#d4b25a', trim: '#fff8e2', shop: 'BERBER', awning: '#2f9a6a'},
	{x: 300, w: 540, floors: 12, color: '#e98c7a', shade: '#c66d5c', trim: '#fff0e8', shop: 'ECZANE', awning: '#2f9a6a', balconies: [2, 4, 6, BALCONY_FLOOR, 11]},
	{x: 900, w: 500, floors: 8, color: '#b8b2e6', shade: '#958ec8', trim: '#f6f4ff', shop: 'ÇAY OCAĞI', awning: '#d8443a'},
	{x: 1460, w: 560, floors: 10, color: '#f0c9a0', shade: '#cfa67c', trim: '#fff6ea', shop: 'KIRTASİYE', awning: '#f2a330'},
	{x: 2080, w: 520, floors: 7, color: '#8fc3e0', shade: '#6ea2bf', trim: '#f2fbff', shop: 'LOKANTA', awning: '#e8453c'},
] as const;

/** Morning sky + far city (depth planes 0.04–0.3). */
export const Backdrop: React.FC<{cam: Cam; frame: number; tint?: number}> = ({cam, frame}) => (
	<>
		<Plane cam={cam} depth={0.04} frame={frame}>
			<SkyGrad id="bgsky" y0={-3200} y1={1700} stops={[[0, '#1c5aa6'], [0.45, '#5fa8e0'], [0.72, '#ffd7a8'], [0.86, '#ffb58a'], [1, '#ff9c7a']]} />
			<Sun x={860} y={780} r={70} />
		</Plane>
		<Plane cam={cam} depth={0.1} frame={frame}>
			<Cloud x={160 + frame * 0.25} y={260} s={0.9} seed="c1" />
			<Cloud x={900 - frame * 0.15} y={-200} s={1.2} seed="c2" />
			<Cloud x={420 + frame * 0.1} y={-900} s={1.4} seed="c3" />
			<Cloud x={-200 + frame * 0.2} y={-1700} s={1.1} seed="c4" />
		</Plane>
		<Plane cam={cam} depth={0.22} frame={frame}>
			<Skyline y={1330} color="#7d8fb8" light="#dfe6f7" seed="far" />
		</Plane>
		<Plane cam={cam} depth={0.45} frame={frame}>
			{[-1600, -1080, -560, -60, 470, 1000, 1500, 2050].map((x, i) => (
				<Apartment key={x} x={x} baseY={G_Y} w={480} floors={9 + (i % 3) * 2} color="#a79fc2" shade="#8f88ad" trim="#c9c3df" seed={`back${i}`} lights={0.1} />
			))}
		</Plane>
	</>
);

/** The main street set (focal plane): buildings, lamps, trees, road. */
export const StreetSet: React.FC<{crack?: number; extra?: React.ReactNode}> = ({crack = 0, extra = null}) => (
	<g>
		{BUILDINGS.map((b, i) => (
			<Apartment
				key={b.x}
				x={b.x}
				baseY={G_Y}
				w={b.w}
				floors={b.floors}
				floorH={FLOOR_H}
				color={b.color}
				shade={b.shade}
				trim={b.trim}
				seed={`main${i}`}
				shop={b.shop}
				awning={b.awning}
				balconies={'balconies' in b ? [...b.balconies] : null}
			/>
		))}
		{/* a protruding shop-sign pole on the café building — the hero misses it */}
		<g>
			<rect x={600} y={G_Y - 1236} width={304} height={18} fill="#3a4250" stroke={INK} strokeWidth={6} />
			<rect x={700} y={G_Y - 1218} width={120} height={78} rx={8} fill="#ffd23f" stroke={INK} strokeWidth={6} />
			<text x={760} y={G_Y - 1165} textAnchor="middle" fontFamily={HEAD_FONT} fontSize={34} fill={INK}>
				ÇAY
			</text>
		</g>
		{extra}
		<Street y={G_Y} crack={crack} />
		<Lamp x={-640} y={G_Y + 40} h={560} />
		<Lamp x={1240} y={G_Y + 40} h={560} />
		<Tree x={-180} y={G_Y + 40} s={0.9} seed="t1" />
		<Tree x={1820} y={G_Y + 40} s={1} seed="t2" />
		{/* bus stop */}
		<g>
			<rect x={560} y={G_Y - 330} width={14} height={370} fill="#3a4250" stroke={INK} strokeWidth={5} />
			<rect x={540} y={G_Y - 360} width={260} height={30} rx={6} fill="#3a4250" stroke={INK} strokeWidth={5} />
			<circle cx={566} cy={G_Y - 400} r={34} fill="#fff" stroke={INK} strokeWidth={6} />
			<text x={566} y={G_Y - 388} textAnchor="middle" fontFamily={HEAD_FONT} fontSize={34} fill={INK}>
				D
			</text>
		</g>
	</g>
);

const CAR_COLORS: Record<string, CarKind> = {van: 'van', taxi: 'taxi', sedan: 'sedan', bus: 'bus'};

const poseFor = (item: Item, phase: string, frame: number, seed: number): {pose: Pose; face: Face} => {
	if (phase === 'pre') return {pose: item.id === 'amca' ? POSES.sit : POSES.stand, face: item.id === 'amca' ? 'happy' : 'neutral'};
	if (phase === 'float') return {pose: wobblePose(item.id === 'amca' ? POSES.sit : POSES.flail, frame, 0.8, seed), face: seed % 3 === 0 ? 'scream' : seed % 3 === 1 ? 'shock' : 'scared'};
	if (phase === 'fall') return {pose: wobblePose(POSES.fall, frame, 1.2, seed), face: 'scream'};
	return {pose: POSES.sit, face: 'dizzy'};
};

/** Draws one simulated item at its physical state for global frame gf. */
export const ItemView: React.FC<{item: Item; gf: number; frame: number; trail?: boolean}> = ({item, gf, frame, trail = true}) => {
	const st = itemState(item, gf);
	const seed = item.id.length;
	const draw = (x: number, y: number, rot: number) => {
		switch (item.kind) {
			case 'car': {
				const dent = st.phase === 'landed' ? Math.min(1, item.mass) * Math.exp(-st.sinceLand / 40) * 0.6 : 0;
				return <Car x={x} y={y} s={item.scale} kind={CAR_COLORS[item.variant]} color={item.color} wheel={gf * (st.phase === 'pre' ? 6 : 14)} rot={rot} flip={item.flip} dent={dent} />;
			}
			case 'person': {
				const {pose, face} = poseFor(item, st.phase, frame, seed);
				const walking = st.phase === 'pre' && item.walk > 0 ? item.walk : 0;
				return <Person x={x} y={y} scale={item.scale} rot={rot} flip={item.flip} look={CAST[item.variant as CastName]} pose={pose} face={face} walk={walking} seed={item.id} gaze={[0, -1]} />;
			}
			case 'cart':
				return <SimitCart x={x} y={y} s={item.scale} wheel={rot * 3} />;
			case 'cat':
				return <Cat x={x} y={y} s={item.scale} rot={rot} scared={st.phase !== 'pre'} />;
			case 'tea':
				return <TeaGlass x={x} y={y} s={item.scale} rot={rot} level={st.phase === 'pre' ? 0.85 : 0.2} />;
			case 'simit':
				return <Simit x={x} y={y} s={item.scale} rot={rot} />;
			case 'table':
				return (
					<g transform={`translate(${x} ${y}) rotate(${rot})`}>
						<rect x={-80} y={-110} width={160} height={18} rx={5} fill="#c9853f" stroke={INK} strokeWidth={6} />
						<rect x={-8} y={-94} width={16} height={94} fill="#8a5a2b" stroke={INK} strokeWidth={5} />
						<rect x={-50} y={-10} width={100} height={12} rx={5} fill="#8a5a2b" stroke={INK} strokeWidth={5} />
					</g>
				);
			default:
				return <Prop kind={item.variant as PropKind} x={x} y={y} s={item.scale} rot={rot} />;
		}
	};
	const ghosts =
		trail && st.phase === 'fall'
			? [3, 2, 1].map((k) => {
					const p = itemState(item, gf - k * 1.5);
					return (
						<g key={k} opacity={0.12 * (4 - k)}>
							{draw(p.x, p.y, p.rot)}
						</g>
					);
				})
			: null;
	return (
		<g>
			{st.phase !== 'pre' && st.h > 0.05 ? <ellipse cx={st.x} cy={(item.kind === 'car' ? item.y0 + 30 : G_Y + 40) + 6} rx={(item.kind === 'car' ? 180 : 60) / (1 + st.h * 0.3)} ry={10} fill="#000" opacity={0.25 / (1 + st.h * 0.4)} /> : null}
			{ghosts}
			{draw(st.x, st.y, st.rot)}
		</g>
	);
};

export const Items: React.FC<{gf: number; frame: number; only?: string[]; exclude?: string[]}> = ({gf, frame, only, exclude}) => (
	<g>
		{ITEMS.filter((i) => (!only || only.includes(i.id)) && !(exclude ?? []).includes(i.id)).map((i) => (
			<ItemView key={i.id} item={i} gf={gf} frame={frame} />
		))}
	</g>
);

/** The hero ("sen") at his physical position for global frame gf. */
export const Hero: React.FC<{gf: number; frame: number; face?: Face; pose?: Pose; x?: number; y?: number; scale?: number; rot?: number}> = ({gf, frame, face, pose, x, y, scale, rot}) => {
	const h = heroHeight(gf);
	let p: Pose = POSES.stand;
	let f: Face = 'happy';
	let walk = 0;
	let r = 0;
	if (gf < JUMP_START) {
		walk = 1.2;
	} else if (gf < OFF_FRAME) {
		p = POSES.jump;
		f = 'happy';
	} else if (gf < GRAB_FRAME) {
		const k = Math.min(1, (gf - OFF_FRAME) / 40);
		p = wobblePose(mixPose(POSES.jump, POSES.flail, k), frame, k, 2);
		f = gf < OFF_FRAME + 20 ? 'awe' : 'scream';
		r = Math.sin(storySec(gf) * 0.7) * 14 * k;
	} else {
		const since = gf - GRAB_FRAME;
		const swing = gf > ON_FRAME ? Math.sin((gf - ON_FRAME) * 0.32) * Math.exp(-(gf - ON_FRAME) / 40) * 22 : Math.sin(since * 0.2) * 6;
		p = wobblePose({...POSES.hang, legL: [POSES.hang.legL[0] + swing, 14], legR: [POSES.hang.legR[0] + swing * 0.8, 22]}, frame, gf > ON_FRAME ? 0.3 : 0.15, 4);
		f = gf < GRAB_FRAME + 18 ? 'determined' : gf < ON_FRAME ? 'relief' : 'scream';
	}
	return (
		<Person
			x={x ?? heroX(gf)}
			y={y ?? heroY(gf)}
			scale={scale ?? HERO_SCALE}
			rot={rot ?? r}
			look={CAST.kaan}
			pose={pose ?? p}
			face={face ?? f}
			walk={pose ? 0 : walk}
			gaze={[0.3, -0.6]}
			mouthOpen={0.6}
			seed="kaan"
			shadow={h < 0.6 ? h * 100 : null}
		/>
	);
};

export const Gulls: React.FC<{frame: number; y: number; n?: number}> = ({frame, y, n = 4}) => (
	<g>
		{new Array(n).fill(0).map((_, i) => (
			<Seagull key={i} x={((frame * (2.4 + i * 0.4) + i * 420) % 2200) - 500} y={y + i * 90 + Math.sin(frame * 0.05 + i) * 20} s={0.5 + (i % 2) * 0.2} frame={frame} seed={`g${i}`} />
		))}
	</g>
);

/** Story-clock + gravity HUD (top right). Visible while gravity is off and a little after. */
export const GravityHUD: React.FC = () => {
	const gf = useCurrentFrame();
	if (gf < OFF_FRAME - 6 || gf > ON_FRAME + 70) return null;
	const g = gravityG(gf);
	const s = Math.max(0, storySec(gf));
	const appear = Math.min(1, (gf - OFF_FRAME + 6) / 8);
	const out = gf > ON_FRAME + 50 ? 1 - (gf - ON_FRAME - 50) / 20 : 1;
	const danger = g > 0.5 && gf >= ON_FRAME;
	const ring = Math.min(1, s / 10);
	const C = 2 * Math.PI * 62;
	return (
		<AbsoluteFill style={{pointerEvents: 'none', opacity: Math.max(0, Math.min(appear, out))}}>
			<div style={{position: 'absolute', right: 40, top: 150, width: 300, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, transform: `scale(${0.8 + appear * 0.2})`, transformOrigin: 'top right'}}>
				<svg width={150} height={150} viewBox="0 0 150 150">
					<circle cx={75} cy={75} r={62} fill="rgba(21,18,28,0.72)" stroke={INK} strokeWidth={6} />
					<circle cx={75} cy={75} r={62} fill="none" stroke={danger ? BRAND.pink : BRAND.cyan} strokeWidth={10} strokeDasharray={`${C * ring} ${C}`} transform="rotate(-90 75 75)" strokeLinecap="round" />
					<text x={75} y={88} textAnchor="middle" fontFamily={HEAD_FONT} fontSize={52} fill="#fff">
						{Math.min(10, Math.floor(s))}
					</text>
					<text x={75} y={112} textAnchor="middle" fontFamily={BODY_FONT} fontWeight={800} fontSize={14} fill={BRAND.yellow} letterSpacing={2}>
						SANİYE
					</text>
				</svg>
				<div
					style={{
						fontFamily: HEAD_FONT,
						fontSize: 46,
						color: danger ? BRAND.pink : g < 0.05 ? BRAND.cyan : '#fff',
						background: 'rgba(21,18,28,0.72)',
						border: `5px solid ${INK}`,
						borderRadius: 18,
						padding: '4px 18px',
						letterSpacing: 2,
					}}
				>
					{g.toFixed(2)} g
				</div>
			</div>
		</AbsoluteFill>
	);
};

export {G_Y, ON_FRAME, OFF_FRAME, GRAB_FRAME};
