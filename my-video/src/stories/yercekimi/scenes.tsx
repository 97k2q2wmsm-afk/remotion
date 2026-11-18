import React from 'react';
import {AbsoluteFill, interpolate, random, useCurrentFrame} from 'remotion';
import {BODY_FONT, BRAND, HEAD_FONT} from '../../channels/basina-gelseydi/brand';
import {Vignette} from '../../engine/Light';
import {Particles} from '../../engine/Particles';
import {SceneProps} from '../../engine/timeline';
import {Cloud, Ferry, Sea, Seagull, Simit, SkyGrad, Skyline, Sun, TeaGlass} from '../../engine/modern/City';
import {CinemaLight, DustPuff, Glitch, Letterbox, LiquidBlob, Shockwave, SpeedLines} from '../../engine/modern/Fx';
import {MC, clamp01, keys, kick} from '../../engine/modern/motion';
import {CAST, INK, Person, POSES, wobblePose} from '../../engine/modern/Person';
import {G_Y, GRAB_FRAME, heroHeight, heroX, heroY, ITEMS, itemState, landing, PX_PER_M, RAIL_M} from './physics';
import {Backdrop, Cam, Gulls, Hero, Items, Plane, StreetSet, Svg, useGlobalFrame} from './world';

const cl = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Index of the active internal shot for a list of cut frames (local). */
const shotOf = (frame: number, cuts: number[]) => cuts.filter((c) => frame >= c).length;

/** Full street world rendered through a camera. */
const World: React.FC<{cam: Cam; gf: number; hero?: boolean; crack?: number; exclude?: string[]; children?: React.ReactNode; fg?: React.ReactNode}> = ({cam, gf, hero = true, crack = 0, exclude, children, fg}) => {
	const frame = useCurrentFrame();
	return (
		<Svg>
			<Backdrop cam={cam} frame={frame} />
			<Plane cam={cam} depth={1} frame={frame}>
				<StreetSet crack={crack} />
				<Gulls frame={frame + 200} y={G_Y - 2300} n={3} />
				<Items gf={gf} frame={frame} exclude={exclude} />
				{hero ? <Hero gf={gf} frame={frame} /> : null}
				{children}
			</Plane>
			{fg}
		</Svg>
	);
};

const Tag: React.FC<{text: string; x: number; y: number; at: number; color?: string; rot?: number; size?: number}> = ({text, x, y, at, color = BRAND.yellow, rot = -4, size = 54}) => {
	const frame = useCurrentFrame();
	const k = MC.easeOutBack(clamp01((frame - at) / 10));
	if (frame < at) return null;
	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${k})`,
				fontFamily: HEAD_FONT,
				fontSize: size,
				color: INK,
				background: color,
				border: `6px solid ${INK}`,
				borderRadius: 16,
				padding: '2px 22px',
				boxShadow: `0 8px 0 ${INK}`,
				letterSpacing: 2,
				whiteSpace: 'nowrap',
			}}
		>
			{text}
		</div>
	);
};

// ───────────────────────────── 1. HOOK (flash-forward) ─────────────────────────────
export const Hook: React.FC<SceneProps> = ({durationInFrames: d, word}) => {
	const frame = useCurrentFrame();
	const cut = word('ilk') ?? Math.round(d * 0.58);
	// Flash-forward: show the city ~5–6 story-seconds into the event.
	const gf = Math.round(interpolate(frame, [0, d], [700, 790]));
	const shot = shotOf(frame, [cut]);
	if (shot === 0) {
		const cam: Cam = {
			x: keys(frame, [[0, 560], [cut, 640]]),
			y: keys(frame, [[0, 1330], [cut, 1150]]),
			zoom: keys(frame, [[0, 1.75], [cut, 1.15]], MC.easeOutCubic),
			rot: keys(frame, [[0, -4], [cut, 3]]),
			shake: 3 + kick(frame, 0, 18, 8),
		};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} hero={false} />
				<SpeedLines amount={0.5} dir="down" seed="hk" />
				<Particles kind="dust" count={40} seed="hookdust" color="#fff6dc" />
				<CinemaLight angle={140} />
				<Vignette strength={0.45} />
				<Glitch amount={interpolate(frame, [0, 6], [1, 0], cl)} seed="hk" />
			</AbsoluteFill>
		);
	}
	const f = frame - cut;
	const hx = heroX(gf);
	const hy = heroY(gf);
	const cam: Cam = {x: hx + 20, y: hy + keys(f, [[0, 420], [d - cut, -40]], MC.easeOutCubic), zoom: keys(f, [[0, 1.7], [d - cut, 2.35]]), rot: -6 + f * 0.15, shake: 4};
	return (
		<AbsoluteFill>
			<World cam={cam} gf={gf} />
			<SpeedLines amount={0.9} dir="down" seed="hk2" color="#fff" />
			<CinemaLight angle={120} strength={1.2} />
			<Vignette strength={0.5} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 2. SABAH (ordinary morning) ─────────────────────────────
const Panorama: React.FC<{frame: number; pan: number}> = ({frame, pan}) => (
	<Svg>
		<g transform={`translate(${-pan * 0.15} 0)`}>
			<SkyGrad id="panosky" y0={0} y1={1920} stops={[[0, '#2a6cb8'], [0.38, '#7fb8e6'], [0.6, '#ffd2a0'], [0.7, '#ff9f7a']]} />
			<Sun x={760} y={1060} r={90} />
			<Cloud x={300} y={420} s={1.1} seed="p1" />
			<Cloud x={880} y={260} s={0.8} seed="p2" />
		</g>
		<g transform={`translate(${-pan * 0.4} 0)`}>
			<Skyline y={1240} color="#5d6d96" light="#e7ecfa" seed="pano" />
		</g>
		<Sea y={1230} h={700} frame={frame} />
		<g transform={`translate(${-pan} 0)`}>
			<Ferry x={300 + frame * 2.2} y={1420} s={1.1} />
			<rect x={-400} y={1700} width={2400} height={260} fill="#2f3d5c" />
			{new Array(12).fill(0).map((_, i) => (
				<rect key={i} x={-300 + i * 200} y={1640 - (i % 3) * 40} width={160} height={300} fill="#3a4a6c" stroke={INK} strokeWidth={6} />
			))}
		</g>
		{[0, 1, 2].map((i) => (
			<Seagull key={i} x={200 + i * 260 + frame * (3 + i)} y={700 + i * 110} s={0.9 - i * 0.2} frame={frame + i * 7} seed={`pg${i}`} />
		))}
	</Svg>
);

export const Morning: React.FC<SceneProps> = ({durationInFrames: d, word}) => {
	const frame = useCurrentFrame();
	const gf = useGlobalFrame();
	const tTraffic = word('Trafik') ?? Math.round(d * 0.4);
	const tTea = word('çay') ?? Math.round(d * 0.8);
	const shot = shotOf(frame, [tTraffic, tTea]);
	if (shot === 0) {
		return (
			<AbsoluteFill>
				<Panorama frame={frame} pan={frame * 2.2} />
				<CinemaLight angle={70} warm="rgba(255,200,140,0.5)" />
				<Vignette strength={0.35} />
			</AbsoluteFill>
		);
	}
	if (shot === 1) {
		const f = frame - tTraffic;
		const cam: Cam = {x: keys(f, [[0, 200], [tTea - tTraffic, 440]]), y: 1440, zoom: keys(f, [[0, 1.35], [tTea - tTraffic, 1.5]]), rot: 0};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} />
				<CinemaLight angle={70} warm="rgba(255,200,140,0.5)" />
				<Vignette strength={0.35} />
			</AbsoluteFill>
		);
	}
	// Tea close-up on the café table (the tea that will later float).
	const f = frame - tTea;
	const tea = ITEMS.find((i) => i.id === 'tea')!;
	const cam: Cam = {x: tea.x0 - 10, y: tea.y0 - 70, zoom: keys(f, [[0, 4.4], [d - tTea, 5.0]]), rot: 0};
	return (
		<AbsoluteFill>
			<World cam={cam} gf={gf} hero={false}>
				<Particles kind="steam" count={10} seed="teasteam" area={{x: tea.x0 - 20, y: tea.y0 - 260, w: 40, h: 200}} />
			</World>
			<CinemaLight angle={60} warm="rgba(255,190,120,0.55)" />
			<Vignette strength={0.5} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 3. KAPANIŞ (gravity switches off) ─────────────────────────────
const LedClock: React.FC<{text: string; flicker: number}> = ({text, flicker}) => (
	<div
		style={{
			fontFamily: HEAD_FONT,
			fontSize: 300,
			letterSpacing: 16,
			color: '#7dff9a',
			textShadow: `0 0 30px rgba(125,255,154,${0.8 * flicker}), 0 0 90px rgba(125,255,154,${0.5 * flicker})`,
			opacity: 0.35 + 0.65 * flicker,
		}}
	>
		{text}
	</div>
);

export const SwitchOff: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const gf = useGlobalFrame();
	const off = hit('off') ?? Math.round(d * 0.4);
	const tCars = word('Arabalar') ?? off + 12;
	const minute = word('yedi') ?? off - 20;
	const shot = shotOf(frame, [off + 2, tCars]);
	if (shot === 0) {
		const flick = frame > off - 6 ? 0.5 + 0.5 * Math.sin(frame * 3) : 1;
		const z = keys(frame, [[0, 1], [off, 1.25]], MC.easeInCubic);
		return (
			<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, #183a2a 0%, #0b1712 70%)'}}>
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: `scale(${z})`}}>
					<div style={{border: `10px solid ${INK}`, borderRadius: 40, padding: '30px 60px', background: '#0d1a14', boxShadow: '0 0 0 14px #2f9a6a'}}>
						<LedClock text={frame >= minute ? '08:47' : '08:46'} flicker={flick} />
						<div style={{fontFamily: BODY_FONT, fontWeight: 800, fontSize: 48, color: '#7dff9a', textAlign: 'center', letterSpacing: 10, opacity: 0.8}}>ECZANE · 14°C</div>
					</div>
				</AbsoluteFill>
				<Glitch amount={interpolate(frame, [off - 8, off], [0, 1], cl)} seed="clk" />
				<Vignette strength={0.6} />
			</AbsoluteFill>
		);
	}
	if (shot === 1) {
		// Feet leave the ground: low close shot on the bus stop.
		const f = frame - off;
		const cam: Cam = {x: 690, y: G_Y - 10, zoom: keys(f, [[0, 2.6], [tCars - off, 2.2]]), rot: 0, shake: kick(f, 0, 16, 10)};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} />
				<Shockwave x={540} y={960} at={0} color="#bfefff" />
				<SpeedLines amount={interpolate(f, [0, 10], [1, 0.25], cl)} dir="radial" seed="off" />
				<Glitch amount={interpolate(f, [0, 8], [1, 0], cl)} seed="off" />
				<CinemaLight angle={70} />
			</AbsoluteFill>
		);
	}
	// Pull back and tilt up as everything starts to rise.
	const f = frame - tCars;
	const L = d - tCars;
	const cam: Cam = {x: keys(f, [[0, 520], [L, 560]]), y: keys(f, [[0, 1500], [L, 1080]], MC.easeInOutSine), zoom: keys(f, [[0, 1.45], [L, 1.0]], MC.easeInOutSine), rot: keys(f, [[0, 2], [L, -3]])};
	return (
		<AbsoluteFill>
			<World cam={cam} gf={gf} />
			<Particles kind="dust" count={50} seed="rise" color="#fff2d0" speed={1.2} />
			<CinemaLight angle={70} />
			<Vignette strength={0.35} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 4. ZIPLA (the hero keeps rising) ─────────────────────────────
export const Rising: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const gf = useGlobalFrame();
	const tStop = word('durmuyorsun') ?? Math.round(d * 0.3);
	const tPole = word('direğe') ?? Math.round(d * 0.66);
	const miss = hit('miss') ?? Math.round(d * 0.88);
	const shot = shotOf(frame, [tStop - 4, tPole - 6]);
	if (shot === 0) {
		// Replay: the jump at 08:47:00 (rewind look)
		const replayGf = Math.round(keys(frame, [[0, 300], [tStop - 4, 345]], MC.easeOutCubic));
		const cam: Cam = {x: heroX(replayGf), y: heroY(replayGf) + 40, zoom: 2.1, rot: -2};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={replayGf}>
					<ellipse cx={heroX(316) + 40} cy={G_Y + 46} rx={140} ry={20} fill="#6fa8c9" stroke={INK} strokeWidth={5} opacity={0.9} />
				</World>
				<AbsoluteFill style={{background: 'rgba(40,60,90,0.25)', mixBlendMode: 'multiply'}} />
				<Tag text="08:47:00" x={540} y={300} at={2} color="#ffffff" rot={-3} />
				<div style={{position: 'absolute', left: 40, top: 180, fontFamily: BODY_FONT, fontWeight: 900, fontSize: 40, color: '#fff', letterSpacing: 6}}>◀◀ TEKRAR</div>
				<Letterbox amount={1} />
			</AbsoluteFill>
		);
	}
	if (shot === 1) {
		// Tracking shot: windows stream past, altitude meter
		const f = frame - (tStop - 4);
		const hx = heroX(gf);
		const hy = heroY(gf);
		const cam: Cam = {x: hx + 60, y: hy - 30, zoom: 1.55, rot: Math.sin(f * 0.05) * 3};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} />
				<SpeedLines amount={0.75} dir="down" seed="rise" />
				<Altimeter gf={gf} />
				<CinemaLight angle={110} strength={1.1} />
				<Vignette strength={0.4} />
			</AbsoluteFill>
		);
	}
	// Reaching for the sign pole… and missing it.
	const f = frame - (tPole - 6);
	const hx = heroX(gf);
	const reachK = clamp01((f - 4) / 14) * (1 - clamp01((frame - miss - 6) / 16));
	const pose = wobblePose(
		{...POSES.reach, armL: [POSES.flail.armL[0] * (1 - reachK) + POSES.reach.armL[0] * reachK, 20]},
		frame,
		0.25 * (1 - reachK) + 0.1,
		7,
	);
	const cam: Cam = {x: (hx + 640) / 2, y: G_Y - 1236 + 60, zoom: keys(f, [[0, 2.0], [d - tPole, 2.6]]), rot: 0, shake: kick(frame, miss, 6, 8)};
	return (
		<AbsoluteFill>
			<Svg>
				<Backdrop cam={cam} frame={frame} />
				<Plane cam={cam} depth={1} frame={frame}>
					<StreetSet />
					<Hero gf={gf} frame={frame} pose={reachK > 0.05 ? pose : undefined} face={frame >= miss ? 'shock' : reachK > 0.3 ? 'determined' : undefined} />
				</Plane>
			</Svg>
			<Tag text="KAÇIRDIN!" x={540} y={560} at={miss + 2} color={BRAND.pink} rot={5} size={70} />
			<Altimeter gf={gf} />
			<CinemaLight angle={110} />
			<Vignette strength={0.45} />
		</AbsoluteFill>
	);
};

const Altimeter: React.FC<{gf: number}> = ({gf}) => {
	const h = heroHeight(gf);
	return (
		<div style={{position: 'absolute', left: 40, top: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8}}>
			<div style={{width: 18, height: 380, borderRadius: 9, background: 'rgba(21,18,28,0.6)', border: `5px solid ${INK}`, position: 'relative', overflow: 'hidden'}}>
				<div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.min(100, (h / 30) * 100)}%`, background: `linear-gradient(0deg, ${BRAND.orange}, ${BRAND.yellow})`}} />
			</div>
			<div style={{fontFamily: HEAD_FONT, fontSize: 52, color: '#fff', WebkitTextStroke: `8px ${INK}`, paintOrder: 'stroke fill'}}>{h.toFixed(1)} m</div>
			<div style={{fontFamily: BODY_FONT, fontWeight: 900, fontSize: 26, color: BRAND.yellow, WebkitTextStroke: `5px ${INK}`, paintOrder: 'stroke fill'}}>↑ 2,8 m/s</div>
		</div>
	);
};

// ───────────────────────────── 5. DÜNYA (why everything lifts) ─────────────────────────────
const Globe: React.FC<{frame: number; k: number}> = ({frame, k}) => {
	const R = 330;
	const cx = 540;
	const cy = 1040;
	const spin = frame * 2.2;
	const lands = [
		[-0.5, -0.3, 120, 80],
		[0.1, -0.5, 160, 90],
		[0.6, 0.1, 110, 140],
		[-0.2, 0.35, 90, 70],
		[1.2, -0.25, 140, 100],
		[1.7, 0.3, 120, 80],
	];
	// tangent line from the observer (top of the globe)
	const len = k * 520;
	const curveDrop = (x: number) => cy - Math.sqrt(Math.max(0, R * R - x * x));
	return (
		<Svg>
			<rect width={1080} height={1920} fill="#0b1030" />
			{new Array(80).fill(0).map((_, i) => (
				<circle key={i} cx={random(`st${i}`) * 1080} cy={random(`sy${i}`) * 1920} r={1 + random(`sr${i}`) * 2.5} fill="#fff" opacity={0.4 + 0.5 * Math.sin(frame * 0.1 + i)} />
			))}
			<circle cx={cx} cy={cy} r={R + 40} fill="#5fb3ff" opacity={0.25} />
			<defs>
				<clipPath id="globe">
					<circle cx={cx} cy={cy} r={R} />
				</clipPath>
			</defs>
			<circle cx={cx} cy={cy} r={R} fill="#2f7fd0" stroke={INK} strokeWidth={10} />
			<g clipPath="url(#globe)">
				{lands.map(([lx, ly, w, h], i) => {
					const x = cx + (((lx * 300 + spin + 1600) % 1300) - 650);
					return <ellipse key={i} cx={x} cy={cy + ly * R} rx={w} ry={h} fill="#5fbf6a" stroke={INK} strokeWidth={6} />;
				})}
				<circle cx={cx + 150} cy={cy + 160} r={R} fill="#0b1030" opacity={0.28} />
			</g>
			{/* rotation arrow */}
			<path d={`M ${cx - R - 50} ${cy + 80} Q ${cx} ${cy + R + 140} ${cx + R + 50} ${cy + 80}`} fill="none" stroke={BRAND.yellow} strokeWidth={14} strokeLinecap="round" strokeDasharray="30 22" strokeDashoffset={-frame * 4} />
			<path d={`M ${cx + R + 50} ${cy + 80} l -10 -50 l 46 30 Z`} fill={BRAND.yellow} stroke={INK} strokeWidth={5} />
			{/* the curved ground vs the straight path */}
			<path d={`M ${cx} ${cy - R} L ${cx + len} ${cy - R}`} stroke="#fff" strokeWidth={10} strokeDasharray="22 16" strokeLinecap="round" />
			<path d={`M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx + Math.min(R * 0.95, len * 0.8)} ${curveDrop(Math.min(R * 0.95, len * 0.8))}`} fill="none" stroke={BRAND.orange} strokeWidth={14} strokeLinecap="round" />
			<g transform={`translate(${cx + len * 0.85} ${cy - R - 40}) scale(0.16)`} opacity={k}>
				<Person x={0} y={0} scale={1} look={CAST.kaan} pose={wobblePose(POSES.float, frame, 0.6, 3)} face="shock" seed="globe" />
			</g>
			<g transform={`translate(${cx} ${cy - R - 36}) scale(0.12)`}>
				<Person x={0} y={0} scale={1} look={CAST.kaan} pose={POSES.stand} face="neutral" seed="globe0" />
			</g>
		</Svg>
	);
};

export const Earth: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const gf = useGlobalFrame();
	const tStand = word('Yerinde') ?? Math.round(d * 0.4);
	const tTea = word('Çay') ?? Math.round(d * 0.75);
	const teaHit = hit('tea') ?? Math.round(d * 0.9);
	const shot = shotOf(frame, [tStand, tTea]);
	if (shot === 0) {
		const k = clamp01((frame - 10) / 40);
		return (
			<AbsoluteFill style={{transform: `scale(${keys(frame, [[0, 1.15], [tStand, 1]], MC.easeOutCubic)})`}}>
				<Globe frame={frame} k={k} />
				<Tag text="SEN DÜMDÜZ GİDERSİN" x={540} y={520} at={18} color="#ffffff" rot={-3} size={52} />
				<Tag text="YER KIVRILIR" x={760} y={1500} at={34} color={BRAND.orange} rot={4} size={52} />
				<Vignette strength={0.5} />
			</AbsoluteFill>
		);
	}
	if (shot === 1) {
		// Bus stop crowd: 1 metre up even if you stood still.
		const f = frame - tStand;
		const cam: Cam = {x: keys(f, [[0, 560], [tTea - tStand, 760]]), y: G_Y - 120, zoom: 1.75, rot: 0};
		const kadin = ITEMS.find((i) => i.id === 'kadin')!;
		const st = itemState(kadin, gf);
		const top = st.y + 300 * kadin.scale;
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} hero={false}>
					<g opacity={clamp01((f - 6) / 10)}>
						<path d={`M ${kadin.x0 - 150} ${G_Y + 40} L ${kadin.x0 - 150} ${top - 30 + (G_Y + 40 - (top - 30)) * 0}`} stroke={BRAND.yellow} strokeWidth={10} />
						<path d={`M ${kadin.x0 - 180} ${G_Y + 40} L ${kadin.x0 - 120} ${G_Y + 40} M ${kadin.x0 - 180} ${G_Y + 40 - st.h * PX_PER_M} L ${kadin.x0 - 120} ${G_Y + 40 - st.h * PX_PER_M}`} stroke={BRAND.yellow} strokeWidth={10} />
					</g>
				</World>
				<Tag text={`${Math.max(0.3, (itemState(kadin, gf).h)).toFixed(1).replace('.', ',')} M`} x={300} y={980} at={8} color={BRAND.yellow} rot={-6} size={60} />
				<CinemaLight angle={70} />
				<Vignette strength={0.4} />
			</AbsoluteFill>
		);
	}
	// Tea leaves the glass and becomes a floating sphere.
	const f = frame - tTea;
	const out = clamp01((frame - tTea + 4) / Math.max(6, teaHit - tTea + 4));
	const blobY = 1100 - out * 420 - Math.max(0, frame - teaHit) * 2.2;
	const blobR = 60 + out * 70;
	return (
		<AbsoluteFill style={{background: 'linear-gradient(180deg, #ffcf9e 0%, #f2a77a 100%)'}}>
			<Svg>
				<g transform={`translate(540 ${1350 - f * 0.6}) rotate(${f * 0.25})`}>
					<TeaGlass x={0} y={0} s={2.6} level={0.85 - out * 0.75} saucer={false} />
				</g>
				{out > 0.05 ? <LiquidBlob x={545 + Math.sin(f * 0.07) * 14} y={blobY} r={blobR} seed="tea" /> : null}
				{out > 0.2 ? <LiquidBlob x={700} y={blobY + 120} r={22} seed="tea2" /> : null}
				{out > 0.4 ? <LiquidBlob x={400} y={blobY - 60} r={14} seed="tea3" /> : null}
				<g transform={`translate(${180 + f * 0.8} ${560 - f * 0.4}) rotate(${f * 1.5})`}>
					<Simit x={0} y={0} s={1.5} />
				</g>
				<rect x={820 + Math.sin(f * 0.05) * 10} y={700 - f * 0.5} width={60} height={60} rx={8} fill="#fffdf6" stroke={INK} strokeWidth={6} transform={`rotate(${f} ${850} ${730 - f * 0.5})`} />
			</Svg>
			<Particles kind="dust" count={30} seed="teadust" color="#fff6e0" />
			<Vignette strength={0.45} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 6. ASKIDA (suspended, 7…8…9) ─────────────────────────────
const BigCount: React.FC<{n: string; at: number | null}> = ({n, at}) => {
	const frame = useCurrentFrame();
	if (at === null || frame < at || frame > at + 26) return null;
	const k = MC.easeOutBack(clamp01((frame - at) / 8));
	const o = 1 - clamp01((frame - at - 16) / 10);
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'}}>
			<div style={{fontFamily: HEAD_FONT, fontSize: 520, color: '#fff', opacity: o * 0.92, transform: `scale(${0.6 + k * 0.5})`, WebkitTextStroke: `22px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 20px 0 ${INK}`}}>{n}</div>
		</AbsoluteFill>
	);
};

export const Suspended: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const gf = useGlobalFrame();
	const tCity = word('Şehir') ?? Math.round(d * 0.35);
	const tEight = hit('eight') ?? Math.round(d * 0.58);
	const grab = hit('grab') ?? Math.round(d * 0.9);
	const shot = shotOf(frame, [tCity, tEight - 8]);
	const lb = interpolate(frame, [0, 20], [0, 1], cl);
	if (shot === 0) {
		// Huge wide: you are 20 m up, the whole street hangs below.
		const hx = heroX(gf);
		const hy = heroY(gf);
		const cam: Cam = {x: hx + keys(frame, [[0, 80], [tCity, 0]]), y: keys(frame, [[0, hy + 260], [tCity, hy + 520]]), zoom: keys(frame, [[0, 0.62], [tCity, 0.42]], MC.easeInOutSine), rot: keys(frame, [[0, -5], [tCity, 2]])};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} />
				<Particles kind="dust" count={60} seed="susp" color="#fff2d0" speed={0.3} />
				<CinemaLight angle={120} warm="rgba(255,180,120,0.4)" cool="rgba(40,60,140,0.45)" />
				<Vignette strength={0.5} />
				<Letterbox amount={lb} />
			</AbsoluteFill>
		);
	}
	if (shot === 1) {
		// Slow pan across the frozen chaos.
		const f = frame - tCity;
		const L = tEight - 8 - tCity;
		const cam: Cam = {x: keys(f, [[0, -380], [L, 1100]], MC.easeInOutSine), y: G_Y - 420, zoom: 1.35, rot: 1.5};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} hero={false} />
				<Particles kind="dust" count={60} seed="susp2" color="#fff2d0" speed={0.25} />
				<CinemaLight angle={120} warm="rgba(255,180,120,0.4)" cool="rgba(40,60,140,0.45)" />
				<Vignette strength={0.5} />
				<Letterbox amount={1} />
			</AbsoluteFill>
		);
	}
	// 8… 9… grab the balcony!
	const f = frame - (tEight - 8);
	const railY = G_Y - RAIL_M * PX_PER_M;
	const hx = heroX(gf);
	const reach = gf < GRAB_FRAME ? wobblePose({...POSES.hang, armL: [-160, -10], armR: [150, 20], legL: [-30, 40], legR: [20, 50]}, frame, 0.4, 5) : undefined;
	const cam: Cam = {x: hx + 40, y: railY + 140, zoom: keys(f, [[0, 1.6], [grab - (tEight - 8), 2.15]], MC.easeInCubic), rot: -2, shake: kick(frame, grab, 10, 6)};
	return (
		<AbsoluteFill>
			<World cam={cam} gf={gf} />
			<BigCount n="8" at={tEight} />
			<BigCount n="9" at={hit('nine')} />
			<Shockwave x={540} y={railY - cam.y + 960} at={grab} color="#ffd23f" maxR={500} dur={16} />
			<CinemaLight angle={120} warm="rgba(255,180,120,0.4)" cool="rgba(40,60,140,0.45)" />
			<Vignette strength={0.45} />
			<Letterbox amount={1 - clamp01((frame - grab) / 10)} />
			{reach ? null : <Tag text="TUTUN!" x={540} y={520} at={grab + 1} color={BRAND.yellow} rot={-5} size={64} />}
		</AbsoluteFill>
	);
};

// ───────────────────────────── 7. DÖNÜŞ (gravity returns) ─────────────────────────────
export const Return: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const gf = useGlobalFrame();
	const on = hit('on') ?? 6;
	const tAll = word('Havadaki') ?? Math.round(d * 0.45);
	const shot = shotOf(frame, [tAll - 4]);
	if (shot === 0) {
		// Under the hero, looking up: the jolt when weight returns, everything rains past.
		const hx = heroX(gf);
		const railY = G_Y - RAIL_M * PX_PER_M;
		const cam: Cam = {x: hx, y: railY + 260, zoom: 1.45, rot: 6, shake: 4 + kick(frame, on, 30, 8)};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} />
				<SpeedLines amount={interpolate(frame, [on, on + 6], [0, 1], cl)} dir="up" seed="ret" />
				<Shockwave x={540} y={700} at={on} color="#ffffff" />
				<Glitch amount={interpolate(frame, [on - 2, on, on + 8], [0, 1, 0], cl)} seed="on" />
				<CinemaLight angle={140} strength={1.2} />
				<Vignette strength={0.5} />
				<Tag text="1,00 g" x={540} y={420} at={on + 2} color={BRAND.pink} rot={-6} size={90} />
			</AbsoluteFill>
		);
	}
	const f = frame - (tAll - 4);
	// Everything lands: shake follows the actual landings.
	const shake = ITEMS.reduce((acc, it) => {
		const l = landing(it.v0);
		return acc + kick(gf, l.frame, 14 * it.mass, 5);
	}, 0);
	const cam: Cam = {x: 560, y: keys(f, [[0, 1180], [d - tAll, 1320]]), zoom: keys(f, [[0, 0.85], [d - tAll, 0.95]]), rot: -2, shake: Math.min(40, shake)};
	return (
		<AbsoluteFill>
			<World cam={cam} gf={gf} crack={clamp01((gf - 1230) / 10)}>
				{ITEMS.filter((i) => i.mass >= 0.5).map((i) => {
					const l = landing(i.v0);
					const st = itemState(i, l.frame);
					return <DustPuff key={i.id} x={st.x} y={(i.kind === 'car' ? i.y0 + 30 : G_Y + 40)} at={l.frame - (gf - frame)} s={i.kind === 'car' ? 1.3 : 0.6} seed={i.id} />;
				})}
			</World>
			<CinemaLight angle={140} />
			<Vignette strength={0.45} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 8. SONUÇ (aftermath) ─────────────────────────────
export const Aftermath: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const gf = useGlobalFrame();
	const tCars = word('Ama') ?? Math.round(d * 0.4);
	const slam = hit('slam') ?? Math.round(d * 0.6);
	const tCity = word('Şehir') ?? Math.round(d * 0.75);
	const shot = shotOf(frame, [tCars, tCity]);
	if (shot === 0) {
		const cam: Cam = {x: keys(frame, [[0, 760], [tCars, 900]]), y: G_Y - 60, zoom: 1.6, rot: 0};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf} crack={1}>
					{[0, 1, 2].map((i) => (
						<g key={i} transform={`translate(${880 + i * 70} ${G_Y - 160 - ((frame * 1.6 + i * 40) % 120)}) rotate(${frame * 6 + i * 120})`}>
							<path d="M 0 -18 L 5 -5 L 18 -5 L 8 4 L 12 18 L 0 9 L -12 18 L -8 4 L -18 -5 L -5 -5 Z" fill={BRAND.yellow} stroke={INK} strokeWidth={3} />
						</g>
					))}
				</World>
				<Particles kind="dust" count={60} seed="aft" color="#e8dcc6" speed={0.6} />
				<CinemaLight angle={80} />
				<Vignette strength={0.4} />
			</AbsoluteFill>
		);
	}
	if (shot === 1) {
		// A car that was flung high comes down hard (elsewhere on the avenue).
		const f = frame - tCars;
		const fallDur = slam - tCars;
		const p = clamp01(f / Math.max(1, fallDur));
		const y = -500 + p * p * 1830;
		const landed = frame >= slam;
		const since = frame - slam;
		const cam: Cam = {x: 540, y: 1180, zoom: 1, rot: 0, shake: kick(frame, slam, 34, 7)};
		return (
			<AbsoluteFill>
				<Svg>
					<Backdrop cam={cam} frame={frame} />
					<Plane cam={cam} depth={1} frame={frame}>
						<StreetSet crack={landed ? 1 : 0} />
						<CarFall y={landed ? G_Y + 150 - Math.abs(Math.sin(since * 0.5)) * Math.exp(-since / 5) * 60 : y} rot={landed ? 178 : 140 + p * 38} dent={landed ? 1 : 0} />
						{!landed ? new Array(4).fill(0).map((_, k) => <rect key={k} x={430 + k * 50} y={y - 400 - k * 30} width={8} height={240} fill="#fff" opacity={0.35} />) : null}
						<DustPuff x={520} y={G_Y + 240} at={slam} s={2} seed="slam" />
					</Plane>
				</Svg>
				<Shockwave x={520} y={1330} at={slam} color="#fff3d0" maxR={900} dur={18} />
				<Vignette strength={0.45} />
			</AbsoluteFill>
		);
	}
	// Giant wide crane-up over the wrecked street.
	const f = frame - tCity;
	const L = d - tCity;
	const cam: Cam = {x: 380, y: keys(f, [[0, 1250], [L, 820]], MC.easeInOutSine), zoom: keys(f, [[0, 0.75], [L, 0.46]], MC.easeInOutSine), rot: keys(f, [[0, 0], [L, -2]])};
	return (
		<AbsoluteFill>
			<World cam={cam} gf={gf} crack={1}>
				<CarFall y={G_Y + 150} rot={178} dent={1} x={-900} />
				{[-700, -100, 900, 1600].map((x, i) => (
					<g key={x} opacity={0.75}>
						<Cloudy x={x} y={G_Y - 80} s={1.4 + (i % 2) * 0.5} frame={frame} seed={`sm${i}`} />
					</g>
				))}
			</World>
			<Particles kind="dust" count={80} seed="aft3" color="#e8dcc6" speed={0.5} />
			<CinemaLight angle={80} warm="rgba(255,170,110,0.45)" />
			<Vignette strength={0.5} />
		</AbsoluteFill>
	);
};

const Cloudy: React.FC<{x: number; y: number; s: number; frame: number; seed: string}> = ({x, y, s, frame, seed}) => (
	<g transform={`translate(${x} ${y - frame * 0.6}) scale(${s + frame * 0.002})`}>
		<Cloud x={0} y={0} s={1} fill="#d9cdb8" shade="#b9ab92" seed={seed} />
	</g>
);

const CarFall: React.FC<{y: number; rot: number; dent: number; x?: number}> = ({y, rot, dent, x = 520}) => (
	<g transform={`translate(${x} ${y}) rotate(${rot}) scale(1.25)`}>
		<g transform={`scale(1 ${1 - dent * 0.18})`}>
			<path d="M -170 -20 Q -170 -70 -140 -76 L -85 -84 Q -57 -140 -28 -146 L 57 -146 Q 85 -140 113 -86 Q 170 -80 170 -40 L 170 -20 Z" fill="#ffc928" stroke={INK} strokeWidth={7} strokeLinejoin="round" />
			<path d="M -73 -88 Q -53 -132 -22 -134 L 0 -134 L 0 -88 Z M 12 -88 L 12 -134 L 53 -134 Q 79 -128 101 -88 Z" fill="#9fd0ea" stroke={INK} strokeWidth={5} />
			{[-95, 95].map((wx) => (
				<circle key={wx} cx={wx} cy={-16} r={44} fill="#1f2128" stroke={INK} strokeWidth={6} />
			))}
			<rect x={-40} y={-172} width={80} height={26} rx={6} fill="#fff5c0" stroke={INK} strokeWidth={5} />
		</g>
	</g>
);

// ───────────────────────────── 9. FİNAL (hanging + next episode) ─────────────────────────────
export const Finale: React.FC<SceneProps> = ({durationInFrames: d, word, hit}) => {
	const frame = useCurrentFrame();
	const gf = useGlobalFrame();
	const tQ = word('Peki') ?? Math.round(d * 0.4);
	const q = hit('q') ?? Math.round(d * 0.8);
	if (frame < tQ - 2) {
		const hx = heroX(GRAB_FRAME);
		const railY = G_Y - RAIL_M * PX_PER_M;
		const cam: Cam = {x: hx + 10, y: railY + 150, zoom: keys(frame, [[0, 2.0], [tQ, 3.2]], MC.easeInOutSine), rot: keys(frame, [[0, -3], [tQ, 2]])};
		return (
			<AbsoluteFill>
				<World cam={cam} gf={gf}>
					<g opacity={0.8}>
						<path d={`M ${hx + 70} ${railY + 30} q 10 20 0 30 q -10 -10 0 -30 Z`} fill="#8fd3ff" stroke={INK} strokeWidth={3} transform={`translate(0 ${(frame * 2) % 60})`} />
					</g>
				</World>
				<CinemaLight angle={120} />
				<Vignette strength={0.55} />
			</AbsoluteFill>
		);
	}
	// End card: next episode teaser — double gravity.
	const f = frame - (tQ - 2);
	const squash = 1 - 0.18 * MC.easeOutBounce(clamp01(f / 24));
	const textIn = MC.easeOutBack(clamp01((f - 6) / 14));
	const big = MC.easeOutElastic(clamp01((frame - q + 2) / 30));
	return (
		<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 40%, #3a2a6a 0%, #120d26 75%)'}}>
			<SpeedLines amount={0.7} dir="down" seed="end" color="#b9a8ff" count={34} />
			<Svg>
				{new Array(9).fill(0).map((_, i) => (
					<path key={i} d={`M ${120 + i * 105} ${200 + ((f * 18 + i * 140) % 700)} l 0 120 l -22 -30 m 22 30 l 22 -30`} stroke="#ffd23f" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.45} />
				))}
				<g transform={`translate(540 1250) scale(1 ${squash}) translate(-540 -1250)`}>
					<ellipse cx={540} cy={1260} rx={260} ry={34} fill="#000" opacity={0.4} />
					<Person x={540} y={1030 + (1 - squash) * 200} scale={1.0} look={CAST.kaan} pose={{...POSES.stand, armL: [-40, 60], armR: [40, -60], legL: [-14, 30], legR: [14, -30], lean: 6, head: 10}} face="scared" seed="endhero" />
				</g>
			</Svg>
			<div style={{position: 'absolute', top: 210, left: 0, right: 0, textAlign: 'center', transform: `scale(${textIn})`}}>
				<div style={{fontFamily: BODY_FONT, fontWeight: 900, fontSize: 40, letterSpacing: 10, color: BRAND.cyan}}>SONRAKİ BÖLÜM</div>
				<div lang="tr" style={{fontFamily: HEAD_FONT, fontSize: 150, lineHeight: 1, color: '#fff', WebkitTextStroke: `18px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 14px 0 ${INK}`, marginTop: 10}}>
					YERÇEKİMİ
				</div>
				<div style={{fontFamily: HEAD_FONT, fontSize: 260, lineHeight: 1, color: BRAND.yellow, WebkitTextStroke: `22px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 16px 0 ${INK}`, transform: `scale(${0.6 + big * 0.4}) rotate(-4deg)`}}>
					2 KATI?
				</div>
			</div>
			<div style={{position: 'absolute', bottom: 210, left: 0, right: 0, textAlign: 'center', opacity: clamp01((f - 30) / 10)}}>
				<div style={{display: 'inline-block', fontFamily: HEAD_FONT, fontSize: 50, letterSpacing: 4, color: INK, background: BRAND.yellow, border: `6px solid ${INK}`, borderRadius: 20, padding: '6px 34px', boxShadow: `0 8px 0 ${INK}`}}>
					TAKİP ET · {BRAND.name}
				</div>
			</div>
			<Vignette strength={0.5} />
		</AbsoluteFill>
	);
};

