// Queue semantics: pause / resume / cancel / retry and honest failure reporting.
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

process.env.STUDIO_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'cs-jobs-'));
const jobs = await import('../lib/jobs.mjs');

const until = async (fn, ms = 5000) => {
	const t0 = Date.now();
	while (!fn()) {
		if (Date.now() - t0 > ms) throw new Error('timeout');
		await new Promise((r) => setTimeout(r, 10));
	}
};

let runs = 0;
jobs.registerJobKind('slow', 'local', async (_p, ctx) => {
	runs++;
	for (let i = 0; i < 100; i++) {
		if (ctx.signal.aborted) throw new Error('aborted');
		ctx.progress(i / 100, `step ${i}`);
		await new Promise((r) => setTimeout(r, 10));
	}
	return {ok: true};
});
jobs.registerJobKind('boom', 'remote', async () => {
	throw new Error('Provider exploded: CUDA out of memory');
});

test('a failing job keeps the real error and can be retried', async () => {
	const j = jobs.enqueue('boom', {projectId: 'p1'});
	await until(() => j.status === 'failed');
	assert.equal(j.error, 'Provider exploded: CUDA out of memory');
	jobs.retryJob(j.id);
	await until(() => j.status === 'failed' && j.attempts === 2);
});

test('pause stops the running job, resume re-queues it, cancel ends it', async () => {
	const j = jobs.enqueue('slow', {projectId: 'p2', n: 1});
	await until(() => j.status === 'running' && j.progress > 0.05);
	jobs.pauseJob(j.id);
	await until(() => j.status === 'paused');
	jobs.resumeJob(j.id);
	await until(() => j.status === 'running');
	jobs.cancelJob(j.id);
	await until(() => j.status === 'cancelled');
	assert.equal(j.attempts, 2);
});

test('identical work is de-duplicated while queued/running', async () => {
	const a = jobs.enqueue('slow', {projectId: 'p3', n: 2});
	const b = jobs.enqueue('slow', {projectId: 'p3', n: 2});
	assert.equal(a.id, b.id);
	jobs.cancelJob(a.id);
	await until(() => a.status === 'cancelled');
});

test('a job completes with progress 1 and its result', async () => {
	const before = runs;
	const j = jobs.enqueue('slow', {projectId: 'p4', n: 3});
	await until(() => j.status === 'succeeded', 10000);
	assert.equal(j.progress, 1);
	assert.deepEqual(j.result, {ok: true});
	assert.equal(runs, before + 1);
});
