// Cinematic AI Studio — dependency-free client. Works on desktop and iPhone Safari
// (touch drag via pointer events, Range-served video, no hover-only controls).
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const fmtS = (s) => (s == null ? '–' : s < 60 ? `${(+s).toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`);
const clone = (o) => JSON.parse(JSON.stringify(o));

const S = {
	schema: null,
	status: null,
	providers: null,
	config: null,
	projects: [],
	pid: localStorage.getItem('cs.project') || null,
	project: null,
	renders: {},
	timeline: null,
	jobs: [],
	exports: [],
	sel: null,
	zoom: Number(localStorage.getItem('cs.zoom') || 40),
	lookdev: null,
	stills: [],
	auto: null,
};

// ─── API ────────────────────────────────────────────────────────────────────
const token = () => localStorage.getItem('cs.token') || new URLSearchParams(location.search).get('token') || '';
if (new URLSearchParams(location.search).get('token')) localStorage.setItem('cs.token', new URLSearchParams(location.search).get('token'));
const fileUrl = (rel, bust = '') => `/files/${S.pid}/${rel.split('/').map(encodeURIComponent).join('/')}${token() ? `?token=${encodeURIComponent(token())}` : ''}${bust ? `${token() ? '&' : '?'}v=${bust}` : ''}`;
const api = async (path, {method = 'GET', body, raw} = {}) => {
	const res = await fetch(path, {method, headers: {...(raw ? {} : {'content-type': 'application/json'}), ...(token() ? {'x-studio-token': token()} : {})}, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined)});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
	return data;
};
const toast = (msg, kind = '') => {
	const t = document.createElement('div');
	t.className = `toast ${kind}`;
	t.textContent = msg;
	$('#toasts').append(t);
	setTimeout(() => t.remove(), kind === 'bad' ? 9000 : 4000);
};
const guard = (fn) => async (...a) => {
	try {
		return await fn(...a);
	} catch (e) {
		toast(e.message, 'bad');
	}
};

// ─── Project load / autosave ────────────────────────────────────────────────
let saveTimer = null;
let saving = false;
const setSave = (txt) => ($('#savestate').textContent = txt);
const loadProject = async (id) => {
	const r = await api(`/api/projects/${id}`);
	S.project = r.project;
	S.renders = r.renders;
	S.timeline = r.timeline;
	S.pid = id;
	localStorage.setItem('cs.project', id);
	if (!S.sel || !S.project.scenes.some((s) => s.scene_id === S.sel)) S.sel = S.project.scenes[0]?.scene_id ?? null;
	setSave(r.validation.length ? `⚠ ${r.validation.length} validation issue(s)` : 'Saved ✓');
};
const save = (rerender = false) => {
	setSave('Saving…');
	clearTimeout(saveTimer);
	saveTimer = setTimeout(async () => {
		if (saving) return save(rerender);
		saving = true;
		try {
			S.project = await api(`/api/projects/${S.pid}`, {method: 'PUT', body: S.project});
			const r = await api(`/api/projects/${S.pid}`);
			S.renders = r.renders;
			S.timeline = r.timeline;
			setSave('Saved ✓');
			if (rerender) render();
		} catch (e) {
			setSave('⚠ Not saved');
			toast(e.message, 'bad');
		} finally {
			saving = false;
		}
	}, 500);
};
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => {
	const ks = p.split('.');
	const last = ks.pop();
	ks.reduce((a, k) => a[k], o)[last] = v;
};
const scene = (id = S.sel) => S.project?.scenes.find((s) => s.scene_id === id);
const sceneIdx = (id) => S.project.scenes.findIndex((s) => s.scene_id === id);

// ─── Form helpers ───────────────────────────────────────────────────────────
// data-bind="scenes.3.camera.lens" binds an input to the project and autosaves.
const opts = (table, cur) => Object.entries(table).map(([k, v]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(typeof v === 'string' ? v : v.label)}</option>`).join('');
const sel = (bind, table, cur, extra = '') => `<select data-bind="${bind}" ${extra}>${opts(table, cur)}</select>`;
const inp = (bind, val, type = 'text', extra = '') => `<input data-bind="${bind}" type="${type}" value="${esc(val)}" ${type === 'number' ? 'data-type="number" inputmode="decimal"' : ''} ${extra}/>`;
const fld = (label, html, cls = '') => `<div class="field ${cls}"><label>${esc(label)}</label>${html}</div>`;
const chips = (bind, table, list) => `<div class="chips">${Object.entries(table).map(([k, v]) => `<button type="button" class="chip ${list.includes(k) ? 'on' : ''}" data-chip="${bind}" data-val="${k}">${esc(typeof v === 'string' ? v : v.label)}</button>`).join('')}</div>`;
const badgeFor = (st) => {
	const cls = {succeeded: 'ok', not_required: 'ok', running: 'run', queued: 'run', failed: 'bad', blocked: 'warn', not_started: '', paused: 'warn', cancelled: ''}[st] ?? '';
	const label = S.schema.generation_status[st] ?? S.schema.job_status[st] ?? st;
	return `<span class="badge ${cls}">${esc(label)}</span>`;
};
const bindAll = (root, after) => {
	$$('[data-bind]', root).forEach((el) => {
		const ev = el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color' || el.type === 'range' ? 'change' : 'input';
		el.addEventListener(ev, () => {
			let v = el.type === 'checkbox' ? el.checked : el.value;
			if (el.dataset.type === 'number' || el.type === 'range') v = Number(v);
			if (el.dataset.type === 'nullable' && v === '') v = null;
			setPath(S.project, el.dataset.bind, v);
			save(el.dataset.rerender === '1');
			after?.(el);
		});
	});
	$$('[data-chip]', root).forEach((el) =>
		el.addEventListener('click', () => {
			const list = getPath(S.project, el.dataset.chip);
			const i = list.indexOf(el.dataset.val);
			if (i >= 0) list.splice(i, 1);
			else list.push(el.dataset.val);
			el.classList.toggle('on');
			save();
		}),
	);
};
const on = (root, sel, ev, fn) => $$(sel, root).forEach((el) => el.addEventListener(ev, guard((e) => fn(el, e))));
const pickFile = (accept) =>
	new Promise((resolve) => {
		const i = document.createElement('input');
		i.type = 'file';
		i.accept = accept;
		i.onchange = () => resolve(i.files[0] ?? null);
		i.click();
	});
const upload = async (kind, accept, params = {}) => {
	const f = await pickFile(accept);
	if (!f) return null;
	toast(`Uploading ${f.name}…`);
	const q = new URLSearchParams({kind, name: f.name, ...params});
	const r = await api(`/api/projects/${S.pid}/upload?${q}`, {method: 'POST', raw: f});
	S.project = r.project;
	toast(`Imported ${f.name}`, 'ok');
	return r;
};

// ─── Jobs polling ───────────────────────────────────────────────────────────
let jobTimer = null;
const pollJobs = async () => {
	clearTimeout(jobTimer);
	try {
		const prev = new Map(S.jobs.map((j) => [j.id, j.status]));
		S.jobs = await api(`/api/jobs${S.pid ? `?project=${S.pid}` : ''}`);
		const finished = S.jobs.filter((j) => prev.get(j.id) === 'running' && j.status !== 'running');
		for (const j of finished) toast(`${j.label}: ${S.schema.job_status[j.status]}${j.error ? `\n${j.error}` : ''}`, j.status === 'succeeded' ? 'ok' : 'bad');
		if (finished.length && S.pid) {
			await loadProject(S.pid);
			if (['generator', 'render', 'exports', 'timeline', 'audio', 'storyboard'].includes(route().view)) {
				if (route().view === 'exports') S.exports = await api(`/api/projects/${S.pid}/exports`);
				render();
			}
		} else if (route().view === 'render' || route().view === 'dashboard') updateJobsUI();
		else updateJobBars();
	} catch {}
	const active = S.jobs.some((j) => j.status === 'running' || j.status === 'queued');
	jobTimer = setTimeout(pollJobs, active ? 1500 : 6000);
};
const jobRow = (j) => `<div class="card" data-job="${j.id}">
	<div class="spread"><div><strong>${esc(j.label)}</strong> ${badgeFor(j.status)} <span class="muted small">${esc(j.lane)} lane · attempt ${j.attempts}</span></div>
	<div class="row">${j.status === 'running' || j.status === 'queued' ? `<button class="sm" data-jact="pause" data-id="${j.id}">Pause</button>` : ''}${j.status === 'paused' ? `<button class="sm teal" data-jact="resume" data-id="${j.id}">Resume</button>` : ''}${['running', 'queued', 'paused'].includes(j.status) ? `<button class="sm danger" data-jact="cancel" data-id="${j.id}">Cancel</button>` : ''}${['failed', 'cancelled'].includes(j.status) ? `<button class="sm" data-jact="retry" data-id="${j.id}">Retry</button>` : ''}</div></div>
	<div class="bar" style="margin:10px 0 6px"><i style="width:${Math.round(j.progress * 100)}%"></i></div>
	<div class="small muted">${esc(j.stage)}</div>${j.error ? `<div class="small" style="color:#ffb4ae;margin-top:4px">${esc(j.error)}</div>` : ''}
	${j.log_tail?.length ? `<pre class="log">${esc(j.log_tail.join('\n'))}</pre>` : ''}</div>`;
const bindJobButtons = (root) => on(root, '[data-jact]', 'click', async (b) => {
	await api(`/api/jobs/${b.dataset.id}/${b.dataset.jact}`, {method: 'POST'});
	pollJobs();
});
const updateJobsUI = () => {
	const box = $('#jobs');
	if (!box) return;
	box.innerHTML = S.jobs.length ? S.jobs.slice(0, 30).map(jobRow).join('') : '<div class="empty">No jobs yet.</div>';
	bindJobButtons(box);
};
const updateJobBars = () => {
	const run = S.jobs.find((j) => j.status === 'running');
	const el = $('#side-foot');
	if (el) el.innerHTML = run ? `<div><strong>${esc(run.label)}</strong></div><div class="bar" style="margin:6px 0"><i style="width:${Math.round(run.progress * 100)}%"></i></div><div>${esc(run.stage)}</div>` : `${S.jobs.filter((j) => j.status === 'queued').length} queued`;
};
const waitJob = async (id, onTick) => {
	while (true) {
		const j = await api(`/api/jobs/${id}`);
		onTick?.(j);
		if (!['queued', 'running'].includes(j.status)) return j;
		await new Promise((r) => setTimeout(r, 1500));
	}
};

// ─── Navigation ─────────────────────────────────────────────────────────────
const VIEWS = [
	['dashboard', 'Dashboard', '◉', false],
	['new', 'New Project', '+', false],
	['storyboard', 'Storyboard', '▤', true],
	['characters', 'Characters', '☺', true],
	['generator', 'Scene Generator', '✦', true],
	['env3d', '3D Environment Studio', '△', true],
	['models', 'AI Model Manager', '⚙', false],
	['timeline', 'Timeline Editor', '▭', true],
	['audio', 'Audio Studio', '♪', true],
	['render', 'Render Manager', '▶', false],
	['exports', 'Export Library', '⬇', true],
	['settings', 'Settings', '☰', false],
];
const TAB = ['dashboard', 'storyboard', 'timeline', 'render'];
const route = () => {
	const [view = 'dashboard'] = location.hash.replace(/^#\/?/, '').split('/');
	return {view: VIEWS.some((v) => v[0] === view) ? view : 'dashboard'};
};
const navHtml = (v) => VIEWS.map(([id, label, icon, needs], i) => `<a href="#/${id}" class="${id === v ? 'on' : ''} ${needs && !S.project ? 'dis' : ''}"><span class="n">${icon}</span>${label}${i < 0 ? '' : ''}</a>`).join('');
const renderNav = () => {
	const v = route().view;
	$('#nav').innerHTML = navHtml(v);
	$('#tabbar').innerHTML = TAB.map((id) => {
		const [, label, icon] = VIEWS.find((x) => x[0] === id);
		return `<a href="#/${id}" class="${id === v ? 'on' : ''}"><b>${icon}</b>${label.split(' ')[0]}</a>`;
	}).join('') + `<a href="#" id="more"><b>⋯</b>More</a>`;
	$('#more').onclick = (e) => {
		e.preventDefault();
		$('#sheet').hidden = false;
		$('#sheet').innerHTML = `<div class="inner"><nav>${navHtml(v)}</nav></div>`;
		$('#sheet').onclick = () => ($('#sheet').hidden = true);
	};
	const view = VIEWS.find((x) => x[0] === v);
	$('#crumbs').innerHTML = `${esc(view[1])}${S.project && view[3] ? `<small>${esc(S.project.title)}</small>` : ''}`;
	updateJobBars();
};

const needProject = () => (S.project ? null : `<div class="card empty">Open or create a project first.<div class="row" style="justify-content:center;margin-top:12px"><a class="btn primary" href="#/new">New project</a><a class="btn" href="#/dashboard">Projects</a></div></div>`);

// ═══ 1. Dashboard ═══════════════════════════════════════════════════════════
const viewDashboard = () => {
	const hw = S.status.hardware;
	const prov = S.providers?.providers ?? [];
	const okCount = prov.filter((p) => p.available).length;
	const caps = S.providers?.capabilities;
	return `<div class="grid g4">
		<div class="card"><h3>Hardware</h3><div class="kpi">${esc(hw.tier === 'none' ? 'CPU only' : `${hw.vram_gb} GB VRAM`)}</div><div class="small muted">${esc(hw.cpu_cores)} cores · ${esc(hw.ram_gb)} GB RAM</div></div>
		<div class="card"><h3>AI video</h3><div class="kpi">${caps?.video.available ? '✓' : '—'}</div><div class="small muted">${esc(caps?.video.available ? caps.video.provider : 'No local video model connected')}</div></div>
		<div class="card"><h3>Providers ready</h3><div class="kpi">${okCount}/${prov.length}</div><div class="small muted"><a href="#/models">AI Model Manager →</a></div></div>
		<div class="card"><h3>Queue</h3><div class="kpi">${S.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length}</div><div class="small muted"><a href="#/render">Render Manager →</a></div></div>
	</div>
	<div class="card" style="margin-top:14px"><div class="small">${esc(hw.recommendation)}</div></div>
	<div class="spread" style="margin:22px 0 10px"><h2>Projects</h2><div class="row"><button id="sample">Create sample project</button><a class="btn primary" href="#/new">+ New project</a></div></div>
	<div class="grid auto">${S.projects.map((p) => `<div class="card"><div class="spread"><strong>${esc(p.title)}</strong>${p.id === S.pid ? '<span class="badge ok">open</span>' : ''}</div>
		<div class="small muted" style="margin:4px 0 10px">${esc(p.topic)}</div>
		<div class="small muted">${p.scenes} scenes · ${fmtS(p.duration)} · ${esc(p.format)} · ${p.exports} export(s)</div>
		<div class="row" style="margin-top:12px"><button class="primary sm" data-open="${p.id}">Open</button><button class="sm danger" data-del="${p.id}">Delete</button></div></div>`).join('') || '<div class="empty">No projects yet.</div>'}</div>
	<h2 style="margin-top:22px">Recent jobs</h2><div id="jobs"></div>`;
};
const bindDashboard = (root) => {
	updateJobsUI();
	on(root, '[data-open]', 'click', async (b) => {
		await loadProject(b.dataset.open);
		location.hash = '#/storyboard';
	});
	on(root, '[data-del]', 'click', async (b) => {
		if (!confirm('Delete this project and all its files? This cannot be undone.')) return;
		await api(`/api/projects/${b.dataset.del}`, {method: 'DELETE'});
		if (S.pid === b.dataset.del) {
			S.pid = null;
			S.project = null;
			localStorage.removeItem('cs.project');
		}
		S.projects = await api('/api/projects');
		render();
	});
	on(root, '#sample', 'click', async () => {
		toast('Creating sample project (includes a procedural score)…');
		const p = await api('/api/sample-project', {method: 'POST'});
		await loadProject(p.id);
		S.projects = await api('/api/projects');
		location.hash = '#/storyboard';
	});
};

// ═══ 2. New project + automatic production workflow ═════════════════════════
const viewNew = () => {
	const sc = S.schema;
	return `<div class="grid g2"><div class="card stack"><h2>New production</h2>
		${fld('1 · Topic', '<textarea id="np-topic" placeholder="e.g. What if Rome never fell?"></textarea>')}
		${fld('Title (optional)', '<input id="np-title" placeholder="Defaults to the topic"/>')}
		<div class="grid g2">${fld('2 · Language', `<select id="np-lang">${opts(sc.languages, 'en')}</select>`)}${fld('3 · Format', `<select id="np-format">${opts(sc.formats, '16:9')}</select>`)}</div>
		<div class="grid g2">${fld('4 · Target duration (seconds)', '<input id="np-dur" type="number" value="60" min="15" max="600" inputmode="numeric"/>')}${fld('Frame rate', `<select id="np-fps">${sc.fps.map((f) => `<option ${f === 24 ? 'selected' : ''}>${f}</option>`).join('')}</select>`)}</div>
		${fld('5 · Cinematic style', `<select id="np-style">${opts(sc.styles, 'epic_historical')}</select>`)}
		<label class="check"><input type="checkbox" id="np-auto" checked/> Run the automatic production workflow after creating</label>
		<div class="row end"><button class="primary" id="np-go">Create project</button></div></div>
		<div class="card"><h2>Automatic workflow</h2><ol class="steps" id="auto-steps">${autoStepsHtml()}</ol>
		<p class="small muted">Each step reports what really happened. Steps that need a provider you don't have (e.g. TTS, AI video) are skipped with the reason — nothing is faked.</p></div></div>`;
};
const AUTO_STEPS = ['Generate script', 'Generate storyboard + route scenes', 'Generate scene assets', 'Generate narration (local TTS)', 'Fit durations & subtitles to narration', 'Generate procedural music', 'Render preview of the full video'];
const autoStepsHtml = () => AUTO_STEPS.map((s, i) => `<li class="${S.auto?.[i]?.state ?? ''}">${esc(s)}${S.auto?.[i]?.note ? ` — <span class="small">${esc(S.auto[i].note)}</span>` : ''}</li>`).join('');
const autoStep = (i, state, note = '') => {
	S.auto[i] = {state, note};
	const el = $('#auto-steps');
	if (el) el.innerHTML = autoStepsHtml();
};
const runAuto = async () => {
	S.auto = AUTO_STEPS.map(() => ({state: '', note: ''}));
	const P = `/api/projects/${S.pid}`;
	const step = async (i, fn) => {
		autoStep(i, 'run', 'working…');
		try {
			const r = await fn();
			autoStep(i, r?.skip ? 'skip' : 'done', r?.note ?? '');
			return true;
		} catch (e) {
			autoStep(i, 'fail', e.message);
			throw e;
		}
	};
	try {
		await step(0, async () => {
			const p = await api(`${P}/script`, {method: 'POST', body: {}});
			return {note: `${p.script.beats.length} beats · ${p.script.source}`};
		});
		await step(1, async () => {
			await api(`${P}/storyboard`, {method: 'POST'});
			const r = await api(`${P}/route`, {method: 'POST'});
			const m = {};
			r.project.scenes.forEach((s) => (m[s.visual_type] = (m[s.visual_type] ?? 0) + 1));
			return {note: `${r.project.scenes.length} scenes · ${Object.entries(m).map(([k, v]) => `${v}× ${S.schema.visual_types[k].label}`).join(', ')}`};
		});
		await step(2, async () => {
			await loadProject(S.pid);
			const needs = S.project.scenes.filter((s) => s.visual_type !== 'procedural_3d');
			if (!needs.length) return {note: 'all scenes are procedural 3D — rendered from code, nothing to generate'};
			const jobs = await api(`${P}/generate-all`, {method: 'POST'});
			let fails = 0;
			for (const j of jobs) if ((await waitJob(j.id, (x) => autoStep(2, 'run', `${x.label}: ${x.stage}`))).status !== 'succeeded') fails++;
			if (fails) throw new Error(`${fails} scene(s) failed to generate — see Scene Generator`);
			return {note: `${needs.length} asset(s) generated`};
		});
		await step(3, async () => {
			const caps = (await api('/api/providers?refresh=1')).capabilities;
			if (!caps.tts.available) return {skip: true, note: 'no local TTS provider — import narration in the Audio Studio'};
			const j = await api(`${P}/narration/generate`, {method: 'POST', body: {}});
			const done = await waitJob(j.id, (x) => autoStep(3, 'run', x.stage));
			if (done.status !== 'succeeded') throw new Error(done.error || 'narration failed');
			return {note: `${done.result.scenes.length} clip(s) via ${caps.tts.provider}`};
		});
		await step(4, async () => {
			await loadProject(S.pid);
			if (!S.project.scenes.some((s) => s.narration_audio)) return {skip: true, note: 'no narration audio yet'};
			await api(`${P}/narration/fit`, {method: 'POST'});
			return {note: 'scene lengths now follow the voice-over'};
		});
		await step(5, async () => {
			await api(`${P}/music/procedural`, {method: 'POST'});
			return {note: 'original score synthesised (labelled procedural)'};
		});
		await step(6, async () => {
			const j = await api(`${P}/export`, {method: 'POST', body: {quality: 'preview'}});
			const done = await waitJob(j.id, (x) => autoStep(6, 'run', `${Math.round(x.progress * 100)}% · ${x.stage}`));
			if (done.status !== 'succeeded') throw new Error(done.error || 'export failed');
			return {note: `${done.result.file} — open the Export Library`};
		});
		toast('Automatic production finished — preview is in the Export Library', 'ok');
	} catch (e) {
		toast(`Automatic workflow stopped: ${e.message}`, 'bad');
	}
	await loadProject(S.pid);
};
const bindNew = (root) =>
	on(root, '#np-go', 'click', async () => {
		const body = {topic: $('#np-topic').value.trim(), title: $('#np-title').value.trim(), language: $('#np-lang').value, format: $('#np-format').value, fps: Number($('#np-fps').value), target_duration: Number($('#np-dur').value), style: $('#np-style').value};
		if (!body.topic) throw new Error('Enter a topic');
		const p = await api('/api/projects', {method: 'POST', body});
		await loadProject(p.id);
		S.projects = await api('/api/projects');
		renderNav();
		toast('Project created', 'ok');
		if ($('#np-auto').checked) runAuto();
		else location.hash = '#/storyboard';
	});

// ═══ 3. Storyboard ══════════════════════════════════════════════════════════
const sceneEditor = (s, i) => {
	const sc = S.schema;
	const b = `scenes.${i}`;
	return `<div class="scene-card method-${s.visual_type}" id="sc-${s.scene_id}"><header><div class="row"><span class="dot" style="background:var(--m)"></span><strong>${esc(s.scene_id)}</strong><span class="muted small">${fmtS(s.duration)} · ${esc(sc.environments[s.environment])}</span></div>
	<div class="row"><button class="sm ghost" data-move="-1" data-sid="${s.scene_id}" title="Move up">↑</button><button class="sm ghost" data-move="1" data-sid="${s.scene_id}" title="Move down">↓</button><button class="sm ghost" data-dup="${s.scene_id}">Duplicate</button><button class="sm danger" data-rm="${s.scene_id}">Delete</button></div></header>
	<div class="body stack">
		${fld('Narration', `<textarea data-bind="${b}.narration" rows="2">${esc(s.narration)}</textarea>`)}
		${fld('Visual description', `<textarea data-bind="${b}.visual_description" rows="2">${esc(s.visual_description)}</textarea>`)}
		<div class="grid g4">${fld('Duration (s)', inp(`${b}.duration`, s.duration, 'number', 'step="0.1" min="0.5" max="120"'))}${fld('Environment', sel(`${b}.environment`, sc.environments, s.environment, 'data-rerender="1"'))}${fld('Lighting', sel(`${b}.lighting`, sc.lighting, s.lighting))}${fld('Transition in', sel(`${b}.transition`, sc.transitions, s.transition))}</div>
		<div class="grid g4">${fld('Shot', sel(`${b}.camera.shot`, sc.shots, s.camera.shot))}${fld('Camera move', sel(`${b}.camera.movement`, sc.moves, s.camera.movement))}${fld('Lens (mm)', inp(`${b}.camera.lens`, s.camera.lens, 'number', 'min="10" max="300"'))}${fld('Handheld shake', inp(`${b}.camera.shake`, s.camera.shake, 'range', 'min="0" max="1" step="0.05"'))}</div>
		<div class="row"><label class="check"><input type="checkbox" data-bind="${b}.camera.depth_of_field" ${s.camera.depth_of_field ? 'checked' : ''}/> Depth of field</label>
		<label class="check"><input type="checkbox" data-rack="${i}" ${s.camera.focus_transition ? 'checked' : ''}/> Rack focus</label>
		${s.camera.focus_transition ? `${sel(`${b}.camera.focus_transition.from`, sc.focus, s.camera.focus_transition.from, 'style="width:auto"')} → ${sel(`${b}.camera.focus_transition.to`, sc.focus, s.camera.focus_transition.to, 'style="width:auto"')}` : ''}</div>
		${fld('Atmosphere & effects', chips(`${b}.atmosphere`, sc.atmosphere, s.atmosphere))}
		${fld('Animation', chips(`${b}.animation`, sc.animations, s.animation))}
		${S.project.characters.length ? fld('Characters (consistent across scenes)', `<div class="chips">${S.project.characters.map((c) => `<button type="button" class="chip ${s.characters.includes(c.id) ? 'on' : ''}" data-chip="${b}.characters" data-val="${c.id}">${esc(c.name)}</button>`).join('')}</div>`) : ''}
		${fld('Sound effects', chips(`${b}.sound_effects`, sc.sound_effects, s.sound_effects))}
		<div class="grid g2">${fld('Production method', `<select data-method="${i}">${opts(sc.visual_types, s.visual_type)}</select>`)}<div class="field"><label>Router</label><label class="check"><input type="checkbox" data-bind="${b}.visual_type_locked" ${s.visual_type_locked ? 'checked' : ''}/> Lock my choice (router won't change it)</label></div></div>
		${s.route_reason ? `<div class="small muted">↳ ${esc(s.route_reason)}</div>` : ''}
		<details><summary>Scene JSON</summary><pre class="log mono">${esc(JSON.stringify(s, null, 2))}</pre></details>
	</div></div>`;
};
const viewStoryboard = () => {
	const p = S.project;
	const total = S.timeline?.total ?? 0;
	return `<div class="card"><div class="spread"><div><h2>${esc(p.title)}</h2><div class="small muted">${esc(p.topic)} · ${esc(S.schema.styles[p.style].label)} · ${esc(p.format)} · ${p.fps} fps · target ${fmtS(p.target_duration)} · current ${fmtS(total)}</div></div>
	<div class="row"><button id="sb-script">${p.script ? 'Rewrite script' : 'Generate script'}</button><button id="sb-board" ${p.script ? '' : 'disabled'}>Generate storyboard</button><button id="sb-route" class="teal">Route scenes</button><button id="sb-add">+ Scene</button></div></div></div>
	${p.script ? `<div class="card"><div class="spread"><h2>Script</h2><span class="small muted">${esc(p.script.source ?? '')}</span></div><div class="stack">${p.script.beats.map((bt, i) => `<div class="grid" style="grid-template-columns:140px 1fr">${inp(`script.beats.${i}.heading`, bt.heading)}<textarea data-bind="script.beats.${i}.narration" rows="2">${esc(bt.narration)}</textarea></div>`).join('')}</div><p class="small muted">Edit the beats, then “Generate storyboard” rebuilds scenes from them (it replaces existing scenes).</p></div>` : ''}
	<div class="stack" style="margin-top:14px">${p.scenes.map(sceneEditor).join('') || '<div class="card empty">No scenes yet — generate a script and storyboard, or add a scene.</div>'}</div>`;
};
const bindStoryboard = (root) => {
	bindAll(root);
	const P = `/api/projects/${S.pid}`;
	on(root, '#sb-script', 'click', async () => {
		if (S.project.script && !confirm('Replace the current script?')) return;
		S.project = await api(`${P}/script`, {method: 'POST', body: {}});
		toast(`Script: ${S.project.script.source}`, 'ok');
		render();
	});
	on(root, '#sb-board', 'click', async () => {
		if (S.project.scenes.length && !confirm('Rebuild all scenes from the script? Current scenes will be replaced.')) return;
		S.project = await api(`${P}/storyboard`, {method: 'POST'});
		await loadProject(S.pid);
		render();
	});
	on(root, '#sb-route', 'click', async () => {
		const r = await api(`${P}/route`, {method: 'POST'});
		S.project = r.project;
		if (r.blocked.length) toast(`Blocked: ${r.blocked.map((b) => `${b.scene_id} — ${b.reason}`).join('\n')}`, 'bad');
		else toast('Scenes routed', 'ok');
		render();
	});
	on(root, '#sb-add', 'click', () => {
		const last = S.project.scenes.at(-1);
		const id = `scene_${String(S.project.scenes.length + 1).padStart(3, '0')}_${Math.random().toString(36).slice(2, 5)}`;
		const s = last ? {...clone(last), scene_id: id, asset: null, narration: '', narration_audio: null, overlays: [], subtitles: [], generation: {...clone(last.generation), status: 'not_started', log: [], error: null}} : {...clone(S.lookdevDefault), scene_id: id};
		S.project.scenes.push(s);
		S.sel = id;
		save(true);
	});
	on(root, '[data-move]', 'click', (b) => {
		const i = sceneIdx(b.dataset.sid);
		const j = i + Number(b.dataset.move);
		if (j < 0 || j >= S.project.scenes.length) return;
		const [s] = S.project.scenes.splice(i, 1);
		S.project.scenes.splice(j, 0, s);
		save(true);
	});
	on(root, '[data-dup]', 'click', (b) => {
		const i = sceneIdx(b.dataset.dup);
		const s = clone(S.project.scenes[i]);
		s.scene_id = `${s.scene_id.slice(0, 50)}_b${Math.random().toString(36).slice(2, 4)}`;
		S.project.scenes.splice(i + 1, 0, s);
		save(true);
	});
	on(root, '[data-rm]', 'click', (b) => {
		if (!confirm(`Delete ${b.dataset.rm}?`)) return;
		S.project.scenes.splice(sceneIdx(b.dataset.rm), 1);
		save(true);
	});
	on(root, '[data-rack]', 'change', (el) => {
		const s = S.project.scenes[Number(el.dataset.rack)];
		s.camera.focus_transition = el.checked ? {from: 'background', to: 'subject'} : null;
		save(true);
	});
	on(root, '[data-method]', 'change', (el) => {
		const s = S.project.scenes[Number(el.dataset.method)];
		s.visual_type = el.value;
		s.visual_type_locked = true;
		s.route_reason = `Chosen by you (${S.schema.visual_types[el.value].label}).`;
		save(true);
	});
};

// ═══ 4. Characters ══════════════════════════════════════════════════════════
const newCharacter = () => ({id: `char_${Math.random().toString(36).slice(2, 7)}`, name: 'New character', appearance: '', clothing: '', hair: '', hair_style: 'short', build: 'average', palette: {skin: '#d8a888', hair: '#2a1c14', top: '#3b5b8a', bottom: '#2b2b2b', accent: '#c9a227'}, scale: 1.75, model_reference: null, reference_images: [], seed: Math.floor(Math.random() * 1e6)});
const viewCharacters = () => {
	const p = S.project;
	return `<div class="spread" style="margin-bottom:12px"><p class="muted small" style="margin:0">A character keeps one ID, one look and one 3D rig across every scene. AI providers receive the same description, seed and (when supported) reference image.</p><button class="primary" id="ch-add">+ Character</button></div>
	<div class="grid g2">${p.characters.map((c, i) => {
		const b = `characters.${i}`;
		const used = p.scenes.filter((s) => s.characters.includes(c.id));
		return `<div class="card stack"><div class="spread"><h2>${esc(c.name)}</h2><span class="badge">${esc(c.id)}</span></div>
		<div class="grid g2">${fld('Name', inp(`${b}.name`, c.name))}${fld('Height (m)', inp(`${b}.scale`, c.scale, 'number', 'step="0.01" min="0.3" max="4"'))}</div>
		${fld('Appearance', `<textarea data-bind="${b}.appearance" rows="2">${esc(c.appearance)}</textarea>`)}
		<div class="grid g2">${fld('Clothing', inp(`${b}.clothing`, c.clothing))}${fld('Hair', inp(`${b}.hair`, c.hair))}</div>
		<div class="grid g3">${fld('Hair style (3D)', sel(`${b}.hair_style`, S.schema.hair_styles, c.hair_style))}${fld('Build', sel(`${b}.build`, S.schema.builds, c.build))}${fld('Seed', inp(`${b}.seed`, c.seed, 'number'))}</div>
		${fld('Colour palette', `<div class="swatches">${['skin', 'hair', 'top', 'bottom', 'accent'].map((k) => `<div><input type="color" data-bind="${b}.palette.${k}" value="${c.palette[k]}"/><div class="small muted" style="text-align:center">${k}</div></div>`).join('')}</div>`)}
		${fld('Reference images', `<div class="thumbs">${c.reference_images.map((r, k) => `<div><img src="${fileUrl(r)}" alt=""/><button class="sm ghost" data-rmref="${i}:${k}">✕</button></div>`).join('')}<button class="sm" data-addref="${c.id}">+ Image</button></div>`)}
		${fld('3D model (.glb, optional)', `<div class="row">${c.model_reference ? `<span class="mono">${esc(c.model_reference)}</span><button class="sm ghost" data-rmmodel="${i}">Remove</button>` : '<span class="muted small">Procedural rig from palette</span>'}<button class="sm" data-addmodel="${c.id}">Upload .glb</button></div>`)}
		${fld('Scene assignments', `<div class="chips">${p.scenes.map((s) => `<button type="button" class="chip ${s.characters.includes(c.id) ? 'on' : ''}" data-assign="${c.id}" data-sid="${s.scene_id}">${esc(s.scene_id)}</button>`).join('') || '<span class="muted small">No scenes</span>'}</div><div class="small muted">${used.length} scene(s)</div>`)}
		<div class="row end"><button class="sm" data-preview="${c.id}">Preview in 3D</button><button class="sm danger" data-rmchar="${i}">Delete</button></div><div data-prevbox="${c.id}"></div></div>`;
	}).join('') || '<div class="card empty">No characters yet.</div>'}</div>`;
};
const bindCharacters = (root) => {
	bindAll(root);
	on(root, '#ch-add', 'click', () => {
		S.project.characters.push(newCharacter());
		save(true);
	});
	on(root, '[data-rmchar]', 'click', (b) => {
		const c = S.project.characters[Number(b.dataset.rmchar)];
		if (!confirm(`Delete ${c.name}? It will be removed from all scenes.`)) return;
		S.project.characters.splice(Number(b.dataset.rmchar), 1);
		S.project.scenes.forEach((s) => (s.characters = s.characters.filter((x) => x !== c.id)));
		save(true);
	});
	on(root, '[data-assign]', 'click', (b) => {
		const s = scene(b.dataset.sid);
		const i = s.characters.indexOf(b.dataset.assign);
		if (i >= 0) s.characters.splice(i, 1);
		else s.characters.push(b.dataset.assign);
		b.classList.toggle('on');
		save();
	});
	on(root, '[data-addref]', 'click', async (b) => {
		if (await upload('character_reference', 'image/*', {character: b.dataset.addref})) render();
	});
	on(root, '[data-addmodel]', 'click', async (b) => {
		if (await upload('character_model', '.glb,.gltf', {character: b.dataset.addmodel})) render();
	});
	on(root, '[data-rmref]', 'click', (b) => {
		const [i, k] = b.dataset.rmref.split(':').map(Number);
		S.project.characters[i].reference_images.splice(k, 1);
		save(true);
	});
	on(root, '[data-rmmodel]', 'click', (b) => {
		S.project.characters[Number(b.dataset.rmmodel)].model_reference = null;
		save(true);
	});
	on(root, '[data-preview]', 'click', async (b) => {
		const box = $(`[data-prevbox="${b.dataset.preview}"]`);
		box.innerHTML = '<div class="small muted">Rendering a real 3D still…</div>';
		const base = scene() ?? S.lookdevDefault;
		const r = await api(`/api/projects/${S.pid}/scenes/_lookdev/still`, {method: 'POST', body: {frame: 30, scene: {...base, scene_id: 'lookdev', visual_type: 'procedural_3d', asset: null, environment: 'interior', lighting: 'golden_hour', characters: [b.dataset.preview], atmosphere: ['dust_particles'], animation: [], overlays: [], camera: {...base.camera, shot: 'medium', movement: 'static', lens: 50, depth_of_field: true, focus_transition: null, shake: 0}}}});
		box.innerHTML = `<img class="preview" src="${fileUrl(r.file)}" alt="3D preview"/>`;
	});
};

// ═══ 5. Scene generator ═════════════════════════════════════════════════════
const assetPreview = (s) => {
	if (!s.asset) return '';
	return s.asset.kind === 'video' ? `<video class="preview" src="${fileUrl(s.asset.path)}" controls playsinline muted preload="metadata"></video>` : `<img class="preview" src="${fileUrl(s.asset.path)}" alt="asset"/>`;
};
const renderPreview = (s) => {
	const r = S.renders[s.scene_id] ?? {};
	const f = r.final ?? r.preview;
	return f ? `<video class="preview" src="${fileUrl(f)}" controls playsinline muted preload="metadata"></video><div class="small muted">${r.final ? 'Final' : 'Preview'} render (cached)</div>` : '';
};
const viewGenerator = () => {
	const caps = S.providers?.capabilities;
	return `<div class="card spread"><div class="small">Video: <b>${esc(caps?.video.available ? caps.video.provider : 'none')}</b> · Image: <b>${esc(caps?.image.available ? caps.image.provider : 'none')}</b> · Blender: <b>${caps?.blender.available ? 'yes' : 'no'}</b> · Procedural 3D: <b>always</b></div>
	<div class="row"><button class="teal" id="g-route">Route all</button><button id="g-all">Generate all</button><button class="primary" id="g-prev">Render all previews</button></div></div>
	<div class="grid g2" style="margin-top:14px">${S.project.scenes.map((s, i) => {
		const g = s.generation;
		const needs = s.visual_type !== 'procedural_3d';
		return `<div class="scene-card method-${s.visual_type}"><header><div class="row"><span class="dot" style="background:var(--m)"></span><strong>${esc(s.scene_id)}</strong>${badgeFor(needs ? g.status : 'not_required')}</div><span class="small muted">${fmtS(s.duration)}</span></header><div class="body stack">
		<div class="grid g2">${fld('Method', `<select data-method="${i}">${opts(S.schema.visual_types, s.visual_type)}</select>`)}${fld('Provider', `<div class="small" style="padding-top:10px">${esc(g.provider ?? '—')}</div>`)}</div>
		${s.route_reason ? `<div class="small muted">↳ ${esc(s.route_reason)}</div>` : ''}
		${g.error ? `<div class="small" style="color:#ffb4ae">${esc(g.error)}</div>` : ''}
		${assetPreview(s)}${renderPreview(s)}
		${g.prompt ? `<details><summary>Prompt & settings used</summary><div class="small mono">${esc(g.prompt)}</div><div class="small muted mono" style="margin-top:6px">neg: ${esc(g.negative_prompt)}</div><pre class="log">${esc(JSON.stringify(g.settings, null, 1))}</pre></details>` : ''}
		${g.log?.length ? `<details><summary>Log</summary><pre class="log">${esc(g.log.join('\n'))}</pre></details>` : ''}
		<div class="row">${needs && s.visual_type !== 'user_asset' ? `<button class="sm primary" data-gen="${s.scene_id}">${s.asset ? 'Regenerate' : 'Generate'}</button>` : ''}${s.asset && needs && s.visual_type !== 'user_asset' ? `<button class="sm" data-gen="${s.scene_id}" data-newseed="1">New seed</button>` : ''}<button class="sm" data-import="${s.scene_id}">Import asset</button><button class="sm teal" data-rprev="${s.scene_id}">Render preview</button><button class="sm" data-rfinal="${s.scene_id}">Render final</button></div>
		</div></div>`;
	}).join('')}</div>`;
};
const bindGenerator = (root) => {
	const P = `/api/projects/${S.pid}`;
	on(root, '[data-method]', 'change', (el) => {
		const s = S.project.scenes[Number(el.dataset.method)];
		s.visual_type = el.value;
		s.visual_type_locked = true;
		s.route_reason = `Chosen by you (${S.schema.visual_types[el.value].label}).`;
		save(true);
	});
	on(root, '#g-route', 'click', async () => {
		const r = await api(`${P}/route`, {method: 'POST'});
		S.project = r.project;
		if (r.blocked.length) toast(r.blocked.map((b) => `${b.scene_id}: ${b.reason}`).join('\n'), 'bad');
		render();
	});
	on(root, '#g-all', 'click', async () => {
		await api(`${P}/generate-all`, {method: 'POST'});
		toast('Generation queued for all scenes');
		pollJobs();
	});
	on(root, '#g-prev', 'click', async () => {
		await api(`${P}/render`, {method: 'POST', body: {quality: 'preview'}});
		toast('Preview renders queued');
		pollJobs();
	});
	on(root, '[data-gen]', 'click', async (b) => {
		await api(`${P}/scenes/${b.dataset.gen}/generate`, {method: 'POST', body: {new_seed: Boolean(b.dataset.newseed)}});
		toast(`Generation queued for ${b.dataset.gen}`);
		await loadProject(S.pid);
		render();
		pollJobs();
	});
	on(root, '[data-import]', 'click', async (b) => {
		if (await upload('scene_asset', 'video/*,image/*', {scene: b.dataset.import})) render();
	});
	on(root, '[data-rprev]', 'click', async (b) => {
		await api(`${P}/render`, {method: 'POST', body: {scene_id: b.dataset.rprev, quality: 'preview'}});
		toast(`Preview render queued for ${b.dataset.rprev}`);
		pollJobs();
	});
	on(root, '[data-rfinal]', 'click', async (b) => {
		await api(`${P}/render`, {method: 'POST', body: {scene_id: b.dataset.rfinal, quality: 'final'}});
		toast(`Final render queued for ${b.dataset.rfinal}`);
		pollJobs();
	});
};

// ═══ 6. 3D Environment Studio ═══════════════════════════════════════════════
const viewEnv3d = () => {
	const sc = S.schema;
	if (!S.lookdev) S.lookdev = clone(scene() ?? S.lookdevDefault);
	const d = S.lookdev;
	const L = (k, html) => fld(k, html);
	const lsel = (k, table, cur) => `<select data-ld="${k}">${opts(table, cur)}</select>`;
	return `<div class="grid g2"><div class="card stack"><h2>Look development</h2>
		<div class="grid g2">${L('Environment', lsel('environment', sc.environments, d.environment))}${L('Lighting', lsel('lighting', sc.lighting, d.lighting))}</div>
		<div class="grid g3">${L('Shot', lsel('camera.shot', sc.shots, d.camera.shot))}${L('Move', lsel('camera.movement', sc.moves, d.camera.movement))}${L('Lens', `<input data-ld="camera.lens" type="number" value="${d.camera.lens}" inputmode="numeric"/>`)}</div>
		${L('Atmosphere', `<div class="chips">${Object.entries(sc.atmosphere).map(([k, v]) => `<button type="button" class="chip ${d.atmosphere.includes(k) ? 'on' : ''}" data-ldchip="atmosphere" data-val="${k}">${esc(v)}</button>`).join('')}</div>`)}
		${L('Animation', `<div class="chips">${Object.entries(sc.animations).map(([k, v]) => `<button type="button" class="chip ${d.animation.includes(k) ? 'on' : ''}" data-ldchip="animation" data-val="${k}">${esc(v)}</button>`).join('')}</div>`)}
		${S.project.characters.length ? L('Characters', `<div class="chips">${S.project.characters.map((c) => `<button type="button" class="chip ${d.characters.includes(c.id) ? 'on' : ''}" data-ldchip="characters" data-val="${c.id}">${esc(c.name)}</button>`).join('')}</div>`) : ''}
		<label class="check"><input type="checkbox" data-ld="camera.depth_of_field" ${d.camera.depth_of_field ? 'checked' : ''}/> Depth of field</label>
		<div class="row"><button class="primary" id="ld-still">Render still</button><button id="ld-move">Render camera move (3 frames)</button><button class="teal" id="ld-add">Add as new scene</button>${scene() ? `<button id="ld-apply">Apply to ${esc(S.sel)}</button>` : ''}</div>
		<p class="small muted">Real frames from the same engine used for final renders (half resolution, preview particle density).</p></div>
		<div class="card"><h2>Frames</h2><div id="ld-out" class="stack">${S.stills.map((f) => `<img class="preview" src="${fileUrl(f)}" alt="still"/>`).join('') || '<div class="placeholder preview">No frames rendered yet</div>'}</div></div></div>`;
};
const bindEnv3d = (root) => {
	on(root, '[data-ld]', 'change', (el) => setPath(S.lookdev, el.dataset.ld, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value));
	on(root, '[data-ldchip]', 'click', (el) => {
		const list = S.lookdev[el.dataset.ldchip];
		const i = list.indexOf(el.dataset.val);
		if (i >= 0) list.splice(i, 1);
		else list.push(el.dataset.val);
		el.classList.toggle('on');
	});
	const still = async (frames) => {
		const out = $('#ld-out');
		out.innerHTML = '<div class="placeholder preview">Rendering…</div>';
		S.stills = [];
		const d = {...S.lookdev, visual_type: 'procedural_3d', asset: null, scene_id: 'lookdev'};
		for (const f of frames) {
			const r = await api(`/api/projects/${S.pid}/scenes/_lookdev/still`, {method: 'POST', body: {frame: Math.round(f * d.duration * S.project.fps), scene: d}});
			S.stills.push(r.file);
			out.innerHTML = S.stills.map((x) => `<img class="preview" src="${fileUrl(x)}" alt="still"/>`).join('');
		}
	};
	on(root, '#ld-still', 'click', () => still([0.5]));
	on(root, '#ld-move', 'click', () => still([0, 0.5, 0.98]));
	on(root, '#ld-add', 'click', () => {
		const s = {...clone(S.lookdev), scene_id: `scene_${String(S.project.scenes.length + 1).padStart(3, '0')}_${Math.random().toString(36).slice(2, 5)}`, visual_type: 'procedural_3d', asset: null, narration: '', narration_audio: null, overlays: [], subtitles: []};
		S.project.scenes.push(s);
		S.sel = s.scene_id;
		save();
		toast(`Added ${s.scene_id} to the storyboard`, 'ok');
	});
	on(root, '#ld-apply', 'click', () => {
		const s = scene();
		Object.assign(s, {environment: S.lookdev.environment, lighting: S.lookdev.lighting, camera: clone(S.lookdev.camera), atmosphere: [...S.lookdev.atmosphere], animation: [...S.lookdev.animation], characters: [...S.lookdev.characters]});
		save();
		toast(`Applied to ${s.scene_id}`, 'ok');
	});
};

// ═══ 7. AI Model Manager ════════════════════════════════════════════════════
const cfgIn = (path, val, type = 'text', extra = '') => `<input data-cfg="${path}" type="${type}" value="${esc(val)}" ${extra}/>`;
const cfgChk = (path, val, label) => `<label class="check"><input type="checkbox" data-cfg="${path}" ${val ? 'checked' : ''}/> ${esc(label)}</label>`;
const viewModels = () => {
	const pv = S.providers;
	const c = S.config;
	const groups = {video: 'AI video', image: 'AI image', '3d': '3D', tts: 'Speech', llm: 'Script writer'};
	const comfyModels = (folder) => (pv?.comfy?.models?.[folder] ?? []);
	const dl = (id, folder) => `<datalist id="${id}">${comfyModels(folder).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>`;
	return `<div class="card"><div class="spread"><h2>Providers</h2><div class="row"><span class="small muted">checked ${esc(pv?.checked_at?.slice(11, 19) ?? '')}</span><button id="pm-refresh" class="teal">Re-detect</button></div></div>
	<table><tbody>${(pv?.providers ?? []).map((p) => `<tr><td style="width:24px"><span class="dot ${p.available ? 'ok' : 'bad'}"></span></td><td><strong>${esc(p.name)}</strong><div class="small muted">${esc(groups[p.group])}</div></td><td class="small">${esc(p.reason ?? '')}</td></tr>`).join('')}</tbody></table>
	<p class="small muted">The studio never downloads model weights. Install them in ComfyUI yourself, then set the exact filenames below — detection checks they exist.</p></div>
	<div class="grid g2" style="margin-top:14px">
	<div class="card stack"><h2>ComfyUI</h2>${cfgChk('comfyui.enabled', c.comfyui.enabled, 'Enabled')}
		<div class="row">${cfgIn('comfyui.url', c.comfyui.url)}<button id="pm-comfy">Test connection</button></div><div id="pm-comfy-out" class="small"></div>
		${pv?.comfy?.devices?.length ? `<div class="small muted">Devices: ${pv.comfy.devices.map((d) => `${esc(d.name)} (${d.vram_gb ?? '?'} GB)`).join(', ')}</div>` : ''}
		<h3>Image checkpoint</h3>${cfgIn('comfyui.image.checkpoint', c.comfyui.image.checkpoint, 'text', 'list="dl-ck" placeholder="e.g. sd_xl_base_1.0.safetensors"')}${dl('dl-ck', 'checkpoints')}
		<div class="grid g3">${fld('Steps', cfgIn('comfyui.image.steps', c.comfyui.image.steps, 'number'))}${fld('CFG', cfgIn('comfyui.image.cfg', c.comfyui.image.cfg, 'number', 'step="0.5"'))}${fld('Ref. denoise', cfgIn('comfyui.image.reference_denoise', c.comfyui.image.reference_denoise, 'number', 'step="0.05"'))}</div>
		<h3>Wan 2.2</h3>${cfgChk('comfyui.wan22.enabled', c.comfyui.wan22.enabled, 'Enabled')}
		${fld('Variant', `<select data-cfg="comfyui.wan22.variant"><option value="ti2v_5b" ${c.comfyui.wan22.variant === 'ti2v_5b' ? 'selected' : ''}>TI2V-5B (single model, 24 fps)</option><option value="a14b" ${c.comfyui.wan22.variant === 'a14b' ? 'selected' : ''}>14B two-expert (16 fps, high VRAM)</option></select>`)}
		<div class="grid g2">${fld('5B diffusion model', cfgIn('comfyui.wan22.unet', c.comfyui.wan22.unet, 'text', 'list="dl-dm"'))}${fld('Text encoder', cfgIn('comfyui.wan22.text_encoder', c.comfyui.wan22.text_encoder, 'text', 'list="dl-te"'))}${fld('14B high-noise (i2v)', cfgIn('comfyui.wan22.unet_high_noise', c.comfyui.wan22.unet_high_noise, 'text', 'list="dl-dm"'))}${fld('14B low-noise (i2v)', cfgIn('comfyui.wan22.unet_low_noise', c.comfyui.wan22.unet_low_noise, 'text', 'list="dl-dm"'))}${fld('VAE (5B)', cfgIn('comfyui.wan22.vae', c.comfyui.wan22.vae, 'text', 'list="dl-vae"'))}${fld('Max clip seconds', cfgIn('comfyui.wan22.max_seconds', c.comfyui.wan22.max_seconds, 'number'))}</div>
		${dl('dl-dm', 'diffusion_models')}${dl('dl-te', 'text_encoders')}${dl('dl-vae', 'vae')}
		<h3>LTX-Video</h3>${cfgChk('comfyui.ltx.enabled', c.comfyui.ltx.enabled, 'Enabled')}
		<div class="grid g2">${fld('Checkpoint', cfgIn('comfyui.ltx.checkpoint', c.comfyui.ltx.checkpoint, 'text', 'list="dl-ck"'))}${fld('Text encoder', cfgIn('comfyui.ltx.text_encoder', c.comfyui.ltx.text_encoder, 'text', 'list="dl-te"'))}</div></div>
	<div class="stack">
	<div class="card stack"><h2>Hardware</h2><div class="small">${esc(S.status.hardware.platform)} · ${esc(S.status.hardware.cpu)} · ${S.status.hardware.cpu_cores} cores · ${S.status.hardware.ram_gb} GB RAM</div>
		<div class="small">GPUs: ${S.status.hardware.gpus.map((g) => `${esc(g.name)} (${g.vram_gb ?? '?'} GB)`).join(', ') || 'none detected'}</div><div class="small">This browser's WebGL: <span id="webgl">…</span></div>
		<div class="small muted">${esc(S.status.hardware.recommendation)}</div>${fld('Override VRAM (GB) for planning', cfgIn('hardware.gpu_vram_gb_override', c.hardware.gpu_vram_gb_override ?? '', 'number', 'data-nullable="1"'))}</div>
	<div class="card stack"><h2>AUTOMATIC1111 / Forge</h2>${cfgChk('a1111.enabled', c.a1111.enabled, 'Enabled')}${cfgIn('a1111.url', c.a1111.url)}</div>
	<div class="card stack"><h2>Official repo CLIs</h2>${cfgChk('wan_cli.enabled', c.wan_cli.enabled, 'Wan 2.2 repo')}${fld('Wan2.2 checkout path', cfgIn('wan_cli.repo_path', c.wan_cli.repo_path))}${fld('Command template', `<textarea data-cfg="wan_cli.command" rows="3" class="mono">${esc(c.wan_cli.command)}</textarea>`)}
		${cfgChk('ltx_cli.enabled', c.ltx_cli.enabled, 'LTX-Video repo')}${fld('LTX-Video checkout path', cfgIn('ltx_cli.repo_path', c.ltx_cli.repo_path))}${fld('Command template', `<textarea data-cfg="ltx_cli.command" rows="3" class="mono">${esc(c.ltx_cli.command)}</textarea>`)}<p class="small muted">Templates follow each repo's README; check them against the version you cloned.</p></div>
	<div class="card stack"><h2>Blender</h2>${cfgChk('blender.enabled', c.blender.enabled, 'Enabled (optional)')}<div class="grid g3">${fld('Binary path', cfgIn('blender.path', c.blender.path, 'text', 'placeholder="auto"'))}${fld('Engine', `<select data-cfg="blender.engine"><option ${c.blender.engine === 'CYCLES' ? 'selected' : ''}>CYCLES</option><option ${c.blender.engine === 'EEVEE' ? 'selected' : ''}>EEVEE</option></select>`)}${fld('Samples', cfgIn('blender.samples', c.blender.samples, 'number'))}</div></div>
	</div></div>`;
};
const bindCfg = (root) =>
	on(root, '[data-cfg]', 'change', async (el) => {
		const patch = {};
		let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' && el.dataset.nullable ? null : Number(el.value)) : el.value;
		const ks = el.dataset.cfg.split('.');
		ks.reduce((a, k, i) => (a[k] = i === ks.length - 1 ? v : {}), patch);
		const r = await api('/api/config', {method: 'PUT', body: patch});
		S.config = r.config;
		S.providers = await api('/api/providers');
		toast('Settings saved', 'ok');
	});
const bindModels = (root) => {
	bindCfg(root);
	try {
		const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
		const ext = gl?.getExtension('WEBGL_debug_renderer_info');
		$('#webgl').textContent = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'available') : 'not available';
	} catch {
		$('#webgl').textContent = 'unknown';
	}
	on(root, '#pm-refresh', 'click', async () => {
		S.providers = await api('/api/providers?refresh=1');
		render();
	});
	on(root, '#pm-comfy', 'click', async () => {
		const out = $('#pm-comfy-out');
		out.textContent = 'Testing…';
		const r = await api('/api/providers/comfyui/test', {method: 'POST', body: {url: $('[data-cfg="comfyui.url"]').value}});
		out.innerHTML = r.ok ? `<span style="color:#9fe0a6">✓ Connected (${r.latency_ms} ms) · ComfyUI ${esc(r.version ?? '')}</span><br>${Object.entries(r.capabilities).map(([k, v]) => `${v.available ? '✓' : '✗'} ${esc(k)}: ${esc(v.reason)}`).join('<br>')}` : `<span style="color:#ffb4ae">✗ ${esc(r.errors.join(' '))}</span>`;
	});
};

// ═══ 8. Timeline editor ═════════════════════════════════════════════════════
const viewTimeline = () => {
	const p = S.project;
	const {starts, total} = S.timeline ?? {starts: [], total: 0};
	const pxs = S.zoom;
	const W = Math.max(600, Math.ceil(total * pxs) + 40);
	const s = scene();
	const i = sceneIdx(S.sel);
	const fmtCls = p.format === '9:16' ? 'v916' : p.format === '1:1' ? 'v11' : '';
	const r = s ? S.renders[s.scene_id] ?? {} : {};
	const vid = r.final ?? r.preview;
	const ticks = [];
	for (let t = 0; t <= total; t += pxs < 25 ? 10 : pxs < 60 ? 5 : 1) ticks.push(`<span style="left:${t * pxs}px">${fmtS(t)}</span>`);
	return `<div class="grid g2"><div class="card stack"><div class="spread"><h2>Preview</h2><div class="row"><button class="sm teal" id="tl-rp">Render scene preview</button><a class="btn sm" href="#/exports">Full video →</a></div></div>
		${vid ? `<video class="preview ${fmtCls}" id="tl-video" src="${fileUrl(vid)}" controls playsinline preload="metadata"></video>` : `<div class="preview placeholder ${fmtCls}">No render for ${esc(S.sel ?? 'this scene')} yet — “Render scene preview”.</div>`}
		<div class="small muted">Scene starts at ${fmtS(starts[i] ?? 0)} on the timeline · total ${fmtS(total)}</div></div>
	${s ? `<div class="card stack"><div class="spread"><h2>${esc(s.scene_id)}</h2><div class="row"><button class="sm" data-nudge="-1">◀ Earlier</button><button class="sm" data-nudge="1">Later ▶</button></div></div>
		<div class="grid g2">${fld(`Duration: ${s.duration}s`, `<input type="range" min="1" max="30" step="0.1" data-bind="scenes.${i}.duration" value="${s.duration}" data-rerender="1"/>`)}${fld('Transition in', sel(`scenes.${i}.transition`, S.schema.transitions, s.transition, 'data-rerender="1"'))}</div>
		<details open><summary>Text overlays (${s.overlays.length})</summary><div class="stack">${s.overlays.map((o, k) => `<div class="grid" style="grid-template-columns:1fr 70px 70px 120px auto;gap:6px">${inp(`scenes.${i}.overlays.${k}.text`, o.text)}${inp(`scenes.${i}.overlays.${k}.start`, o.start, 'number', 'step="0.1"')}${inp(`scenes.${i}.overlays.${k}.end`, o.end, 'number', 'step="0.1"')}${sel(`scenes.${i}.overlays.${k}.position`, {top: 'Top', center: 'Center', lower_third: 'Lower third'}, o.position)}<button class="sm ghost" data-rmov="${k}">✕</button></div>`).join('')}<button class="sm" id="tl-addov">+ Overlay</button></div></details>
		<details><summary>Subtitles (${s.subtitles.length})</summary><div class="stack">${s.subtitles.map((c, k) => `<div class="grid" style="grid-template-columns:70px 70px 1fr auto;gap:6px">${inp(`scenes.${i}.subtitles.${k}.start`, c.start, 'number', 'step="0.05"')}${inp(`scenes.${i}.subtitles.${k}.end`, c.end, 'number', 'step="0.05"')}${inp(`scenes.${i}.subtitles.${k}.text`, c.text)}<button class="sm ghost" data-rmsub="${k}">✕</button></div>`).join('')}<div class="row"><button class="sm" id="tl-addsub">+ Cue</button><button class="sm" id="tl-autosub">Auto from narration</button></div></div></details></div>` : '<div class="card empty">No scenes</div>'}</div>
	<div class="card" style="margin-top:14px"><div class="spread"><h2>Timeline</h2><div class="row small"><span class="muted">Zoom</span><input type="range" id="tl-zoom" min="10" max="140" value="${pxs}" style="width:140px"/></div></div>
	<div class="tl-wrap"><div class="tl" style="width:${W}px">
		<div class="tl-ruler">${ticks.join('')}</div>
		<div class="track" id="tr-video"><span class="track-label">Scenes</span>${p.scenes.map((x, k) => `<div class="clip method-${x.visual_type} ${x.scene_id === S.sel ? 'sel' : ''}" data-clip="${x.scene_id}" style="left:${starts[k] * pxs}px;width:${Math.max(8, x.duration * pxs - 2)}px"><span class="handle" data-drag="${x.scene_id}">⋮</span><span>${esc(x.scene_id.replace('scene_', '#'))} · ${esc(S.schema.environments[x.environment])}</span></div>${k > 0 && x.transition !== 'cut' ? `<div class="trans" style="left:${starts[k] * pxs}px;width:${S.schema.transitions[x.transition].seconds * pxs}px"></div>` : ''}`).join('')}</div>
		<div class="track small"><span class="track-label">Text</span>${p.scenes.flatMap((x, k) => x.overlays.map((o) => `<div class="clip" style="--m:#c88be8;left:${(starts[k] + o.start) * pxs}px;width:${Math.max(6, (o.end - o.start) * pxs)}px">${esc(o.text)}</div>`)).join('')}</div>
		<div class="track small"><span class="track-label">Subtitles</span>${p.scenes.flatMap((x, k) => x.subtitles.map((c) => `<div class="clip" style="--m:#8d92a0;left:${(starts[k] + c.start) * pxs}px;width:${Math.max(6, (c.end - c.start) * pxs)}px">${esc(c.text)}</div>`)).join('')}</div>
		<div class="track"><span class="track-label">Narration</span>${p.scenes.map((x, k) => (x.narration_audio ? `<div class="clip" style="--m:#4fb3bf;left:${(starts[k] + 0.3) * pxs}px;width:${Math.max(6, x.narration_audio.duration * pxs)}px"><canvas data-wave="${esc(x.narration_audio.path)}"></canvas></div>` : '')).join('')}</div>
		<div class="track"><span class="track-label">Music</span>${p.audio.music.path ? `<div class="clip" style="--m:#e8a54b;left:0;width:${total * pxs}px"><canvas data-wave="${esc(p.audio.music.path)}"></canvas><span style="position:relative">${esc(p.audio.music.source ?? '')}</span></div>` : ''}</div>
		<div class="track small"><span class="track-label">SFX</span>${p.scenes.map((x, k) => (x.sound_effects.length ? `<div class="clip" style="--m:#8fbf6a;left:${starts[k] * pxs}px;width:${Math.max(6, x.duration * pxs - 2)}px">${esc(x.sound_effects.map((e) => S.schema.sound_effects[e]).join(', '))}</div>` : '')).join('')}</div>
		<div class="playhead" id="tl-ph" style="left:${(starts[i] ?? 0) * pxs}px"></div>
	</div></div>
	<div class="grid g4" style="margin-top:12px">${fld(`Narration volume ${p.audio.narration_volume}`, `<input type="range" min="0" max="2" step="0.05" data-bind="audio.narration_volume" value="${p.audio.narration_volume}" data-rerender="1"/>`)}${fld(`Music volume ${p.audio.music.volume}`, `<input type="range" min="0" max="1.5" step="0.05" data-bind="audio.music.volume" value="${p.audio.music.volume}" data-rerender="1"/>`)}${fld(`SFX volume ${p.audio.sfx_volume}`, `<input type="range" min="0" max="2" step="0.05" data-bind="audio.sfx_volume" value="${p.audio.sfx_volume}" data-rerender="1"/>`)}<div class="field"><label>Render</label><div class="row"><button class="sm primary" id="tl-exp">Export preview</button><button class="sm" id="tl-expf">Export final</button></div></div></div>
	<p class="small muted">Drag a scene by its ⋮ handle to reorder (touch works). Tap a scene to edit it. Hatched areas are transition overlaps.</p></div>`;
};
const drawWaves = async (root) => {
	for (const cv of $$('canvas[data-wave]', root)) {
		try {
			const w = await api(`/api/projects/${S.pid}/waveform?path=${encodeURIComponent(cv.dataset.wave)}&buckets=300`);
			const r = cv.getBoundingClientRect();
			cv.width = Math.max(10, r.width * devicePixelRatio);
			cv.height = Math.max(10, r.height * devicePixelRatio);
			const g = cv.getContext('2d');
			g.fillStyle = 'rgba(255,255,255,.55)';
			const n = w.peaks.length;
			for (let k = 0; k < n; k++) {
				const h = Math.max(1, w.peaks[k] * cv.height * 0.9);
				g.fillRect((k / n) * cv.width, (cv.height - h) / 2, Math.max(1, cv.width / n - 0.5), h);
			}
		} catch {}
	}
};
const bindTimeline = (root) => {
	bindAll(root);
	drawWaves(root);
	const P = `/api/projects/${S.pid}`;
	const i = sceneIdx(S.sel);
	on(root, '#tl-zoom', 'input', (el) => {
		S.zoom = Number(el.value);
		localStorage.setItem('cs.zoom', S.zoom);
		render();
	});
	on(root, '[data-clip]', 'click', (el) => {
		S.sel = el.dataset.clip;
		render();
	});
	on(root, '[data-nudge]', 'click', (b) => {
		const j = i + Number(b.dataset.nudge);
		if (j < 0 || j >= S.project.scenes.length) return;
		const [x] = S.project.scenes.splice(i, 1);
		S.project.scenes.splice(j, 0, x);
		save(true);
	});
	on(root, '#tl-addov', 'click', () => {
		const s = scene();
		s.overlays.push({id: `ov_${Date.now().toString(36)}`, text: 'Title', start: 0.5, end: Math.min(s.duration, 3.5), position: 'lower_third'});
		save(true);
	});
	on(root, '[data-rmov]', 'click', (b) => {
		scene().overlays.splice(Number(b.dataset.rmov), 1);
		save(true);
	});
	on(root, '#tl-addsub', 'click', () => {
		const s = scene();
		const last = s.subtitles.at(-1);
		s.subtitles.push({start: last ? last.end : 0.3, end: Math.min(s.duration, (last ? last.end : 0.3) + 2), text: ''});
		save(true);
	});
	on(root, '[data-rmsub]', 'click', (b) => {
		scene().subtitles.splice(Number(b.dataset.rmsub), 1);
		save(true);
	});
	on(root, '#tl-autosub', 'click', async () => {
		S.project = await api(`${P}/subtitles/auto`, {method: 'POST'});
		render();
	});
	on(root, '#tl-rp', 'click', async () => {
		await api(`${P}/render`, {method: 'POST', body: {scene_id: S.sel, quality: 'preview'}});
		toast(`Preview render queued for ${S.sel}`);
		pollJobs();
	});
	on(root, '#tl-exp', 'click', async () => {
		await api(`${P}/export`, {method: 'POST', body: {quality: 'preview'}});
		toast('Preview export queued');
		pollJobs();
	});
	on(root, '#tl-expf', 'click', async () => {
		await api(`${P}/export`, {method: 'POST', body: {quality: 'final'}});
		toast('Final export queued');
		pollJobs();
	});
	// Drag to reorder (pointer events → mouse, pen and touch).
	$$('[data-drag]', root).forEach((h) => {
		h.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const clip = h.parentElement;
			const startX = e.clientX;
			const left0 = parseFloat(clip.style.left);
			clip.classList.add('dragging');
			h.setPointerCapture(e.pointerId);
			const move = (ev) => (clip.style.left = `${left0 + ev.clientX - startX}px`);
			const up = (ev) => {
				h.removeEventListener('pointermove', move);
				h.removeEventListener('pointerup', up);
				clip.classList.remove('dragging');
				const t = (left0 + ev.clientX - startX) / S.zoom + 0.01;
				const from = sceneIdx(h.dataset.drag);
				const starts = S.timeline.starts;
				let to = starts.findIndex((st, k) => t < st + S.project.scenes[k].duration / 2);
				if (to < 0) to = S.project.scenes.length - 1;
				if (to !== from) {
					const [x] = S.project.scenes.splice(from, 1);
					S.project.scenes.splice(to, 0, x);
					S.sel = x.scene_id;
					save(true);
				} else render();
			};
			h.addEventListener('pointermove', move);
			h.addEventListener('pointerup', up);
		});
	});
	const v = $('#tl-video');
	if (v) v.addEventListener('timeupdate', () => ($('#tl-ph').style.left = `${((S.timeline.starts[i] ?? 0) + v.currentTime) * S.zoom}px`));
};

// ═══ 9. Audio studio ════════════════════════════════════════════════════════
const viewAudio = () => {
	const p = S.project;
	const tts = S.providers?.capabilities.tts;
	return `<div class="grid g2"><div class="card stack"><h2>Narration</h2>
		<div class="small">${tts?.available ? `Local TTS available: <b>${esc(tts.provider)}</b>` : 'No local TTS provider — import recorded narration per scene (or install Piper / eSpeak NG).'}</div>
		<div class="row"><button class="primary" id="au-tts" ${tts?.available ? '' : 'disabled'}>Generate all narration</button><button id="au-fit">Fit scene durations to narration</button><button id="au-sub">Auto subtitles</button></div>
		<p class="small muted">“Fit” sets each scene to its voice-over length (+0.3 s lead, +0.7 s tail) and re-times subtitles.</p></div>
	<div class="card stack"><h2>Music & mix</h2>
		<div class="small">${p.audio.music.path ? `Track: <span class="mono">${esc(p.audio.music.path)}</span> · ${esc(p.audio.music.source)}` : 'No music track'}</div>
		${p.audio.music.path ? `<audio controls preload="none" src="${fileUrl(p.audio.music.path)}" style="width:100%"></audio>` : ''}
		<div class="row"><button id="au-music">Upload music</button><button id="au-proc">Generate procedural score</button>${p.audio.music.path ? '<button class="ghost" id="au-nomusic">Remove</button>' : ''}</div>
		<div class="grid g2">${fld(`Music volume ${p.audio.music.volume}`, `<input type="range" min="0" max="1.5" step="0.05" data-bind="audio.music.volume" value="${p.audio.music.volume}"/>`)}${fld(`SFX volume ${p.audio.sfx_volume}`, `<input type="range" min="0" max="2" step="0.05" data-bind="audio.sfx_volume" value="${p.audio.sfx_volume}"/>`)}${fld(`Narration volume ${p.audio.narration_volume}`, `<input type="range" min="0" max="2" step="0.05" data-bind="audio.narration_volume" value="${p.audio.narration_volume}"/>`)}${fld('Loudness target (LUFS)', inp('audio.target_lufs', p.audio.target_lufs, 'number', 'step="1" min="-30" max="-8"'))}</div>
		<label class="check"><input type="checkbox" data-bind="audio.duck_music" ${p.audio.duck_music ? 'checked' : ''}/> Duck music under narration (side-chain)</label></div></div>
	<div class="stack" style="margin-top:14px">${p.scenes.map((s, i) => `<div class="card stack"><div class="spread"><strong>${esc(s.scene_id)}</strong><span class="small muted">scene ${fmtS(s.duration)} · voice ${s.narration_audio ? `${fmtS(s.narration_audio.duration)} (${esc(s.narration_audio.source)})` : 'none'}</span></div>
		<textarea data-bind="scenes.${i}.narration" rows="2">${esc(s.narration)}</textarea>
		${s.narration_audio ? `<audio controls preload="none" src="${fileUrl(s.narration_audio.path)}" style="width:100%"></audio>` : ''}
		${s.narration_audio && s.narration_audio.duration + 0.3 > s.duration ? '<div class="small" style="color:#f1d38a">Narration is longer than the scene — use “Fit scene durations”.</div>' : ''}
		<div class="row"><button class="sm" data-tts="${s.scene_id}" ${tts?.available && s.narration.trim() ? '' : 'disabled'}>Speak (TTS)</button><button class="sm" data-upn="${s.scene_id}">Upload narration</button>${s.narration_audio ? `<button class="sm ghost" data-rmn="${i}">Remove</button>` : ''}</div>
		${fld('Sound effects (procedural)', chips(`scenes.${i}.sound_effects`, S.schema.sound_effects, s.sound_effects))}</div>`).join('')}</div>`;
};
const bindAudio = (root) => {
	bindAll(root);
	const P = `/api/projects/${S.pid}`;
	on(root, '#au-tts', 'click', async () => {
		await api(`${P}/narration/generate`, {method: 'POST', body: {}});
		toast('Narration queued');
		pollJobs();
	});
	on(root, '[data-tts]', 'click', async (b) => {
		await api(`${P}/narration/generate`, {method: 'POST', body: {scene_ids: [b.dataset.tts]}});
		toast(`Narration queued for ${b.dataset.tts}`);
		pollJobs();
	});
	on(root, '#au-fit', 'click', async () => {
		S.project = await api(`${P}/narration/fit`, {method: 'POST'});
		await loadProject(S.pid);
		toast('Scene durations fitted to narration', 'ok');
		render();
	});
	on(root, '#au-sub', 'click', async () => {
		S.project = await api(`${P}/subtitles/auto`, {method: 'POST'});
		toast('Subtitles regenerated', 'ok');
	});
	on(root, '#au-music', 'click', async () => (await upload('music', 'audio/*')) && render());
	on(root, '#au-proc', 'click', async () => {
		S.project = await api(`${P}/music/procedural`, {method: 'POST'});
		toast('Procedural score generated', 'ok');
		render();
	});
	on(root, '#au-nomusic', 'click', () => {
		S.project.audio.music = {...S.project.audio.music, path: null, source: null};
		save(true);
	});
	on(root, '[data-upn]', 'click', async (b) => (await upload('narration', 'audio/*', {scene: b.dataset.upn})) && render());
	on(root, '[data-rmn]', 'click', (b) => {
		S.project.scenes[Number(b.dataset.rmn)].narration_audio = null;
		save(true);
	});
};

// ═══ 10. Render manager ═════════════════════════════════════════════════════
const viewRender = () => {
	const p = S.project;
	return `${p ? `<div class="card"><div class="spread"><h2>${esc(p.title)}</h2><div class="row"><button class="teal" id="rm-prev">Render all previews</button><button id="rm-final">Render all final</button><button class="primary" id="rm-exp">Export final MP4</button><button id="rm-expp">Export preview</button></div></div>
	<table style="margin-top:10px"><thead><tr><th>Scene</th><th>Method</th><th>Asset</th><th>Preview</th><th>Final</th></tr></thead><tbody>${p.scenes.map((s) => `<tr><td>${esc(s.scene_id)}</td><td class="small">${esc(S.schema.visual_types[s.visual_type].label)}</td><td>${s.visual_type === 'procedural_3d' ? '<span class="badge ok">code</span>' : s.asset ? '<span class="badge ok">ready</span>' : '<span class="badge bad">missing</span>'}</td><td>${S.renders[s.scene_id]?.preview ? '<span class="badge ok">cached</span>' : '<span class="badge">—</span>'}</td><td>${S.renders[s.scene_id]?.final ? '<span class="badge ok">cached</span>' : '<span class="badge">—</span>'}</td></tr>`).join('')}</tbody></table>
	<p class="small muted">Scenes render one by one and are cached by content: change a scene and only that scene re-renders. Pausing stops the scene in progress; it restarts on resume while finished scenes stay cached.</p></div>` : ''}
	<h2 style="margin:18px 0 10px">Queue</h2><div id="jobs"></div>`;
};
const bindRender = (root) => {
	updateJobsUI();
	if (!S.project) return;
	const P = `/api/projects/${S.pid}`;
	on(root, '#rm-prev', 'click', async () => (await api(`${P}/render`, {method: 'POST', body: {quality: 'preview'}}), pollJobs()));
	on(root, '#rm-final', 'click', async () => (await api(`${P}/render`, {method: 'POST', body: {quality: 'final'}}), pollJobs()));
	on(root, '#rm-exp', 'click', async () => (await api(`${P}/export`, {method: 'POST', body: {quality: 'final'}}), pollJobs()));
	on(root, '#rm-expp', 'click', async () => (await api(`${P}/export`, {method: 'POST', body: {quality: 'preview'}}), pollJobs()));
};

// ═══ 11. Export library ═════════════════════════════════════════════════════
const viewExports = () => {
	const fmtCls = S.project.format === '9:16' ? 'v916' : S.project.format === '1:1' ? 'v11' : '';
	return `<div class="stack">${S.exports.map((e) => {
		const q = e.report?.qc ?? {};
		return `<div class="card stack"><div class="spread"><strong>${esc(e.file.replace('exports/', ''))}</strong><div class="row"><a class="btn sm primary" href="${fileUrl(e.file)}" download>Download MP4</a>${e.srt ? `<a class="btn sm" href="${fileUrl(e.srt)}" download>SRT</a>` : ''}</div></div>
		<video class="preview ${fmtCls}" src="${fileUrl(e.file, Math.round(e.mtime))}" controls playsinline preload="metadata"></video>
		<div class="grid g4 small"><div><span class="muted">Duration</span><br>${fmtS(q.duration_s)}</div><div><span class="muted">Video</span><br>${q.width}×${q.height} · ${q.fps ? (+q.fps).toFixed(2) : '?'} fps · ${esc(q.video_codec)}</div><div><span class="muted">Size / bitrate</span><br>${q.size_mb} MB · ${q.bitrate_kbps} kb/s</div><div><span class="muted">Loudness</span><br>${q.loudness_lufs ?? '—'} LUFS · peak ${q.true_peak_dbfs ?? '—'} dBFS</div></div>
		${e.report ? `<details><summary>Report</summary><div class="small">Narration: ${e.report.audio.narration ? 'yes' : '<b>none</b>'} · Music: ${esc(e.report.audio.music ?? 'none')} · SFX layers: ${e.report.audio.sfx.length} · Ducking: ${e.report.audio.ducking ? 'on' : 'off'}</div><table><tbody>${e.report.scenes.map((s) => `<tr><td>${esc(s.scene_id)}</td><td>${fmtS(s.start)}</td><td>${fmtS(s.duration)}</td><td class="small">${esc(S.schema.visual_types[s.method]?.label ?? s.method)}</td><td class="small">${esc(s.transition)}</td></tr>`).join('')}</tbody></table></details>` : ''}</div>`;
	}).join('') || '<div class="card empty">No exports yet. Use “Export” in the Timeline Editor or Render Manager.</div>'}</div>`;
};

// ═══ 12. Settings ═══════════════════════════════════════════════════════════
const viewSettings = () => {
	const c = S.config;
	const p = S.project;
	return `<div class="grid g2">
	${p ? `<div class="card stack"><h2>Project: ${esc(p.title)}</h2>${fld('Title', inp('title', p.title))}${fld('Topic', inp('topic', p.topic))}
		<div class="grid g3">${fld('Format', sel('format', S.schema.formats, p.format))}${fld('FPS', `<select data-bind="fps" data-type="number">${S.schema.fps.map((f) => `<option ${f === p.fps ? 'selected' : ''}>${f}</option>`).join('')}</select>`)}${fld('Style', sel('style', S.schema.styles, p.style))}</div>
		<div class="grid g3">${fld('Video bitrate (kb/s)', inp('export_settings.video_bitrate_kbps', p.export_settings.video_bitrate_kbps, 'number'))}${fld('Audio bitrate (kb/s)', inp('export_settings.audio_bitrate_kbps', p.export_settings.audio_bitrate_kbps, 'number'))}${fld('Language', sel('language', S.schema.languages, p.language))}</div>
		<label class="check"><input type="checkbox" data-bind="export_settings.burn_subtitles" ${p.export_settings.burn_subtitles ? 'checked' : ''}/> Burn subtitles into the picture (a soft subtitle track is always included)</label>
		<p class="small muted">Exports are H.264 High / yuv420p / BT.709 MP4 with AAC audio at 1080p for the chosen aspect ratio.</p></div>` : ''}
	<div class="card stack"><h2>Text to speech</h2>${fld('Provider', `<select data-cfg="tts.provider">${['auto', 'piper', 'espeak', 'google', 'none'].map((x) => `<option ${c.tts.provider === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}
		<div class="grid g2">${fld('Piper binary', cfgIn('tts.piper.binary', c.tts.piper.binary))}${fld('Piper voice model (.onnx)', cfgIn('tts.piper.model', c.tts.piper.model))}</div>${fld('eSpeak speed (wpm)', cfgIn('tts.espeak.speed', c.tts.espeak.speed, 'number'))}
		<h3>Google Cloud TTS — paid</h3>${cfgChk('tts.google.enabled', c.tts.google.enabled, 'Enable adapter')}${cfgChk('tts.google.consent_paid_api', c.tts.google.consent_paid_api, 'I consent to paid API usage billed to my Google account')}
		<div class="small ${S.googleKey ? '' : 'muted'}">API key: ${S.googleKey ? 'GOOGLE_TTS_API_KEY is set' : 'set GOOGLE_TTS_API_KEY in .env (never stored in the browser)'}</div></div>
	<div class="card stack"><h2>Script writer</h2>${fld('Engine', `<select data-cfg="llm.provider"><option value="template" ${c.llm.provider === 'template' ? 'selected' : ''}>Built-in templates (editable draft)</option><option value="ollama" ${c.llm.provider === 'ollama' ? 'selected' : ''}>Local LLM via Ollama (free)</option></select>`)}<div class="grid g2">${fld('Ollama URL', cfgIn('llm.ollama_url', c.llm.ollama_url))}${fld('Model', cfgIn('llm.model', c.llm.model))}</div></div>
	<div class="card stack"><h2>Rendering</h2><div class="grid g2">${fld('WebGL backend', `<select data-cfg="render.gl">${['angle', 'swangle', 'egl', 'vulkan', 'angle-egl'].map((x) => `<option ${c.render.gl === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`)}${fld('Render concurrency', cfgIn('render.concurrency', c.render.concurrency ?? '', 'number', 'placeholder="auto" data-nullable="1"'))}</div></div>
	<div class="card stack"><h2>Access from your phone</h2><p class="small">Start the server with <span class="mono">STUDIO_HOST=0.0.0.0 STUDIO_TOKEN=yoursecret npm run studio</span>, then open <span class="mono">http://&lt;computer-ip&gt;:4555/?token=yoursecret</span> on the iPhone (same Wi-Fi). Add it to the Home Screen for a full-screen app.</p>
		${fld('Token for this browser', `<input id="st-token" value="${esc(token())}" placeholder="only needed off-device"/>`)}</div></div>`;
};
const bindSettings = (root) => {
	bindAll(root);
	bindCfg(root);
	on(root, '#st-token', 'change', (el) => localStorage.setItem('cs.token', el.value.trim()));
};

// ─── Render loop ────────────────────────────────────────────────────────────
const VIEW_FNS = {dashboard: [viewDashboard, bindDashboard], new: [viewNew, bindNew], storyboard: [viewStoryboard, bindStoryboard], characters: [viewCharacters, bindCharacters], generator: [viewGenerator, bindGenerator], env3d: [viewEnv3d, bindEnv3d], models: [viewModels, bindModels], timeline: [viewTimeline, bindTimeline], audio: [viewAudio, bindAudio], render: [viewRender, bindRender], exports: [viewExports, () => {}], settings: [viewSettings, bindSettings]};
const NEEDS = new Set(VIEWS.filter((v) => v[3]).map((v) => v[0]));
const render = () => {
	renderNav();
	const {view} = route();
	const root = $('#view');
	const scrollY = window.scrollY;
	const gate = NEEDS.has(view) ? needProject() : null;
	if (gate) {
		root.innerHTML = gate;
		return;
	}
	const [html, bind] = VIEW_FNS[view];
	root.innerHTML = html();
	bind(root);
	window.scrollTo(0, scrollY);
};
window.addEventListener('hashchange', async () => {
	$('#sheet').hidden = true;
	const {view} = route();
	if (view === 'exports' && S.pid) S.exports = await api(`/api/projects/${S.pid}/exports`).catch(() => []);
	if (view === 'dashboard') S.projects = await api('/api/projects');
	if (view === 'models') S.providers = await api('/api/providers').catch(() => S.providers);
	render();
	window.scrollTo(0, 0);
});

(async () => {
	try {
		[S.schema, S.status, S.projects] = await Promise.all([api('/api/schema'), api('/api/status'), api('/api/projects')]);
		const cfg = await api('/api/config');
		S.config = cfg.config;
		S.googleKey = cfg.google_key_present;
		S.lookdevDefault = {scene_id: 'lookdev', duration: 6, visual_type: 'procedural_3d', visual_type_locked: false, route_reason: null, environment: 'forest', visual_description: '', characters: [], camera: {shot: 'wide', movement: 'slow_forward_dolly', lens: 35, depth_of_field: true, focus_transition: null, shake: 0}, lighting: 'golden_hour', atmosphere: ['god_rays', 'dust_particles'], animation: ['swaying_trees'], narration: '', sound_effects: [], transition: 'fade', continuity_from: null, seed: 1, asset: null, generation: {status: 'not_started', method: null, provider: null, prompt: null, negative_prompt: null, settings: {}, error: null, log: [], updated_at: null}, overlays: [], subtitles: [], narration_audio: null};
		if (S.pid) await loadProject(S.pid).catch(() => ((S.pid = null), localStorage.removeItem('cs.project')));
		render();
		api('/api/providers').then((p) => {
			S.providers = p;
			if (['dashboard', 'models', 'generator', 'audio'].includes(route().view)) render();
		});
		if (route().view === 'exports' && S.pid) {
			S.exports = await api(`/api/projects/${S.pid}/exports`);
			render();
		}
		pollJobs();
	} catch (e) {
		$('#view').innerHTML = `<div class="card empty">Cannot reach the studio server: ${esc(e.message)}${/token/i.test(e.message) ? '<br>Open the link with ?token=… or set it in Settings.' : ''}</div>`;
	}
})();
