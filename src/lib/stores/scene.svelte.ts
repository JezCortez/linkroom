// Scene store — reactive state shared between Scene.svelte and UI components.
// Written as a Svelte 5 rune module (.svelte.ts) so $state works outside components.

export type SceneObjectKey = 'laptop' | 'bookshelf' | 'frame' | 'character' | 'lamp' | null;

export type LoadStage =
	| 'idle'
	| 'renderer'
	| 'lights'
	| 'room'
	| 'furniture'
	| 'character'
	| 'ready';

// ─── Loading ──────────────────────────────────────────────────────────────────

export const loading = $state({
	/** 0–100 */
	progress: 0,
	hint: 'Initialising scene…',
	stage: 'idle' as LoadStage,
	done: false
});

export function setProgress(pct: number, hint: string, stage?: LoadStage) {
	loading.progress = pct;
	loading.hint = hint;
	if (stage) loading.stage = stage;
	if (pct >= 100) loading.done = true;
}

// ─── Focused object (camera fly-to) ──────────────────────────────────────────

export const focus = $state({
	/** Which interactive object is currently focused (camera flew to it). */
	key: null as SceneObjectKey
});

export function setFocus(key: SceneObjectKey) {
	focus.key = key;
}

// ─── Lamp ─────────────────────────────────────────────────────────────────────

export const lamp = $state({ on: true });

export function toggleLamp() {
	lamp.on = !lamp.on;
}

// ─── Time simulation ──────────────────────────────────────────────────────────

export type SceneTimeMode = 'auto' | 'night' | 'day';

export const sceneTime = $state({
	/**
	 * auto: use real clock (or setSimHour if used)
	 * night: force around 1:30 AM
	 * day: force around 1:00 PM
	 */
	mode: 'auto' as SceneTimeMode
});

export function toggleNightScene() {
	sceneTime.mode = sceneTime.mode === 'night' ? 'auto' : 'night';
}

export function setNightScene(forceNight: boolean) {
	sceneTime.mode = forceNight ? 'night' : 'auto';
}

export function toggleDayScene() {
	sceneTime.mode = sceneTime.mode === 'day' ? 'auto' : 'day';
}

export function setSceneTimeMode(mode: SceneTimeMode) {
	sceneTime.mode = mode;
}

export const clock = $state({
	/** Simulated hours (0–23) */
	hour: new Date().getHours(),
	/** Simulated minutes */
	minute: new Date().getMinutes(),
	/** 0 = night, 1 = day */
	dayT: 0
});

export function updateClock(hour: number, minute: number, dayT: number) {
	clock.hour = hour;
	clock.minute = minute;
	clock.dayT = dayT;
}

// ─── WebGL support ────────────────────────────────────────────────────────────

export const webgl = $state({
	supported: true,
	checked: false
});

export function setWebGLSupport(supported: boolean) {
	webgl.supported = supported;
	webgl.checked = true;
}
