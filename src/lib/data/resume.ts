// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResumeLink {
	label: string;
	url: string;
	type: 'primary' | 'secondary';
}

export interface ResumeAbout {
	name: string;
	role: string;
	bio: string;
	facts: string[];
	links: ResumeLink[];
}

export interface ResumeProject {
	name: string;
	desc: string;
	tech: string[];
	url?: string;
}

export interface ResumeSkills {
	frontend: string[];
	backend: string[];
	tools: string[];
}

export interface ResumeContact {
	email: string;
	github: string;
	linkedin: string;
	twitter: string;
	location: string;
	available: boolean;
}

export interface ResumeData {
	about: ResumeAbout;
	projects: ResumeProject[];
	skills: ResumeSkills;
	contact: ResumeContact;
}

export interface CategoryLink {
	label: string;
	url: string;
	description: string;
	badge?: string;
}

export interface LinkCategory {
	title: string;
	subtitle: string;
	links: CategoryLink[];
}

export interface LinkCategoryMap {
	laptop: LinkCategory;
	bookshelf: LinkCategory;
	frame: LinkCategory;
	character: LinkCategory;
}

// Optional external links hub (e.g. deployed Linkcard).
// Leave empty to keep using the local /links page.
export const linksHubUrl = '';

export const resume: ResumeData = {
	about: {
		name: 'Jez Kendrick Cortez',
		role: 'Frontend Developer',
		bio: 'I build interactive web experiences with clean UI, strong UX fundamentals, and immersive 3D touches.',
		facts: ['Focused on modern frontend engineering', 'Open to collaboration opportunities', 'Gaming and web-tech enthusiast'],
		links: [
			{ label: 'GitHub', url: 'https://github.com/JezCortez', type: 'primary' },
			{ label: 'Portfolio', url: 'https://jezcortez.dev', type: 'secondary' },
			{ label: 'Resume PDF', url: '/resume.pdf', type: 'secondary' }
		]
	},
	projects: [
		{
			name: 'LinkRoom',
			desc: 'An interactive 3D link hub inspired by gaming rooms and portfolio storytelling.',
			tech: ['SvelteKit', 'Three.js', 'TypeScript', 'GSAP']
		},
		{
			name: 'Personal Portfolio',
			desc: 'A responsive personal website highlighting projects, social links, and developer profile.',
			tech: ['SvelteKit', 'Vite', 'CSS']
		}
	],
	skills: {
		frontend: ['SvelteKit', 'TypeScript', 'Three.js', 'GSAP', 'Responsive CSS'],
		backend: ['Node.js', 'REST APIs'],
		tools: ['Git/GitHub', 'Vite', 'VS Code', 'Figma']
	},
	contact: {
		email: 'jezcortez31@gmail.com',
		github: 'github.com/JezCortez',
		linkedin: 'www.linkedin.com/in/jez-kendrick-cortez-8b7580338',
		twitter: '@Jezzy_31',
		location: 'Philippines',
		available: true
	}
};

// ─── Data ─────────────────────────────────────────────────────────────────────
// Edit this file to update your portfolio content.
// The 3D scene reads from this same source, so changes here update both the
// interactive room labels AND the SEO-friendly HTML fallback pages.

export const linkCategories: LinkCategoryMap = {
	laptop: {
		title: 'Gaming',
		subtitle: 'Lets go Gaming!',
		links: [
			{ label: 'Discord', url: 'https://discord.com/users/533917065044557835', description: 'Game invites and VCs', badge: 'Featured' },
			{ label: 'Steam', url: 'https://steamcommunity.com/id/jezzyofficial/', description: 'My Steam Profile' },
			{ label: 'YouTube', url: 'https://www.youtube.com/@jezzy4491', description: 'I record games sometimes' },
			{ label: 'Twitch', url: 'https://www.twitch.tv/jezzyboi/about', description: 'I never stream lmao' }
		]
	},
	bookshelf: {
		title: 'Socials',
		subtitle: 'My social links',
		links: [
			{ label: 'Facebook', url: 'https://www.facebook.com/jez.kendrick.cortez/', description: 'Facebook', badge: 'Main' },
			{ label: 'Twitter/X', url: 'https://x.com/Jezzy_31', description: 'X updates' },
			{ label: 'Instagram', url: 'https://www.instagram.com/jez_cortez/', description: 'Photos and shii' },
			{ label: 'Threads', url: 'https://www.threads.com/', description: 'Same same with X but different' }
		]
	},
	frame: {
		title: 'Development',
		subtitle: 'More context about who I am and how I work.',
		links: [
			{ label: 'Portfolio Website', url: 'https://jezcortez.dev', description: 'My Portfolio Website', badge: 'Portfolio' },
			{ label: 'GitHub', url: 'https://github.com/JezCortez', description: 'Code, open-source, and collaborations.' },
			{ label: 'Dev.to', url: 'https://dev.to/jez_cortez_ba0267014fe942', description: 'Dev Community' },
			{ label: 'Dribble', url: 'https://dribbble.com/jez-kendrick-cortez', description: 'UI/UX Design' }
		]
	},
	character: {
		title: 'Me',
		subtitle: 'All about me, Contact me here.',
		links: [
			{ label: 'Email', url: 'mailto:jezcortez31@gmail.com', description: 'Project Inquiries and quick contact.', badge: 'Fastest' },
			{ label: 'Resume', url: '/resume.pdf', description: 'View or download my resume (PDF).' },
			{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/jez-kendrick-cortez-8b7580338', description: 'Professional profile and experience.' },
			{ label: 'GitHub', url: 'https://github.com/JezCortez', description: 'Code, open-source, and collaborations.' }
		]
	}
};