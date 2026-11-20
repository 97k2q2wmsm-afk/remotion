// Project persistence. One directory per project under the data dir:
//   project.json  (atomic writes)   assets/  renders/  audio/  exports/  generation/
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {SCHEMA_VERSION, validateProject} from '../../src/cinematic/schema.ts';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const DATA_DIR = path.resolve(process.env.STUDIO_DATA_DIR || path.join(ROOT, 'studio-data'));
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
mkdirSync(PROJECTS_DIR, {recursive: true});

export const writeJsonAtomic = (file, data) => {
	mkdirSync(path.dirname(file), {recursive: true});
	const tmp = `${file}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
	writeFileSync(tmp, JSON.stringify(data, null, 2));
	renameSync(tmp, file);
};

export const readJson = (file, fallback) => {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		return fallback;
	}
};

export const projectDir = (id) => {
	if (!/^[a-z0-9-]{3,80}$/.test(id)) throw httpError(400, `Invalid project id "${id}"`);
	return path.join(PROJECTS_DIR, id);
};

/** Resolve a project-relative path, refusing anything that escapes the project dir. */
export const projectPath = (id, rel) => {
	const base = projectDir(id);
	const full = path.resolve(base, rel);
	if (full !== base && !full.startsWith(base + path.sep)) throw httpError(400, `Path escapes project: ${rel}`);
	return full;
};

export const httpError = (status, message) => Object.assign(new Error(message), {status});

const slug = (s) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ı/g, 'i')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48) || 'project';

export const newProject = ({title, topic, language = 'en', format = '16:9', fps = 24, target_duration = 60, style = 'epic_historical'}) => {
	const now = new Date().toISOString();
	const id = `${slug(title || topic || 'project')}-${randomBytes(2).toString('hex')}`;
	return {
		schema_version: SCHEMA_VERSION,
		id,
		title: title || topic || 'Untitled project',
		topic: topic || '',
		language,
		format,
		fps: Number(fps),
		target_duration: Number(target_duration),
		style,
		script: null,
		characters: [],
		scenes: [],
		audio: {narration_volume: 1, music: {path: null, volume: 0.35, source: null}, sfx_volume: 0.6, ambience_volume: 0.5, duck_music: true, target_lufs: -14},
		export_settings: {video_bitrate_kbps: 12000, audio_bitrate_kbps: 192, burn_subtitles: false},
		created_at: now,
		updated_at: now,
	};
};

export const saveProject = (p) => {
	const errors = validateProject(p);
	if (errors.length) throw httpError(422, `Project is invalid:\n- ${errors.slice(0, 20).join('\n- ')}`);
	p.updated_at = new Date().toISOString();
	const dir = projectDir(p.id);
	for (const sub of ['assets', 'renders', 'audio', 'exports', 'generation']) mkdirSync(path.join(dir, sub), {recursive: true});
	writeJsonAtomic(path.join(dir, 'project.json'), p);
	return p;
};

export const loadProject = (id) => {
	const file = path.join(projectDir(id), 'project.json');
	if (!existsSync(file)) throw httpError(404, `Project "${id}" not found`);
	return JSON.parse(readFileSync(file, 'utf8'));
};

export const listProjects = () =>
	readdirSync(PROJECTS_DIR)
		.filter((d) => existsSync(path.join(PROJECTS_DIR, d, 'project.json')))
		.map((d) => {
			const p = readJson(path.join(PROJECTS_DIR, d, 'project.json'), null);
			if (!p) return null;
			const exportsDir = path.join(PROJECTS_DIR, d, 'exports');
			const exports = existsSync(exportsDir) ? readdirSync(exportsDir).filter((f) => f.endsWith('.mp4')).length : 0;
			return {id: p.id, title: p.title, topic: p.topic, format: p.format, style: p.style, scenes: p.scenes.length, duration: p.scenes.reduce((a, s) => a + s.duration, 0), updated_at: p.updated_at, exports};
		})
		.filter(Boolean)
		.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

export const deleteProject = (id) => rmSync(projectDir(id), {recursive: true, force: true});

/** Mutate a project under a simple per-project lock (the server is single-process). */
const locks = new Map();
export const updateProject = async (id, fn) => {
	const prev = locks.get(id) ?? Promise.resolve();
	let release;
	const mine = new Promise((r) => (release = r));
	locks.set(id, prev.then(() => mine));
	await prev;
	try {
		const p = loadProject(id);
		const out = (await fn(p)) ?? p;
		return saveProject(out);
	} finally {
		release();
	}
};

export const fileInfo = (file) => {
	try {
		const s = statSync(file);
		return {size: s.size, mtime: s.mtimeMs};
	} catch {
		return null;
	}
};
