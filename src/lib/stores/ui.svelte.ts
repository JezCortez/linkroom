// UI store — panel content, help modal, nav dot hover state.

import type { SceneObjectKey } from './scene.svelte.js';
import { linkCategories } from '$lib/data/resume.js';

// ─── Panel ────────────────────────────────────────────────────────────────────

export type PanelContent = {
	title: string;
	html: string;
} | null;

export const panel = $state({
	open: false,
	content: null as PanelContent
});

/** Generate panel HTML from resume data for a given object key. */
function buildPanelContent(key: SceneObjectKey): PanelContent {
	if (!key) return null;
	if (key === 'lamp') return null;

	const category = linkCategories[key];
	if (!category) return null;

	const esc = (value: string) =>
		value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');

	const links = category.links
		.map((link) => {
			const isExternal = /^https?:\/\//.test(link.url);
			const targetAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
			const badge = link.badge ? `<span class="linktree-badge">${esc(link.badge)}</span>` : '';
			return `
				<a class="linktree-item" href="${esc(link.url)}"${targetAttrs}>
					<span class="linktree-head">
						<span class="linktree-label">${esc(link.label)}</span>
						${badge}
					</span>
					<span class="linktree-desc">${esc(link.description)}</span>
				</a>`;
		})
		.join('');

	return {
		title: category.title,
		html: `
			<div class="linktree-panel">
				<p class="linktree-subtitle">${esc(category.subtitle)}</p>
				<div class="linktree-list">${links}</div>
			</div>`
	};
}

export function openPanel(key: SceneObjectKey) {
	panel.content = buildPanelContent(key);
	panel.open = !!panel.content;
}

export function closePanel() {
	panel.open = false;
	// Delay clearing content so close animation can finish
	setTimeout(() => {
		panel.content = null;
	}, 300);
}

// ─── Help modal ───────────────────────────────────────────────────────────────

export const help = $state({ open: false });

export function toggleHelp() {
	help.open = !help.open;
}

export function closeHelp() {
	help.open = false;
}

// ─── Mobile notice ────────────────────────────────────────────────────────────

export const mobile = $state({ dismissed: false });

export function dismissMobileNotice() {
	mobile.dismissed = true;
}
