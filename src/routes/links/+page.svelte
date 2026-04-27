<script lang="ts">
	import { onMount } from 'svelte';
	import { resume, linkCategories } from '$lib/data/resume.js';

	onMount(() => {
		document.body.classList.add('scrollable');
		return () => document.body.classList.remove('scrollable');
	});
</script>

<svelte:head>
	<title>Links - {resume.about.name}</title>
	<meta name="description" content="Quick links hub for {resume.about.name}: projects, skills resources, about, and contact links." />
	<link rel="canonical" href="https://alexmorgan.dev/links" />
</svelte:head>

<div class="links-page">
	<header class="links-header">
		<a class="back" href="/">← Back to 3D Home</a>
		<h1>{resume.about.name}</h1>
		<p>{resume.about.role}</p>
	</header>

	<main class="category-grid" aria-label="Link categories">
		{#each Object.values(linkCategories) as category}
			<section class="category-card">
				<h2>{category.title}</h2>
				<p class="subtitle">{category.subtitle}</p>
				<div class="link-list">
					{#each category.links as link}
						<a class="link-item" href={link.url} target={link.url.startsWith('http') ? '_blank' : undefined} rel={link.url.startsWith('http') ? 'noopener noreferrer' : undefined}>
							<span class="row-top">
								<span class="label">{link.label}</span>
								{#if link.badge}
									<span class="badge">{link.badge}</span>
								{/if}
							</span>
							<span class="desc">{link.description}</span>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	</main>
</div>

<style>
	@import '../_page-base.css';

	.links-page {
		max-width: 1020px;
		margin: 0 auto;
		padding: 22px 20px 40px;
	}

	.links-header {
		margin-bottom: 24px;
	}

	.links-header h1 {
		margin: 10px 0 4px;
		font-size: clamp(28px, 5vw, 42px);
		color: #d7e2ff;
	}

	.links-header p {
		margin: 0;
		color: rgba(255 255 255 / 0.65);
	}

	.back {
		display: inline-block;
		padding: 6px 10px;
		border-radius: 999px;
		background: rgba(255 255 255 / 0.05);
		border: 1px solid rgba(255 255 255 / 0.12);
		text-decoration: none;
		color: #b7cbff;
		font-size: 12px;
	}

	.category-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 16px;
	}

	.category-card {
		background: rgba(15 18 40 / 0.84);
		border: 1px solid rgba(255 255 255 / 0.08);
		border-radius: 14px;
		padding: 14px;
	}

	.category-card h2 {
		margin: 0 0 5px;
		font-size: 18px;
		color: #d6e1ff;
		border: 0;
		padding: 0;
	}

	.subtitle {
		margin: 0 0 10px;
		font-size: 12px;
		line-height: 1.45;
		color: rgba(255 255 255 / 0.58);
	}

	.link-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.link-item {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 10px 11px;
		border-radius: 10px;
		border: 1px solid rgba(255 255 255 / 0.09);
		background: rgba(255 255 255 / 0.03);
		text-decoration: none;
		transition: transform 0.14s ease, border-color 0.14s ease, background 0.14s ease;
	}

	.link-item:hover {
		transform: translateY(-1px);
		border-color: rgba(140 168 255 / 0.58);
		background: rgba(76 112 220 / 0.18);
	}

	.row-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.label {
		color: #dce7ff;
		font-size: 13px;
		font-weight: 640;
	}

	.badge {
		font-size: 10px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(108 141 255 / 0.22);
		border: 1px solid rgba(108 141 255 / 0.38);
		color: #d1deff;
	}

	.desc {
		font-size: 12px;
		line-height: 1.4;
		color: rgba(255 255 255 / 0.6);
	}
</style>
