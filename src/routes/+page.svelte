<script lang="ts">
	// +page.svelte — Main page: 3D scene + all UI overlays.
	//
	// Composition pattern: this page is pure orchestration.
	// Each component reads from stores; stores talk to the scene.
	// The page itself holds NO state — it's a thin shell.

	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { linksHubUrl } from '$lib/data/resume.js';

	// Three.js scene (lazy-imported — excluded from SSR bundle entirely)
	let SceneComponent: typeof import('$lib/components/Scene.svelte').default | null = $state(null);

	// UI overlay components (these are fine to import statically)
	import LoadingScreen  from '$lib/components/UI/LoadingScreen.svelte';
	import Panel          from '$lib/components/UI/Panel.svelte';
	import NavDots        from '$lib/components/UI/NavDots.svelte';
	import HelpModal      from '$lib/components/UI/HelpModal.svelte';
	import HintBar        from '$lib/components/UI/HintBar.svelte';
	import MobileNotice   from '$lib/components/UI/MobileNotice.svelte';
	import FallbackContent from '$lib/components/UI/FallbackContent.svelte';

	// Lazy-load Three.js only on the client — never SSR.
	// This keeps the SSR bundle ~0kb for Three.js (it's 600kb+).
	onMount(async () => {
		const mod = await import('$lib/components/Scene.svelte');
		SceneComponent = mod.default;
	});

	const linksShortcutHref = linksHubUrl || `${base}/links`;
	const linksShortcutExternal = /^https?:\/\//.test(linksShortcutHref);
</script>

<!-- ── UI overlay stack (z-index layered above canvas) ───────────────────── -->

<!-- 1. Mobile notice (highest priority, shown before anything loads) -->
<MobileNotice />

<!-- 2. Loading screen (fades out when scene.loading.done = true) -->
<LoadingScreen />

<!-- 3. Three.js canvas — rendered client-side only after onMount -->
{#if SceneComponent}
	<SceneComponent />
{/if}

<!-- 4. SEO fallback — always in DOM, visually hidden when WebGL active -->
<FallbackContent />

<!-- 5. Nav dots (left side) -->
<NavDots />

<!-- 6. Detail panel (slides in from right on object click) -->
<Panel />

<!-- 7. Hint bar (bottom center, dismisses on first interaction) -->
<HintBar />

<!-- 8. Help modal + button (bottom right) -->
<HelpModal />

<!-- 9. Quick links route shortcut -->
<a
	class="links-shortcut"
	href={linksShortcutHref}
	target={linksShortcutExternal ? '_blank' : undefined}
	rel={linksShortcutExternal ? 'noopener noreferrer' : undefined}
	aria-label="Open links page"
>Open Links</a>

<style>
	.links-shortcut {
		position: fixed;
		top: 20px;
		right: 20px;
		z-index: 18;
		padding: 9px 14px;
		border-radius: 999px;
		border: 1px solid rgba(255 255 255 / 0.22);
		background: rgba(10 14 34 / 0.55);
		backdrop-filter: blur(10px);
		color: #d9e4ff;
		text-decoration: none;
		font-size: 12px;
		font-weight: 650;
		letter-spacing: 0.03em;
		transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
	}

	.links-shortcut:hover {
		transform: translateY(-1px);
		background: rgba(70 105 225 / 0.42);
		border-color: rgba(150 180 255 / 0.62);
	}

	@media (max-width: 640px) {
		.links-shortcut {
			top: 14px;
			right: 14px;
			padding: 8px 12px;
			font-size: 11px;
		}
	}
</style>
