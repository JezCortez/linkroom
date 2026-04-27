<script lang="ts">
	// Scene.svelte — Three.js canvas wrapper.
	// All scene code runs inside onMount (client-only, never SSR).
	// $effect bridges Svelte store state → Three.js imperatively.

	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import gsap from 'gsap';

	import { setProgress, setFocus, focus, lamp, sceneTime, setWebGLSupport, updateClock } from '$lib/stores/scene.svelte.js';
	import { openPanel, closePanel } from '$lib/stores/ui.svelte.js';

	let canvasEl: HTMLCanvasElement;
	let labelsEl: HTMLDivElement;

	// Three.js refs kept outside reactive state
	let renderer: THREE.WebGLRenderer;
	let camera: THREE.PerspectiveCamera;
	let controls: OrbitControls;
	let scene: THREE.Scene;
	let raf: number;

	// Mutable scene state (plain JS, not Svelte reactive)
	let lampOn = true;
	let lampLightRef: THREE.PointLight;
	let lampShadeMat: THREE.MeshStandardMaterial;
	let lampBulbMesh: THREE.Mesh;
	let lampLightBase = 9.0;
	let deskGlowBase = 2.2;
	let deskGlowRef: THREE.PointLight;
	let laptopScreenMats: any[] = [];
	let lampMeshes: THREE.Object3D[] = [];
	let allInteractiveMeshes: THREE.Object3D[] = [];
	let focusedObject: any = null;
	let hoveredObject: any = null;
	let isAnimating = false;
	let charState = 'sitting';
	let characterGroupRef: THREE.Group;
	let bedBodyLumpRef: THREE.Group;
	let particleGeoRef: THREE.BufferGeometry;
	let labelEls: Record<string, HTMLElement> = {};
	let labelDefs: any[] = [];
	let interactiveObjects: any[] = [];
	let focusObjectFn: ((obj: any) => void) | null = null;
	let hourPivot: THREE.Group, minPivot: THREE.Group, secPivot: THREE.Group;
	let winPaneMats: THREE.MeshStandardMaterial[] = [];
	let winLightRef: THREE.PointLight;
	let fillLeftRef: THREE.PointLight, fillRightRef: THREE.PointLight;
	let ceilBounceRef: THREE.PointLight, charLightRef: THREE.PointLight;
	let ambientRef: THREE.AmbientLight, dirLightRef: THREE.DirectionalLight;
	let nightLightPtRef: THREE.SpotLight;
	let ceilPanelRef: THREE.Mesh;
	let tvScreenMat: THREE.MeshStandardMaterial;
	let tvUiMats: THREE.MeshStandardMaterial[] = [];
	let tvPowerLedMat: THREE.MeshStandardMaterial;

	const DEFAULT_CAM_POS = new THREE.Vector3(0, 2.8, 5.2);
	const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 1.4, -3.5);

	// ── $effect: lamp store → Three.js ────────────────────────────────────────
	$effect(() => {
		const isOn = lamp.on;
		if (!lampLightRef) return;
		lampOn = isOn;
		if (isOn) {
			lampLightRef.intensity = lampLightBase;
			if (lampShadeMat) { lampShadeMat.emissive.set(0xffaa44); lampShadeMat.emissiveIntensity = 3.0; }
			if (lampBulbMesh) (lampBulbMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 5.0;
		} else {
			lampLightRef.intensity = 0;
			if (lampShadeMat) { lampShadeMat.emissive.set(0x000000); lampShadeMat.emissiveIntensity = 0; }
			if (lampBulbMesh) (lampBulbMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
		}
	});

	// ── $effect: focus store → Three.js (from nav dots) ──────────────────────
	$effect(() => {
		const key = focus.key;
		if (!key || !focusObjectFn) return;
		const obj = interactiveObjects.find((o: any) => o.key === key);
		if (obj && (!focusedObject || focusedObject.key !== key)) focusObjectFn(obj);
	});

	onMount(() => {
		// WebGL detection
		try {
			const c = document.createElement('canvas');
			if (!c.getContext('webgl2') && !c.getContext('webgl')) { setWebGLSupport(false); return; }
		} catch { setWebGLSupport(false); return; }
		setWebGLSupport(true);

		const isMobile = window.innerWidth <= 600 || ('ontouchstart' in window && window.innerWidth <= 1024);

		/* ── Renderer ─────────────────────────────────────────────── */
		renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: !isMobile });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.shadowMap.enabled = !isMobile;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 2.2;

		/* ── Scene ────────────────────────────────────────────────── */
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x131325);
		scene.fog = new THREE.FogExp2(0x131325, 0.016);

		/* ── Camera ───────────────────────────────────────────────── */
		camera = new THREE.PerspectiveCamera(isMobile ? 65 : 55, window.innerWidth / window.innerHeight, 0.1, 60);
		camera.position.set(0, 7, 14);
		camera.lookAt(DEFAULT_CAM_TARGET);

		/* ── Controls ─────────────────────────────────────────────── */
		controls = new OrbitControls(camera, renderer.domElement);
		controls.target.copy(DEFAULT_CAM_TARGET);
		controls.enableDamping = true;
		controls.dampingFactor = 0.07;
		controls.minDistance = isMobile ? 2 : 2.5;
		controls.maxDistance = isMobile ? 12 : 9;
		controls.maxPolarAngle = Math.PI / 2.08;
		controls.minPolarAngle = 0.15;
		controls.enabled = false;

		setProgress(15, 'Setting up lights…');

		/* ── Lights ───────────────────────────────────────────────── */
		const ambient = new THREE.AmbientLight(0xc8d0ff, 1.4);
		scene.add(ambient); ambientRef = ambient;

		const dirLight = new THREE.DirectionalLight(0xfff8f0, 2.8);
		dirLight.position.set(5, 10, 6);
		dirLight.castShadow = true;
		dirLight.shadow.mapSize.set(1024, 1024);
		dirLight.shadow.camera.near = 0.5; dirLight.shadow.camera.far = 40;
		dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -10;
		dirLight.shadow.camera.right = dirLight.shadow.camera.top = 10;
		dirLight.shadow.bias = -0.001;
		scene.add(dirLight); dirLightRef = dirLight;

		const fillLeft = new THREE.PointLight(0x88aaff, 1.5, 14);
		fillLeft.position.set(-4, 4.5, -3); scene.add(fillLeft); fillLeftRef = fillLeft;

		const fillRight = new THREE.PointLight(0xffddbb, 1.4, 14);
		fillRight.position.set(4, 4.5, -4); scene.add(fillRight); fillRightRef = fillRight;

		deskGlowBase = 2.2;
		const deskGlow = new THREE.PointLight(0xffbb66, deskGlowBase, 5);
		deskGlow.position.set(-0.3, 3.2, -5.5); scene.add(deskGlow); deskGlowRef = deskGlow;

		lampLightBase = 9.0;
		const lampLight = new THREE.PointLight(0xffcc77, lampLightBase, 18);
		lampLight.castShadow = false;
		lampLight.position.set(1.2, 2.8, -4.0); scene.add(lampLight); lampLightRef = lampLight;

		const ceilBounce = new THREE.PointLight(0xaabbff, 1.3, 16);
		ceilBounce.position.set(0, 6.0, -5.0); scene.add(ceilBounce); ceilBounceRef = ceilBounce;

		const charLight = new THREE.PointLight(0xffeedd, 1.3, 7);
		charLight.position.set(2, 4, -1.5); scene.add(charLight); charLightRef = charLight;

		setProgress(28, 'Building room…');

		/* ── Material helpers ─────────────────────────────────────── */
		const mat = (c: number, o: any = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.78, metalness: 0.04, ...o });
		const gloss = (c: number, o: any = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 0.35, ...o });
		const emMat = (c: number, e: number, i = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: i, roughness: 0.4 });

		/* ═══════════════════════════════════════════════════════════
		   ROOM
		═══════════════════════════════════════════════════════════ */
		const ROOM_W = 10, ROOM_D = 9, ROOM_H = 6.5, ROOM_CZ = -4.0;
		const wallColor = 0x1e1e3a, wallColor2 = 0x1c1c38;
		const wainscotColor = 0x252545, trimColor = 0x2e2e52;

		// Floor
		const floorBase = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshStandardMaterial({ color: 0x1e1e36, roughness: 0.9 }));
		floorBase.rotation.x = -Math.PI / 2; floorBase.position.set(0, 0, ROOM_CZ); floorBase.receiveShadow = true; scene.add(floorBase);
		for (let i = 0; i < 12; i++) {
			const plank = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, 0.005), new THREE.MeshStandardMaterial({ color: 0x28284a, roughness: 0.95 }));
			plank.rotation.x = -Math.PI / 2; plank.position.set(0, 0.001, ROOM_CZ - ROOM_D / 2 + (i + 1) * (ROOM_D / 13)); scene.add(plank);
		}
		const grid = new THREE.GridHelper(ROOM_W, 14, 0x2a2a4a, 0x222240);
		grid.position.set(0, 0.002, ROOM_CZ); scene.add(grid);

		// Back wall
		const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_H), mat(wallColor, { roughness: 0.92 }));
		backWall.position.set(0, ROOM_H / 2, -8.5); backWall.receiveShadow = true; scene.add(backWall);
		// Left wall
		const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), mat(wallColor2, { roughness: 0.92 }));
		leftWall.position.set(-5, ROOM_H / 2, ROOM_CZ); leftWall.rotation.y = Math.PI / 2; leftWall.receiveShadow = true; scene.add(leftWall);
		// Right wall
		const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, ROOM_H), mat(wallColor2, { roughness: 0.92 }));
		rightWall.position.set(5, ROOM_H / 2, ROOM_CZ); rightWall.rotation.y = -Math.PI / 2; rightWall.receiveShadow = true; scene.add(rightWall);
		// Ceiling
		const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), mat(0x14142a));
		ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOM_H, ROOM_CZ); scene.add(ceil);

		// Wainscoting
		([[ROOM_W, 0, ROOM_H / 2, -8.47, 0], [ROOM_D, -5 + 0.03, ROOM_H / 2, ROOM_CZ, Math.PI / 2], [ROOM_D, 5 - 0.03, ROOM_H / 2, ROOM_CZ, Math.PI / 2]] as any[]).forEach(([w, x, _y, z, ry]) => {
			const lower = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3), mat(wainscotColor, { roughness: 0.88 }));
			lower.position.set(x, 0.65, z); if (ry) lower.rotation.y = ry; scene.add(lower);
			const rail = new THREE.Mesh(new THREE.BoxGeometry(ry ? 0.07 : w, 0.055, ry ? w : 0.07), mat(trimColor, { roughness: 0.7 }));
			rail.position.set(x ? x * 0.98 : 0, 1.32, z); scene.add(rail);
		});

		// Skirting boards
		([[ROOM_W, new THREE.Vector3(0, 0.09, -8.46), 0], [ROOM_D, new THREE.Vector3(-4.97, 0.09, ROOM_CZ), Math.PI / 2], [ROOM_D, new THREE.Vector3(4.97, 0.09, ROOM_CZ), Math.PI / 2]] as any[]).forEach(([w, pos, ry]) => {
			const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.06), mat(trimColor));
			m.position.copy(pos); m.rotation.y = ry; scene.add(m);
		});

		// Crown molding
		([[ROOM_W, new THREE.Vector3(0, 6.44, -8.46), 0], [ROOM_D, new THREE.Vector3(-4.97, 6.44, ROOM_CZ), Math.PI / 2], [ROOM_D, new THREE.Vector3(4.97, 6.44, ROOM_CZ), Math.PI / 2]] as any[]).forEach(([w, pos, ry]) => {
			const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.08), mat(trimColor));
			m.position.copy(pos); m.rotation.y = ry; scene.add(m);
		});

		// Ceiling light panel
		const ceilPanel = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.04, 0.7), emMat(0xffffff, 0xbbccff, 0.65));
		ceilPanel.position.set(0, 6.48, ROOM_CZ); scene.add(ceilPanel); ceilPanelRef = ceilPanel;

		// Window on left wall
		let winLight: THREE.PointLight;
		{
			const winX = -4.97, winY = 3.3, winZ = -5.8, winW = 1.4, winH = 1.2;
			const frameMat = mat(0x2a2a48, { roughness: 0.6 });
			([[winW + 0.12, 0.08, 0.06, 0, winH / 2 + 0.04, 0], [winW + 0.12, 0.08, 0.06, 0, -winH / 2 - 0.04, 0], [0.08, winH, 0.06, -winW / 2 - 0.04, 0, 0], [0.08, winH, 0.06, winW / 2 + 0.04, 0, 0], [0.04, winH, 0.06, 0, 0, 0], [winW, 0.04, 0.06, 0, 0, 0]] as any[]).forEach(([w, h, d, ox, oy]) => {
				const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
				bar.position.set(winX + 0.04, winY + oy, winZ + ox); bar.rotation.y = Math.PI / 2; scene.add(bar);
			});
			([[-winW / 4, winH / 4], [winW / 4, winH / 4], [-winW / 4, -winH / 4], [winW / 4, -winH / 4]] as any[]).forEach(([ox, oy]) => {
				const paneMat = new THREE.MeshStandardMaterial({ color: 0x0a0a20, emissive: 0x0a0a20, emissiveIntensity: 0.3, roughness: 0.4 });
				winPaneMats.push(paneMat);
				const pane = new THREE.Mesh(new THREE.PlaneGeometry(winW / 2 - 0.06, winH / 2 - 0.06), paneMat);
				pane.position.set(winX + 0.03, winY + oy, winZ + ox); pane.rotation.y = Math.PI / 2; scene.add(pane);
			});
			winLight = new THREE.PointLight(0xaaccff, 0.05, 8);
			winLight.position.set(winX + 0.5, winY, winZ); scene.add(winLight); winLightRef = winLight;
		}

		// Wall panels
		for (let i = 0; i < 3; i++) {
			const pw = 2.2, ph = 0.85, px = -3.3 + i * 3.3;
			const pf = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.12, ph + 0.1, 0.03), mat(wainscotColor, { roughness: 0.85 }));
			pf.position.set(px, 0.72, -8.47); scene.add(pf);
			const pi = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.025), mat(wallColor, { roughness: 0.95 }));
			pi.position.set(px, 0.72, -8.455); scene.add(pi);
		}

		// Area rug
		const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.2), mat(0x2d1a40, { roughness: 0.95 }));
		rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.003, -3.2); scene.add(rug);
		const rugBorder = new THREE.Mesh(new THREE.PlaneGeometry(5.08, 3.48), mat(0x4a2a62, { roughness: 0.95 }));
		rugBorder.rotation.x = -Math.PI / 2; rugBorder.position.set(0, 0.002, -3.2); scene.add(rugBorder);
		const rugPattern = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.2), mat(0x3a1e52, { roughness: 0.95 }));
		rugPattern.rotation.x = -Math.PI / 2; rugPattern.position.set(0, 0.004, -3.2); scene.add(rugPattern);

		setProgress(42, 'Placing furniture…');

		/* ═══════════════════════════════════════════════════════════
		   DESK
		═══════════════════════════════════════════════════════════ */
		{
			const deskWood = gloss(0x3a2010, { roughness: 0.45, metalness: 0.05 });
			const deskFrame = gloss(0x2c1a0c, { roughness: 0.5 });
			const DX = -0.3, DZ = -6.5;
			const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.45), deskWood);
			top.position.set(DX, 1.08, DZ); top.castShadow = top.receiveShadow = true; scene.add(top);
			([[DX - 1.5, 0.65], [DX + 1.5, 0.65], [DX - 1.5, -0.65], [DX + 1.5, -0.65]] as any[]).forEach(([x, zo]) => {
				const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.08, 0.07), deskFrame);
				leg.position.set(x, 0.54, DZ + zo); leg.castShadow = true; scene.add(leg);
			});
		}

		/* ═══════════════════════════════════════════════════════════
		   DESK LAMP (clickable)
		═══════════════════════════════════════════════════════════ */
		const lampGroup = new THREE.Group();
		{
			const LX = 0.7, LY = 1.13, LZ = -6.15;
			const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.25, metalness: 0.85 });
			const shadeMat = new THREE.MeshStandardMaterial({ color: 0xffeecc, emissive: 0xffaa44, emissiveIntensity: 1.8, roughness: 0.55, side: THREE.DoubleSide });
			lampShadeMat = shadeMat;

			const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.04, 16), metalMat);
			base.castShadow = true; lampGroup.add(base);
			const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.020, 0.74, 10), metalMat);
			pole.position.set(0, 0.39, 0); pole.castShadow = true; lampGroup.add(pole);
			const topJoint = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), metalMat);
			topJoint.position.set(0, 0.76, 0); lampGroup.add(topJoint);
			const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.30, 10), metalMat);
			arm.rotation.x = Math.PI / 2; arm.position.set(0, 0.76, 0.15); arm.castShadow = true; lampGroup.add(arm);
			const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 0.20, 20, 1, true), shadeMat);
			shade.position.set(0, 0.65, 0.30); lampGroup.add(shade);
			const shadeCap = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
			shadeCap.rotation.x = -Math.PI / 2; shadeCap.position.set(0, 0.75, 0.30); lampGroup.add(shadeCap);
			const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 3.0 }));
			bulb.position.set(0, 0.66, 0.30); lampGroup.add(bulb); lampBulbMesh = bulb;

			lampGroup.position.set(LX, LY, LZ); scene.add(lampGroup);
			lampGroup.traverse((c: any) => { if (c.isMesh) lampMeshes.push(c); });
		}

		/* ═══════════════════════════════════════════════════════════
		   GAMING PC SETUP → Projects
		═══════════════════════════════════════════════════════════ */
		const laptopGroup = new THREE.Group();
		{
			const deskPadMat = mat(0x12121a, { roughness: 0.92 });
			const caseMat = gloss(0x1f2028, { roughness: 0.24, metalness: 0.62 });
			const trimMat = gloss(0x2d2f3a, { roughness: 0.3, metalness: 0.58 });
			const glassMat = new THREE.MeshPhysicalMaterial({
				color: 0xffffff,
				roughness: 0.02,
				metalness: 0,
				transmission: 0.95,
				ior: 1.45,
				thickness: 0.01,
				transparent: true,
				opacity: 0.14,
				depthWrite: false,
				side: THREE.DoubleSide
			});

			const deskPad = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.012, 0.75), deskPadMat);
			deskPad.position.set(0.08, 0.006, 0.0); laptopGroup.add(deskPad);

			const caseW = 0.46, caseH = 0.9, caseD = 0.84;
			const caseGroup = new THREE.Group();
			([
				[caseW, 0.03, caseD, 0, caseH / 2 - 0.015, 0],
				[caseW, 0.03, caseD, 0, -caseH / 2 + 0.015, 0],
				[caseW, caseH, 0.03, 0, 0, -caseD / 2 + 0.015],
				[0.03, caseH, caseD, caseW / 2 - 0.015, 0, 0],
				[0.03, caseH, 0.12, -caseW / 2 + 0.015, 0, -caseD / 2 + 0.06],
				[0.03, caseH, 0.12, -caseW / 2 + 0.015, 0, caseD / 2 - 0.06],
				[0.03, 0.12, caseD - 0.24, -caseW / 2 + 0.015, caseH / 2 - 0.06, 0],
				[0.03, 0.12, caseD - 0.24, -caseW / 2 + 0.015, -caseH / 2 + 0.06, 0]
			] as number[][]).forEach(([w, h, d, x, y, z]) => {
				const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), caseMat);
				piece.position.set(x, y, z);
				piece.castShadow = piece.receiveShadow = true;
				caseGroup.add(piece);
			});
			const interiorBack = new THREE.Mesh(new THREE.PlaneGeometry(caseW - 0.08, caseH - 0.08), mat(0x12131e, { roughness: 0.9 }));
			interiorBack.position.set(0, 0, -caseD / 2 + 0.035);
			caseGroup.add(interiorBack);
			caseGroup.position.set(0.95, 0.45, 0.02);
			laptopGroup.add(caseGroup);
			const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.82, 0.76), trimMat);
			frontPanel.position.set(1.18, 0.45, 0.02); laptopGroup.add(frontPanel);
			const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.72), glassMat);
			sideGlass.position.set(0.718, 0.45, 0.02); sideGlass.rotation.y = Math.PI / 2; laptopGroup.add(sideGlass);

			// PC internals (mounted in case-local space so they align with the side window)
			const boardMat = mat(0x2a3244, { roughness: 0.78 });
			const boardTrimMat = mat(0x202636, { roughness: 0.8 });
			const gpuMat = gloss(0x262838, { roughness: 0.28, metalness: 0.6 });
			const pcbGlowMat = emMat(0x5ca7ff, 0x3b8fff, 1.4);
			(pcbGlowMat as any)._baseIntensity = pcbGlowMat.emissiveIntensity; laptopScreenMats.push(pcbGlowMat);
			const ramGlowMat = emMat(0x72d6ff, 0x4bc9ff, 1.6);
			(ramGlowMat as any)._baseIntensity = ramGlowMat.emissiveIntensity; laptopScreenMats.push(ramGlowMat);
			const gpuLogoMat = emMat(0x8a7dff, 0x6a57ff, 1.8);
			(gpuLogoMat as any)._baseIntensity = gpuLogoMat.emissiveIntensity; laptopScreenMats.push(gpuLogoMat);

			// Motherboard mounted on the tray (YZ plane, thin X)
			const motherboard = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.62, 0.52), boardMat);
			motherboard.position.set(0.11, 0.05, -0.02); caseGroup.add(motherboard);
			const ioCover = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.09), boardTrimMat);
			ioCover.position.set(0.12, 0.26, -0.22); caseGroup.add(ioCover);
			const chipset = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.08, 0.08), boardTrimMat);
			chipset.position.set(0.10, -0.12, 0.08); caseGroup.add(chipset);

			for (let i = 0; i < 4; i++) {
				const ramStick = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.24, 0.024), boardTrimMat);
				ramStick.position.set(0.09, 0.17, -0.18 + i * 0.042); caseGroup.add(ramStick);
				const ramEdge = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.20, 0.016), ramGlowMat);
				ramEdge.position.set(0.083, 0.17, -0.18 + i * 0.042); caseGroup.add(ramEdge);
			}

			const cpuBlock = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), mat(0x1f2432, { roughness: 0.38, metalness: 0.55 }));
			cpuBlock.position.set(0.095, 0.08, -0.03); cpuBlock.rotation.z = Math.PI / 2; caseGroup.add(cpuBlock);
			const cpuGlow = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 8, 18), pcbGlowMat);
			cpuGlow.position.set(0.078, 0.08, -0.03); cpuGlow.rotation.y = Math.PI / 2; caseGroup.add(cpuGlow);

			// GPU mounted horizontally: long in Z, sticks out from motherboard toward glass (negative X)
			const gpuBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.34), gpuMat);
			gpuBody.position.set(0.02, -0.04, 0.00); caseGroup.add(gpuBody);
			const gpuBackplate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.34), boardTrimMat);
			gpuBackplate.position.set(0.09, -0.04, 0.00); caseGroup.add(gpuBackplate);
			([-0.06, 0.06] as number[]).forEach(oz => {
				const fanFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 18), mat(0x161823));
				fanFrame.position.set(-0.055, -0.04, oz); fanFrame.rotation.y = Math.PI / 2; caseGroup.add(fanFrame);
				const fanGlow = new THREE.Mesh(new THREE.CircleGeometry(0.042, 14), pcbGlowMat);
				fanGlow.position.set(-0.043, -0.04, oz); fanGlow.rotation.y = Math.PI / 2; caseGroup.add(fanGlow);
			});
			const gpuLogo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.006), gpuLogoMat);
			gpuLogo.position.set(0.04, -0.09, 0.00); gpuLogo.rotation.y = Math.PI / 2; caseGroup.add(gpuLogo);

			// Front radiator against the front panel side
			const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.20), mat(0x1a1c28, { roughness: 0.72 }));
			radiator.position.set(0.17, 0.16, 0.16); caseGroup.add(radiator);
			([-0.09, 0.09] as number[]).forEach(y => {
				const radFan = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 14), mat(0x10131c));
				radFan.position.set(0.13, 0.16 + y, 0.16); radFan.rotation.y = Math.PI / 2; caseGroup.add(radFan);
				const radFanGlow = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), ramGlowMat);
				radFanGlow.position.set(0.142, 0.16 + y, 0.16); radFanGlow.rotation.y = Math.PI / 2; caseGroup.add(radFanGlow);
			});

			const psuShroud = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.30), mat(0x171a26, { roughness: 0.82 }));
			psuShroud.position.set(0.04, -0.30, 0.04); caseGroup.add(psuShroud);
			const cableA = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 10), mat(0x222630));
			cableA.position.set(0.10, 0.02, 0.06); cableA.rotation.z = Math.PI * 0.22; cableA.rotation.y = Math.PI * 0.1; caseGroup.add(cableA);
			const cableB = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 10), mat(0x222630));
			cableB.position.set(0.02, 0.06, -0.02); cableB.rotation.z = -Math.PI * 0.18; cableB.rotation.y = -Math.PI * 0.12; caseGroup.add(cableB);

			for (let i = 0; i < 3; i++) {
				const fanGlow = emMat(0x66ccff, 0x44bbff, 1.7);
				(fanGlow as any)._baseIntensity = fanGlow.emissiveIntensity; laptopScreenMats.push(fanGlow);
				const fan = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), fanGlow);
				fan.position.set(1.19, 0.18 + i * 0.27, 0.02); fan.rotation.y = Math.PI / 2; laptopGroup.add(fan);
			}

			const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.28, 12), trimMat);
			stand.position.set(-0.2, 0.2, -0.08); stand.castShadow = true; laptopGroup.add(stand);
			const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.18), trimMat);
			standBase.position.set(-0.2, 0.06, -0.08); laptopGroup.add(standBase);

			const monitorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.56, 0.05), trimMat);
			monitorFrame.position.set(-0.2, 0.62, -0.24); monitorFrame.castShadow = true; laptopGroup.add(monitorFrame);
			const monitorScreenMat = emMat(0x0f1f3b, 0x2f66ff, 1.55);
			(monitorScreenMat as any)._baseIntensity = monitorScreenMat.emissiveIntensity; laptopScreenMats.push(monitorScreenMat);
			const monitorScreen = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.46, 0.01), monitorScreenMat);
			monitorScreen.position.set(-0.2, 0.62, -0.21); laptopGroup.add(monitorScreen);
			const monitorBacklightMat = emMat(0x7ca2ff, 0x5588ff, 1.35);
			(monitorBacklightMat as any)._baseIntensity = monitorBacklightMat.emissiveIntensity; laptopScreenMats.push(monitorBacklightMat);
			const monitorBacklight = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.01), monitorBacklightMat);
			monitorBacklight.position.set(-0.2, 0.62, -0.27); laptopGroup.add(monitorBacklight);

			const uiColors = [0x7bdcff, 0x7c6af7, 0x5af778, 0xf7d96a, 0xf7916a, 0x55ccff];
			uiColors.forEach((col, i) => {
				const barMat = emMat(col, col, 1.2);
				(barMat as any)._baseIntensity = barMat.emissiveIntensity; laptopScreenMats.push(barMat);
				const bar = new THREE.Mesh(new THREE.BoxGeometry(0.18 + Math.random() * 0.18, 0.024, 0.004), barMat);
				bar.position.set(-0.48 + Math.random() * 0.55, 0.78 - i * 0.07, -0.20); laptopGroup.add(bar);
			});

			([-0.72, 0.30] as number[]).forEach(sx => {
				const spkBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.18), mat(0x171822, { roughness: 0.72 }));
				spkBody.position.set(sx, 0.19, -0.12); spkBody.castShadow = true; laptopGroup.add(spkBody);
				const spkRingMat = emMat(0x76d6ff, 0x44c8ff, 1.2);
				(spkRingMat as any)._baseIntensity = spkRingMat.emissiveIntensity; laptopScreenMats.push(spkRingMat);
				const spkDriver = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 18), spkRingMat);
				spkDriver.position.set(sx, 0.2, -0.02); spkDriver.rotation.x = Math.PI / 2; laptopGroup.add(spkDriver);
				const tweeter = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 14), mat(0x0e0e14));
				tweeter.position.set(sx, 0.30, -0.02); tweeter.rotation.x = Math.PI / 2; laptopGroup.add(tweeter);
			});

			const kbdBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.035, 0.28), mat(0x181824, { roughness: 0.75 }));
			kbdBase.position.set(-0.08, 0.04, 0.11); kbdBase.castShadow = true; laptopGroup.add(kbdBase);
			for (let row = 0; row < 4; row++) {
				for (let col = 0; col < 14; col++) {
					const key = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.015, 0.044), mat(0x242432));
					key.position.set(-0.40 + col * 0.06, 0.058, 0.02 + row * 0.06); laptopGroup.add(key);
				}
			}

			const rgbStripMat = emMat(0x77e5ff, 0x33ccff, 1.8);
			(rgbStripMat as any)._baseIntensity = rgbStripMat.emissiveIntensity; laptopScreenMats.push(rgbStripMat);
			const rgbStrip = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.008, 0.012), rgbStripMat);
			rgbStrip.position.set(-0.08, 0.07, -0.02); laptopGroup.add(rgbStrip);

			const mousePad = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.24), mat(0x101018, { roughness: 0.9 }));
			mousePad.position.set(0.48, 0.008, 0.12); laptopGroup.add(mousePad);
			const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.038, 0.14), mat(0x1b1b25, { roughness: 0.65 }));
			mouse.position.set(0.48, 0.03, 0.12); mouse.castShadow = true; laptopGroup.add(mouse);
			const mouseGlowMat = emMat(0x6fdfff, 0x3bc9ff, 1.6);
			(mouseGlowMat as any)._baseIntensity = mouseGlowMat.emissiveIntensity; laptopScreenMats.push(mouseGlowMat);
			const mouseGlow = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.006, 0.09), mouseGlowMat);
			mouseGlow.position.set(0.48, 0.012, 0.12); laptopGroup.add(mouseGlow);

			const controllerBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.14), mat(0x13131b, { roughness: 0.7 }));
			controllerBody.position.set(0.12, 0.034, 0.28); controllerBody.castShadow = true; laptopGroup.add(controllerBody);
			([-0.09, 0.09] as number[]).forEach(cx => {
				const grip = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), mat(0x13131b, { roughness: 0.72 }));
				grip.scale.set(0.95, 0.7, 0.75); grip.position.set(0.12 + cx, 0.032, 0.32); laptopGroup.add(grip);
			});
			([-0.04, 0.04] as number[]).forEach(sx => {
				const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 10), mat(0x08080e));
				stick.position.set(0.12 + sx, 0.061, 0.27); laptopGroup.add(stick);
			});
			const dpad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.04), mat(0x222234));
			dpad.position.set(0.03, 0.062, 0.25); laptopGroup.add(dpad);
			const actionClusterMat = emMat(0x7a6fff, 0x5a4eff, 1.3);
			(actionClusterMat as any)._baseIntensity = actionClusterMat.emissiveIntensity; laptopScreenMats.push(actionClusterMat);
			const actionCluster = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), actionClusterMat);
			actionCluster.position.set(0.21, 0.062, 0.25); actionCluster.rotation.x = -Math.PI / 2; laptopGroup.add(actionCluster);

			const console = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, 0.18), mat(0x181824, { roughness: 0.62 }));
			console.position.set(0.88, 0.032, 0.31); console.castShadow = true; laptopGroup.add(console);
			const consoleLedMat = emMat(0x66eeaa, 0x33cc88, 1.9);
			(consoleLedMat as any)._baseIntensity = consoleLedMat.emissiveIntensity; laptopScreenMats.push(consoleLedMat);
			const consoleLed = new THREE.Mesh(new THREE.CircleGeometry(0.01, 10), consoleLedMat);
			consoleLed.position.set(0.75, 0.049, 0.37); consoleLed.rotation.x = -Math.PI / 2; laptopGroup.add(consoleLed);

			for (let i = 0; i < 4; i++) {
				const gameCase = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.11), mat([0x3b4da8, 0x8a2d95, 0x2d8a64, 0xa85a2d][i], { roughness: 0.78 }));
				gameCase.position.set(-0.66 + i * 0.075, 0.02 + i * 0.009, 0.27); gameCase.rotation.y = -0.15; laptopGroup.add(gameCase);
			}

			const headsetBand = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 20, Math.PI), mat(0x1a1a22));
			headsetBand.position.set(0.58, 0.08, -0.10); headsetBand.rotation.x = Math.PI / 2; headsetBand.rotation.z = Math.PI * 0.08; laptopGroup.add(headsetBand);
			([-0.06, 0.06] as number[]).forEach(x => {
				const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), mat(0x111118));
				cup.rotation.x = Math.PI / 2; cup.position.set(0.58 + x, 0.026, -0.10); laptopGroup.add(cup);
			});
		}
		laptopGroup.position.set(-0.42, 1.12, -6.54); laptopGroup.rotation.y = Math.PI * 0.04; laptopGroup.scale.set(0.9, 0.9, 0.9); scene.add(laptopGroup);

		/* ═══════════════════════════════════════════════════════════
		   BOOKSHELF → Skills
		═══════════════════════════════════════════════════════════ */
		const bookshelfGroup = new THREE.Group();
		{
			const wood = mat(0x9a7c4a, { roughness: 0.75 }), dark = mat(0x6b5638, { roughness: 0.78 });
			const makePanel = (w: number, h: number, d: number, x: number, y: number, z: number) => {
				const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
				m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; bookshelfGroup.add(m);
			};
			makePanel(0.12, 3.2, 0.45, -0.73, 0, 0); makePanel(0.12, 3.2, 0.45, 0.73, 0, 0);
			makePanel(1.55, 0.12, 0.45, 0, -1.55, 0); makePanel(1.55, 0.12, 0.45, 0, 1.55, 0);
			makePanel(1.55, 0.08, 0.43, 0, -0.78, 0); makePanel(1.55, 0.08, 0.43, 0, 0.10, 0); makePanel(1.55, 0.08, 0.43, 0, 0.98, 0);
			const back = new THREE.Mesh(new THREE.BoxGeometry(1.46, 3.1, 0.04), dark);
			back.position.set(0, 0, -0.20); bookshelfGroup.add(back);
			const bookPalette = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xd35400, 0x27ae60, 0x8e44ad, 0xc0392b, 0x2980b9, 0xf1c40f, 0x16a085, 0x7f8c8d];
			let bi = 0;
			for (let row = 0; row < 3; row++) {
				const baseY = -1.48 + row * 0.88;
				let x = -0.62;
				while (x < 0.63) {
					const bw = 0.062 + Math.random() * 0.052, bh = 0.38 + Math.random() * 0.22;
					const tilted = Math.random() > 0.82;
					const book = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.30), mat(bookPalette[bi % bookPalette.length], { roughness: 0.85 }));
					book.position.set(x + bw / 2, baseY + bh / 2, 0.02); book.rotation.z = tilted ? (Math.random() - 0.5) * 0.25 : 0; book.castShadow = true; bookshelfGroup.add(book);
					const spine = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, bh * 0.15, 0.01), mat(0xffffff, { roughness: 0.95 }));
					spine.position.set(x + bw / 2, baseY + bh * 0.6, 0.162); bookshelfGroup.add(spine);
					x += bw + 0.008; bi++;
				}
			}
			// Top shelf décor
			const globeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.08, 8), mat(0x8a6030));
			globeBase.position.set(-0.45, 1.67, 0.04); bookshelfGroup.add(globeBase);
			const globe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), mat(0x2255aa, { roughness: 0.5 }));
			globe.position.set(-0.45, 1.83, 0.04); bookshelfGroup.add(globe);
			for (let i = 0; i < 3; i++) {
				const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.004, 4, 16), mat(0x88aaff));
				ring.position.set(-0.45, 1.83, 0.04); ring.rotation.y = (i / 3) * Math.PI; bookshelfGroup.add(ring);
			}
			const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.055, 0.13, 10), mat(0xcc7755));
			pot.position.set(0.5, 1.64, 0.04); bookshelfGroup.add(pot);
			const soil = new THREE.Mesh(new THREE.CircleGeometry(0.066, 10), mat(0x3d2b1f));
			soil.position.set(0.5, 1.706, 0.04); soil.rotation.x = -Math.PI / 2; bookshelfGroup.add(soil);
			for (let i = 0; i < 6; i++) {
				const angle = (i / 6) * Math.PI * 2;
				const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.062, 6, 5), mat(0x228844, { roughness: 0.9 }));
				leaf.scale.set(0.6, 1.3, 0.6); leaf.position.set(0.5 + Math.sin(angle) * 0.06, 1.82 + Math.random() * 0.06, 0.04 + Math.cos(angle) * 0.06); leaf.castShadow = true; bookshelfGroup.add(leaf);
			}
			const trophy = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.14, 8), mat(0xf0c040, { roughness: 0.3, metalness: 0.8 }));
			trophy.position.set(0.15, 1.73, 0.04); bookshelfGroup.add(trophy);
			const star = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 4), mat(0xf0c040, { roughness: 0.2, metalness: 0.9 }));
			star.position.set(0.15, 1.83, 0.04); bookshelfGroup.add(star);
			([[- 0.63, -2.15, -0.18], [-0.63, -2.15, 0.18], [0.63, -2.15, -0.18], [0.63, -2.15, 0.18]] as any[]).forEach(([x, y, z]) => {
				const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), wood);
				leg.position.set(x, y, z); leg.castShadow = leg.receiveShadow = true; bookshelfGroup.add(leg);
			});
		}
		bookshelfGroup.position.set(3.5, 1.85, -7.2); bookshelfGroup.scale.set(1.2, 1.2, 1.2); scene.add(bookshelfGroup);

		/* ═══════════════════════════════════════════════════════════
		   WALL TV → About Me
		═══════════════════════════════════════════════════════════ */
		const wallFrameGroup = new THREE.Group();
		{
			const tvW = 1.95, tvH = 1.15, tvD = 0.11;
			const bezelMat = gloss(0x11141c, { roughness: 0.24, metalness: 0.55 });
			const rearMat = mat(0x161b28, { roughness: 0.82 });

			const body = new THREE.Mesh(new THREE.BoxGeometry(tvW, tvH, tvD), rearMat);
			body.castShadow = true; body.receiveShadow = true; wallFrameGroup.add(body);

			const bezel = new THREE.Mesh(new THREE.BoxGeometry(tvW - 0.08, tvH - 0.08, 0.035), bezelMat);
			bezel.position.z = tvD / 2 + 0.005; wallFrameGroup.add(bezel);

			tvScreenMat = new THREE.MeshStandardMaterial({ color: 0x101a2b, emissive: 0x2359cc, emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.08 });
			const screen = new THREE.Mesh(new THREE.PlaneGeometry(tvW - 0.2, tvH - 0.2), tvScreenMat);
			screen.position.z = tvD / 2 + 0.024; wallFrameGroup.add(screen);

			const statusBarMat = new THREE.MeshStandardMaterial({ color: 0x2d3f70, emissive: 0x2d5dcc, emissiveIntensity: 0.9, roughness: 0.28 });
			(statusBarMat as any)._baseIntensity = statusBarMat.emissiveIntensity; tvUiMats.push(statusBarMat);
			const statusBar = new THREE.Mesh(new THREE.BoxGeometry(tvW - 0.34, 0.065, 0.004), statusBarMat);
			statusBar.position.set(0, tvH * 0.29, tvD / 2 + 0.03); wallFrameGroup.add(statusBar);

			const tileColors = [0x7cb8ff, 0x7c6af7, 0x5af7d0, 0xf7d96a, 0xf7916a, 0x55ccff];
			tileColors.forEach((col, i) => {
				const tMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.05, roughness: 0.35 });
				(tMat as any)._baseIntensity = tMat.emissiveIntensity; tvUiMats.push(tMat);
				const tile = new THREE.Mesh(new THREE.BoxGeometry(0.2 + (i % 2) * 0.08, 0.09, 0.004), tMat);
				tile.position.set(-0.63 + (i % 3) * 0.46, 0.10 - Math.floor(i / 3) * 0.22, tvD / 2 + 0.03);
				wallFrameGroup.add(tile);
			});

			tvPowerLedMat = new THREE.MeshStandardMaterial({ color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 2.2, roughness: 0.18 });
			const powerLed = new THREE.Mesh(new THREE.CircleGeometry(0.015, 14), tvPowerLedMat);
			powerLed.position.set(tvW / 2 - 0.10, -tvH / 2 + 0.05, tvD / 2 + 0.029); wallFrameGroup.add(powerLed);

			const wallPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.20, 0.03), mat(0x1a1f2d, { roughness: 0.72 }));
			wallPlate.position.set(0, 0, -tvD / 2 - 0.018); wallFrameGroup.add(wallPlate);
			const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.09), mat(0x202634, { roughness: 0.72 }));
			arm.position.set(0, 0, -tvD / 2 + 0.022); wallFrameGroup.add(arm);
		}
		wallFrameGroup.position.set(-1.8, 4.0, -8.48); wallFrameGroup.scale.set(1.08, 1.08, 1.08); scene.add(wallFrameGroup);

		/* ═══════════════════════════════════════════════════════════
		   CHAIR (stays at desk permanently)
		═══════════════════════════════════════════════════════════ */
		const chairGroup = new THREE.Group();
		{
			const seatMat = mat(0x1a1a24, { roughness: 0.8 }), chromeMat = gloss(0x888898, { metalness: 0.9, roughness: 0.15 });
			const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.55), seatMat);
			seat.position.y = 0.58; seat.castShadow = true; chairGroup.add(seat);
			const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.6, 0.06), seatMat);
			chairBack.position.set(0, 0.92, -0.24); chairBack.castShadow = true; chairGroup.add(chairBack);
			const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.06), seatMat);
			headrest.position.set(0, 1.27, -0.24); chairGroup.add(headrest);
			([-0.34, 0.34] as number[]).forEach(x => {
				const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.36), seatMat);
				arm.position.set(x, 0.74, 0.03); chairGroup.add(arm);
				const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.17, 8), chromeMat);
				sup.position.set(x, 0.65, 0.09); chairGroup.add(sup);
			});
			const lift = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.4, 10), chromeMat);
			lift.position.set(0, 0.2, 0); chairGroup.add(lift);
			for (let i = 0; i < 5; i++) {
				const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.04), chromeMat);
				spoke.rotation.y = (i / 5) * Math.PI * 2; spoke.position.y = 0.03; chairGroup.add(spoke);
				const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), mat(0x111111));
				wheel.rotation.z = Math.PI / 2; wheel.position.set(Math.sin((i / 5) * Math.PI * 2) * 0.19, 0.03, Math.cos((i / 5) * Math.PI * 2) * 0.19); chairGroup.add(wheel);
			}
		}
		chairGroup.position.set(1.6, 0, -2.2); chairGroup.rotation.y = -Math.PI * 0.18; chairGroup.scale.set(1.18, 1.18, 1.18); scene.add(chairGroup);

		/* ═══════════════════════════════════════════════════════════
		   CHARACTER → Contact
		═══════════════════════════════════════════════════════════ */
		const characterGroup = new THREE.Group();
		{
			const skin = mat(0xffc31a, { roughness: 0.72 }), shirt = mat(0x7d838d, { roughness: 0.82 });
			const pants = mat(0x606873, { roughness: 0.86 }), hair = mat(0x7ec52a, { roughness: 0.88 });
			const shoe = mat(0x2c3138, { roughness: 0.82 });

			const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.22), shirt);
			torso.position.set(0, 0.87, 0.02); torso.castShadow = true; characterGroup.add(torso);
			const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.30, 0.012), mat(0x505862));
			stripe.position.set(0, 0.87, 0.117); characterGroup.add(stripe);
			const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.012), mat(0x9aa0aa));
			collarL.position.set(-0.05, 1.09, 0.116); collarL.rotation.z = 0.35; characterGroup.add(collarL);
			const collarR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.012), mat(0x9aa0aa));
			collarR.position.set(0.05, 1.09, 0.116); collarR.rotation.z = -0.35; characterGroup.add(collarR);

			([-0.11, 0.11] as number[]).forEach(lx => {
				const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.38), pants);
				thigh.position.set(lx, 0.64, 0.19); thigh.castShadow = true; characterGroup.add(thigh);
				const calf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.13), pants);
				calf.position.set(lx, 0.40, 0.38); calf.castShadow = true; characterGroup.add(calf);
				const shoe2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.22), shoe);
				shoe2.position.set(lx, 0.14, 0.47); characterGroup.add(shoe2);
			});

			([-0.21, 0.21] as number[]).forEach(ax => {
				const side = ax < 0 ? -1 : 1;
				const uArm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.28, 0.11), shirt);
				uArm.position.set(ax, 0.96, 0.04); uArm.rotation.z = side * 0.22; uArm.rotation.x = -0.55; uArm.castShadow = true; characterGroup.add(uArm);
				const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), shirt);
				elbow.position.set(ax, 0.841, 0.113); characterGroup.add(elbow);
				const fore = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.21, 0.088), skin);
				fore.position.set(ax * 0.89, 0.766, 0.184); fore.rotation.x = 2.38; fore.rotation.z = -side * 0.10; characterGroup.add(fore);
				const hand = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.036, 0.085), skin);
				hand.position.set(ax * 0.78, 0.690, 0.255); characterGroup.add(hand);
				for (let f = 0; f < 4; f++) {
					const fing = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.034), skin);
					fing.position.set(ax * 0.78 + (f - 1.5) * 0.020, 0.690, 0.296); characterGroup.add(fing);
				}
			});

			const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.060, 0.09, 10), skin);
			neck.position.set(0, 1.145, 0.02); characterGroup.add(neck);
			const head = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.225, 0.20), skin);
			head.position.set(0, 1.305, 0.02); head.castShadow = true; characterGroup.add(head);

			const eyeY = 1.31;
			([-0.056, 0.056] as number[]).forEach(ex => {
				const eye = new THREE.Mesh(new THREE.CircleGeometry(0.045, 18), mat(0x050507, { roughness: 0.2 }));
				eye.position.set(ex, eyeY, 0.132); characterGroup.add(eye);
				const shineBig = new THREE.Mesh(new THREE.CircleGeometry(0.010, 10), mat(0xffffff, { roughness: 0.15 }));
				shineBig.position.set(ex - 0.014, eyeY + 0.014, 0.134); characterGroup.add(shineBig);
				const shineSmall = new THREE.Mesh(new THREE.CircleGeometry(0.005, 8), mat(0xffffff, { roughness: 0.15 }));
				shineSmall.position.set(ex + 0.015, eyeY - 0.014, 0.134); characterGroup.add(shineSmall);
			});

			([-1, 1] as number[]).forEach(side => {
				for (let i = 0; i < 3; i++) {
					const blush = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.003, 0.002), mat(0xff4f70));
					blush.position.set(side * (0.095 - i * 0.010), 1.25 + i * 0.004, 0.124);
					blush.rotation.z = side * -0.55;
					characterGroup.add(blush);
				}
			});

			([-0.108, 0.108] as number[]).forEach(ex => {
				const ear = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.048, 0.042), skin);
				ear.position.set(ex, 1.30, 0.02); characterGroup.add(ear);
			});

			const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.09, 0.22), hair);
			hairTop.position.set(0, 1.44, 0.01); characterGroup.add(hairTop);
			const hairCrown = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.06, 0.20), hair);
			hairCrown.position.set(0, 1.49, 0.00); hairCrown.rotation.x = -0.08; characterGroup.add(hairCrown);
			const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.08), hair);
			hairBack.position.set(0, 1.39, -0.09); characterGroup.add(hairBack);

			([-0.10, 0.10] as number[]).forEach(hx => {
				const sideLock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.17), hair);
				sideLock.position.set(hx, 1.36, 0.01); characterGroup.add(sideLock);
			});

			([
				[-0.10, 0.036, 0.11],
				[-0.065, 0.032, 0.115],
				[-0.03, 0.040, 0.12],
				[0.005, 0.030, 0.115],
				[0.04, 0.038, 0.12],
				[0.075, 0.030, 0.113],
				[0.105, 0.034, 0.108]
			] as number[][]).forEach(([x, r, z]) => {
				const fringe = new THREE.Mesh(new THREE.ConeGeometry(r, 0.10, 6), hair);
				fringe.position.set(x, 1.365, z);
				fringe.rotation.z = Math.PI;
				characterGroup.add(fringe);
			});

			// Laptop on lap
			const lapBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.032, 0.30), gloss(0x2c2c36, { metalness: 0.6 }));
			lapBase.position.set(0, 0.66, 0.19); lapBase.rotation.x = -0.08; lapBase.castShadow = true; characterGroup.add(lapBase);
			const lapScreen = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.27, 0.016), gloss(0x2c2c36, { metalness: 0.6 }));
			lapScreen.position.set(0, 0.86, 0.01); lapScreen.rotation.x = -1.05; characterGroup.add(lapScreen);
			const lapDispMat = emMat(0x0d1f3c, 0x2244ee, 0.9);
			(lapDispMat as any)._baseIntensity = lapDispMat.emissiveIntensity; laptopScreenMats.push(lapDispMat);
			const lapDisplay = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.21, 0.006), lapDispMat);
			lapDisplay.position.set(0, 0.86, 0.022); lapDisplay.rotation.x = -1.05; characterGroup.add(lapDisplay);
			[0xf7916a, 0x5af778, 0x7c6af7, 0xffee88, 0x55ccff].forEach((col, i) => {
				const w = 0.055 + Math.random() * 0.10, indent = (i % 3) * 0.022;
				const clm = emMat(col, col, 1.5); (clm as any)._baseIntensity = clm.emissiveIntensity; laptopScreenMats.push(clm);
				const cl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.013, 0.002), clm);
				cl.position.set(-0.08 + indent + w / 2, 0.88 + 0.04 - i * 0.038, 0.034); cl.rotation.x = -1.05; characterGroup.add(cl);
			});
		}
		characterGroup.position.set(1.6, 0, -2.2); characterGroup.rotation.y = -Math.PI * 0.18; characterGroup.scale.set(1.18, 1.18, 1.18);
		scene.add(characterGroup); characterGroupRef = characterGroup;

		/* ═══════════════════════════════════════════════════════════
		   BED
		═══════════════════════════════════════════════════════════ */
		const BED_X = -3.5, BED_Z = -7.1, BED_W = 2.2, BED_L = 2.9;
		let bedBodyLump: THREE.Group;
		{
			const bedWood = gloss(0x2e1a0e, { roughness: 0.48, metalness: 0.06 });
			const mattressMat = mat(0xcec0aa, { roughness: 0.88 });
			const blanketBase = mat(0x1e2d50, { roughness: 0.92 });
			const blanketFoldMat = mat(0x2a3f6a, { roughness: 0.88 });
			const bedGroup = new THREE.Group();

			([[BED_W / 2 - 0.06, BED_L / 2 - 0.07], [-BED_W / 2 + 0.06, BED_L / 2 - 0.07], [BED_W / 2 - 0.06, -BED_L / 2 + 0.07], [-BED_W / 2 + 0.06, -BED_L / 2 + 0.07]] as any[]).forEach(([ox, oz]) => {
				const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.07), bedWood);
				leg.position.set(ox, 0.18, oz); leg.castShadow = true; bedGroup.add(leg);
			});
			([-BED_W / 2 + 0.04, BED_W / 2 - 0.04] as number[]).forEach(ox => {
				const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.20, BED_L - 0.14), bedWood);
				rail.position.set(ox, 0.22, 0); rail.castShadow = true; bedGroup.add(rail);
			});
			const mattress = new THREE.Mesh(new THREE.BoxGeometry(BED_W - 0.09, 0.22, BED_L - 0.04), mattressMat);
			mattress.position.set(0, 0.41, 0); mattress.receiveShadow = mattress.castShadow = true; bedGroup.add(mattress);
			const headboard = new THREE.Mesh(new THREE.BoxGeometry(BED_W + 0.12, 0.75, 0.10), bedWood);
			headboard.position.set(0, 0.58, -BED_L / 2 - 0.05); headboard.castShadow = true; bedGroup.add(headboard);
			const headTop = new THREE.Mesh(new THREE.BoxGeometry(BED_W + 0.12, 0.09, 0.14), bedWood);
			headTop.position.set(0, 0.97, -BED_L / 2 - 0.05); bedGroup.add(headTop);
			for (let i = 0; i < 4; i++) {
				const slat = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), bedWood);
				slat.position.set(-BED_W / 2 + 0.32 + i * (BED_W - 0.30) / 3, 0.58, -BED_L / 2 - 0.04); bedGroup.add(slat);
			}
			const footboard = new THREE.Mesh(new THREE.BoxGeometry(BED_W + 0.12, 0.34, 0.08), bedWood);
			footboard.position.set(0, 0.38, BED_L / 2 + 0.04); footboard.castShadow = true; bedGroup.add(footboard);
			([-0.34, 0.34] as number[]).forEach(px => {
				const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.11, 0.38), mat(0xf5f0e8, { roughness: 0.85 }));
				pillow.position.set(px, 0.55, -BED_L / 2 + 0.27); bedGroup.add(pillow);
			});
			const blanket = new THREE.Mesh(new THREE.BoxGeometry(BED_W - 0.09, 0.13, BED_L - 0.55), blanketBase);
			blanket.position.set(0, 0.55, 0.16); blanket.castShadow = true; bedGroup.add(blanket);
			const fold = new THREE.Mesh(new THREE.BoxGeometry(BED_W - 0.09, 0.07, 0.24), blanketFoldMat);
			fold.position.set(0, 0.61, -BED_L / 2 + 0.57); bedGroup.add(fold);

			// Sleeping body lump
			bedBodyLump = new THREE.Group();
			const BSY = 0.52, HZ = -BED_L / 2 + 0.26, S = 1.18;
			const _skin = mat(0xffc31a, { roughness: 0.75 }), _hair = mat(0x7ec52a, { roughness: 0.85 });
			const _shirt = mat(0x7a828d, { roughness: 0.82 }), _blkA = mat(0x4b515c, { roughness: 0.90 }), _blkB = mat(0x5e6672, { roughness: 0.88 });
			const blkUpper = new THREE.Mesh(new THREE.BoxGeometry(BED_W - 0.08, 0.26, 1.22), _blkA);
			blkUpper.position.set(0, BSY + 0.18, -BED_L / 2 + 1.16); bedBodyLump.add(blkUpper);
			const blkMid = new THREE.Mesh(new THREE.BoxGeometry(BED_W - 0.08, 0.20, 0.93), _blkA);
			blkMid.position.set(0, BSY + 0.15, -BED_L / 2 + 2.26); bedBodyLump.add(blkMid);
			const blkLow = new THREE.Mesh(new THREE.BoxGeometry(BED_W - 0.08, 0.12, 0.52), _blkA);
			blkLow.position.set(0, BSY + 0.10, BED_L / 2 - 0.21); bedBodyLump.add(blkLow);
			const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 1.30), _blkB);
			ridge.position.set(0, BSY + 0.25, -BED_L / 2 + 1.35); bedBodyLump.add(ridge);
			const chest = new THREE.Mesh(new THREE.BoxGeometry(0.45 * S, 0.15, 0.28 * S), _shirt);
			chest.position.set(0, BSY + 0.25, HZ + 0.40 * S); bedBodyLump.add(chest);
			const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.26 * S, 0.19, 0.28 * S), _skin);
			headBox.position.set(0, BSY + 0.16, HZ); bedBodyLump.add(headBox);
			const hairMain = new THREE.Mesh(new THREE.BoxGeometry(0.27 * S, 0.08, 0.22 * S), _hair);
			hairMain.position.set(0, BSY + 0.225, HZ - 0.045); bedBodyLump.add(hairMain);
			bedBodyLump.visible = false;
			bedGroup.add(bedBodyLump);
			bedGroup.position.set(BED_X, 0, BED_Z);
			scene.add(bedGroup);
			bedBodyLumpRef = bedBodyLump;
		}

		/* ── Moonlight ────────────────────────────────────────────── */
		const nightLightPt = new THREE.SpotLight(0x8899bb, 0, 11, Math.PI * 0.14, 0.6, 1.5);
		nightLightPt.position.set(-4.7, 3.0, -5.8); nightLightPt.target.position.set(BED_X, 0.5, BED_Z);
		nightLightPt.castShadow = false; scene.add(nightLightPt); scene.add(nightLightPt.target); nightLightPtRef = nightLightPt;
		{
			const poolMat = new THREE.MeshBasicMaterial({ color: 0x99aacc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
			const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), poolMat);
			pool.rotation.x = -Math.PI / 2; pool.rotation.z = Math.PI * 0.12; pool.position.set(BED_X + 0.2, 0.01, BED_Z + 0.3); scene.add(pool);
			const bedMat = new THREE.MeshBasicMaterial({ color: 0xaabbee, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
			const bedPool = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), bedMat);
			bedPool.rotation.x = -Math.PI / 2; bedPool.rotation.z = Math.PI * 0.12; bedPool.position.set(BED_X + 0.1, 0.53, BED_Z + 0.2); scene.add(bedPool);
			nightLightPt.userData.poolMat = poolMat; nightLightPt.userData.bedPoolMat = bedMat;
		}

		/* ── Sleep state machine ──────────────────────────────────── */
		const DESK_POS = new THREE.Vector3(1.6, 0, -2.2), DESK_ROT_Y = -Math.PI * 0.18;
		const BED_ENTRY = new THREE.Vector3(BED_X + 0.95, 0, BED_Z + 0.55), BED_ROT_Y = Math.PI * 0.55;
		let simTime: Date | null = null;
		const getSceneNow = () => {
			const baseNow = simTime ? new Date(simTime) : new Date();
			if (sceneTime.mode === 'auto') return baseNow;
			const forcedTime = new Date(baseNow);
			if (sceneTime.mode === 'night') forcedTime.setHours(1, 30, 0, 0);
			if (sceneTime.mode === 'day') forcedTime.setHours(13, 0, 0, 0);
			return forcedTime;
		};
		{
			const h = getSceneNow().getHours();
			if (h >= 23 || h < 7) { charState = 'sleeping'; characterGroup.visible = false; bedBodyLump.visible = true; }
		}

		function startGoingToBed() {
			if (charState !== 'sitting') return;
			charState = 'going_to_bed';
			const proxy = { px: characterGroup.position.x, pz: characterGroup.position.z, ry: characterGroup.rotation.y };
			gsap.to(proxy, { px: BED_ENTRY.x, pz: BED_ENTRY.z, ry: BED_ROT_Y, duration: 2.6, ease: 'power2.inOut',
				onUpdate() { characterGroup.position.set(proxy.px, 0, proxy.pz); characterGroup.rotation.y = proxy.ry; },
				onComplete() { characterGroup.visible = false; bedBodyLump.visible = true; charState = 'sleeping'; }
			});
		}
		function startWakingUp() {
			if (charState !== 'sleeping') return;
			charState = 'waking_up'; bedBodyLump.visible = false;
			characterGroup.position.copy(BED_ENTRY); characterGroup.rotation.y = BED_ROT_Y; characterGroup.visible = true;
			const proxy = { px: BED_ENTRY.x, pz: BED_ENTRY.z, ry: BED_ROT_Y };
			gsap.to(proxy, { px: DESK_POS.x, pz: DESK_POS.z, ry: DESK_ROT_Y, duration: 2.6, ease: 'power2.inOut',
				onUpdate() { characterGroup.position.set(proxy.px, 0, proxy.pz); characterGroup.rotation.y = proxy.ry; },
				onComplete() { charState = 'sitting'; }
			});
		}

		setProgress(60, 'Hanging clock…');

		/* ═══════════════════════════════════════════════════════════
		   WALL CLOCK
		═══════════════════════════════════════════════════════════ */
		const clockGroup = new THREE.Group();
		const handMat = new THREE.MeshStandardMaterial({ color: 0x111122 });
		const redMat = new THREE.MeshStandardMaterial({ color: 0xe84040 });
		const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.065, 52), gloss(0x1a1a32, { roughness: 0.18, metalness: 0.6 }));
		clockBody.rotation.x = Math.PI / 2; clockGroup.add(clockBody);
		const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.325, 52), new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.95 }));
		clockFace.position.z = 0.035; clockGroup.add(clockFace);
		const rim = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.026, 10, 52), gloss(0x999ab0, { metalness: 0.85, roughness: 0.18 }));
		rim.position.z = 0.028; clockGroup.add(rim);
		for (let i = 0; i < 12; i++) {
			const a = (i / 12) * Math.PI * 2, big = i % 3 === 0;
			const mark = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.025 : 0.014, big ? 0.065 : 0.042, 0.01), new THREE.MeshStandardMaterial({ color: 0x1a1a2e }));
			mark.position.set(Math.sin(a) * 0.265, Math.cos(a) * 0.265, 0.04); mark.rotation.z = -a; clockGroup.add(mark);
		}
		function makeHand(w: number, len: number, m: THREE.Material, zOff: number) {
			const pivot = new THREE.Group(); pivot.position.z = zOff;
			const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.011), m); mesh.position.y = len / 2; pivot.add(mesh);
			const tail = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, len * 0.22, 0.011), m); tail.position.y = -(len * 0.22) / 2; pivot.add(tail);
			return pivot;
		}
		hourPivot = makeHand(0.019, 0.16, handMat, 0.048);
		minPivot = makeHand(0.013, 0.23, handMat, 0.055);
		secPivot = makeHand(0.008, 0.27, redMat, 0.062);
		clockGroup.add(hourPivot, minPivot, secPivot);
		const pin = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), redMat.clone()); pin.position.z = 0.068; clockGroup.add(pin);
		clockGroup.position.set(0.8, 4.4, -8.49); scene.add(clockGroup);

		/* ═══════════════════════════════════════════════════════════
		   PARTICLES
		═══════════════════════════════════════════════════════════ */
		const PARTICLE_COUNT = isMobile ? 60 : 200;
		const particleGeo = new THREE.BufferGeometry();
		const particlePos = new Float32Array(PARTICLE_COUNT * 3);
		for (let i = 0; i < PARTICLE_COUNT; i++) {
			particlePos[i * 3] = (Math.random() - 0.5) * 9;
			particlePos[i * 3 + 1] = Math.random() * 5.5 + 0.5;
			particlePos[i * 3 + 2] = Math.random() * -8 - 0.3;
		}
		particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
		scene.add(new THREE.Points(particleGeo, new THREE.PointsMaterial({ color: 0x9aafff, size: 0.042, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false })));
		particleGeoRef = particleGeo;

		/* ── Corner plants ────────────────────────────────────────── */
		function buildPlant(s: number) {
			const g = new THREE.Group();
			const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.14 * s, 0.28 * s, 10), mat(0xaa6633)); pot.castShadow = true; g.add(pot);
			const soil = new THREE.Mesh(new THREE.CircleGeometry(0.175 * s, 10), mat(0x3a2310)); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.142 * s; g.add(soil);
			for (let i = 0; i < 7; i++) {
				const a = (i / 7) * Math.PI * 2, h = 0.3 + Math.random() * 0.28;
				const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14 * s, 7, 5), mat(0x228844, { roughness: 0.88 }));
				leaf.scale.set(0.55, h / 0.28, 0.55); leaf.position.set(Math.sin(a) * 0.12 * s, (0.45 + h * 0.2) * s, Math.cos(a) * 0.12 * s); leaf.castShadow = true; g.add(leaf);
			}
			return g;
		}
		const plant1 = buildPlant(1.2); plant1.position.set(-4.6, 0, -1.5); scene.add(plant1);
		const plant2 = buildPlant(0.9); plant2.position.set(4.5, 0, -6.5); scene.add(plant2);

		/* ── Coffee mug ───────────────────────────────────────────── */
		const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.12, 12), mat(0xf0f0f0));
		mug.position.set(-1.0, 1.19, -6.55); mug.castShadow = true; scene.add(mug);
		const mugLiq = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), mat(0x3a1800));
		mugLiq.rotation.x = -Math.PI / 2; mugLiq.position.set(-1.0, 1.252, -6.55); scene.add(mugLiq);
		const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.014, 7, 14, Math.PI), mat(0xf0f0f0));
		mugHandle.position.set(-0.935, 1.19, -6.55); mugHandle.rotation.y = Math.PI / 2; scene.add(mugHandle);

		/* ── Sticky notes ─────────────────────────────────────────── */
		([[0xffee44, -2.2], [0xff9999, 0.0], [0xaaffaa, 2.2]] as any[]).forEach(([col, px]) => {
			const note = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.015), mat(col, { roughness: 0.9 }));
			note.position.set(px, 2.1, -8.47); note.rotation.z = (Math.random() - 0.5) * 0.1; scene.add(note);
			for (let r = 0; r < 3; r++) {
				const ln = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.014, 0.002), mat(0x33333333));
				ln.position.set(px, 2.18 - r * 0.07, -8.46); scene.add(ln);
			}
		});

		setProgress(86, 'Wiring interactions…');

		/* ═══════════════════════════════════════════════════════════
		   FLOATING LABELS
		═══════════════════════════════════════════════════════════ */
		labelDefs = [
			{ key: 'laptop', mesh: laptopGroup, icon: '🖥️', text: 'Gaming', offset: new THREE.Vector3(0, 0.7, 0) },
			{ key: 'bookshelf', mesh: bookshelfGroup, icon: '📚', text: 'Socials', offset: new THREE.Vector3(0, 2.3, 0) },
			{ key: 'frame', mesh: wallFrameGroup, icon: '📺', text: 'Development', offset: new THREE.Vector3(0, 1.0, 0) },
			{ key: 'character', mesh: characterGroup, icon: '🧑', text: 'Me', offset: new THREE.Vector3(0, 2.0, 0), getMesh: () => charState === 'sleeping' ? bedBodyLump : characterGroup },
		];
		labelDefs.forEach(def => {
			const div = document.createElement('div');
			div.className = 'scene-label';
			div.innerHTML = `<span class="label-emoji">${def.icon}</span><span class="label-text">${def.text}</span>`;
			if ('ontouchstart' in window) {
				div.style.pointerEvents = 'auto';
				div.addEventListener('click', (e: Event) => { e.stopPropagation(); const obj = interactiveObjects.find((o: any) => o.key === def.key); if (obj) focusObject(obj); });
			}
			labelsEl.appendChild(div);
			labelEls[def.key] = div;
		});

		/* ═══════════════════════════════════════════════════════════
		   INTERACTIVE OBJECTS MAP
		═══════════════════════════════════════════════════════════ */
		interactiveObjects = [
			{ mesh: laptopGroup, key: 'laptop', camPos: new THREE.Vector3(-0.1, 2.1, -4.5), camTarget: new THREE.Vector3(-0.3, 1.2, -6.5) },
			{ mesh: bookshelfGroup, key: 'bookshelf', camPos: new THREE.Vector3(1.6, 2.4, -5.5), camTarget: new THREE.Vector3(3.5, 2.0, -7.2) },
			{ mesh: wallFrameGroup, key: 'frame', camPos: new THREE.Vector3(-1.7, 4.0, -6.5), camTarget: new THREE.Vector3(-1.8, 4.0, -8.5) },
			{ mesh: characterGroup, key: 'character', camPos: new THREE.Vector3(-2.5, 2.0, -5.0), camTarget: new THREE.Vector3(-3.5, 0.5, -7.1),
			getMesh: () => charState === 'sleeping' ? bedBodyLump : characterGroup,
			getCamPos: () => charState === 'sleeping' ? new THREE.Vector3(-2.5, 2.0, -5.0) : new THREE.Vector3(-0.2, 2.0, 0.8),
			getCamTarget: () => charState === 'sleeping' ? new THREE.Vector3(-3.5, 0.5, -7.1) : new THREE.Vector3(1.6, 0.8, -2.2) },
		];

		const bedBodyMeshes = new Set<THREE.Object3D>();
		const meshToObject = new Map<THREE.Object3D, any>();
		function getAllMeshes(obj: THREE.Object3D) { const out: THREE.Object3D[] = []; obj.traverse((c: any) => { if (c.isMesh) out.push(c); }); return out; }

		interactiveObjects.forEach(o => getAllMeshes(o.mesh).forEach(m => { allInteractiveMeshes.push(m); meshToObject.set(m, o); }));
		const contactObj = interactiveObjects.find(o => o.key === 'character');
		bedBodyLump.traverse((c: any) => { if (c.isMesh) { allInteractiveMeshes.push(c); meshToObject.set(c, contactObj); bedBodyMeshes.add(c); } });

		function resolveHit(mesh: THREE.Object3D) {
			if (bedBodyMeshes.has(mesh) && charState !== 'sleeping') return null;
			return meshToObject.get(mesh) ?? null;
		}
		function setEmissive(group: THREE.Object3D, color: number, intensity: number) {
			group.traverse((c: any) => { if (!c.isMesh) return; (Array.isArray(c.material) ? c.material : [c.material]).forEach((m: any) => { if (m.emissive) { m.emissive.set(color); m.emissiveIntensity = intensity; } }); });
		}
		function clearEmissive(group: THREE.Object3D) { setEmissive(group, 0x000000, 0); }

		/* ═══════════════════════════════════════════════════════════
		   LIGHTING UPDATE
		═══════════════════════════════════════════════════════════ */
		function updateRoomLighting(now: Date) {
			const h24 = now.getHours() + now.getMinutes() / 60;
			let dayT = h24 < 5 ? 0 : h24 < 7 ? (h24 - 5) / 2 : h24 < 18 ? 1 : h24 < 20 ? 1 - (h24 - 18) / 2 : 0;
			const glowT = (h24 >= 5 && h24 < 8) ? Math.sin(((h24 - 5) / 3) * Math.PI) : (h24 >= 17 && h24 < 20) ? Math.sin(((h24 - 17) / 3) * Math.PI) : 0;

			ambient.color.lerpColors(new THREE.Color(0x1a1b38), new THREE.Color(0xc8d0ff), dayT);
			if (glowT > 0) ambient.color.lerp(new THREE.Color(0x6b3318), glowT * 0.4);
			ambient.intensity = 1.2 + dayT * 0.8;

			dirLight.color.lerpColors(new THREE.Color(0x1a2650), new THREE.Color(0xfff8f0), dayT);
			if (glowT > 0) dirLight.color.lerp(new THREE.Color(0xff7722), glowT * 0.7);
			dirLight.intensity = 0.6 + dayT * 2.2;

			const moonColor = new THREE.Color(0x8899cc);
			const paneColor = new THREE.Color(0x1a2244).lerp(new THREE.Color(0x6699cc), dayT);
			if (glowT > 0) paneColor.lerp(new THREE.Color(0xdd5500), glowT * 0.65);
			winPaneMats.forEach(m => { m.color.copy(paneColor); m.emissive.copy(dayT < 0.1 ? moonColor : paneColor); m.emissiveIntensity = dayT < 0.1 ? 0.55 : 0.05 + dayT * 0.5 + glowT * 0.35; });
			winLight.color.lerpColors(moonColor, new THREE.Color(0xaaccff), dayT);
			if (glowT > 0) winLight.color.lerp(new THREE.Color(0xff8844), glowT * 0.6);
			winLight.intensity = 0.55 * (1 - dayT) + 0.05 + dayT * 1.15 + glowT * 0.4;

			fillLeft.color.lerpColors(new THREE.Color(0x3355aa), new THREE.Color(0x88aaff), dayT);
			fillLeft.intensity = 0.9 + dayT * 0.6;
			fillRight.intensity = 1.0 + dayT * 0.4;
			ceilBounce.intensity = 0.8 + dayT * 0.5;
			charLight.intensity = 2.5 - dayT * 0.5;
			deskGlowBase = 4.0 - dayT * 0.9;
			lampLightBase = lampOn ? (9.0 - dayT * 1.5) : 0;
			if (ceilPanel.material) (ceilPanel.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 - dayT * 0.2;

			const nightT = Math.max(0, 1 - dayT * 2.5);
			nightLightPt.intensity = nightT * 2.2;
			if (nightLightPt.userData.poolMat) { nightLightPt.userData.poolMat.opacity = nightT * 0.12; nightLightPt.userData.bedPoolMat.opacity = nightT * 0.22; }

			const screenOn = h24 >= 7 && h24 < 23;
			laptopScreenMats.forEach((m: any) => { m.emissiveIntensity = screenOn ? (m._baseIntensity ?? 1.2) : 0; });

			updateClock(now.getHours(), now.getMinutes(), dayT);
		}

		function updateWallFrameTime(now: Date) {
			const h24 = now.getHours() + now.getMinutes() / 60;
			const dayT = h24 < 5 ? 0 : h24 < 7 ? (h24 - 5) / 2 : h24 < 18 ? 1 : h24 < 20 ? 1 - (h24 - 18) / 2 : 0;
			const nightBoost = 1 - dayT;
			const flicker = 0.93 + Math.sin(now.getSeconds() * 1.9 + now.getMilliseconds() * 0.01) * 0.07;

			tvScreenMat.color.lerpColors(new THREE.Color(0x0f1524), new THREE.Color(0x152b4b), dayT);
			tvScreenMat.emissive.lerpColors(new THREE.Color(0x2f5aca), new THREE.Color(0x4fa2ff), dayT * 0.75 + 0.25);
			tvScreenMat.emissiveIntensity = (0.75 + nightBoost * 0.85) * flicker;

			tvUiMats.forEach((m: any, i: number) => {
				const base = m._baseIntensity ?? 1.0;
				const pulse = 0.88 + Math.sin((now.getSeconds() + i * 0.6) * 1.2) * 0.15;
				m.emissiveIntensity = base * (0.75 + nightBoost * 0.55) * pulse;
			});

			tvPowerLedMat.color.set(dayT < 0.35 ? 0x33ff99 : 0x55ddff);
			tvPowerLedMat.emissive.copy(tvPowerLedMat.color);
			tvPowerLedMat.emissiveIntensity = 1.9 + nightBoost * 0.6;
		}

		/* ═══════════════════════════════════════════════════════════
		   CLOCK TICK
		═══════════════════════════════════════════════════════════ */
		(window as any).setSimHour = (h: number, m = 0) => {
			simTime = new Date(2024, 0, 1, h, m, 0); charState = 'sitting';
			characterGroup.visible = true; bedBodyLump.visible = false;
			characterGroup.position.copy(DESK_POS); characterGroup.rotation.y = DESK_ROT_Y;
		};

		function tickScene() {
			const now = getSceneNow();
			const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds();
			secPivot.rotation.z = -((s + ms / 1000) / 60) * Math.PI * 2;
			minPivot.rotation.z = -((m + (s + ms / 1000) / 60) / 60) * Math.PI * 2;
			hourPivot.rotation.z = -((h + m / 60) / 12) * Math.PI * 2;
			updateWallFrameTime(now); updateRoomLighting(now);
			const h24 = now.getHours() + now.getMinutes() / 60;
			if ((h24 >= 23 || h24 < 7) && charState === 'sitting') startGoingToBed();
			if (h24 >= 7 && h24 < 23 && charState === 'sleeping') startWakingUp();
		}

		/* ═══════════════════════════════════════════════════════════
		   RAYCASTING + INTERACTIONS
		═══════════════════════════════════════════════════════════ */
		const raycaster = new THREE.Raycaster();
		const pointer = new THREE.Vector2();
		let lastTouchEndTime = 0;

		function updatePointer(e: MouseEvent | Touch) { pointer.x = (e.clientX / window.innerWidth) * 2 - 1; pointer.y = -(e.clientY / window.innerHeight) * 2 + 1; }

		function animateCamera(toPos: THREE.Vector3, toTarget: THREE.Vector3, onComplete?: () => void) {
			isAnimating = true; controls.enabled = false;
			const fromPos = camera.position.clone(), fromTarget = controls.target.clone();
			const proxy = { t: 0 };
			gsap.to(proxy, { t: 1, duration: 1.45, ease: 'power2.inOut',
				onUpdate() { camera.position.lerpVectors(fromPos, toPos, proxy.t); controls.target.lerpVectors(fromTarget, toTarget, proxy.t); camera.lookAt(controls.target); },
				onComplete() { isAnimating = false; onComplete?.(); }
			});
		}

		function getActiveMesh(obj: any) { return obj.getMesh ? obj.getMesh() : obj.mesh; }

		function focusObject(obj: any) {
			if (hoveredObject) { clearEmissive(getActiveMesh(hoveredObject)); hoveredObject = null; }
			if (focusedObject && focusedObject !== obj) clearEmissive(getActiveMesh(focusedObject));
			focusedObject = obj; setEmissive(getActiveMesh(obj), 0xaa88ff, 0.55);
			setFocus(obj.key);
			const camPos = obj.getCamPos ? obj.getCamPos() : obj.camPos;
			const camTarget = obj.getCamTarget ? obj.getCamTarget() : obj.camTarget;
			animateCamera(camPos, camTarget);
			setTimeout(() => openPanel(obj.key), 320);
		}
		focusObjectFn = focusObject;

		function doResetCamera() {
			if (focusedObject) { clearEmissive(getActiveMesh(focusedObject)); focusedObject = null; }
			setFocus(null); closePanel();
			animateCamera(DEFAULT_CAM_POS, DEFAULT_CAM_TARGET, () => { controls.enabled = true; });
		}

		canvasEl.addEventListener('mousemove', (e: MouseEvent) => {
			if (isAnimating || focusedObject) return;
			updatePointer(e); raycaster.setFromCamera(pointer, camera);
			const lampHover = raycaster.intersectObjects(lampMeshes, false);
			if (lampHover.length > 0) { if (hoveredObject) { clearEmissive(getActiveMesh(hoveredObject)); hoveredObject = null; } canvasEl.style.cursor = 'pointer'; return; }
			const hits = raycaster.intersectObjects(allInteractiveMeshes, false);
			const obj = hits.length > 0 ? resolveHit(hits[0].object) : null;
			if (obj) {
				if (obj !== hoveredObject) { if (hoveredObject) clearEmissive(getActiveMesh(hoveredObject)); hoveredObject = obj; setEmissive(getActiveMesh(hoveredObject), 0x9977ff, 0.4); }
				canvasEl.style.cursor = 'pointer';
			} else { if (hoveredObject) { clearEmissive(getActiveMesh(hoveredObject)); hoveredObject = null; } canvasEl.style.cursor = 'default'; }
		});

		window.addEventListener('click', (e: MouseEvent) => {
			if (isAnimating) return;
			if (Date.now() - lastTouchEndTime < 350) return;
			updatePointer(e); raycaster.setFromCamera(pointer, camera);
			const lampHits = raycaster.intersectObjects(lampMeshes, false);
			if (lampHits.length > 0) { import('$lib/stores/scene.svelte.js').then(({ toggleLamp }) => toggleLamp()); return; }
			const hits = raycaster.intersectObjects(allInteractiveMeshes, false);
			if (hits.length > 0) { const obj = resolveHit(hits[0].object); if (obj) { focusObject(obj); return; } }
			if (focusedObject) doResetCamera();
		});

		window.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && focusedObject) doResetCamera(); });

		window.addEventListener('touchstart', (e: TouchEvent) => {
			if (e.touches.length !== 1) return;
			const t = e.touches[0];
			pointer.x = (t.clientX / window.innerWidth) * 2 - 1; pointer.y = -(t.clientY / window.innerHeight) * 2 + 1;
		}, { passive: true });

		window.addEventListener('touchend', (e: TouchEvent) => {
			lastTouchEndTime = Date.now();
			const t = e.changedTouches[0];
			updatePointer(t); raycaster.setFromCamera(pointer, camera);
			const lampHits = raycaster.intersectObjects(lampMeshes, false);
			if (lampHits.length > 0) { import('$lib/stores/scene.svelte.js').then(({ toggleLamp }) => toggleLamp()); return; }
			const hits = raycaster.intersectObjects(allInteractiveMeshes, false);
			const obj = hits.length > 0 ? resolveHit(hits[0].object) : null;
			if (obj) { focusObject(obj); } else if (focusedObject) { doResetCamera(); }
		}, { passive: true });

		window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

		/* ═══════════════════════════════════════════════════════════
		   RENDER LOOP
		═══════════════════════════════════════════════════════════ */
		const _vProj = new THREE.Vector3();
		function updateLabels(hideDueToFocus: boolean) {
			labelDefs.forEach((def: any) => {
				const el = labelEls[def.key]; if (!el) return;
				if (hideDueToFocus) { el.style.opacity = '0'; return; }
				const srcMesh = def.getMesh ? def.getMesh() : def.mesh;
				const wp = new THREE.Vector3(); srcMesh.getWorldPosition(wp); wp.add(def.offset);
				_vProj.copy(wp).project(camera);
				if (_vProj.z > 1) { el.style.opacity = '0'; return; }
				const x = (_vProj.x * 0.5 + 0.5) * window.innerWidth;
				const y = (-_vProj.y * 0.5 + 0.5) * window.innerHeight;
				el.style.transform = `translate(-50%, -100%) translate(${x}px,${y}px)`; el.style.opacity = '1';
			});
		}

		// Initial lighting pass
		tickScene();

		setProgress(100, 'Ready!');

		// Intro fly-in
		gsap.to(camera.position, { x: DEFAULT_CAM_POS.x, y: DEFAULT_CAM_POS.y, z: DEFAULT_CAM_POS.z, duration: 2.2, ease: 'power3.inOut',
			onUpdate() { camera.lookAt(DEFAULT_CAM_TARGET); },
			onComplete() { controls.enabled = true; }
		});

		let lastTime = 0;
		function animate(time: number) {
			raf = requestAnimationFrame(animate);
			const dt = Math.min((time - lastTime) * 0.001, 0.05); lastTime = time;
			tickScene();
			deskGlowRef.intensity = deskGlowBase + Math.sin(time * 0.0028) * 0.06;
			if (lampOn) lampLightRef.intensity = lampLightBase + Math.sin(time * 0.0031 + 1.2) * 0.08;

			// Particle drift
			const posAttr = particleGeoRef.attributes.position;
			for (let i = 0; i < PARTICLE_COUNT; i++) {
				posAttr.setY(i, posAttr.getY(i) + dt * 0.05);
				if (posAttr.getY(i) > 6.2) posAttr.setY(i, 0.4);
				posAttr.setX(i, posAttr.getX(i) + Math.sin(time * 0.0004 + i) * dt * 0.012);
			}
			posAttr.needsUpdate = true;

			// Character sway at desk
			if (charState === 'sitting') { characterGroupRef.rotation.y = DESK_ROT_Y + Math.sin(time * 0.0009) * 0.035; }

			updateLabels(!!focusedObject);
			controls.update();
			renderer.render(scene, camera);
		}
		animate(0);

		return () => { cancelAnimationFrame(raf); renderer.dispose(); };
	});
</script>

<canvas bind:this={canvasEl} aria-label="Interactive 3D portfolio room — use mouse to orbit, click objects to explore"></canvas>
<div bind:this={labelsEl} class="labels-container" aria-hidden="true"></div>

<style>
	canvas {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		z-index: 0;
	}
	.labels-container {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 1;
	}
	:global(.scene-label) {
		position: absolute;
		top: 0; left: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		background: rgba(0 0 0 / 0.55);
		backdrop-filter: blur(6px);
		border-radius: 20px;
		color: #fff;
		font-size: 13px;
		font-weight: 500;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.25s ease;
		white-space: nowrap;
	}
	:global(.label-emoji) { font-size: 15px; }
</style>
