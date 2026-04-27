<script lang="ts">
	import { help, toggleHelp, closeHelp } from '$lib/stores/ui.svelte.js';
	import { sceneTime, setSceneTimeMode, type SceneTimeMode } from '$lib/stores/scene.svelte.js';

	const timeModes: Array<{ mode: SceneTimeMode; label: string }> = [
		{ mode: 'night', label: 'Night' },
		{ mode: 'auto', label: 'Auto' },
		{ mode: 'day', label: 'Day' }
	];

	function modeIndex(mode: SceneTimeMode) {
		if (mode === 'night') return 0;
		if (mode === 'day') return 2;
		return 1;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeHelp();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Scene time toggles -->
<div class="scene-time-controls" role="radiogroup" aria-label="Scene time mode">
	<div class="scene-time-track" style={`--time-index:${modeIndex(sceneTime.mode)}`}>
		<div class="scene-time-thumb" aria-hidden="true"></div>
		{#each timeModes as item}
			<button
				class="scene-time-option"
				class:active={sceneTime.mode === item.mode}
				onclick={() => setSceneTimeMode(item.mode)}
				role="radio"
				aria-checked={sceneTime.mode === item.mode}
				aria-label={`Set ${item.label.toLowerCase()} mode`}
			>
				{item.label}
			</button>
		{/each}
	</div>
</div>

<!-- Help button -->
<button
	class="help-btn"
	class:active={help.open}
	onclick={toggleHelp}
	aria-label="Controls & instructions"
	aria-expanded={help.open}
>?</button>

<!-- Modal -->
{#if help.open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="help-modal"
		role="dialog"
		aria-modal="true"
		aria-label="Controls & Instructions"
	>
		<div class="help-title">Controls &amp; Guide</div>

		<section class="help-section">
			<div class="help-section-label">Navigate</div>
			{#each [
				['🖱️', 'Drag',         'Orbit / rotate the room'],
				['⚙️', 'Scroll',        'Zoom in & out'],
				['👆', 'Click object',  'Fly to it and open detail panel'],
				['⎋',  'Esc',           'Close panel and reset view'],
			] as [icon, key, val]}
				<div class="help-row">
					<span class="help-icon" aria-hidden="true">{icon}</span>
					<span class="help-row-text">
						<span class="help-key">{key}</span>
						<span class="help-val">{val}</span>
					</span>
				</div>
			{/each}
		</section>

		<hr class="help-divider" />

		<section class="help-section">
			<div class="help-section-label">Interactive Objects</div>
			{#each [
				['🖥️', 'Gaming',     'Game-related links'],
				['📚', 'Socials',  'Social and community links'],
				['📺', 'Development', 'Development links'],
				['🧑', 'Me',  'Personal links'],
				['💡', 'Desk Lamp',  'Click to toggle the lamp on / off'],
			] as [icon, key, val]}
				<div class="help-row">
					<span class="help-icon" aria-hidden="true">{icon}</span>
					<span class="help-row-text">
						<span class="help-key">{key}</span>
						<span class="help-val">{val}</span>
					</span>
				</div>
			{/each}
		</section>

		<hr class="help-divider" />

		<p class="help-tip">
			Room lighting changes with the real time of day.
			Use the Night / Auto / Day slider to override it anytime.
			The developer goes to bed at 11&nbsp;PM and returns to the desk at&nbsp;7&nbsp;AM.
		</p>

		<button class="help-close" onclick={closeHelp} aria-label="Close help">✕</button>
	</div>

	<!-- Backdrop -->
	<button class="modal-backdrop" onclick={closeHelp} aria-label="Close help" tabindex="-1"></button>
{/if}

<style>
	.scene-time-controls {
		position: fixed;
		bottom: 24px;
		right: 72px;
		z-index: 15;
	}

	.scene-time-track {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		align-items: center;
		gap: 0;
		width: 210px;
		height: 38px;
		padding: 2px;
		border-radius: 999px;
		background: rgba(255 255 255 / 0.08);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255 255 255 / 0.2);
	}

	.scene-time-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: calc((100% - 4px) / 3);
		height: calc(100% - 4px);
		border-radius: 999px;
		background: rgba(100 130 255 / 0.3);
		border: 1px solid rgba(140 170 255 / 0.55);
		transform: translateX(calc(var(--time-index) * 100%));
		transition: transform 0.2s ease;
		pointer-events: none;
	}

	.scene-time-option {
		position: relative;
		height: 100%;
		border: none;
		background: transparent;
		color: rgba(255 255 255 / 0.62);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.02em;
		cursor: pointer;
		transition: color 0.15s;
		z-index: 1;
	}

	.scene-time-option:hover,
	.scene-time-option.active {
		color: #fff;
	}

	@media (max-width: 640px) {
		.scene-time-controls {
			right: 68px;
		}

		.scene-time-track {
			width: 186px;
		}

		.scene-time-option {
			font-size: 11px;
		}
	}

	.help-btn {
		position: fixed;
		bottom: 24px;
		right: 24px;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: rgba(255 255 255 / 0.12);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255 255 255 / 0.2);
		color: rgba(255 255 255 / 0.75);
		font-size: 18px;
		font-weight: 700;
		cursor: pointer;
		z-index: 15;
		transition: background 0.15s, color 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.help-btn:hover,
	.help-btn.active {
		background: rgba(100 130 255 / 0.3);
		color: #fff;
	}

	.help-modal {
		position: fixed;
		bottom: 70px;
		right: 24px;
		width: min(340px, 90vw);
		max-height: 70vh;
		overflow-y: auto;
		background: rgba(10 12 28 / 0.94);
		backdrop-filter: blur(16px);
		border: 1px solid rgba(100 130 255 / 0.2);
		border-radius: 16px;
		padding: 20px 20px 18px;
		z-index: 30;
		color: #e8eeff;
		box-shadow: 0 16px 60px rgba(0 0 0 / 0.6);
	}

	.help-title {
		font-size: 15px;
		font-weight: 700;
		margin-bottom: 16px;
		color: #c8d8ff;
	}

	.help-section {
		margin-bottom: 4px;
	}

	.help-section-label {
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: rgba(255 255 255 / 0.35);
		margin-bottom: 10px;
	}

	.help-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-bottom: 8px;
	}

	.help-icon {
		font-size: 16px;
		width: 20px;
		flex-shrink: 0;
	}

	.help-row-text {
		display: flex;
		gap: 6px;
		font-size: 13px;
		flex-wrap: wrap;
	}

	.help-key {
		font-weight: 600;
		color: #a0b8ff;
	}

	.help-val {
		color: rgba(255 255 255 / 0.6);
	}

	.help-divider {
		border: none;
		border-top: 1px solid rgba(255 255 255 / 0.08);
		margin: 14px 0;
	}

	.help-tip {
		font-size: 12px;
		color: rgba(255 255 255 / 0.4);
		line-height: 1.6;
		margin: 0;
	}

	.help-close {
		position: absolute;
		top: 10px;
		right: 12px;
		background: none;
		border: none;
		color: rgba(255 255 255 / 0.4);
		cursor: pointer;
		font-size: 14px;
		padding: 4px 6px;
		border-radius: 4px;
		transition: color 0.15s;
	}

	.help-close:hover {
		color: #fff;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 29;
		background: transparent;
		border: none;
	}
</style>
