// Job queue with pause / resume / retry / cancel.
//   lane "local":  CPU/GPU-heavy work on this machine (Remotion renders, exports, Blender)
//   lane "remote": work done by other processes/servers (ComfyUI, A1111, TTS, LLM)
// One job per lane runs at a time. Job history persists in studio-data/jobs.json; a job
// that was running when the server stopped is marked failed — it is never auto-resumed.
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {JOB_STATUS} from '../../src/cinematic/schema.ts';
import {DATA_DIR, readJson, writeJsonAtomic} from './store.mjs';

const FILE = path.join(DATA_DIR, 'jobs.json');
const handlers = new Map(); // kind → {lane, run(job, ctx)}
const jobs = new Map(readJson(FILE, []).map((j) => [j.id, j]));
for (const j of jobs.values()) {
	if (j.status === 'running') Object.assign(j, {status: 'failed', error: 'Interrupted: the studio server stopped while this job was running. Retry to run it again.', finished_at: new Date().toISOString()});
}
const running = new Map(); // lane → {job, abort}
const listeners = new Set();

const persist = () => writeJsonAtomic(FILE, [...jobs.values()].slice(-300));
const touch = (job) => {
	job.updated_at = new Date().toISOString();
	persist();
	for (const l of listeners) l(job);
};

export const onJobChange = (fn) => listeners.add(fn);
export const registerJobKind = (kind, lane, run) => handlers.set(kind, {lane, run});

export const listJobs = (projectId) => [...jobs.values()].filter((j) => !projectId || j.project_id === projectId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
export const getJob = (id) => jobs.get(id);

export const enqueue = (kind, params) => {
	const h = handlers.get(kind);
	if (!h) throw new Error(`Unknown job kind ${kind}`);
	// De-duplicate: the same work already waiting or running is returned instead.
	const key = JSON.stringify([kind, params]);
	const dup = [...jobs.values()].find((j) => j.key === key && (j.status === 'queued' || j.status === 'running'));
	if (dup) return dup;
	const now = new Date().toISOString();
	const job = {id: `job_${Date.now().toString(36)}${randomBytes(2).toString('hex')}`, key, kind, lane: h.lane, project_id: params.projectId ?? null, label: params.label ?? kind, params, status: 'queued', progress: 0, stage: 'Waiting in queue', log: [], error: null, result: null, attempts: 0, created_at: now, started_at: null, finished_at: null, updated_at: now};
	jobs.set(job.id, job);
	touch(job);
	pump();
	return job;
};

const setStatus = (job, status) => {
	if (!Object.hasOwn(JOB_STATUS, status)) throw new Error(`Bad job status ${status}`);
	job.status = status;
	touch(job);
};

export const pauseJob = (id) => {
	const job = jobs.get(id);
	if (!job) return null;
	if (job.status === 'queued') setStatus(job, 'paused');
	else if (job.status === 'running') {
		job.pauseRequested = true;
		running.get(job.lane)?.abort.abort();
	}
	return job;
};
export const resumeJob = (id) => {
	const job = jobs.get(id);
	if (job?.status === 'paused') {
		job.stage = 'Resumed — waiting in queue';
		setStatus(job, 'queued');
		pump();
	}
	return job;
};
export const cancelJob = (id) => {
	const job = jobs.get(id);
	if (!job) return null;
	if (job.status === 'running') {
		job.cancelRequested = true;
		running.get(job.lane)?.abort.abort();
	} else if (job.status === 'queued' || job.status === 'paused') {
		job.finished_at = new Date().toISOString();
		setStatus(job, 'cancelled');
	}
	return job;
};
export const retryJob = (id) => {
	const job = jobs.get(id);
	if (job && (job.status === 'failed' || job.status === 'cancelled')) {
		Object.assign(job, {error: null, progress: 0, stage: 'Retrying — waiting in queue', finished_at: null});
		setStatus(job, 'queued');
		pump();
	}
	return job;
};

const pump = () => {
	for (const lane of ['local', 'remote']) {
		if (running.has(lane)) continue;
		const next = [...jobs.values()].filter((j) => j.lane === lane && j.status === 'queued').sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
		if (next) void execute(next);
	}
};

const execute = async (job) => {
	const abort = new AbortController();
	running.set(job.lane, {job, abort});
	Object.assign(job, {attempts: job.attempts + 1, started_at: new Date().toISOString(), error: null, pauseRequested: false, cancelRequested: false});
	setStatus(job, 'running');
	let lastTouch = 0;
	const ctx = {
		signal: abort.signal,
		log: (line) => {
			job.log.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
			if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
			if (Date.now() - lastTouch > 500) {
				lastTouch = Date.now();
				touch(job);
			}
		},
		progress: (p, stage) => {
			job.progress = Math.max(0, Math.min(1, p));
			if (stage) job.stage = stage;
			if (Date.now() - lastTouch > 400) {
				lastTouch = Date.now();
				touch(job);
			}
		},
	};
	try {
		job.result = await handlers.get(job.kind).run(job.params, ctx);
		job.progress = 1;
		job.stage = 'Done';
		job.finished_at = new Date().toISOString();
		setStatus(job, 'succeeded');
	} catch (e) {
		job.finished_at = new Date().toISOString();
		if (job.cancelRequested) {
			job.stage = 'Cancelled';
			setStatus(job, 'cancelled');
		} else if (job.pauseRequested) {
			job.finished_at = null;
			job.stage = 'Paused — the step in progress restarts on resume (finished scenes stay cached)';
			setStatus(job, 'paused');
		} else {
			job.error = e?.message ?? String(e);
			job.stage = 'Failed';
			ctx.log(`ERROR ${job.error}`);
			setStatus(job, 'failed');
		}
	} finally {
		running.delete(job.lane);
		pump();
	}
};

export const startQueue = () => pump();
