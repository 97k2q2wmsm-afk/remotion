// Automatic script + storyboard engine (spec §4).
//
// Script: a local LLM (Ollama, free) when configured; otherwise a structured
// TEMPLATE draft in en/tr/es that the user is expected to edit. The UI labels the
// source honestly ("template draft" vs "ollama:<model>").
//
// Storyboard: deterministic rules turn beats into validated scenes — environment by
// keyword scoring, a shot plan with camera variety, lighting arc from the style,
// atmosphere/animation per environment, durations from narration length.
import {ANIMATIONS, CAMERA_MOVES, CAMERA_SHOTS, ENVIRONMENTS, LIGHTING, STYLES, defaultCamera, makeScene} from '../../src/cinematic/schema.ts';
import {autoSubtitles, defaultSoundEffects} from './media.mjs';
import {ollamaJson} from './providers/others.mjs';

/** Average narration speed (words/second) per language at a calm documentary pace. */
export const WPS = {en: 2.5, tr: 2.0, es: 2.6};

const T = {
	en: {
		hook: ['{topic}. It sounds impossible — but stay until the end.', 'Imagine it: {topic}.'],
		context: ['To understand it, we have to go back to where it all began.', 'Long before anyone noticed, the first signs were already there.'],
		develop: ['Piece by piece, the world we know begins to change.', 'Every decision pushes the story further from what history remembers.', 'People feel it first in small things — then everywhere at once.', 'Cities, roads and borders slowly rearrange themselves around it.', 'And the people living through it have no idea how it will end.'],
		turn: ['And then, in a single moment, everything shifts.'],
		climax: ['This is the moment that decides everything.'],
		resolution: ['When the dust settles, nothing is quite the same.'],
		outro: ['So — what would you have done? Tell us in the comments.'],
		headings: {hook: 'Hook', context: 'Context', develop: 'Development', turn: 'Turning point', climax: 'Climax', resolution: 'Resolution', outro: 'Outro'},
	},
	tr: {
		hook: ['{topic}. Kulağa imkânsız geliyor — ama sonuna kadar izle.', 'Bir düşün: {topic}.'],
		context: ['Bunu anlamak için her şeyin başladığı yere dönmemiz gerek.', 'Kimse fark etmeden önce, ilk işaretler çoktan ortaya çıkmıştı.'],
		develop: ['Parça parça, bildiğimiz dünya değişmeye başlıyor.', 'Her karar, hikâyeyi tarihin hatırladığından biraz daha uzağa itiyor.', 'İnsanlar bunu önce küçük şeylerde hissediyor — sonra her yerde.', 'Şehirler, yollar ve sınırlar yavaş yavaş yeniden şekilleniyor.', 'Ve bunu yaşayanlar, sonunun nereye varacağını bilmiyor.'],
		turn: ['Ve sonra, tek bir anda, her şey değişiyor.'],
		climax: ['İşte her şeyi belirleyen an bu.'],
		resolution: ['Toz duman dağıldığında, hiçbir şey eskisi gibi değil.'],
		outro: ['Peki sen olsan ne yapardın? Yorumlarda yaz.'],
		headings: {hook: 'Kanca', context: 'Arka plan', develop: 'Gelişme', turn: 'Dönüm noktası', climax: 'Doruk', resolution: 'Çözüm', outro: 'Kapanış'},
	},
	es: {
		hook: ['{topic}. Parece imposible, pero quédate hasta el final.', 'Imagínalo: {topic}.'],
		context: ['Para entenderlo, tenemos que volver al lugar donde todo empezó.', 'Mucho antes de que nadie lo notara, las primeras señales ya estaban ahí.'],
		develop: ['Poco a poco, el mundo que conocemos empieza a cambiar.', 'Cada decisión aleja la historia de lo que recordamos.', 'La gente lo nota primero en las cosas pequeñas, y luego en todas partes.', 'Ciudades, caminos y fronteras se reorganizan lentamente.', 'Y quienes lo viven no saben cómo terminará.'],
		turn: ['Y entonces, en un solo instante, todo cambia.'],
		climax: ['Este es el momento que lo decide todo.'],
		resolution: ['Cuando el polvo se asienta, nada vuelve a ser igual.'],
		outro: ['¿Y tú qué habrías hecho? Cuéntanoslo en los comentarios.'],
		headings: {hook: 'Gancho', context: 'Contexto', develop: 'Desarrollo', turn: 'Giro', climax: 'Clímax', resolution: 'Desenlace', outro: 'Cierre'},
	},
};

export const beatPlan = (n) => {
	const n2 = Math.max(4, n);
	const arc = ['hook', 'context', 'turn', 'climax', 'resolution', 'outro'];
	if (n2 <= arc.length) {
		// Short videos keep the beats that matter most for a complete arc.
		const keep = new Set(['hook', 'climax', 'outro', 'turn', 'context', 'resolution'].slice(0, n2));
		return arc.filter((b) => keep.has(b));
	}
	return ['hook', 'context', ...Array.from({length: n2 - 6}, () => 'develop'), 'turn', 'climax', 'resolution', 'outro'];
};

/** Insert the topic, keeping its own ending punctuation ("…fell?" stays a question). */
const withTopic = (line, topic) => {
	const t = topic.trim();
	const ends = /[.?!…]$/.test(t);
	return line.replace(/\{topic\}([.:]?)/, (_, p) => (ends ? t : t + p));
};

export const templateScript = (project) => {
	const t = T[project.language] ?? T.en;
	const n = Math.round(Math.min(14, Math.max(4, project.target_duration / 7)));
	const counters = {};
	const beats = beatPlan(n).map((kind) => {
		const list = t[kind];
		const k = (counters[kind] = (counters[kind] ?? -1) + 1);
		return {kind, heading: t.headings[kind], narration: withTopic(list[k % list.length], project.topic)};
	});
	return {title: project.title, beats, source: 'template draft — edit the narration, or enable a local LLM (Ollama) in Settings for a topic-specific script'};
};

export const llmScript = async (project, llmCfg, signal) => {
	const words = Math.round(project.target_duration * (WPS[project.language] ?? 2.5));
	const prompt = `You are a documentary screenwriter. Write a narrated cinematic video script.
Topic: ${project.topic}
Language: ${project.language} (write ALL narration in this language)
Target length: about ${words} spoken words in total, ${Math.round(project.target_duration / 7)} beats.
Visual style: ${STYLES[project.style].label}.
Return JSON: {"title": string, "beats": [{"kind": "hook|context|develop|turn|climax|resolution|outro", "heading": string, "narration": string, "environment": one of ${Object.keys(ENVIRONMENTS).join('|')}}]}
Only state facts you are confident about; frame speculation as "what if".`;
	const r = await ollamaJson(llmCfg, prompt, signal);
	if (!Array.isArray(r?.beats) || !r.beats.length) throw new Error('The local LLM returned no beats.');
	return {
		title: String(r.title || project.title),
		beats: r.beats.slice(0, 20).map((b) => ({kind: String(b.kind || 'develop'), heading: String(b.heading || ''), narration: String(b.narration || '').trim(), environment: Object.hasOwn(ENVIRONMENTS, b.environment) ? b.environment : null})),
		source: `ollama:${llmCfg.model}`,
	};
};

// ─── Storyboard rules ───────────────────────────────────────────────────────

export const inferEnvironment = (text, style) => {
	const s = ` ${text.toLowerCase()} `;
	let best = null;
	let score = 0;
	for (const [id, def] of Object.entries(ENVIRONMENTS)) {
		const k = def.keywords.reduce((a, w) => a + (s.includes(w) ? w.length : 0), 0);
		if (k > score) {
			score = k;
			best = id;
		}
	}
	return best ?? {epic_historical: 'ancient_roman_city', documentary: 'mountains', dark_mystery: 'forest', sci_fi: 'futuristic_city', nature: 'forest'}[style];
};

const CLIMAX_ENV = {
	forest: 'forest',
	mountains: 'mountains',
	city: 'modern_street',
	medieval_village: 'battlefield',
	ancient_roman_city: 'battlefield',
	modern_street: 'city',
	futuristic_city: 'futuristic_city',
	battlefield: 'battlefield',
	interior: 'interior',
	ocean_coast: 'ocean_coast',
};

const SHOT_PLAN = [
	['aerial_establishing', 'slow_forward_dolly', 30],
	['wide', 'tracking_right', 35],
	['medium', 'push_in', 50],
	['low_angle', 'crane_up', 28],
	['wide', 'orbit', 32],
	['close_up', 'push_in', 75],
	['aerial_establishing', 'aerial_flyover', 24],
	['over_shoulder', 'handheld', 40],
	['wide', 'crane_down', 35],
	['medium', 'tracking_left', 45],
];

const ENV_ANIM = {
	forest: ['swaying_trees', 'flying_birds'],
	mountains: ['flowing_water', 'flying_birds'],
	city: ['traffic', 'flying_birds'],
	medieval_village: ['moving_crowds', 'flags_in_wind'],
	ancient_roman_city: ['moving_crowds', 'flags_in_wind'],
	modern_street: ['traffic', 'moving_crowds'],
	futuristic_city: ['traffic'],
	battlefield: ['moving_crowds', 'flags_in_wind'],
	interior: [],
	ocean_coast: ['flowing_water', 'flying_birds'],
};
const ENV_ATM = {
	forest: ['god_rays', 'dust_particles'],
	mountains: ['clouds'],
	city: ['clouds'],
	medieval_village: ['smoke', 'dust_particles'],
	ancient_roman_city: ['dust_particles', 'god_rays'],
	modern_street: [],
	futuristic_city: ['volumetric_fog'],
	battlefield: ['smoke', 'fire', 'sparks'],
	interior: ['dust_particles', 'god_rays'],
	ocean_coast: ['clouds', 'wind'],
};

export const buildStoryboard = (project) => {
	if (!project.script?.beats?.length) throw new Error('Generate (or write) a script first.');
	const style = STYLES[project.style];
	const lang = project.language;
	const wps = WPS[lang] ?? 2.5;
	const topicEnv = inferEnvironment(project.topic, project.style);
	const beats = project.script.beats;
	const climaxIdx = beats.findIndex((b) => b.kind === 'climax');
	const main = project.characters[0]?.id ?? null;
	const winter = /snow|winter|ice|frozen|kar|kış|buz|nieve|invierno|hielo/i.test(project.topic);

	let scenes = beats.map((b, i) => {
		// LLM beats name their set; template beats stay in the topic's world, with the
		// climax moving to that world's most dramatic companion set.
		const env = b.environment ?? (b.kind === 'climax' ? CLIMAX_ENV[topicEnv] : topicEnv);
		const [shot, move, lens] = i === 0 ? SHOT_PLAN[0] : b.kind === 'climax' ? ['low_angle', 'push_in', 28] : b.kind === 'outro' ? ['aerial_establishing', 'dolly_out', 28] : SHOT_PLAN[i % SHOT_PLAN.length];
		const lighting = b.kind === 'climax' && project.style !== 'nature' ? (style.lighting.includes('stormy') ? 'stormy' : style.lighting[0]) : b.kind === 'outro' && style.lighting.includes('day_to_night') ? 'day_to_night' : style.lighting[Math.floor((i / beats.length) * style.lighting.length) % style.lighting.length];
		const atmosphere = [...new Set([...ENV_ATM[env], ...(i % 2 === 0 ? style.atmosphere.slice(0, 1) : []), ...(winter ? ['snow'] : []), ...(b.kind === 'climax' && env === 'battlefield' ? ['explosions'] : [])])].filter((a) => !(env === 'interior' && (a === 'rain' || a === 'snow' || a === 'clouds')));
		const human = main && ['medium', 'close_up', 'low_angle', 'over_shoulder'].includes(shot);
		const characters = human ? [main] : [];
		const animation = [...ENV_ANIM[env], ...(human && move !== 'handheld' && i % 2 === 0 ? ['character_walk'] : [])].filter((a) => Object.hasOwn(ANIMATIONS, a));
		const words = b.narration.split(/\s+/).filter(Boolean).length;
		const duration = Math.min(12, Math.max(3.5, +(words / wps + 1.2).toFixed(1)));
		const transition = i === 0 ? 'cut' : i === climaxIdx ? 'dip_to_black' : b.kind === 'turn' ? 'whip' : 'fade';
		const scene = makeScene({
			scene_id: `scene_${String(i + 1).padStart(3, '0')}`,
			duration,
			environment: env,
			visual_description: `${CAMERA_SHOTS[shot].label} of a ${ENVIRONMENTS[env].label.toLowerCase()} at ${LIGHTING[lighting].label.toLowerCase()}, ${CAMERA_MOVES[move].label.toLowerCase()}. ${b.heading}: ${b.narration}`,
			characters,
			camera: {...defaultCamera(), shot, movement: move, lens, depth_of_field: shot !== 'aerial_establishing', focus_transition: shot === 'close_up' || shot === 'over_shoulder' ? {from: 'background', to: 'subject'} : null, shake: move === 'handheld' ? 0.5 : b.kind === 'climax' ? 0.2 : 0},
			lighting,
			atmosphere,
			animation,
			narration: b.narration,
			transition,
			seed: 1000 + i * 17,
			overlays: i === 0 ? [{id: 'title', text: project.script.title || project.title, start: 0.6, end: Math.min(duration - 0.3, 4), position: 'center'}] : [],
		});
		scene.sound_effects = defaultSoundEffects(scene);
		return scene;
	});
	// Fit total runtime to the target (within per-scene limits).
	const total = scenes.reduce((a, s) => a + s.duration, 0);
	const k = project.target_duration / total;
	scenes = scenes.map((s, i) => {
		const duration = +Math.min(14, Math.max(3, s.duration * k)).toFixed(1);
		return {...s, duration, continuity_from: i > 0 && scenes[i - 1].environment === s.environment ? scenes[i - 1].scene_id : null, subtitles: autoSubtitles(s.narration, duration)};
	});
	return scenes;
};

/** Text prompt for AI providers, built from the scene + consistent character sheets + style. */
export const buildPrompt = (project, scene) => {
	const style = STYLES[project.style];
	const cast = scene.characters.map((id) => project.characters.find((c) => c.id === id)).filter(Boolean);
	const castText = cast.map((c) => `${c.name}: ${c.appearance}; wearing ${c.clothing}; ${c.hair}`).join('. ');
	const atm = scene.atmosphere.map((a) => a.replace(/_/g, ' ')).join(', ');
	const prompt = [
		`cinematic film still, ${style.label.toLowerCase()} look, anamorphic ${scene.camera.lens}mm lens`,
		`${CAMERA_SHOTS[scene.camera.shot].label.toLowerCase()} shot, ${CAMERA_MOVES[scene.camera.movement].label.toLowerCase()}`,
		scene.visual_description,
		`${ENVIRONMENTS[scene.environment].label}, ${LIGHTING[scene.lighting].label.toLowerCase()} lighting${atm ? `, ${atm}` : ''}`,
		castText,
		'volumetric light, highly detailed, physically based materials, depth of field, film grain',
	]
		.filter(Boolean)
		.join('. ');
	const negative = 'text, subtitles, watermark, logo, signature, low quality, blurry, jpeg artifacts, deformed, extra limbs, bad hands, cartoon, flat lighting';
	return {prompt, negative};
};
