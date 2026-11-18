import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Camera, Layer, Stage} from '../../engine/Camera';
import {Character, PALETTES} from '../../engine/Character';
import {CAPTION_FONT, TITLE_FONT} from '../../engine/fonts';
import {StatCallout, TitleCard} from '../../engine/Kinetic';
import {Flash, Glow, GodRays, Grade, LightningFlicker, Vignette} from '../../engine/Light';
import {Birds, Particles} from '../../engine/Particles';
import {Blob, INK} from '../../engine/Shapes';
import {SceneProps} from '../../engine/timeline';
import {CityRow, CloudBank, Column, Cypress, Galley, Ground, PyroCloud, Sea, Sky, Sun, Vesuvius} from './art';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const outCubic = Easing.out(Easing.cubic);
const frac = (f: number, d: number) => Math.min(0.99, Math.max(0.01, f / d));

/** Shake that kicks at `at` and decays, on top of a constant base tremor. */
const kickShake = (at: number, amp: number, decay: number, base = 0) => (f: number) =>
	base + (f >= at ? amp * Math.exp(-(f - at) / decay) : 0);

// ───────────────────────────── 1. HOOK ─────────────────────────────
export const Hook: React.FC<SceneProps> = ({durationInFrames: d, word}) => {
	const frame = useCurrentFrame();
	const nadie = word('nadie') ?? d * 0.8;
	const ominous = interpolate(frame, [nadie - 6, nadie + 24], [0, 1], clamp);
	return (
		<AbsoluteFill>
			<Camera
				durationInFrames={d}
				shake={(f) => (f > nadie ? 2 * ominous : 0)}
				keys={[
					{at: 0, x: -30, y: 40, zoom: 1.02},
					{at: frac(nadie, d), x: 10, y: -20, zoom: 1.14},
					{at: 1, x: 70, y: -170, zoom: 1.34},
				]}
			>
				<Layer depth={0.05}>
					<Stage>
						<Sky id="hook" stops={[[0, '#2d2350'], [0.3, '#a3477a'], [0.5, '#f08a5d'], [0.62, '#ffd08a']]} />
						<Sun x={210} y={760} r={70} color="#ffd27a" />
					</Stage>
				</Layer>
				<Layer depth={0.08}>
					<GodRays x={210} y={760} color="#ffd9a0" opacity={0.28} angle={120} spread={120} rays={9} seed="hook" />
				</Layer>
				<Layer depth={0.15}>
					<Stage>
						<CloudBank x={820} y={420} s={1.1} fill="#f6b38a" seed="c1" />
						<CloudBank x={180} y={300} s={0.8} fill="#e98f7c" seed="c2" />
					</Stage>
				</Layer>
				<Layer depth={0.3}>
					<Stage>
						<Vesuvius x={640} y={1090} s={1.05} erupt={0} glow={0} green={1} seed="v-hook" />
					</Stage>
					<Glow x={650} y={600} radius={260} color="#ff3b1a" opacity={0.5 * ominous} blend="multiply" />
				</Layer>
				<Layer depth={0.4}>
					<Birds count={6} seed="b1" y={520} speed={0.9} />
				</Layer>
				<Layer depth={0.6}>
					<Stage>
						<CityRow seed="hook-a" baseY={1220} count={9} x0={-280} x1={1360} minH={110} maxH={230} />
					</Stage>
				</Layer>
				<Layer depth={0.9}>
					<Stage>
						<CityRow seed="hook-b" baseY={1500} count={6} x0={-320} x1={1420} minH={170} maxH={320} />
						<Ground y={1700} fill="#c9a77c" hill={30} />
					</Stage>
					<Particles kind="steam" count={10} seed="chimney" area={{x: 420, y: 980, w: 60, h: 260}} />
				</Layer>
				<Layer depth={1.5}>
					<Stage>
						<Cypress x={-30} y={2050} h={1000} />
						<Column x={1040} y={2100} h={1300} w={120} />
					</Stage>
				</Layer>
			</Camera>
			<Grade color="#ff9a4a" opacity={0.28} />
			<AbsoluteFill style={{background: '#2a0505', opacity: ominous * 0.28, mixBlendMode: 'multiply'}} />
			<Vignette strength={0.6} />
			<TitleCard kicker="AÑO 79 d.C." title="POMPEYA" at={4} out={d - 26} y={250} size={150} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 2. STREETS ─────────────────────────────
const Awning: React.FC<{y: number}> = ({y}) => {
	const frame = useCurrentFrame();
	const stripes = 12;
	const w = 1300 / stripes;
	return (
		<g>
			{[-40, 1120].map((x) => (
				<rect key={x} x={x - 18} y={y} width={36} height={1100} fill="#7a4a24" stroke={INK} strokeWidth={7} />
			))}
			{new Array(stripes).fill(0).map((_, i) => {
				const x = -110 + i * w;
				const flap = Math.sin(frame * 0.12 + i * 0.7) * 6;
				return (
					<path
						key={i}
						d={`M ${x} ${y - 120} L ${x + w} ${y - 120} L ${x + w} ${y + 40} Q ${x + w / 2} ${y + 90 + flap} ${x} ${y + 40} Z`}
						fill={i % 2 === 0 ? '#c2412d' : '#f3e2bd'}
						stroke={INK}
						strokeWidth={6}
						strokeLinejoin="round"
					/>
				);
			})}
		</g>
	);
};

const Counter: React.FC = () => (
	<g>
		<rect x={-200} y={1380} width={1480} height={600} fill="#8a5330" stroke={INK} strokeWidth={8} />
		<rect x={-200} y={1380} width={1480} height={40} fill="#a86a3d" stroke={INK} strokeWidth={6} />
		{[-120, 260, 640, 1020].map((x) => (
			<rect key={x} x={x} y={1450} width={200} height={140} rx={10} fill="#6b3e22" stroke={INK} strokeWidth={5} />
		))}
		{/* loaves of panis quadratus */}
		{[420, 520, 470, 600].map((x, i) => (
			<g key={i} transform={`translate(${x} ${1360 - (i === 2 ? 46 : 0)})`}>
				<ellipse cx={0} cy={0} rx={56} ry={34} fill="#c98a3c" stroke={INK} strokeWidth={6} />
				<ellipse cx={-10} cy={-10} rx={30} ry={13} fill="#e2ad60" />
				{[-28, -10, 8, 26].map((lx) => (
					<line key={lx} x1={lx} y1={-28} x2={lx} y2={26} stroke="#7a4a1d" strokeWidth={5} strokeLinecap="round" />
				))}
			</g>
		))}
		{[880, 960].map((x, i) => (
			<path
				key={x}
				transform={`translate(${x} ${1240 + i * 10}) scale(${1 - i * 0.1})`}
				d="M -18 -40 L 18 -40 L 14 -20 Q 50 10 30 70 Q 20 110 0 140 Q -20 110 -30 70 Q -50 10 -14 -20 Z"
				fill="#b8532c"
				stroke={INK}
				strokeWidth={6}
				strokeLinejoin="round"
			/>
		))}
	</g>
);

export const Streets: React.FC<SceneProps> = ({durationInFrames: d, word}) => {
	const frame = useCurrentFrame();
	const vesubio = word('Vesubio') ?? d * 0.6;
	const kidX = interpolate(frame, [0, d], [-260, 1350]);
	const talk = Math.max(0, Math.sin(frame * 0.45)) * (frame < vesubio ? 1 : 0);
	const lookUp = interpolate(frame, [vesubio, vesubio + 15], [0, 1], clamp);
	return (
		<AbsoluteFill>
			<Camera
				durationInFrames={d}
				shake={null}
				keys={[
					{at: 0, x: -90, y: 30, zoom: 1.06},
					{at: frac(vesubio - 10, d), x: 50, y: 20, zoom: 1.1},
					{at: 1, x: 0, y: -210, zoom: 1.32},
				]}
			>
				<Layer depth={0.05}>
					<Stage>
						<Sky id="streets" stops={[[0, '#4fa3d9'], [0.45, '#9fd2ea'], [0.7, '#ffe6b5']]} />
					</Stage>
				</Layer>
				<Layer depth={0.2}>
					<Stage>
						<Vesuvius x={540} y={1060} s={0.62} erupt={0} glow={0} green={1} seed="v-streets" />
					</Stage>
				</Layer>
				<Layer depth={0.45}>
					<Stage>
						<CityRow seed="st-back" baseY={1120} count={7} x0={-300} x1={1380} minH={140} maxH={260} />
					</Stage>
				</Layer>
				<Layer depth={0.75}>
					<GodRays x={-60} y={200} color="#fff0c0" opacity={0.25} angle={135} spread={40} rays={6} seed="st" />
				</Layer>
				<Layer depth={0.85}>
					<Stage>
						<Awning y={430} />
						<Character
							x={760}
							y={1600}
							scale={1.02}
							palette={PALETTES.baker}
							hair="curly"
							beard
							expression={lookUp > 0.5 ? 'calm' : 'happy'}
							look={lookUp > 0.5 ? [-0.6, -1] : [-1, 0]}
							armR={interpolate(Math.sin(frame * 0.08), [-1, 1], [55, 80])}
							elbowR={-70}
							armL={10}
							item="bread"
							mouth={talk}
							headTilt={lookUp * -8}
							seed="baker"
						/>
						<Counter />
					</Stage>
					<Particles kind="steam" count={14} seed="bread" area={{x: 380, y: 1100, w: 260, h: 260}} />
				</Layer>
				<Layer depth={1.05}>
					<Stage>
						<Character
							x={250}
							y={1760}
							scale={1.02}
							flip
							palette={PALETTES.woman}
							hair="long"
							expression="happy"
							look={lookUp > 0.5 ? [0.4, -1] : [1, 0]}
							armR={14}
							armL={20}
							item="amphora"
							headTilt={lookUp * 6}
							seed="woman"
						/>
					</Stage>
				</Layer>
				<Layer depth={1.35}>
					<Stage>
						<Character x={kidX} y={2000} scale={0.72} palette={PALETTES.child} hair="short" expression="happy" walk={1.7} armL={30} armR={30} seed="kid" />
					</Stage>
				</Layer>
			</Camera>
			<Grade color="#ffb35a" opacity={0.22} />
			<Vignette strength={0.5} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 3. ERUPTION ─────────────────────────────
export const Eruption: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const blast = hit('blast') ?? Math.round(d * 0.35);
	const erupt = interpolate(frame, [blast, blast + 110], [0, 1], {...clamp, easing: outCubic});
	const dark = interpolate(frame, [blast, blast + 120], [0, 1], clamp);
	const scared = frame >= blast + 3;
	const treinta = word('treinta');
	return (
		<AbsoluteFill>
			<Camera
				durationInFrames={d}
				shake={kickShake(blast, 30, 22, frame > blast ? 4 : 0)}
				keys={[
					{at: 0, x: 40, y: 60, zoom: 1.22},
					{at: frac(blast, d), x: 30, y: 20, zoom: 1.3},
					{at: frac(blast + 40, d), x: 0, y: -230, zoom: 0.98},
					{at: 1, x: -20, y: -300, zoom: 0.94},
				]}
			>
				<Layer depth={0.05}>
					<Stage>
						<Sky id="noon" stops={[[0, '#3f93cf'], [0.5, '#8cc8e8'], [0.7, '#f9e3b4']]} />
						<g opacity={dark}>
							<Sky id="noon-dark" stops={[[0, '#120c10'], [0.4, '#3b2520'], [0.7, '#a2471f']]} />
						</g>
					</Stage>
				</Layer>
				<Layer depth={0.35}>
					<Stage>
						<Vesuvius x={560} y={1240} s={0.78} erupt={erupt} glow={erupt} green={1} seed="v-erupt" />
					</Stage>
					<Glow x={570} y={880} radius={420} color="#ff7a1a" opacity={0.55 * erupt} pulse={0.08} />
				</Layer>
				<Layer depth={0.5}>
					<Particles kind="sparks" count={40} seed="erupt-sparks" amount={erupt} area={{x: 300, y: 300, w: 520, h: 700}} speed={1.4} />
				</Layer>
				<Layer depth={0.6}>
					<Stage>
						<CityRow seed="er-city" baseY={1330} count={8} x0={-300} x1={1380} minH={120} maxH={260} />
					</Stage>
					<AbsoluteFill style={{background: '#1c0e0a', opacity: dark * 0.45, mixBlendMode: 'multiply'}} />
				</Layer>
				<Layer depth={1}>
					<Stage>
						<Character
							x={200}
							y={1560}
							scale={1.25}
							flip
							palette={PALETTES.woman}
							hair="long"
							expression={scared ? 'terrified' : 'awe'}
							look={[0.9, -0.9]}
							headTilt={scared ? -10 : -4}
							armR={scared ? 150 : 14}
							elbowR={scared ? 70 : 0}
							armL={scared ? 40 : 18}
							item="none"
							seed="woman2"
						/>
					</Stage>
				</Layer>
			</Camera>
			<Particles kind="ash" count={70} seed="erupt-ash" amount={dark} />
			<Grade color="#ff5a1a" opacity={dark * 0.3} blend="overlay" />
			<Flash at={blast} attack={2} decay={22} />
			<Vignette strength={0.55 + dark * 0.2} />
			{treinta !== null ? <StatCallout value={30} suffix="KM" label="DE ALTURA" at={treinta} out={d - 14} x={790} y={520} /> : null}
		</AbsoluteFill>
	);
};

// ───────────────────────────── 4. DAY BECOMES NIGHT ─────────────────────────────
export const Night: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const crash = hit('crash') ?? Math.round(d * 0.5);
	const huyeron = word('huyeron') ?? Math.round(d * 0.62);
	const esperar = word('esperar') ?? Math.round(d * 0.8);
	const collapse = interpolate(frame, [crash - 4, crash + 26], [0, 1], {...clamp, easing: Easing.in(Easing.quad)});
	const dust = interpolate(frame, [crash + 14, crash + 60], [0, 1], clamp);
	const runX = (offset: number) => interpolate(frame, [huyeron - 25 + offset, huyeron + 95 + offset], [-280, 1400], clamp);
	return (
		<AbsoluteFill>
			<Camera
				durationInFrames={d}
				shake={kickShake(crash + 18, 22, 14, 3)}
				keys={[
					{at: 0, x: -170, y: -60, zoom: 1.1},
					{at: frac(crash, d), x: -40, y: 0, zoom: 1.05},
					{at: frac(esperar - 15, d), x: 60, y: 10, zoom: 1.04},
					{at: 1, x: 230, y: 60, zoom: 1.24},
				]}
			>
				<Layer depth={0.05}>
					<Stage>
						<Sky id="night" stops={[[0, '#0b0709'], [0.45, '#2a1512'], [0.75, '#6b2c17']]} />
					</Stage>
				</Layer>
				<Layer depth={0.2}>
					<Stage>
						<Vesuvius x={860} y={1000} s={0.5} erupt={1} glow={1} green={0} seed="v-night" />
					</Stage>
					<Glow x={865} y={780} radius={380} color="#ff5a12" opacity={0.6} pulse={0.15} />
				</Layer>
				<LightningFlicker seed="night-l" chance={0.035} />
				<Layer depth={0.55}>
					<Stage>
						<CityRow seed="night-mid" baseY={1180} count={8} x0={-320} x1={1400} minH={120} maxH={260} tint="#3a2622" windowsLit={1} />
					</Stage>
				</Layer>
				<Layer depth={0.9}>
					<Stage>
						<CityRow
							seed="night-front"
							baseY={1520}
							count={5}
							x0={-380}
							x1={1500}
							minH={260}
							maxH={380}
							tint="#2a1a17"
							windowsLit={1}
							collapse={{index: 2, p: collapse}}
						/>
						{dust > 0 ? (
							<g opacity={1 - dust}>
								<Blob
									circles={new Array(9).fill(0).map((_, k) => ({cx: 380 + (k - 4) * 70 * (1 + dust), cy: 1420 - Math.abs(k - 4) * 12 - dust * 120, r: 50 + dust * 90}))}
									fill="#6d625a"
									highlight="#8d837b"
								/>
							</g>
						) : null}
						{/* doorway of those who stayed */}
						<rect x={1080} y={1180} width={190} height={330} rx={90} fill="#ffb347" stroke={INK} strokeWidth={8} />
						<Character
							x={1175}
							y={1530}
							scale={0.62}
							palette={PALETTES.baker}
							hair="curly"
							beard
							expression="sad"
							look={[-0.6, -0.7]}
							armR={8}
							armL={8}
							seed="stayer"
						/>
						<Ground y={1540} fill="#3a2e2a" hill={20} />
					</Stage>
					<Glow x={1175} y={1340} radius={300} color="#ffa040" opacity={0.45} pulse={0.1} />
				</Layer>
				<Layer depth={1.1}>
					<Stage>
						<Character x={runX(0)} y={1880} scale={0.82} palette={PALETTES.merchant} hair="short" beard expression="terrified" walk={1.9} armL={60} armR={60} look={[1, 0]} seed="run1" />
						<Character x={runX(14)} y={1930} scale={0.8} palette={PALETTES.woman} hair="long" headgear="hood" expression="terrified" walk={1.8} armL={50} armR={40} look={[1, -0.3]} seed="run2" />
						<Character x={runX(26)} y={1960} scale={0.55} palette={PALETTES.child} hair="short" expression="terrified" walk={2.2} armL={60} armR={60} seed="run3" />
					</Stage>
				</Layer>
			</Camera>
			<Particles kind="pumice" count={55} seed="pumice" speed={1} />
			<Particles kind="ash" count={110} seed="night-ash" />
			<Particles kind="embers" count={30} seed="night-emb" />
			<Grade color="#ff4a10" opacity={0.25} blend="overlay" />
			<Vignette strength={0.75} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 5. PLINY ─────────────────────────────
export const Pliny: React.FC<SceneProps> = ({durationInFrames: d, hit}) => {
	const toll = hit('toll') ?? Math.round(d * 0.8);
	const frame = useCurrentFrame();
	const grief = interpolate(frame, [toll - 4, toll + 30], [0, 1], clamp);
	return (
		<AbsoluteFill>
			<Camera
				durationInFrames={d}
				shake={null}
				keys={[
					{at: 0, x: 220, y: 70, zoom: 1.45},
					{at: frac(toll - 10, d), x: 120, y: 10, zoom: 1.22},
					{at: 1, x: 40, y: -60, zoom: 0.98},
				]}
			>
				<Layer depth={0.05}>
					<Stage>
						<Sky id="bay" stops={[[0, '#160d12'], [0.35, '#3d1d1d'], [0.5, '#a1401d'], [0.56, '#e2702a']]} />
					</Stage>
				</Layer>
				<Layer depth={0.15}>
					<Stage>
						<Vesuvius x={260} y={1000} s={0.5} erupt={1} glow={1} green={0} seed="v-bay" />
					</Stage>
					<Glow x={265} y={800} radius={360} color="#ff6a1a" opacity={0.5} pulse={0.1} />
				</Layer>
				<Layer depth={0.4}>
					<Stage>
						<Sea y={995} colors={['#1b2433', '#1f2c3e', '#26364b', '#2f425a']} reflect="#ff8a3c" reflectX={265} />
					</Stage>
				</Layer>
				<Layer depth={0.55}>
					<Stage>
						<Galley x={880} y={1110} s={0.32} sail="#d9c9a5" seed="g2" />
					</Stage>
				</Layer>
				<Layer depth={0.85}>
					<Stage>
						<Galley x={520} y={1520} s={0.85} sail="#b32a24" seed="g1">
							<Character
								x={250}
								y={-60}
								scale={0.78}
								palette={PALETTES.pliny}
								hair="bald"
								expression="determined"
								look={[1, -0.2]}
								armR={interpolate(grief, [0, 1], [100, 30])}
								armL={10}
								headgear="laurel"
								seed="pliny"
							/>
						</Galley>
						<Sea y={1650} colors={['#223047', '#2a3a52', '#33465f']} />
					</Stage>
				</Layer>
			</Camera>
			<Particles kind="ash" count={60} seed="bay-ash" />
			<Grade color="#ff6a1a" opacity={0.2} blend="overlay" />
			<AbsoluteFill style={{background: '#0d1018', opacity: grief * 0.35, mixBlendMode: 'multiply'}} />
			<AbsoluteFill style={{background: '#808080', opacity: grief * 0.6, mixBlendMode: 'saturation'}} />
			<Vignette strength={0.65 + grief * 0.2} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 6. PYROCLASTIC SURGE ─────────────────────────────
export const Surge: React.FC<SceneProps> = ({durationInFrames: d, hit}) => {
	const frame = useCurrentFrame();
	const surge = hit('surge') ?? Math.round(d * 0.85);
	const p = interpolate(frame, [0, surge], [0, 1], {...clamp, easing: Easing.in(Easing.quad)});
	const engulf = interpolate(frame, [surge - 26, surge + 6], [0, 1], clamp);
	const after = interpolate(frame, [surge + 6, d], [0, 1], clamp);
	const runX = (o: number) => interpolate(frame, [0, d * 0.8], [-100 + o, 1250 + o]);
	return (
		<AbsoluteFill>
			<Camera
				durationInFrames={d}
				shake={(f) => 2 + interpolate(f, [0, surge], [0, 22], clamp)}
				keys={[
					{at: 0, x: -60, y: -40, zoom: 1.0},
					{at: frac(surge, d), x: 20, y: 30, zoom: 1.22},
					{at: 1, x: 20, y: 30, zoom: 1.3},
				]}
			>
				<Layer depth={0.05}>
					<Stage>
						<Sky id="dawn-ash" stops={[[0, '#1d1718'], [0.4, '#4d362e'], [0.62, '#b55a2c']]} />
					</Stage>
				</Layer>
				<Layer depth={0.25}>
					<Stage>
						<Vesuvius x={330} y={1120} s={0.9} erupt={0.75} glow={1} green={0} seed="v-surge" />
					</Stage>
				</Layer>
				<Layer depth={0.45}>
					<Stage>
						<PyroCloud
							x={interpolate(p, [0, 1], [240, 560])}
							y={interpolate(p, [0, 1], [880, 1700])}
							s={interpolate(p, [0, 1], [0.32, 2.1])}
							seed="pyro"
						/>
					</Stage>
				</Layer>
				<Layer depth={0.8}>
					<Stage>
						<CityRow seed="surge-city" baseY={1500} count={7} x0={-320} x1={1420} minH={150} maxH={300} tint="#3b2a24" windowsLit={0.8} />
						<Ground y={1560} fill="#2e2421" hill={18} />
					</Stage>
				</Layer>
				<Layer depth={0.95}>
					<Stage>
						{[0, 120, 260].map((o, i) => (
							<Character
								key={o}
								x={runX(o)}
								y={1700 + i * 18}
								scale={0.42}
								palette={i === 1 ? PALETTES.woman : PALETTES.merchant}
								hair={i === 1 ? 'long' : 'short'}
								expression="terrified"
								walk={2.2}
								armL={60}
								armR={50}
								seed={`flee${i}`}
							/>
						))}
					</Stage>
				</Layer>
			</Camera>
			<Particles kind="ash" count={120} seed="surge-ash" speed={1.6} />
			<Particles kind="embers" count={40} seed="surge-emb" speed={1.5} />
			<AbsoluteFill style={{background: 'radial-gradient(circle at 50% 70%, #ff7a2a 0%, #5d524c 55%, #2b2421 100%)', opacity: engulf}} />
			<AbsoluteFill style={{background: '#e8ddd0', opacity: after * 0.85}} />
			<Grade color="#ff4a10" opacity={0.2} blend="overlay" />
			<Vignette strength={0.7} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 7. REDISCOVERY ─────────────────────────────
export const Discovery: React.FC<SceneProps> = ({durationInFrames: d, word}) => {
	const misma = word('misma') ?? Math.round(d * 0.55);
	return (
		<AbsoluteFill>
			<Camera
				durationInFrames={d}
				shake={null}
				keys={[
					{at: 0, x: -40, y: 160, zoom: 1.22},
					{at: frac(misma, d), x: 30, y: 40, zoom: 1.1},
					{at: 1, x: 90, y: -40, zoom: 1.2},
				]}
			>
				<Layer depth={0.05}>
					<Stage>
						<Sky id="discovery" stops={[[0, '#7fb2d4'], [0.4, '#cfe0e6'], [0.62, '#f6d7a8']]} />
					</Stage>
				</Layer>
				<Layer depth={0.12}>
					<GodRays x={1080} y={360} color="#fff1c8" opacity={0.3} angle={235} spread={50} rays={7} seed="disc" />
				</Layer>
				<Layer depth={0.2}>
					<Stage>
						<Vesuvius x={720} y={1080} s={0.6} erupt={0} glow={0} green={0} seed="v-disc" />
					</Stage>
				</Layer>
				<Layer depth={0.55}>
					<Stage>
						<Ground y={1250} fill="#d4bf9a" hill={26} />
						{[
							[60, 0.15],
							[220, 0],
							[380, 0.45],
							[540, 0.05],
							[700, 0.6],
							[860, 0.1],
							[1020, 0.35],
						].map(([x, b], i) => (
							<Column key={i} x={x} y={1290} h={430} w={58} broken={b} />
						))}
						<rect x={-300} y={1280} width={1700} height={40} fill="#c9b48c" stroke={INK} strokeWidth={6} />
					</Stage>
				</Layer>
				<Layer depth={0.95}>
					<Stage>
						<Ground y={1600} fill="#c2a77a" hill={40} />
						<Character x={270} y={1760} scale={0.86} palette={PALETTES.merchant} hair="short" expression="awe" look={[0.6, -0.4]} armR={45} elbowR={-40} item="brush" seed="assistant" />
						<Character
							x={780}
							y={1730}
							scale={1}
							flip
							palette={PALETTES.archaeologist}
							hair="short"
							headgear="tricorn"
							expression="awe"
							look={[1, -0.3]}
							armR={65}
							elbowR={-55}
							item="lantern"
							seed="arch"
						/>
					</Stage>
				</Layer>
			</Camera>
			<Particles kind="dust" count={60} seed="motes" />
			<Grade color="#ffcf8a" opacity={0.22} />
			<Vignette strength={0.5} />
			<TitleCard kicker="EXCAVACIONES" title="1748" at={14} out={misma - 6} y={250} size={170} />
		</AbsoluteFill>
	);
};

// ───────────────────────────── 8. BRANDED OUTRO ─────────────────────────────
export const Outro: React.FC<SceneProps> = ({durationInFrames: d, hit, word}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const logo = hit('logo') ?? 20;
	const siguenos = word('Síguenos') ?? logo + 20;
	const emblem = spring({frame: frame - 6, fps, config: {damping: 13, stiffness: 90}});
	const cta = spring({frame: frame - siguenos, fps, config: {damping: 10, stiffness: 160}});
	const pulse = 1 + Math.sin(frame * 0.25) * 0.04 * cta;
	return (
		<AbsoluteFill>
			<Camera durationInFrames={d} shake={null} keys={[{at: 0, zoom: 1.12, y: 40}, {at: 1, zoom: 1.0, y: 0}]}>
				<Layer depth={0.05}>
					<AbsoluteFill style={{background: 'radial-gradient(circle at 50% 42%, #5a2416 0%, #1f0c08 55%, #080303 100%)'}} />
				</Layer>
				<Layer depth={0.3}>
					<Stage>
						<g opacity={0.9}>
							<Vesuvius x={540} y={1960} s={1.1} erupt={0.35} glow={0.8} green={0} seed="v-outro" />
						</g>
					</Stage>
				</Layer>
				<Particles kind="embers" count={50} seed="outro-emb" />
			</Camera>
			<AbsoluteFill style={{alignItems: 'center'}}>
				<div style={{marginTop: 360, transform: `scale(${emblem}) rotate(${(1 - emblem) * -20}deg)`}}>
					<svg width={360} height={360} viewBox="-180 -180 360 360">
						<circle r={170} fill="#2a120a" stroke="#f2c25b" strokeWidth={8} />
						<circle r={150} fill="none" stroke="#f2c25b" strokeWidth={3} strokeDasharray="4 10" />
						{[-1, 1].map((s) =>
							new Array(8).fill(0).map((_, k) => {
								const a = (Math.PI / 180) * (110 + k * 17);
								const x = Math.cos(a) * 120 * s;
								const y = Math.sin(a) * 120;
								return (
									<ellipse
										key={`${s}-${k}`}
										cx={x}
										cy={y}
										rx={22}
										ry={10}
										transform={`rotate(${((a * 180) / Math.PI + 90) * s} ${x} ${y})`}
										fill="#d9a441"
										stroke={INK}
										strokeWidth={3}
									/>
								);
							}),
						)}
						{/* column glyph */}
						<rect x={-50} y={-70} width={100} height={18} fill="#f2c25b" stroke={INK} strokeWidth={4} />
						<rect x={-34} y={-52} width={68} height={110} fill="#f6e3b0" stroke={INK} strokeWidth={4} />
						{[-17, 0, 17].map((x) => (
							<line key={x} x1={x} y1={-46} x2={x} y2={52} stroke="#c9a24a" strokeWidth={4} />
						))}
						<rect x={-56} y={58} width={112} height={18} fill="#f2c25b" stroke={INK} strokeWidth={4} />
						<path d="M -60 -70 L 0 -110 L 60 -70 Z" fill="#f2c25b" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
					</svg>
				</div>
			</AbsoluteFill>
			<TitleCard kicker={null} title="LA VOZ" at={logo - 8} out={d + 100} y={780} size={130} />
			<TitleCard kicker={null} title="DEL LEGADO" at={logo - 2} out={d + 100} y={920} size={100} />
			<AbsoluteFill style={{alignItems: 'center'}}>
				<div
					style={{
						marginTop: 1110,
						opacity: cta,
						transform: `translateY(${(1 - cta) * 40}px)`,
						fontFamily: CAPTION_FONT,
						fontWeight: 800,
						fontSize: 34,
						letterSpacing: 4,
						color: '#ffe7b0',
						textAlign: 'center',
						lineHeight: 1.5,
					}}
				>
					HISTORIAS QUE EL TIEMPO
					<br />
					NO PUDO BORRAR
				</div>
				<div
					style={{
						marginTop: 46,
						transform: `scale(${cta * pulse})`,
						background: 'linear-gradient(180deg, #e0412b, #a8231a)',
						border: '5px solid #120804',
						borderRadius: 60,
						padding: '22px 64px',
						fontFamily: TITLE_FONT,
						fontWeight: 900,
						fontSize: 54,
						color: '#fff',
						letterSpacing: 4,
						boxShadow: '0 10px 0 #120804, 0 0 60px rgba(255,90,40,0.5)',
					}}
				>
					▶ SÍGUENOS
				</div>
			</AbsoluteFill>
			<Flash at={logo} color="#ffcf8a" decay={20} peak={0.5} />
			<Vignette strength={0.5} />
		</AbsoluteFill>
	);
};
