import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BODY_FONT, BRAND, HEAD_FONT} from '../../channels/basina-gelseydi/brand';
import {Vignette} from '../../engine/Light';
import {CinemaLight, SpeedLines} from '../../engine/modern/Fx';
import {CAST, INK, Person, POSES} from '../../engine/modern/Person';
import {G_Y} from './physics';
import {Backdrop, Cam, Gulls, Items, Plane, StreetSet, Svg} from './world';

/** Thumbnail / cover (1080×1920; crop-safe centre for 1:1 and 4:5 grids). */
export const Cover: React.FC = () => {
	const gf = 1050;
	const cam: Cam = {x: 560, y: 980, zoom: 0.62, rot: -4};
	return (
		<AbsoluteFill style={{background: '#000'}}>
			<Svg>
				<Backdrop cam={cam} frame={0} />
				<Plane cam={cam} depth={1} frame={0}>
					<StreetSet />
					<Gulls frame={40} y={G_Y - 1500} n={3} />
					<Items gf={gf} frame={0} />
				</Plane>
			</Svg>
			<SpeedLines amount={0.6} dir="down" seed="cover" />
			<Svg>
				<Person x={600} y={1020} scale={1.15} rot={-14} look={CAST.kaan} pose={{...POSES.flail, armL: [-150, -30], armR: [140, 40]}} face="scream" mouthOpen={1} gaze={[0.6, 0.6]} seed="cover" />
			</Svg>
			<CinemaLight angle={130} strength={1.3} />
			<Vignette strength={0.5} />
			<div lang="tr" style={{position: 'absolute', top: 150, left: 50, right: 50, textAlign: 'center'}}>
				<div style={{fontFamily: HEAD_FONT, fontSize: 168, lineHeight: 0.98, color: '#fff', WebkitTextStroke: `22px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 16px 0 ${INK}`, transform: 'rotate(-3deg)'}}>
					YERÇEKİMİ
					<br />
					<span style={{color: BRAND.yellow}}>10 SANİYE</span>
					<br />
					YOK OLSA?
				</div>
			</div>
			<div style={{position: 'absolute', bottom: 260, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 24}}>
				<div style={{fontFamily: HEAD_FONT, fontSize: 90, color: BRAND.cyan, background: 'rgba(21,18,28,0.85)', border: `8px solid ${INK}`, borderRadius: 26, padding: '0 34px', transform: 'rotate(4deg)'}}>0.00 g</div>
			</div>
			<div style={{position: 'absolute', bottom: 150, left: 0, right: 0, textAlign: 'center', fontFamily: BODY_FONT, fontWeight: 900, fontSize: 40, letterSpacing: 8, color: '#fff', WebkitTextStroke: `7px ${INK}`, paintOrder: 'stroke fill'}}>
				{BRAND.name} · BÖLÜM 1
			</div>
		</AbsoluteFill>
	);
};
