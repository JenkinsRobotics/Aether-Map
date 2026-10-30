import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { argv, stdin, stdout } from "node:process";
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region src/document.ts
var DEFAULT_SURFACE_LOOK = {
	/**
	* On screen: a violet checkerboard with a white edge and white pins. Two near
	* shades rather than one flat colour, because a checker reads as a *surface*
	* against a photographed wall where a flat fill reads as a hole, and the
	* squares show a warp the moment you drag a corner.
	*/
	device: {
		pattern: "checker",
		primary: "#5b5bd6",
		secondary: "#7b7be6",
		border: "#ffffff",
		sections: 6,
		opacity: 1,
		pinSizePx: 9
	},
	/**
	* On the wall: black and white. Maximum contrast is the whole job in a dark
	* room, and a checker's corners are easier to line up against a physical edge
	* than a grid's lines are.
	*/
	external: {
		pattern: "checker",
		primary: "#000000",
		secondary: "#ffffff",
		border: "#ffffff",
		sections: 6,
		opacity: 1,
		pinSizePx: 0
	}
};
var DEFAULT_TEXT = {
	text: "Text",
	sizePx: 96,
	color: "#ffffff",
	background: "transparent",
	align: "center"
};
/** Identity colours for layers, assigned in turn as layers are created. */
var LAYER_COLORS = [
	"#4c9dff",
	"#ff8a3d",
	"#8b87ff",
	"#32cf84",
	"#e7a843",
	"#36d6c3",
	"#ff5c8a",
	"#c7d3de"
];
function layerColor(index) {
	return LAYER_COLORS[(index % LAYER_COLORS.length + LAYER_COLORS.length) % LAYER_COLORS.length];
}
function activeScene(show) {
	return show.scenes.find((s) => s.id === show.activeSceneId) ?? show.scenes[0];
}
/** Outputs are born bound: an output nobody connected is a dark projector. */
function newOutput(name, sceneId, kind = "monitor") {
	return {
		id: nextId("out"),
		name,
		kind,
		sceneId
	};
}
function newScene(name, artboard = {
	widthPx: 1920,
	heightPx: 1080
}) {
	return {
		id: nextId("sc"),
		name,
		artboard,
		durationS: 60,
		surfaces: []
	};
}
var DEFAULT_OUTPUT = {
	width: 1920,
	height: 1080
};
function emptyShow() {
	const scene = newScene("Canvas 1");
	return {
		version: 3,
		output: { ...DEFAULT_OUTPUT },
		outputs: [newOutput("Output 1", scene.id)],
		surfaceLook: {
			device: { ...DEFAULT_SURFACE_LOOK.device },
			external: { ...DEFAULT_SURFACE_LOOK.external }
		},
		media: [],
		unassignedSurfaces: [],
		scenes: [scene],
		activeSceneId: scene.id,
		playback: { mode: "loop" }
	};
}
var counter = 0;
function nextId(prefix) {
	counter += 1;
	return `${prefix}${counter}-${Math.random().toString(36).slice(2, 8)}`;
}
/**
* A new surface covers the middle half of the scene artboard, so it is visible
* and draggable the moment it is created.
*/
function newSurface(output, index) {
	const w = output.width;
	const h = output.height;
	const side = Math.round(Math.min(w, h) * .6);
	const nudge = index % 6 * 24;
	const left = Math.round((w - side) / 2) + nudge;
	const top = Math.round((h - side) / 2) + nudge;
	return {
		id: nextId("s"),
		name: `Surface ${index + 1}`,
		enabled: true,
		color: layerColor(index),
		corners: [
			[left, top],
			[left + side, top],
			[left + side, top + side],
			[left, top + side]
		],
		source: {
			mediaId: null,
			rect: [
				0,
				0,
				side,
				side
			]
		},
		masks: [],
		opacity: 1,
		cues: [],
		clips: []
	};
}
function quadCorners(rect) {
	const [x, y, w, h] = rect;
	return [
		[x, y],
		[x + w, y],
		[x + w, y + h],
		[x, y + h]
	];
}
/** Every authored surface, including objects parked outside all artboards. */
function allSurfaces(show) {
	return [...show.unassignedSurfaces, ...show.scenes.flatMap((scene) => scene.surfaces)];
}
/** The collection that currently owns a surface. `scene` absent means workspace root. */
function surfaceCollection(show, surfaceID) {
	if (show.unassignedSurfaces.some((surface) => surface.id === surfaceID)) return {
		scene: null,
		surfaces: show.unassignedSurfaces
	};
	const scene = show.scenes.find((entry) => entry.surfaces.some((surface) => surface.id === surfaceID));
	return scene ? {
		scene,
		surfaces: scene.surfaces
	} : void 0;
}
/** Change whichever collection owns `surfaceID`, without depending on the active scene. */
function withSurfaceCollection(show, surfaceID, change) {
	if (show.unassignedSurfaces.some((surface) => surface.id === surfaceID)) return {
		...show,
		unassignedSurfaces: change(show.unassignedSurfaces)
	};
	const owner = show.scenes.find((scene) => scene.surfaces.some((surface) => surface.id === surfaceID));
	if (!owner) return show;
	return {
		...show,
		scenes: show.scenes.map((scene) => scene.id === owner.id ? {
			...scene,
			surfaces: change(scene.surfaces)
		} : scene)
	};
}
/**
* The scenes on screen right now, back to front, with the opacity each is
* mixed at. One entry normally; two while a crossfade is engaged. A layer at
* zero is dropped rather than drawn invisibly — at either end of the fader the
* show costs exactly what it did before the crossfade existed.
*/
function sceneLayers(show, { editor = false } = {}) {
	const a = activeScene(show);
	const b = show.mix?.sceneId ? show.scenes.find((scene) => scene.id === show.mix.sceneId) : void 0;
	if (!a || a.suppressed && !editor) return [];
	if (!b || b.id === a.id || b.suppressed) return [{
		scene: a,
		opacity: 1,
		active: true
	}];
	const blend = Math.min(1, Math.max(0, show.mix?.blend ?? 0));
	return [{
		scene: a,
		opacity: 1 - blend,
		active: true
	}, {
		scene: b,
		opacity: blend,
		active: false
	}].filter((layer) => layer.opacity > 0);
}
/**
* Layer order is paint order, so a folder has to be one contiguous run or the
* tree would claim a z-order the renderer does not have. Each folder's run sits
* where its first member sat and members keep their relative order; loose
* layers keep their own positions, so folders and loose layers still interleave.
* Idempotent: a correctly grouped list comes back unchanged.
*/
function groupSurfaces(list) {
	const out = [];
	const placed = /* @__PURE__ */ new Set();
	for (const surface of list) {
		if (placed.has(surface.id)) continue;
		if (!surface.folder) {
			out.push(surface);
			placed.add(surface.id);
			continue;
		}
		for (const member of list) if (member.folder === surface.folder && !placed.has(member.id)) {
			out.push(member);
			placed.add(member.id);
		}
	}
	return out;
}
//#endregion
//#region src/features/original-shader-presets.ts
/** Renderer-independent metadata for Map’s original RGB palette generators. */
var variants = (_mode, names, colors, density, speed = .5) => names.map((name, i) => ({
	name,
	params: {
		density: density * (1 + i * .3),
		speed: speed * (1 + i * .25),
		glow: 1,
		scale: 1,
		rotation: 0,
		colors: colors[i]
	}
}));
var neon = [
	[
		"#020611",
		"#08ddf7",
		"#ef3af2"
	],
	[
		"#020a09",
		"#38ff8e",
		"#ffd962"
	],
	[
		"#0c020b",
		"#fa458c",
		"#6776ff"
	]
];
var cool = [
	[
		"#020715",
		"#27a4b8",
		"#aeecff"
	],
	[
		"#06071b",
		"#956aff",
		"#ffc8e9"
	],
	[
		"#020d0b",
		"#26bf82",
		"#e0f5a4"
	]
];
var GALLERY_DEFINITIONS = [
	{
		id: "neon-beams",
		label: "Neon Beams",
		presets: variants(0, [
			"Laser studio",
			"Electric lime",
			"Rose lasers"
		], neon, 6)
	},
	{
		id: "synthwave",
		label: "Synthwave",
		presets: variants(1, [
			"Midnight drive",
			"Miami sunset",
			"After hours"
		], neon, 5, .65)
	},
	{
		id: "pixel-mosaic",
		label: "Pixel Mosaic",
		presets: variants(2, [
			"Pixel dance",
			"Arcade lights",
			"Disco tiles"
		], neon, 12)
	},
	{
		id: "contour-lines",
		label: "Contour Lines",
		presets: variants(3, [
			"Contour bloom",
			"Topographic glow",
			"Ripple rings"
		], cool, 18)
	},
	{
		id: "starfield",
		label: "Starfield",
		presets: variants(4, [
			"Starlight",
			"Violet cosmos",
			"Fireflies"
		], cool, 6, .4)
	},
	{
		id: "aurora",
		label: "Aurora",
		presets: variants(5, [
			"Northern lights",
			"Violet curtains",
			"Emerald sky"
		], cool, 16, .35)
	},
	{
		id: "snowfall",
		label: "Snowfall",
		presets: variants(6, [
			"Winter snow",
			"Sugar plum snow",
			"Golden flurries"
		], cool, 5)
	},
	{
		id: "heart-confetti",
		label: "Heart Confetti",
		presets: variants(7, [
			"Candy hearts",
			"Valentine glow",
			"Golden hearts"
		], [
			[
				"#160817",
				"#ff356b",
				"#f6a2cf"
			],
			[
				"#090312",
				"#a545df",
				"#f38ee8"
			],
			[
				"#130907",
				"#af7535",
				"#fff0ab"
			]
		], 3, .35)
	},
	{
		id: "watchful-eye",
		label: "Watchful Eye",
		presets: variants(8, [
			"Blue eye",
			"Amber eye",
			"Emerald eye"
		], [
			[
				"#000000",
				"#224b63",
				"#84c8d9"
			],
			[
				"#000000",
				"#6f2f0f",
				"#c39339"
			],
			[
				"#000000",
				"#234b2e",
				"#a1b257"
			]
		], 36, .5)
	},
	{
		id: "jack-lantern",
		label: "Jack-o’-lantern",
		presets: variants(9, [
			"Pumpkin grin",
			"Witchlight grin",
			"Ghostlight grin"
		], [
			[
				"#000000",
				"#fb4b00",
				"#ffcc39"
			],
			[
				"#000000",
				"#4dce27",
				"#c1ff55"
			],
			[
				"#000000",
				"#542ad2",
				"#a0c7ff"
			]
		], 3, .5)
	},
	{
		id: "moonlit-window",
		label: "Moonlit Window",
		presets: variants(10, [
			"Moonlit hills",
			"Twilight window",
			"Emerald evening"
		], cool, 3, .3)
	}
];
var stageNeon = [
	"#020611",
	"#08ddf7",
	"#ef3af2"
];
var STAGE_DEFINITIONS = [
	{
		id: "fireworks",
		label: "Fireworks",
		category: "Holiday",
		description: "Staggered radial spark bursts with falling trails.",
		params: {
			bursts: 3,
			particles: 32,
			gravity: .22,
			glow: 1.4,
			tail: .2
		},
		colors: stageNeon
	},
	{
		id: "electric-storm",
		label: "Electric Storm",
		category: "Halloween",
		description: "Branching lightning bolts with changing paths and local flicker.",
		params: {
			bolts: 2,
			roughness: .6,
			glow: 1.1,
			width: .002
		},
		colors: [
			"#01030d",
			"#3b6dee",
			"#dceaff"
		]
	},
	{
		id: "radar-sweep",
		label: "Radar Sweep",
		category: "Neon",
		description: "A rotating radar beam reveals points across concentric range rings.",
		params: {
			rings: 5,
			blips: 14,
			trail: .4,
			glow: 1.8
		},
		colors: [
			"#010a07",
			"#16966a",
			"#72ffb8"
		]
	},
	{
		id: "moire-weave",
		label: "Moire Weave",
		category: "Geometric",
		description: "Two fine gratings interfere to form slowly shifting woven bands.",
		params: {
			spacing: 70,
			twist: 1,
			contrast: 1.5
		},
		colors: stageNeon
	},
	{
		id: "lissajous-ribbons",
		label: "Lissajous Ribbons",
		category: "Geometric",
		description: "Two oscillations trace a luminous ribbon with an evolving phase.",
		params: {
			frequencyX: 3,
			frequencyY: 2,
			width: .004,
			glow: 1
		},
		colors: stageNeon
	},
	{
		id: "pulse-columns",
		label: "Pulse Columns",
		category: "Pixel",
		description: "Segmented columns rise and fall in a repeating decorative rhythm. Assign audio to amplitude for live response.",
		params: {
			columns: 22,
			steps: 28,
			gap: .2,
			amplitude: .85,
			glow: .6
		},
		colors: stageNeon
	},
	{
		id: "sand-dunes",
		label: "Sand Dunes",
		category: "Ambient",
		description: "Wind-shaped ridges catch directional light as their surface flows.",
		params: {
			ridges: 9,
			wind: 1,
			lightAngle: 45,
			contrast: 1.1
		},
		colors: [
			"#24132c",
			"#d08c59",
			"#ffe0a8"
		]
	},
	{
		id: "digital-rain",
		label: "Digital Rain",
		category: "Pixel",
		description: "Abstract illuminated glyphs fall in columns with fading trails.",
		params: {
			columns: 32,
			trail: .25,
			glow: 1.6
		},
		colors: [
			"#000603",
			"#08a356",
			"#a2ffcc"
		]
	}
];
var NATIVE_SHADER_IDS = /* @__PURE__ */ new Set([
	"kaleidoscope",
	"tunnel",
	...GALLERY_DEFINITIONS.map((entry) => entry.id),
	...STAGE_DEFINITIONS.map((entry) => entry.id)
]);
//#endregion
//#region node_modules/@paper-design/shaders/dist/vertex-shader.js
var vertexShaderSource = `#version 300 es
precision mediump float;

layout(location = 0) in vec4 a_position;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_imageAspectRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

out vec2 v_objectUV;
out vec2 v_objectBoxSize;
out vec2 v_responsiveUV;
out vec2 v_responsiveBoxGivenSize;
out vec2 v_patternUV;
out vec2 v_patternBoxSize;
out vec2 v_imageUV;

vec3 getBoxSize(float boxRatio, vec2 givenBoxSize) {
  vec2 box = vec2(0.);
  // fit = none
  box.x = boxRatio * min(givenBoxSize.x / boxRatio, givenBoxSize.y);
  float noFitBoxWidth = box.x;
  if (u_fit == 1.) { // fit = contain
    box.x = boxRatio * min(u_resolution.x / boxRatio, u_resolution.y);
  } else if (u_fit == 2.) { // fit = cover
    box.x = boxRatio * max(u_resolution.x / boxRatio, u_resolution.y);
  }
  box.y = box.x / boxRatio;
  return vec3(box, noFitBoxWidth);
}

void main() {
  gl_Position = a_position;

  vec2 uv = gl_Position.xy * .5;
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * 3.14159265358979323846 / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);


  // ===================================================

  float fixedRatio = 1.;
  vec2 fixedRatioBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );

  v_objectBoxSize = getBoxSize(fixedRatio, fixedRatioBoxGivenSize).xy;
  vec2 objectWorldScale = u_resolution.xy / v_objectBoxSize;

  v_objectUV = uv;
  v_objectUV *= objectWorldScale;
  v_objectUV += boxOrigin * (objectWorldScale - 1.);
  v_objectUV += graphicOffset;
  v_objectUV /= u_scale;
  v_objectUV = graphicRotation * v_objectUV;

  // ===================================================

  v_responsiveBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  float responsiveRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 responsiveBoxSize = getBoxSize(responsiveRatio, v_responsiveBoxGivenSize).xy;
  vec2 responsiveBoxScale = u_resolution.xy / responsiveBoxSize;

  #ifdef ADD_HELPERS
  v_responsiveHelperBox = uv;
  v_responsiveHelperBox *= responsiveBoxScale;
  v_responsiveHelperBox += boxOrigin * (responsiveBoxScale - 1.);
  #endif

  v_responsiveUV = uv;
  v_responsiveUV *= responsiveBoxScale;
  v_responsiveUV += boxOrigin * (responsiveBoxScale - 1.);
  v_responsiveUV += graphicOffset;
  v_responsiveUV /= u_scale;
  v_responsiveUV.x *= responsiveRatio;
  v_responsiveUV = graphicRotation * v_responsiveUV;
  v_responsiveUV.x /= responsiveRatio;

  // ===================================================

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 patternBoxGivenSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;

  vec3 boxSizeData = getBoxSize(patternBoxRatio, patternBoxGivenSize);
  v_patternBoxSize = boxSizeData.xy;
  float patternBoxNoFitBoxWidth = boxSizeData.z;
  vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;

  v_patternUV = uv;
  v_patternUV += graphicOffset / patternBoxScale;
  v_patternUV += boxOrigin;
  v_patternUV -= boxOrigin / patternBoxScale;
  v_patternUV *= u_resolution.xy;
  v_patternUV /= u_pixelRatio;
  if (u_fit > 0.) {
    v_patternUV *= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
  }
  v_patternUV /= u_scale;
  v_patternUV = graphicRotation * v_patternUV;
  v_patternUV += boxOrigin / patternBoxScale;
  v_patternUV -= boxOrigin;
  // x100 is a default multiplier between vertex and fragmant shaders
  // we use it to avoid UV presision issues
  v_patternUV *= .01;

  // ===================================================

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  v_imageUV = uv;
  v_imageUV *= imageBoxScale;
  v_imageUV += boxOrigin * (imageBoxScale - 1.);
  v_imageUV += graphicOffset;
  v_imageUV /= u_scale;
  v_imageUV.x *= u_imageAspectRatio;
  v_imageUV = graphicRotation * v_imageUV;
  v_imageUV.x /= u_imageAspectRatio;

  v_imageUV += .5;
  v_imageUV.y = 1. - v_imageUV.y;
}`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shader-mount.js
var DEFAULT_MAX_PIXEL_COUNT = 8294400;
var ShaderMount$1 = class {
	parentElement;
	canvasElement;
	gl;
	program = null;
	uniformLocations = {};
	/** The fragment shader that we are using */
	fragmentShader;
	/** Stores the RAF for the render loop */
	rafId = null;
	/** Time of the last rendered frame */
	lastRenderTime = 0;
	/** Total time that we have played any animation, passed as a uniform to the shader for time-based VFX */
	currentFrame = 0;
	/** The speed that we progress through animation time (multiplies by delta time every update). Allows negatives to play in reverse. If set to 0, rAF will stop entirely so static shaders have no recurring performance costs */
	speed = 0;
	/** Actual speed used that accounts for visibility: we pause the shader if the tab is hidden or the element out of the viewport */
	currentSpeed = 0;
	/** Uniforms that are provided by the user for the specific shader being mounted (not including uniforms that this Mount adds, like time and resolution) */
	providedUniforms;
	/** Names of the uniforms that should have mipmaps generated for them */
	mipmaps = [];
	/** Just a sanity check to make sure frames don't run after we're disposed */
	hasBeenDisposed = false;
	/** If the resolution of the canvas has changed since the last render */
	resolutionChanged = true;
	/** Store textures that are provided by the user */
	textures = /* @__PURE__ */ new Map();
	minPixelRatio;
	maxPixelCount;
	isSafari = isSafari();
	uniformCache = {};
	textureUnitMap = /* @__PURE__ */ new Map();
	ownerDocument;
	constructor(parentElement, fragmentShader, uniforms, webGlContextAttributes, speed = 0, frame = 0, minPixelRatio = 2, maxPixelCount = DEFAULT_MAX_PIXEL_COUNT, mipmaps = []) {
		if (parentElement?.nodeType === 1) this.parentElement = parentElement;
		else throw new Error("Paper Shaders: parent element must be an HTMLElement");
		this.ownerDocument = parentElement.ownerDocument;
		if (!this.ownerDocument.querySelector("style[data-paper-shader]")) {
			const styleElement = this.ownerDocument.createElement("style");
			styleElement.innerHTML = defaultStyle;
			styleElement.setAttribute("data-paper-shader", "");
			this.ownerDocument.head.prepend(styleElement);
		}
		const canvasElement = this.ownerDocument.createElement("canvas");
		this.canvasElement = canvasElement;
		this.parentElement.prepend(canvasElement);
		this.fragmentShader = fragmentShader;
		this.providedUniforms = uniforms;
		this.mipmaps = mipmaps;
		this.currentFrame = frame;
		this.minPixelRatio = minPixelRatio;
		this.maxPixelCount = maxPixelCount;
		const gl = canvasElement.getContext("webgl2", webGlContextAttributes);
		if (!gl) throw new Error("Paper Shaders: WebGL is not supported in this browser");
		this.gl = gl;
		this.initProgram();
		this.setupPositionAttribute();
		this.setupUniforms();
		this.setUniformValues(this.providedUniforms);
		this.setupResizeObserver();
		visualViewport?.addEventListener("resize", this.handleVisualViewportChange);
		this.setupIntersectionObserver();
		this.setSpeed(speed);
		this.parentElement.setAttribute("data-paper-shader", "");
		this.parentElement.paperShaderMount = this;
		this.ownerDocument.addEventListener("visibilitychange", this.handleDocumentVisibilityChange);
	}
	initProgram = () => {
		const program = createProgram(this.gl, vertexShaderSource, this.fragmentShader);
		if (!program) return;
		this.program = program;
	};
	setupPositionAttribute = () => {
		const positionAttributeLocation = this.gl.getAttribLocation(this.program, "a_position");
		const positionBuffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
			-1,
			-1,
			1,
			-1,
			-1,
			1,
			-1,
			1,
			1,
			-1,
			1,
			1
		]), this.gl.STATIC_DRAW);
		this.gl.enableVertexAttribArray(positionAttributeLocation);
		this.gl.vertexAttribPointer(positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
	};
	setupUniforms = () => {
		const uniformLocations = {
			u_time: this.gl.getUniformLocation(this.program, "u_time"),
			u_pixelRatio: this.gl.getUniformLocation(this.program, "u_pixelRatio"),
			u_resolution: this.gl.getUniformLocation(this.program, "u_resolution")
		};
		Object.entries(this.providedUniforms).forEach(([key, value]) => {
			uniformLocations[key] = this.gl.getUniformLocation(this.program, key);
			if (value instanceof HTMLImageElement) {
				const aspectRatioUniformName = `${key}AspectRatio`;
				uniformLocations[aspectRatioUniformName] = this.gl.getUniformLocation(this.program, aspectRatioUniformName);
			}
		});
		this.uniformLocations = uniformLocations;
	};
	/**
	* The scale that we should render at.
	* - Used to target 2x rendering even on 1x screens for better antialiasing
	* - Prevents the virtual resolution from going beyond the maximum resolution
	* - Accounts for the page zoom level so we render in physical device pixels rather than CSS pixels
	*/
	renderScale = 1;
	parentWidth = 0;
	parentHeight = 0;
	parentDevicePixelWidth = 0;
	parentDevicePixelHeight = 0;
	devicePixelsSupported = false;
	intersectionObserver = null;
	isInViewport = true;
	resizeObserver = null;
	setupResizeObserver = () => {
		this.resizeObserver = new ResizeObserver(([entry]) => {
			if (entry?.borderBoxSize[0]) {
				const physicalPixelSize = entry.devicePixelContentBoxSize?.[0];
				if (physicalPixelSize !== void 0) {
					this.devicePixelsSupported = true;
					this.parentDevicePixelWidth = physicalPixelSize.inlineSize;
					this.parentDevicePixelHeight = physicalPixelSize.blockSize;
				}
				this.parentWidth = entry.borderBoxSize[0].inlineSize;
				this.parentHeight = entry.borderBoxSize[0].blockSize;
			}
			this.handleResize();
		});
		this.resizeObserver.observe(this.parentElement);
	};
	setupIntersectionObserver = () => {
		const view = this.ownerDocument.defaultView;
		if (!view?.IntersectionObserver) return;
		this.intersectionObserver = new view.IntersectionObserver(([entry]) => {
			this.isInViewport = entry?.isIntersecting ?? true;
			this.updateCurrentSpeed();
		});
		this.intersectionObserver.observe(this.parentElement);
	};
	handleVisualViewportChange = () => {
		this.resizeObserver?.disconnect();
		this.setupResizeObserver();
	};
	/** Resize handler for when the container div changes size or the max pixel count changes and we want to resize our canvas to match */
	handleResize = () => {
		let targetPixelWidth = 0;
		let targetPixelHeight = 0;
		const dpr = Math.max(1, window.devicePixelRatio);
		const pinchZoom = visualViewport?.scale ?? 1;
		if (this.devicePixelsSupported) {
			const scaleToMeetMinPixelRatio = Math.max(1, this.minPixelRatio / dpr);
			targetPixelWidth = this.parentDevicePixelWidth * scaleToMeetMinPixelRatio * pinchZoom;
			targetPixelHeight = this.parentDevicePixelHeight * scaleToMeetMinPixelRatio * pinchZoom;
		} else {
			let targetRenderScale = Math.max(dpr, this.minPixelRatio) * pinchZoom;
			if (this.isSafari) {
				const zoomLevel = bestGuessBrowserZoom(this.ownerDocument);
				targetRenderScale *= Math.max(1, zoomLevel);
			}
			targetPixelWidth = Math.round(this.parentWidth) * targetRenderScale;
			targetPixelHeight = Math.round(this.parentHeight) * targetRenderScale;
		}
		const maxPixelCountHeadroom = Math.sqrt(this.maxPixelCount) / Math.sqrt(targetPixelWidth * targetPixelHeight);
		const scaleToMeetMaxPixelCount = Math.min(1, maxPixelCountHeadroom);
		const newWidth = Math.round(targetPixelWidth * scaleToMeetMaxPixelCount);
		const newHeight = Math.round(targetPixelHeight * scaleToMeetMaxPixelCount);
		const newRenderScale = newWidth / Math.round(this.parentWidth);
		if (this.canvasElement.width !== newWidth || this.canvasElement.height !== newHeight || this.renderScale !== newRenderScale) {
			this.renderScale = newRenderScale;
			this.canvasElement.width = newWidth;
			this.canvasElement.height = newHeight;
			this.resolutionChanged = true;
			this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
			this.render(performance.now());
		}
	};
	render = (currentTime) => {
		if (this.hasBeenDisposed) return;
		if (this.program === null) {
			console.warn("Tried to render before program or gl was initialized");
			return;
		}
		const dt = currentTime - this.lastRenderTime;
		this.lastRenderTime = currentTime;
		if (this.currentSpeed !== 0) this.currentFrame += dt * this.currentSpeed;
		this.gl.clear(this.gl.COLOR_BUFFER_BIT);
		this.gl.useProgram(this.program);
		this.gl.uniform1f(this.uniformLocations.u_time, this.currentFrame * .001);
		if (this.resolutionChanged) {
			this.gl.uniform2f(this.uniformLocations.u_resolution, this.gl.canvas.width, this.gl.canvas.height);
			this.gl.uniform1f(this.uniformLocations.u_pixelRatio, this.renderScale);
			this.resolutionChanged = false;
		}
		this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
		if (this.currentSpeed !== 0) this.requestRender();
		else this.rafId = null;
	};
	requestRender = () => {
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.rafId = requestAnimationFrame(this.render);
	};
	/** Creates a texture from an image and sets it into a uniform value */
	setTextureUniform = (uniformName, image) => {
		if (!image.complete || image.naturalWidth === 0) throw new Error(`Paper Shaders: image for uniform ${uniformName} must be fully loaded`);
		const existingTexture = this.textures.get(uniformName);
		if (existingTexture) this.gl.deleteTexture(existingTexture);
		if (!this.textureUnitMap.has(uniformName)) this.textureUnitMap.set(uniformName, this.textureUnitMap.size);
		const textureUnit = this.textureUnitMap.get(uniformName);
		this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
		const texture = this.gl.createTexture();
		this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
		this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
		this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
		if (this.mipmaps.includes(uniformName)) {
			this.gl.generateMipmap(this.gl.TEXTURE_2D);
			this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
		}
		const error = this.gl.getError();
		if (error !== this.gl.NO_ERROR || texture === null) {
			console.error("Paper Shaders: WebGL error when uploading texture:", error);
			return;
		}
		this.textures.set(uniformName, texture);
		const location = this.uniformLocations[uniformName];
		if (location) {
			this.gl.uniform1i(location, textureUnit);
			const aspectRatioUniformName = `${uniformName}AspectRatio`;
			const aspectRatioLocation = this.uniformLocations[aspectRatioUniformName];
			if (aspectRatioLocation) {
				const aspectRatio = image.naturalWidth / image.naturalHeight;
				this.gl.uniform1f(aspectRatioLocation, aspectRatio);
			}
		}
	};
	/** Utility: recursive equality test for all the uniforms */
	areUniformValuesEqual = (a, b) => {
		if (a === b) return true;
		if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.every((val, i) => this.areUniformValuesEqual(val, b[i]));
		return false;
	};
	/** Sets the provided uniform values into the WebGL program, can be a partial list of uniforms that have changed */
	setUniformValues = (updatedUniforms) => {
		this.gl.useProgram(this.program);
		Object.entries(updatedUniforms).forEach(([key, value]) => {
			let cacheValue = value;
			if (value instanceof HTMLImageElement) cacheValue = `${value.src.slice(0, 200)}|${value.naturalWidth}x${value.naturalHeight}`;
			if (this.areUniformValuesEqual(this.uniformCache[key], cacheValue)) return;
			this.uniformCache[key] = cacheValue;
			const location = this.uniformLocations[key];
			if (!location) {
				console.warn(`Uniform location for ${key} not found`);
				return;
			}
			if (value instanceof HTMLImageElement) this.setTextureUniform(key, value);
			else if (Array.isArray(value)) {
				let flatArray = null;
				let valueLength = null;
				if (value[0] !== void 0 && Array.isArray(value[0])) {
					const firstChildLength = value[0].length;
					if (value.every((arr) => arr.length === firstChildLength)) {
						flatArray = value.flat();
						valueLength = firstChildLength;
					} else {
						console.warn(`All child arrays must be the same length for ${key}`);
						return;
					}
				} else {
					flatArray = value;
					valueLength = flatArray.length;
				}
				switch (valueLength) {
					case 2:
						this.gl.uniform2fv(location, flatArray);
						break;
					case 3:
						this.gl.uniform3fv(location, flatArray);
						break;
					case 4:
						this.gl.uniform4fv(location, flatArray);
						break;
					case 9:
						this.gl.uniformMatrix3fv(location, false, flatArray);
						break;
					case 16:
						this.gl.uniformMatrix4fv(location, false, flatArray);
						break;
					default: console.warn(`Unsupported uniform array length: ${valueLength}`);
				}
			} else if (typeof value === "number") this.gl.uniform1f(location, value);
			else if (typeof value === "boolean") this.gl.uniform1i(location, value ? 1 : 0);
			else console.warn(`Unsupported uniform type for ${key}: ${typeof value}`);
		});
	};
	/** Gets the current total animation time from 0ms */
	getCurrentFrame = () => {
		return this.currentFrame;
	};
	/** Set a frame to get a deterministic result, frames are literally just milliseconds from zero since the animation started */
	setFrame = (newFrame) => {
		this.currentFrame = newFrame;
		this.lastRenderTime = performance.now();
		this.render(performance.now());
	};
	/** Set an animation speed (or 0 to stop animation) */
	setSpeed = (newSpeed = 1) => {
		this.speed = newSpeed;
		this.updateCurrentSpeed();
	};
	/** Apply the target speed, pausing (0) while the tab is hidden or the element is out of the viewport */
	updateCurrentSpeed = () => {
		this.setCurrentSpeed(this.ownerDocument.hidden || !this.isInViewport ? 0 : this.speed);
	};
	setCurrentSpeed = (newSpeed) => {
		this.currentSpeed = newSpeed;
		if (this.rafId === null && newSpeed !== 0) {
			this.lastRenderTime = performance.now();
			this.rafId = requestAnimationFrame(this.render);
		}
		if (this.rafId !== null && newSpeed === 0) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	};
	/** Set the maximum pixel count for the shader, this will limit the number of pixels that will be rendered */
	setMaxPixelCount = (newMaxPixelCount = DEFAULT_MAX_PIXEL_COUNT) => {
		this.maxPixelCount = newMaxPixelCount;
		this.handleResize();
	};
	/** Set the minimum pixel ratio for the shader */
	setMinPixelRatio = (newMinPixelRatio = 2) => {
		this.minPixelRatio = newMinPixelRatio;
		this.handleResize();
	};
	/** Update the uniforms that are provided by the outside shader, can be a partial set with only the uniforms that have changed */
	setUniforms = (newUniforms) => {
		this.setUniformValues(newUniforms);
		this.providedUniforms = {
			...this.providedUniforms,
			...newUniforms
		};
		this.render(performance.now());
	};
	handleDocumentVisibilityChange = () => {
		this.updateCurrentSpeed();
	};
	/** Dispose of the shader mount, cleaning up all of the WebGL resources */
	dispose = () => {
		this.hasBeenDisposed = true;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		if (this.gl && this.program) {
			this.textures.forEach((texture) => {
				this.gl.deleteTexture(texture);
			});
			this.textures.clear();
			this.gl.deleteProgram(this.program);
			this.program = null;
			this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
			this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
			this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
			this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
			this.gl.getError();
		}
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		if (this.intersectionObserver) {
			this.intersectionObserver.disconnect();
			this.intersectionObserver = null;
		}
		visualViewport?.removeEventListener("resize", this.handleVisualViewportChange);
		this.ownerDocument.removeEventListener("visibilitychange", this.handleDocumentVisibilityChange);
		this.uniformLocations = {};
		this.canvasElement.remove();
		delete this.parentElement.paperShaderMount;
	};
};
function createShader(gl, type, source) {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}
function createProgram(gl, vertexShaderSource2, fragmentShaderSource) {
	const format = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
	const precision = format ? format.precision : null;
	if (precision && precision < 23) {
		vertexShaderSource2 = vertexShaderSource2.replace(/precision\s+(lowp|mediump)\s+float;/g, "precision highp float;");
		fragmentShaderSource = fragmentShaderSource.replace(/precision\s+(lowp|mediump)\s+float/g, "precision highp float").replace(/\b(uniform|varying|attribute)\s+(lowp|mediump)\s+(\w+)/g, "$1 highp $3");
	}
	const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource2);
	const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
	if (!vertexShader || !fragmentShader) return null;
	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error("Unable to initialize the shader program: " + gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		return null;
	}
	gl.detachShader(program, vertexShader);
	gl.detachShader(program, fragmentShader);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);
	return program;
}
var defaultStyle = `@layer paper-shaders {
  :where([data-paper-shader]) {
    isolation: isolate;
    position: relative;

    & canvas {
      contain: strict;
      display: block;
      position: absolute;
      inset: 0;
      z-index: -1;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      corner-shape: inherit;
    }
  }
}`;
function isSafari() {
	const ua = navigator.userAgent.toLowerCase();
	return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("android");
}
function bestGuessBrowserZoom(doc) {
	const viewportScale = visualViewport?.scale ?? 1;
	const viewportWidth = visualViewport?.width ?? window.innerWidth;
	const scrollbarWidth = window.innerWidth - doc.documentElement.clientWidth;
	const innerWidth = viewportScale * viewportWidth + scrollbarWidth;
	const ratio = outerWidth / innerWidth;
	const zoomPercentageRounded = Math.round(100 * ratio);
	if (zoomPercentageRounded % 5 === 0) return zoomPercentageRounded / 100;
	if (zoomPercentageRounded === 33) return 1 / 3;
	if (zoomPercentageRounded === 67) return 2 / 3;
	if (zoomPercentageRounded === 133) return 4 / 3;
	return ratio;
}
//#endregion
//#region node_modules/@paper-design/shaders/dist/shader-sizing.js
var defaultObjectSizing = {
	fit: "contain",
	scale: 1,
	rotation: 0,
	offsetX: 0,
	offsetY: 0,
	originX: .5,
	originY: .5,
	worldWidth: 0,
	worldHeight: 0
};
var defaultPatternSizing = {
	fit: "none",
	scale: 1,
	rotation: 0,
	offsetX: 0,
	offsetY: 0,
	originX: .5,
	originY: .5,
	worldWidth: 0,
	worldHeight: 0
};
var ShaderFitOptions = {
	none: 0,
	contain: 1,
	cover: 2
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shader-utils.js
var declarePI = `
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
`;
var rotation2 = `
vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}
`;
var proceduralHash11 = `
  float hash11(float p) {
    p = fract(p * 0.3183099) + 0.1;
    p *= p + 19.19;
    return fract(p * p);
  }
`;
var proceduralHash21 = `
  float hash21(vec2 p) {
    p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }
`;
var textureRandomizerR = `
  float randomR(vec2 p) {
    vec2 uv = floor(p) / 100. + .5;
    return texture(u_noiseTexture, fract(uv)).r;
  }
`;
var textureRandomizerGB = `
  vec2 randomGB(vec2 p) {
    vec2 uv = floor(p) / 100. + .5;
    return texture(u_noiseTexture, fract(uv)).gb;
  }
`;
var colorBandingFix = `
  color += 1. / 256. * (fract(sin(dot(.014 * gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453123) - .5);
`;
var simplexNoise = `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;
var fiberNoise = `
float fiberRandom(vec2 p) {
  vec2 uv = floor(p) / 100.;
  return texture(u_noiseTexture, fract(uv)).b;
}

float fiberValueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = fiberRandom(i);
  float b = fiberRandom(i + vec2(1.0, 0.0));
  float c = fiberRandom(i + vec2(0.0, 1.0));
  float d = fiberRandom(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float fiberNoiseFbm(in vec2 n, vec2 seedOffset) {
  float total = 0.0, amplitude = 1.;
  for (int i = 0; i < 4; i++) {
    n = rotate(n, .7);
    total += fiberValueNoise(n + seedOffset) * amplitude;
    n *= 2.;
    amplitude *= 0.6;
  }
  return total;
}

float fiberNoise(vec2 uv, vec2 seedOffset) {
  float epsilon = 0.001;
  float n1 = fiberNoiseFbm(uv + vec2(epsilon, 0.0), seedOffset);
  float n2 = fiberNoiseFbm(uv - vec2(epsilon, 0.0), seedOffset);
  float n3 = fiberNoiseFbm(uv + vec2(0.0, epsilon), seedOffset);
  float n4 = fiberNoiseFbm(uv - vec2(0.0, epsilon), seedOffset);
  return length(vec2(n1 - n2, n3 - n4)) / (2.0 * epsilon);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/mesh-gradient.js
var meshGradientMeta = { maxColorCount: 10 };
var meshGradientFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colors[${meshGradientMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_distortion;
uniform float u_swirl;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_objectUV;
out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float noise(vec2 n, vec2 seedOffset) {
  return valueNoise(n + seedOffset);
}

vec2 getPosition(int i, float t) {
  float a = float(i) * .37;
  float b = .6 + fract(float(i) / 3.) * .9;
  float c = .8 + fract(float(i + 1) / 4.);

  float x = sin(t * b + a);
  float y = cos(t * c + a * 1.5);

  return .5 + .5 * vec2(x, y);
}

void main() {
  vec2 uv = v_objectUV;
  uv += .5;
  vec2 grainUV = uv * 1000.;

  float grain = noise(grainUV, vec2(0.));
  float mixerGrain = .4 * u_grainMixer * (grain - .5);

  const float firstFrameOffset = 41.5;
  float t = .5 * (u_time + firstFrameOffset);

  float radius = smoothstep(0., 1., length(uv - .5));
  float center = 1. - radius;
  for (float i = 1.; i <= 2.; i++) {
    uv.x += u_distortion * center / i * sin(t + i * .4 * smoothstep(.0, 1., uv.y)) * cos(.2 * t + i * 2.4 * smoothstep(.0, 1., uv.y));
    uv.y += u_distortion * center / i * cos(t + i * 2. * smoothstep(.0, 1., uv.x));
  }

  vec2 uvRotated = uv;
  uvRotated -= vec2(.5);
  float angle = 3. * u_swirl * radius;
  uvRotated = rotate(uvRotated, -angle);
  uvRotated += vec2(.5);

  vec3 color = vec3(0.);
  float opacity = 0.;
  float totalWeight = 0.;

  for (int i = 0; i < ${meshGradientMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    vec2 pos = getPosition(i, t) + mixerGrain;
    vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;
    float opacityFraction = u_colors[i].a;

    float dist = length(uvRotated - pos);

    dist = pow(dist, 3.5);
    float weight = 1. / (dist + 1e-3);
    color += colorFraction * weight;
    opacity += opacityFraction * weight;
    totalWeight += weight;
  }

  color /= max(1e-4, totalWeight);
  opacity /= max(1e-4, totalWeight);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/smoke-ring.js
var smokeRingMeta = {
	maxColorCount: 10,
	maxNoiseIterations: 8
};
var smokeRingFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${smokeRingMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_thickness;
uniform float u_radius;
uniform float u_innerShape;
uniform float u_noiseScale;
uniform float u_noiseIterations;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}
${textureRandomizerR}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}
vec2 fbm(vec2 n0, vec2 n1) {
  vec2 total = vec2(0.0);
  float amplitude = .4;
  for (int i = 0; i < ${smokeRingMeta.maxNoiseIterations}; i++) {
    if (i >= int(u_noiseIterations)) break;
    total.x += valueNoise(n0) * amplitude;
    total.y += valueNoise(n1) * amplitude;
    n0 *= 1.99;
    n1 *= 1.99;
    amplitude *= 0.65;
  }
  return total;
}

float getNoise(vec2 uv, vec2 pUv, float t) {
  vec2 pUvLeft = pUv + .03 * t;
  float period = max(abs(u_noiseScale * TWO_PI), 1e-6);
  vec2 pUvRight = vec2(fract(pUv.x / period) * period, pUv.y) + .03 * t;
  vec2 noise = fbm(pUvLeft, pUvRight);
  return mix(noise.y, noise.x, smoothstep(-.25, .25, uv.x));
}

float getRingShape(vec2 uv) {
  float radius = u_radius;
  float thickness = u_thickness;

  float distance = length(uv);
  float ringValue = 1. - smoothstep(radius, radius + thickness, distance);
  ringValue *= smoothstep(radius - pow(u_innerShape, 3.) * thickness, radius, distance);

  return ringValue;
}

void main() {
  vec2 shape_uv = v_objectUV;

  float t = u_time;

  float cycleDuration = 3.;
  float period2 = 2.0 * cycleDuration;
  float localTime1 = fract((0.1 * t + cycleDuration) / period2) * period2;
  float localTime2 = fract((0.1 * t) / period2) * period2;
  float timeBlend = .5 + .5 * sin(.1 * t * PI / cycleDuration - .5 * PI);

  float atg = atan(shape_uv.y, shape_uv.x) + .001;
  float l = length(shape_uv);
  float radialOffset = .5 * l - inversesqrt(max(1e-4, l));
  vec2 polar_uv1 = vec2(atg, localTime1 - radialOffset) * u_noiseScale;
  vec2 polar_uv2 = vec2(atg, localTime2 - radialOffset) * u_noiseScale;
  
  float noise1 = getNoise(shape_uv, polar_uv1, t);
  float noise2 = getNoise(shape_uv, polar_uv2, t);

  float noise = mix(noise1, noise2, timeBlend);

  shape_uv *= (.8 + 1.2 * noise);

  float ringShape = getRingShape(shape_uv);

  float mixer = ringShape * ringShape * (u_colorsCount - 1.);
  int idxLast = int(u_colorsCount) - 1;
  vec4 gradient = u_colors[idxLast];
  gradient.rgb *= gradient.a;
  for (int i = ${smokeRingMeta.maxColorCount} - 2; i >= 0; i--) {
    float localT = clamp(mixer - float(idxLast - i - 1), 0., 1.);
    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  vec3 color = gradient.rgb * ringShape;
  float opacity = gradient.a * ringShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/neuro-noise.js
var neuroNoiseFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_pixelRatio;

uniform vec4 u_colorFront;
uniform vec4 u_colorMid;
uniform vec4 u_colorBack;
uniform float u_brightness;
uniform float u_contrast;

in vec2 v_patternUV;

out vec4 fragColor;

${rotation2}

float neuroShape(vec2 uv, float t) {
  vec2 sine_acc = vec2(0.);
  vec2 res = vec2(0.);
  float scale = 8.;

  for (int j = 0; j < 15; j++) {
    uv = rotate(uv, 1.);
    sine_acc = rotate(sine_acc, 1.);
    vec2 layer = uv * scale + float(j) + sine_acc - t;
    sine_acc += sin(layer);
    res += (.5 + .5 * cos(layer)) / scale;
    scale *= (1.2);
  }
  return res.x + res.y;
}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= .13;

  float t = .5 * u_time;

  float noise = neuroShape(shape_uv, t);

  noise = (1. + u_brightness) * noise * noise;
  noise = pow(noise, .7 + 6. * u_contrast);
  noise = min(1.4, noise);

  float blend = smoothstep(0.7, 1.4, noise);

  vec4 frontC = u_colorFront;
  frontC.rgb *= frontC.a;
  vec4 midC = u_colorMid;
  midC.rgb *= midC.a;
  vec4 blendFront = mix(midC, frontC, blend);

  float safeNoise = max(noise, 0.0);
  vec3 color = blendFront.rgb * safeNoise;
  float opacity = clamp(blendFront.a * safeNoise, 0., 1.);

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/dot-orbit.js
var dotOrbitMeta = { maxColorCount: 10 };
var dotOrbitFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${dotOrbitMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_stepsPerColor;
uniform float u_size;
uniform float u_sizeRange;
uniform float u_spreading;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${textureRandomizerR}
${textureRandomizerGB}


vec3 voronoiShape(vec2 uv, float time) {
  vec2 i_uv = floor(uv);
  vec2 f_uv = fract(uv);

  float spreading = .25 * clamp(u_spreading, 0., 1.);

  float minDist = 1.;
  vec2 randomizer = vec2(0.);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 tileOffset = vec2(float(x), float(y));
      vec2 rand = randomGB(i_uv + tileOffset);
      vec2 cellCenter = vec2(.5 + 1e-4);
      cellCenter += spreading * cos(time + TWO_PI * rand);
      cellCenter -= .5;
      cellCenter = rotate(cellCenter, randomR(vec2(rand.x, rand.y)) + .1 * time);
      cellCenter += .5;
      float dist = length(tileOffset + cellCenter - f_uv);
      if (dist < minDist) {
        minDist = dist;
        randomizer = rand;
      }
    }
  }

  return vec3(minDist, randomizer);
}

void main() {

  vec2 shape_uv = v_patternUV;
  shape_uv *= 1.5;

  const float firstFrameOffset = -10.;
  float t = u_time + firstFrameOffset;

  vec3 voronoi = voronoiShape(shape_uv, t) + 1e-4;

  float radius = .25 * clamp(u_size, 0., 1.) - .5 * clamp(u_sizeRange, 0., 1.) * voronoi[2];
  float dist = voronoi[0];
  float edgeWidth = fwidth(dist);
  float dots = 1. - smoothstep(radius - edgeWidth, radius + edgeWidth, dist);

  float shape = voronoi[1];

  float mixer = shape * (u_colorsCount - 1.);
  mixer = (shape - .5 / u_colorsCount) * u_colorsCount;
  float steps = max(1., u_stepsPerColor);

  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < ${dotOrbitMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;
    float localT = clamp(mixer - float(i - 1), 0.0, 1.0);
    localT = round(localT * steps) / steps;
    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  if ((mixer < 0.) || (mixer > (u_colorsCount - 1.))) {
    float localT = mixer + 1.;
    if (mixer > (u_colorsCount - 1.)) {
      localT = mixer - (u_colorsCount - 1.);
    }
    localT = round(localT * steps) / steps;
    vec4 cFst = u_colors[0];
    cFst.rgb *= cFst.a;
    vec4 cLast = u_colors[int(u_colorsCount - 1.)];
    cLast.rgb *= cLast.a;
    gradient = mix(cLast, cFst, localT);
  }

  vec3 color = gradient.rgb * dots;
  float opacity = gradient.a * dots;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/dot-grid.js
var dotGridFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_colorBack;
uniform vec4 u_colorFill;
uniform vec4 u_colorStroke;
uniform float u_dotSize;
uniform float u_gapX;
uniform float u_gapY;
uniform float u_strokeWidth;
uniform float u_sizeRange;
uniform float u_opacityRange;
uniform float u_shape;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${simplexNoise}

float polygon(vec2 p, float N, float rot) {
  float a = atan(p.x, p.y) + rot;
  float r = TWO_PI / float(N);

  return cos(floor(.5 + a / r) * r - a) * length(p);
}

void main() {

  // x100 is a default multiplier between vertex and fragmant shaders
  // we use it to avoid UV presision issues
  vec2 shape_uv = 100. * v_patternUV;

  vec2 gap = max(abs(vec2(u_gapX, u_gapY)), vec2(1e-6));
  vec2 grid = fract(shape_uv / gap) + 1e-4;
  vec2 grid_idx = floor(shape_uv / gap);
  float sizeRandomizer = .5 + .8 * snoise(2. * vec2(grid_idx.x * 100., grid_idx.y));
  float opacity_randomizer = .5 + .7 * snoise(2. * vec2(grid_idx.y, grid_idx.x));

  vec2 center = vec2(0.5) - 1e-3;
  vec2 p = (grid - center) * vec2(u_gapX, u_gapY);

  float baseSize = u_dotSize * (1. - sizeRandomizer * u_sizeRange);
  float strokeWidth = u_strokeWidth * (1. - sizeRandomizer * u_sizeRange);

  float dist;
  if (u_shape < 0.5) {
    // Circle
    dist = length(p);
  } else if (u_shape < 1.5) {
    // Diamond
    strokeWidth *= 1.5;
    dist = polygon(1.5 * p, 4., .25 * PI);
  } else if (u_shape < 2.5) {
    // Square
    dist = polygon(1.03 * p, 4., 1e-3);
  } else {
    // Triangle
    strokeWidth *= 1.5;
    p = p * 2. - 1.;
    p *= .9;
    p.y = 1. - p.y;
    p.y -= .75 * baseSize;
    dist = polygon(p, 3., 1e-3);
  }

  float edgeWidth = fwidth(dist);
  float shapeOuter = 1. - smoothstep(baseSize - edgeWidth, baseSize + edgeWidth, dist - strokeWidth);
  float shapeInner = 1. - smoothstep(baseSize - edgeWidth, baseSize + edgeWidth, dist);
  float stroke = shapeOuter - shapeInner;

  float dotOpacity = max(0., 1. - opacity_randomizer * u_opacityRange);
  stroke *= dotOpacity;
  shapeInner *= dotOpacity;

  stroke *= u_colorStroke.a;
  shapeInner *= u_colorFill.a;

  vec3 color = vec3(0.);
  color += stroke * u_colorStroke.rgb;
  color += shapeInner * u_colorFill.rgb;
  color += (1. - shapeInner - stroke) * u_colorBack.rgb * u_colorBack.a;

  float opacity = 0.;
  opacity += stroke;
  opacity += shapeInner;
  opacity += (1. - opacity) * u_colorBack.a;

  fragColor = vec4(color, opacity);
}
`;
var DotGridShapes = {
	circle: 0,
	diamond: 1,
	square: 2,
	triangle: 3
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/simplex-noise.js
var simplexNoiseMeta = { maxColorCount: 10 };
var simplexNoiseFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;
uniform float u_scale;

uniform vec4 u_colors[${simplexNoiseMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_stepsPerColor;
uniform float u_softness;

in vec2 v_patternUV;

out vec4 fragColor;

${simplexNoise}

float getNoise(vec2 uv, float t) {
  float noise = .5 * snoise(uv - vec2(0., .3 * t));
  noise += .5 * snoise(2. * uv + vec2(0., .32 * t));

  return noise;
}

float steppedSmooth(float m, float steps, float softness) {
  float stepT = floor(m * steps) / steps;
  float f = m * steps - floor(m * steps);
  float fw = steps * fwidth(m);
  float smoothed = smoothstep(.5 - softness, min(1., .5 + softness + fw), f);
  return stepT + smoothed / steps;
}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= .1;

  float t = .2 * u_time;

  float shape = .5 + .5 * getNoise(shape_uv, t);

  bool u_extraSides = true;

  float mixer = shape * (u_colorsCount - 1.);
  if (u_extraSides == true) {
    mixer = (shape - .5 / u_colorsCount) * u_colorsCount;
  }

  float steps = max(1., u_stepsPerColor);

  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < ${simplexNoiseMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    float localM = clamp(mixer - float(i - 1), 0., 1.);
    localM = steppedSmooth(localM, steps, .5 * u_softness);

    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localM);
  }

  if (u_extraSides == true) {
    if ((mixer < 0.) || (mixer > (u_colorsCount - 1.))) {
      float localM = mixer + 1.;
      if (mixer > (u_colorsCount - 1.)) {
        localM = mixer - (u_colorsCount - 1.);
      }
      localM = steppedSmooth(localM, steps, .5 * u_softness);
      vec4 cFst = u_colors[0];
      cFst.rgb *= cFst.a;
      vec4 cLast = u_colors[int(u_colorsCount - 1.)];
      cLast.rgb *= cLast.a;
      gradient = mix(cLast, cFst, localM);
    }
  }

  vec3 color = gradient.rgb;
  float opacity = gradient.a;

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/metaballs.js
var metaballsMeta = {
	maxColorCount: 8,
	maxBallsCount: 20
};
var metaballsFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${metaballsMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_size;
uniform float u_sizeRange;
uniform float u_count;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}
${textureRandomizerR}
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  vec2 p0 = vec2(i, 0.0);
  vec2 p1 = vec2(i + 1.0, 0.0);
  return mix(randomR(p0), randomR(p1), u);
}

float getBallShape(vec2 uv, vec2 c, float p) {
  float s = .5 * length(uv - c);
  s = 1. - clamp(s, 0., 1.);
  s = pow(s, p);
  return s;
}

void main() {
  vec2 shape_uv = v_objectUV;

  shape_uv += .5;

  const float firstFrameOffset = 2503.4;
  float t = .2 * (u_time + firstFrameOffset);

  vec3 totalColor = vec3(0.);
  float totalShape = 0.;
  float totalOpacity = 0.;

  for (int i = 0; i < ${metaballsMeta.maxBallsCount}; i++) {
    if (i >= int(ceil(u_count))) break;

    float idxFract = float(i) / float(${metaballsMeta.maxBallsCount});
    float angle = TWO_PI * idxFract;

    float speed = 1. - .2 * idxFract;
    float noiseX = noise(angle * 10. + float(i) + t * speed);
    float noiseY = noise(angle * 20. + float(i) - t * speed);

    vec2 pos = vec2(.5) + 1e-4 + .9 * (vec2(noiseX, noiseY) - .5);

    int safeIndex = i % int(u_colorsCount + 0.5);
    vec4 ballColor = u_colors[safeIndex];
    ballColor.rgb *= ballColor.a;

    float sizeFrac = 1.;
    if (float(i) > floor(u_count - 1.)) {
      sizeFrac *= fract(u_count);
    }

    float shape = getBallShape(shape_uv, pos, 45. - 30. * u_size * sizeFrac);
    shape *= pow(u_size, .2);
    shape = smoothstep(0., 1., shape);

    totalColor += ballColor.rgb * shape;
    totalShape += shape;
    totalOpacity += ballColor.a * shape;
  }

  totalColor /= max(totalShape, 1e-4);
  totalOpacity /= max(totalShape, 1e-4);

  float edge_width = fwidth(totalShape);
  float finalShape = smoothstep(.4, .4 + edge_width, totalShape);

  vec3 color = totalColor * finalShape;
  float opacity = totalOpacity * finalShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/perlin-noise.js
var perlinNoiseFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform float u_proportion;
uniform float u_softness;
uniform float u_octaveCount;
uniform float u_persistence;
uniform float u_lacunarity;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${proceduralHash11}
${proceduralHash21}

float hash31(vec3 p) {
  p = fract(p * 0.3183099) + 0.1;
  p += dot(p, p.yzx + 19.19);
  return fract(p.x * (p.y + p.z));
}

vec3 gradientPredefined(float hash) {
  int idx = int(hash * 12.0) % 12;

  if (idx == 0) return vec3(1, 1, 0);
  if (idx == 1) return vec3(-1, 1, 0);
  if (idx == 2) return vec3(1, -1, 0);
  if (idx == 3) return vec3(-1, -1, 0);
  if (idx == 4) return vec3(1, 0, 1);
  if (idx == 5) return vec3(-1, 0, 1);
  if (idx == 6) return vec3(1, 0, -1);
  if (idx == 7) return vec3(-1, 0, -1);
  if (idx == 8) return vec3(0, 1, 1);
  if (idx == 9) return vec3(0, -1, 1);
  if (idx == 10) return vec3(0, 1, -1);
  return vec3(0, -1, -1);// idx == 11
}

float interpolateSafe(float v000, float v001, float v010, float v011,
float v100, float v101, float v110, float v111, vec3 t) {
  t = clamp(t, 0.0, 1.0);

  float v00 = mix(v000, v100, t.x);
  float v01 = mix(v001, v101, t.x);
  float v10 = mix(v010, v110, t.x);
  float v11 = mix(v011, v111, t.x);

  float v0 = mix(v00, v10, t.y);
  float v1 = mix(v01, v11, t.y);

  return mix(v0, v1, t.z);
}

vec3 fade(vec3 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float perlinNoise(vec3 position, float seed) {
  position += vec3(seed * 127.1, seed * 311.7, seed * 74.7);

  vec3 i = floor(position);
  vec3 f = fract(position);
  float h000 = hash31(i);
  float h001 = hash31(i + vec3(0, 0, 1));
  float h010 = hash31(i + vec3(0, 1, 0));
  float h011 = hash31(i + vec3(0, 1, 1));
  float h100 = hash31(i + vec3(1, 0, 0));
  float h101 = hash31(i + vec3(1, 0, 1));
  float h110 = hash31(i + vec3(1, 1, 0));
  float h111 = hash31(i + vec3(1, 1, 1));
  vec3 g000 = gradientPredefined(h000);
  vec3 g001 = gradientPredefined(h001);
  vec3 g010 = gradientPredefined(h010);
  vec3 g011 = gradientPredefined(h011);
  vec3 g100 = gradientPredefined(h100);
  vec3 g101 = gradientPredefined(h101);
  vec3 g110 = gradientPredefined(h110);
  vec3 g111 = gradientPredefined(h111);
  float v000 = dot(g000, f - vec3(0, 0, 0));
  float v001 = dot(g001, f - vec3(0, 0, 1));
  float v010 = dot(g010, f - vec3(0, 1, 0));
  float v011 = dot(g011, f - vec3(0, 1, 1));
  float v100 = dot(g100, f - vec3(1, 0, 0));
  float v101 = dot(g101, f - vec3(1, 0, 1));
  float v110 = dot(g110, f - vec3(1, 1, 0));
  float v111 = dot(g111, f - vec3(1, 1, 1));

  vec3 u = fade(f);
  return interpolateSafe(v000, v001, v010, v011, v100, v101, v110, v111, u);
}

float p_noise(vec3 position, int octaveCount, float persistence, float lacunarity) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 10.0;
  float maxValue = 0.0;
  octaveCount = clamp(octaveCount, 1, 8);

  for (int i = 0; i < octaveCount; i++) {
    float seed = float(i) * 0.7319;
    value += perlinNoise(position * frequency, seed) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value;
}

float get_max_amp(float persistence, float octaveCount) {
  persistence = clamp(persistence * 0.999, 0.0, 0.999);
  octaveCount = clamp(octaveCount, 1.0, 8.0);

  if (abs(persistence - 1.0) < 0.001) {
    return octaveCount;
  }

  return (1.0 - pow(persistence, octaveCount)) / max(1e-4, (1.0 - persistence));
}

void main() {
  vec2 uv = v_patternUV;
  uv *= .5;

  float t = .2 * u_time;

  vec3 p = vec3(uv, t);

  float octCount = floor(u_octaveCount);
  float noise = p_noise(p, int(octCount), u_persistence, u_lacunarity);

  float max_amp = get_max_amp(u_persistence, octCount);
  float noise_normalized = clamp((noise + max_amp) / max(1e-4, (2. * max_amp)) + (u_proportion - .5), 0.0, 1.0);
  float sharpness = clamp(u_softness, 0., 1.);
  float smooth_w = 0.5 * max(fwidth(noise_normalized), 0.001);
  float res = smoothstep(
  .5 - .5 * sharpness - smooth_w,
  .5 + .5 * sharpness + smooth_w,
  noise_normalized
  );

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/voronoi.js
var voronoiMeta = { maxColorCount: 5 };
var voronoiFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform float u_scale;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colors[${voronoiMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_stepsPerColor;
uniform vec4 u_colorGlow;
uniform vec4 u_colorGap;
uniform float u_distortion;
uniform float u_gap;
uniform float u_glow;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${textureRandomizerGB}

vec4 voronoi(vec2 x, float t) {
  vec2 ip = floor(x);
  vec2 fp = fract(x);

  vec2 mg, mr;
  float md = 8.;
  float rand = 0.;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = randomGB(ip + g);
      float raw_hash = o.x;
      o = .5 + u_distortion * sin(t + TWO_PI * o);
      vec2 r = g + o - fp;
      float d = dot(r, r);

      if (d < md) {
        md = d;
        mr = r;
        mg = g;
        rand = raw_hash;
      }
    }
  }

  md = 8.;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 o = randomGB(ip + g);
      o = .5 + u_distortion * sin(t + TWO_PI * o);
      vec2 r = g + o - fp;
      if (dot(mr - r, mr - r) > .00001) {
        md = min(md, dot(.5 * (mr + r), normalize(r - mr)));
      }
    }
  }

  return vec4(md, mr, rand);
}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= 1.25;

  float t = u_time;

  vec4 voronoiRes = voronoi(shape_uv, t);

  float shape = clamp(voronoiRes.w, 0., 1.);
  float mixer = shape * (u_colorsCount - 1.);
  mixer = (shape - .5 / u_colorsCount) * u_colorsCount;
  float steps = max(1., u_stepsPerColor);

  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < ${voronoiMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;
    float localT = clamp(mixer - float(i - 1), 0.0, 1.0);
    localT = round(localT * steps) / steps;
    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  if ((mixer < 0.) || (mixer > (u_colorsCount - 1.))) {
    float localT = mixer + 1.;
    if (mixer > (u_colorsCount - 1.)) {
      localT = mixer - (u_colorsCount - 1.);
    }
    localT = round(localT * steps) / steps;
    vec4 cFst = u_colors[0];
    cFst.rgb *= cFst.a;
    vec4 cLast = u_colors[int(u_colorsCount - 1.)];
    cLast.rgb *= cLast.a;
    gradient = mix(cLast, cFst, localT);
  }

  vec3 cellColor = gradient.rgb;
  float cellOpacity = gradient.a;

  float glows = length(voronoiRes.yz * u_glow);
  glows = pow(glows, 1.5);

  vec3 color = mix(cellColor, u_colorGlow.rgb * u_colorGlow.a, u_colorGlow.a * glows);
  float opacity = cellOpacity + u_colorGlow.a * glows;

  float edge = voronoiRes.x;
  float smoothEdge = .02 / (2. * u_scale) * (1. + .5 * u_gap);
  edge = smoothstep(u_gap - smoothEdge, u_gap + smoothEdge, edge);

  color = mix(u_colorGap.rgb * u_colorGap.a, color, edge);
  opacity = mix(u_colorGap.a, opacity, edge);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/waves.js
var wavesFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform float u_shape;
uniform float u_frequency;
uniform float u_amplitude;
uniform float u_spacing;
uniform float u_proportion;
uniform float u_softness;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}

void main() {
  vec2 shape_uv = v_patternUV;
  shape_uv *= 4.;

  float wave = .5 * cos(shape_uv.x * u_frequency * TWO_PI);
  float zigzag = 2. * abs(fract(shape_uv.x * u_frequency) - .5);
  float irregular = sin(shape_uv.x * .25 * u_frequency * TWO_PI) * cos(shape_uv.x * u_frequency * TWO_PI);
  float irregular2 = .75 * (sin(shape_uv.x * u_frequency * TWO_PI) + .5 * cos(shape_uv.x * .5 * u_frequency * TWO_PI));

  float offset = mix(zigzag, wave, smoothstep(0., 1., u_shape));
  offset = mix(offset, irregular, smoothstep(1., 2., u_shape));
  offset = mix(offset, irregular2, smoothstep(2., 3., u_shape));
  offset *= 2. * u_amplitude;

  float spacing = (.001 + u_spacing);
  float shape = .5 + .5 * sin((shape_uv.y + offset) * PI / spacing);

  float aa = .0001 + fwidth(shape);
  float dc = 1. - clamp(u_proportion, 0., 1.);
  float e0 = dc - u_softness - aa;
  float e1 = dc + u_softness + aa;
  float res = smoothstep(min(e0, e1), max(e0, e1), shape);

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/warp.js
var warpMeta = { maxColorCount: 10 };
var warpFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;
uniform float u_scale;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colors[${warpMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_proportion;
uniform float u_softness;
uniform float u_shape;
uniform float u_shapeScale;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_swirlIterations;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${rotation2}
float randomG(vec2 p) {
  vec2 uv = floor(p) / 100. + .5;
  return texture(u_noiseTexture, fract(uv)).g;
}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomG(i);
  float b = randomG(i + vec2(1.0, 0.0));
  float c = randomG(i + vec2(0.0, 1.0));
  float d = randomG(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}


void main() {
  vec2 uv = v_patternUV;
  uv *= .5;

  const float firstFrameOffset = 118.;
  float t = 0.0625 * (u_time + firstFrameOffset);

  float n1 = valueNoise(uv * 1. + t);
  float n2 = valueNoise(uv * 2. - t);
  float angle = n1 * TWO_PI;
  uv.x += 4. * u_distortion * n2 * cos(angle);
  uv.y += 4. * u_distortion * n2 * sin(angle);

  float swirl = u_swirl;
  for (int i = 1; i <= 20; i++) {
    if (i >= int(u_swirlIterations)) break;
    float iFloat = float(i);
    //    swirl *= (1. - smoothstep(.0, .25, length(fwidth(uv))));
    uv.x += swirl / iFloat * cos(t + iFloat * 1.5 * uv.y);
    uv.y += swirl / iFloat * cos(t + iFloat * 1. * uv.x);
  }

  float proportion = clamp(u_proportion, 0., 1.);

  float shape = 0.;
  if (u_shape < .5) {
    vec2 checksShape_uv = uv * (.5 + 3.5 * u_shapeScale);
    shape = .5 + .5 * sin(checksShape_uv.x) * cos(checksShape_uv.y);
    shape += .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else if (u_shape < 1.5) {
    vec2 stripesShape_uv = uv * (2. * u_shapeScale);
    float f = fract(stripesShape_uv.y);
    shape = smoothstep(.0, .55, f) * (1.0 - smoothstep(.45, 1., f));
    shape += .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else {
    float shapeScaling = 5. * (1. - u_shapeScale);
    float e0 = 0.45 - shapeScaling;
    float e1 = 0.55 + shapeScaling;
    shape = smoothstep(min(e0, e1), max(e0, e1), 1.0 - uv.y + 0.3 * (proportion - 0.5));
  }

  float mixer = shape * (u_colorsCount - 1.);
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  float aa = fwidth(shape);
  for (int i = 1; i < ${warpMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;
    float m = clamp(mixer - float(i - 1), 0.0, 1.0);

    float localMixerStart = floor(m);
    float softness = .5 * u_softness + fwidth(m);
    float smoothed = smoothstep(max(0., .5 - softness - aa), min(1., .5 + softness + aa), m - localMixerStart);
    float stepped = localMixerStart + smoothed;

    m = mix(stepped, m, u_softness);

    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  vec3 color = gradient.rgb;
  float opacity = gradient.a;

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
var WarpPatterns = {
	checks: 0,
	stripes: 1,
	edge: 2
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/god-rays.js
var godRaysMeta = { maxColorCount: 5 };
var godRaysFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colorBloom;
uniform vec4 u_colors[${godRaysMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_density;
uniform float u_spotty;
uniform float u_midSize;
uniform float u_midIntensity;
uniform float u_intensity;
uniform float u_bloom;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${textureRandomizerR}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

${proceduralHash11}

float raysShape(vec2 uv, float r, float freq, float intensity, float radius) {
  float a = atan(uv.y, uv.x);
  vec2 left = vec2(a * freq, r);
  vec2 right = vec2(fract(a / TWO_PI) * TWO_PI * freq, r);
  float n_left = pow(valueNoise(left), intensity);
  float n_right = pow(valueNoise(right), intensity);
  float shape = mix(n_right, n_left, smoothstep(-.15, .15, uv.x));
  return shape;
}

void main() {
  vec2 shape_uv = v_objectUV;

  float t = .2 * u_time;

  float radius = length(shape_uv);
  float spots = 6.5 * abs(u_spotty);

  float intensity = 4. - 3. * clamp(u_intensity, 0., 1.);

  float delta = 1. - smoothstep(0., 1., radius);

  float midSize = 10. * abs(u_midSize);
  float ms_lo = 0.02 * midSize;
  float ms_hi = max(midSize, 1e-6);
  float middleShape = pow(u_midIntensity, 0.3) * (1. - smoothstep(ms_lo, ms_hi, 3.0 * radius));
  middleShape = pow(middleShape, 5.0);

  vec3 accumColor = vec3(0.0);
  float accumAlpha = 0.0;

  for (int i = 0; i < ${godRaysMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    vec2 rotatedUV = rotate(shape_uv, float(i) + 1.0);

    float r1 = radius * (1.0 + 0.4 * float(i)) - 3.0 * t;
    float r2 = 0.5 * radius * (1.0 + spots) - 2.0 * t;
    float density = 6. * u_density + step(.5, u_density) * pow(4.5 * (u_density - .5), 4.);
    float f = mix(1.0, 3.0 + 0.5 * float(i), hash11(float(i) * 15.)) * density;

    float ray = raysShape(rotatedUV, r1, 5.0 * f, intensity, radius);
    ray *= raysShape(rotatedUV, r2, 4.0 * f, intensity, radius);
    ray += (1. + 4. * ray) * middleShape;
    ray = clamp(ray, 0.0, 1.0);

    float srcAlpha = u_colors[i].a * ray;
    vec3 srcColor = u_colors[i].rgb * srcAlpha;

    vec3 alphaBlendColor = accumColor + (1.0 - accumAlpha) * srcColor;
    float alphaBlendAlpha = accumAlpha + (1.0 - accumAlpha) * srcAlpha;

    vec3 addBlendColor = accumColor + srcColor;
    float addBlendAlpha = accumAlpha + srcAlpha;

    accumColor = mix(alphaBlendColor, addBlendColor, u_bloom);
    accumAlpha = mix(alphaBlendAlpha, addBlendAlpha, u_bloom);
  }

  float overlayAlpha = u_colorBloom.a;
  vec3 overlayColor = u_colorBloom.rgb * overlayAlpha;

  vec3 colorWithOverlay = accumColor + accumAlpha * overlayColor;
  accumColor = mix(accumColor, colorWithOverlay, u_bloom);

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;

  vec3 color = accumColor + (1. - accumAlpha) * bgColor;
  float opacity = accumAlpha + (1. - accumAlpha) * u_colorBack.a;
  color = clamp(color, 0., 1.);
  opacity = clamp(opacity, 0., 1.);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/spiral.js
var spiralFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_density;
uniform float u_distortion;
uniform float u_strokeWidth;
uniform float u_strokeCap;
uniform float u_strokeTaper;
uniform float u_noise;
uniform float u_noiseFrequency;
uniform float u_softness;

in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}
${simplexNoise}

void main() {
  vec2 uv = 2. * v_patternUV;

  float t = u_time;
  float l = length(uv);
  float density = clamp(u_density, 0., 1.);
  l = pow(max(l, 1e-6), density);
  float angle = atan(uv.y, uv.x) - t;
  float angleNormalised = angle / TWO_PI;

  angleNormalised += .125 * u_noise * snoise(16. * pow(u_noiseFrequency, 3.) * uv);

  float offset = l + angleNormalised;
  offset -= u_distortion * (sin(4. * l - .5 * t) * cos(PI + l + .5 * t));
  float stripe = fract(offset);

  float shape = 2. * abs(stripe - .5);
  float width = 1. - clamp(u_strokeWidth, .005 * u_strokeTaper, 1.);


  float wCap = mix(width, (1. - stripe) * (1. - step(.5, stripe)), (1. - clamp(l, 0., 1.)));
  width = mix(width, wCap, u_strokeCap);
  width *= (1. - clamp(u_strokeTaper, 0., 1.) * l);

  float fw = fwidth(offset);
  float fwMult = 4. - 3. * (smoothstep(.05, .4, 2. * u_strokeWidth) * smoothstep(.05, .4, 2. * (1. - u_strokeWidth)));
  float pixelSize = mix(fwMult * fw, fwidth(shape), clamp(fw, 0., 1.));
  pixelSize = mix(pixelSize, .002, u_strokeCap * (1. - clamp(l, 0., 1.)));

  float res = smoothstep(width - pixelSize - u_softness, width + pixelSize + u_softness, shape);

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/swirl.js
var swirlMeta = { maxColorCount: 10 };
var swirlFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${swirlMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_bandCount;
uniform float u_twist;
uniform float u_center;
uniform float u_proportion;
uniform float u_softness;
uniform float u_noise;
uniform float u_noiseFrequency;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}
${simplexNoise}
${rotation2}

void main() {
  vec2 shape_uv = v_objectUV;

  float l = length(shape_uv);
  l = max(1e-4, l);

  float t = u_time;

  float angle = ceil(u_bandCount) * atan(shape_uv.y, shape_uv.x) + t;
  float angle_norm = angle / TWO_PI;

  float twist = 3. * clamp(u_twist, 0., 1.);
  float offset = pow(l, -twist) + angle_norm;

  float shape = fract(offset);
  shape = 1. - abs(2. * shape - 1.);
  shape += u_noise * snoise(15. * pow(u_noiseFrequency, 2.) * shape_uv);

  float mid = smoothstep(.2, .2 + .8 * u_center, pow(l, twist));
  shape = mix(0., shape, mid);

  float proportion = clamp(u_proportion, 0., 1.);
  float exponent = mix(.25, 1., proportion * 2.);
  exponent = mix(exponent, 10., max(0., proportion * 2. - 1.));
  shape = pow(shape, exponent);

  float mixer = shape * u_colorsCount;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;

  float outerShape = 0.;
  for (int i = 1; i < ${swirlMeta.maxColorCount + 1}; i++) {
    if (i > int(u_colorsCount)) break;

    float m = clamp(mixer - float(i - 1), 0., 1.);
    float aa = fwidth(m);
    m = smoothstep(.5 - .5 * u_softness - aa, .5 + .5 * u_softness + aa, m);

    if (i == 1) {
      outerShape = m;
    }

    vec4 c = u_colors[i - 1];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  float midAA = .1 * fwidth(pow(l, -twist));
  float outerMid = smoothstep(.2, .2 + midAA, pow(l, twist));
  outerShape = mix(0., outerShape, outerMid);

  vec3 color = gradient.rgb * outerShape;
  float opacity = gradient.a * outerShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/dithering.js
var ditheringFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;
uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

uniform float u_pxSize;
uniform vec4 u_colorBack;
uniform vec4 u_colorFront;
uniform float u_shape;
uniform float u_type;

out vec4 fragColor;

${simplexNoise}
${declarePI}
${proceduralHash11}
${proceduralHash21}

float getSimplexNoise(vec2 uv, float t) {
  float noise = .5 * snoise(uv - vec2(0., .3 * t));
  noise += .5 * snoise(2. * uv + vec2(0., .32 * t));

  return noise;
}

const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
0, 8, 2, 10,
12, 4, 14, 6,
3, 11, 1, 9,
15, 7, 13, 5
);

const int bayer8x8[64] = int[64](
0, 32, 8, 40, 2, 34, 10, 42,
48, 16, 56, 24, 50, 18, 58, 26,
12, 44, 4, 36, 14, 46, 6, 38,
60, 28, 52, 20, 62, 30, 54, 22,
3, 35, 11, 43, 1, 33, 9, 41,
51, 19, 59, 27, 49, 17, 57, 25,
15, 47, 7, 39, 13, 45, 5, 37,
63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 uv, int size) {
  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return float(bayer2x2[index]) / 4.0;
  } else if (size == 4) {
    return float(bayer4x4[index]) / 16.0;
  } else if (size == 8) {
    return float(bayer8x8[index]) / 64.0;
  }
  return 0.0;
}


void main() {
  float t = .5 * u_time;

  float pxSize = u_pxSize * u_pixelRatio;
  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;
  pxSizeUV /= pxSize;
  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;
  vec2 normalizedUV = canvasPixelizedUV / u_resolution;

  vec2 ditheringNoiseUV = canvasPixelizedUV;
  vec2 shapeUV = normalizedUV;

  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
  givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
  float r = u_rotation * PI / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
  vec2 boxSize = vec2(
  (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
  (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
  );
  
  if (u_shape > 3.5) {
    vec2 objectBoxSize = vec2(0.);
    // fit = none
    objectBoxSize.x = min(boxSize.x, boxSize.y);
    if (u_fit == 1.) { // fit = contain
      objectBoxSize.x = min(u_resolution.x, u_resolution.y);
    } else if (u_fit == 2.) { // fit = cover
      objectBoxSize.x = max(u_resolution.x, u_resolution.y);
    }
    objectBoxSize.y = objectBoxSize.x;
    vec2 objectWorldScale = u_resolution.xy / objectBoxSize;

    shapeUV *= objectWorldScale;
    shapeUV += boxOrigin * (objectWorldScale - 1.);
    shapeUV += vec2(-u_offsetX, u_offsetY);
    shapeUV /= u_scale;
    shapeUV = graphicRotation * shapeUV;
  } else {
    vec2 patternBoxSize = vec2(0.);
    // fit = none
    patternBoxSize.x = patternBoxRatio * min(boxSize.x / patternBoxRatio, boxSize.y);
    float patternWorldNoFitBoxWidth = patternBoxSize.x;
    if (u_fit == 1.) { // fit = contain
      patternBoxSize.x = patternBoxRatio * min(u_resolution.x / patternBoxRatio, u_resolution.y);
    } else if (u_fit == 2.) { // fit = cover
      patternBoxSize.x = patternBoxRatio * max(u_resolution.x / patternBoxRatio, u_resolution.y);
    }
    patternBoxSize.y = patternBoxSize.x / patternBoxRatio;
    vec2 patternWorldScale = u_resolution.xy / patternBoxSize;

    shapeUV += vec2(-u_offsetX, u_offsetY) / patternWorldScale;
    shapeUV += boxOrigin;
    shapeUV -= boxOrigin / patternWorldScale;
    shapeUV *= u_resolution.xy;
    shapeUV /= u_pixelRatio;
    if (u_fit > 0.) {
      shapeUV *= (patternWorldNoFitBoxWidth / patternBoxSize.x);
    }
    shapeUV /= u_scale;
    shapeUV = graphicRotation * shapeUV;
    shapeUV += boxOrigin / patternWorldScale;
    shapeUV -= boxOrigin;
    shapeUV += .5;
  }

  float shape = 0.;
  if (u_shape < 1.5) {
    // Simplex noise
    shapeUV *= .001;

    shape = 0.5 + 0.5 * getSimplexNoise(shapeUV, t);
    shape = smoothstep(0.3, 0.9, shape);

  } else if (u_shape < 2.5) {
    // Warp
    shapeUV *= .003;

    for (float i = 1.0; i < 6.0; i++) {
      shapeUV.x += 0.6 / i * cos(i * 2.5 * shapeUV.y + t);
      shapeUV.y += 0.6 / i * cos(i * 1.5 * shapeUV.x + t);
    }

    shape = .15 / max(0.001, abs(sin(t - shapeUV.y - shapeUV.x)));
    shape = smoothstep(0.02, 1., shape);

  } else if (u_shape < 3.5) {
    // Dots
    shapeUV *= .05;

    float stripeIdx = floor(2. * shapeUV.x / TWO_PI);
    float rand = hash11(stripeIdx * 10.);
    rand = sign(rand - .5) * pow(.1 + abs(rand), .4);
    shape = sin(shapeUV.x) * cos(shapeUV.y - 5. * rand * t);
    shape = pow(abs(shape), 6.);

  } else if (u_shape < 4.5) {
    // Sine wave
    shapeUV *= 4.;

    float wave = cos(.5 * shapeUV.x - 2. * t) * sin(1.5 * shapeUV.x + t) * (.75 + .25 * cos(3. * t));
    shape = 1. - smoothstep(-1., 1., shapeUV.y + wave);

  } else if (u_shape < 5.5) {
    // Ripple

    float dist = length(shapeUV);
    float waves = sin(pow(dist, 1.7) * 7. - 3. * t) * .5 + .5;
    shape = waves;

  } else if (u_shape < 6.5) {
    // Swirl

    float l = length(shapeUV);
    float angle = 6. * atan(shapeUV.y, shapeUV.x) + 4. * t;
    float twist = 1.2;
    float offset = 1. / pow(max(l, 1e-6), twist) + angle / TWO_PI;
    float mid = smoothstep(0., 1., pow(l, twist));
    shape = mix(0., fract(offset), mid);

  } else {
    // Sphere
    shapeUV *= 2.;

    float d = 1. - pow(length(shapeUV), 2.);
    vec3 pos = vec3(shapeUV, sqrt(max(0., d)));
    vec3 lightPos = normalize(vec3(cos(1.5 * t), .8, sin(1.25 * t)));
    shape = .5 + .5 * dot(lightPos, pos);
    shape *= step(0., d);
  }


  int type = int(floor(u_type));
  float dithering = 0.0;

  switch (type) {
    case 1: {
      dithering = step(hash21(ditheringNoiseUV), shape);
    } break;
    case 2:
    dithering = getBayerValue(pxSizeUV, 2);
    break;
    case 3:
    dithering = getBayerValue(pxSizeUV, 4);
    break;
    default :
    dithering = getBayerValue(pxSizeUV, 8);
    break;
  }

  dithering -= .5;
  float res = step(.5, shape + dithering);

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);

  fragColor = vec4(color, opacity);
}
`;
var DitheringShapes = {
	simplex: 1,
	warp: 2,
	dots: 3,
	wave: 4,
	ripple: 5,
	swirl: 6,
	sphere: 7
};
var DitheringTypes = {
	"random": 1,
	"2x2": 2,
	"4x4": 3,
	"8x8": 4
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/grain-gradient.js
var grainGradientMeta = { maxColorCount: 7 };
var grainGradientFragmentShader = `#version 300 es
precision lowp float;

uniform mediump float u_time;
uniform mediump vec2 u_resolution;
uniform mediump float u_pixelRatio;

uniform sampler2D u_noiseTexture;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${grainGradientMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_softness;
uniform float u_intensity;
uniform float u_noise;
uniform float u_shape;

uniform mediump float u_originX;
uniform mediump float u_originY;
uniform mediump float u_worldWidth;
uniform mediump float u_worldHeight;
uniform mediump float u_fit;

uniform mediump float u_scale;
uniform mediump float u_rotation;
uniform mediump float u_offsetX;
uniform mediump float u_offsetY;

in vec2 v_objectUV;
in vec2 v_patternUV;
in vec2 v_objectBoxSize;
in vec2 v_patternBoxSize;

out vec4 fragColor;

${declarePI}
${simplexNoise}
${rotation2}
${textureRandomizerR}

float valueNoiseR(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}
vec4 fbmR(vec2 n0, vec2 n1, vec2 n2, vec2 n3) {
  float amplitude = 0.2;
  vec4 total = vec4(0.);
  for (int i = 0; i < 3; i++) {
    n0 = rotate(n0, 0.3);
    n1 = rotate(n1, 0.3);
    n2 = rotate(n2, 0.3);
    n3 = rotate(n3, 0.3);
    total.x += valueNoiseR(n0) * amplitude;
    total.y += valueNoiseR(n1) * amplitude;
    total.z += valueNoiseR(n2) * amplitude;
    total.z += valueNoiseR(n3) * amplitude;
    n0 *= 1.99;
    n1 *= 1.99;
    n2 *= 1.99;
    n3 *= 1.99;
    amplitude *= 0.6;
  }
  return total;
}

${proceduralHash11}

vec2 truchet(vec2 uv, float idx){
  idx = fract(((idx - .5) * 2.));
  if (idx > 0.75) {
    uv = vec2(1.0) - uv;
  } else if (idx > 0.5) {
    uv = vec2(1.0 - uv.x, uv.y);
  } else if (idx > 0.25) {
    uv = 1.0 - vec2(1.0 - uv.x, uv.y);
  }
  return uv;
}

void main() {

  const float firstFrameOffset = 7.;
  float t = .1 * (u_time + firstFrameOffset);

  vec2 shape_uv = vec2(0.);
  vec2 grain_uv = vec2(0.);

  float r = u_rotation * PI / 180.;
  float cr = cos(r);
  float sr = sin(r);
  mat2 graphicRotation = mat2(cr, sr, -sr, cr);
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  if (u_shape > 3.5) {
    shape_uv = v_objectUV;
    grain_uv = shape_uv;

    // apply inverse transform to grain_uv so it respects the originXY
    grain_uv = transpose(graphicRotation) * grain_uv;
    grain_uv *= u_scale;
    grain_uv -= graphicOffset;
    grain_uv *= v_objectBoxSize;
    grain_uv *= .7;
  } else {
    shape_uv = .5 * v_patternUV;
    grain_uv = 100. * v_patternUV;

    // apply inverse transform to grain_uv so it respects the originXY
    grain_uv = transpose(graphicRotation) * grain_uv;
    grain_uv *= u_scale;
    if (u_fit > 0.) {
      vec2 givenBoxSize = vec2(u_worldWidth, u_worldHeight);
      givenBoxSize = max(givenBoxSize, vec2(1.)) * u_pixelRatio;
      float patternBoxRatio = givenBoxSize.x / givenBoxSize.y;
      vec2 patternBoxGivenSize = vec2(
      (u_worldWidth == 0.) ? u_resolution.x : givenBoxSize.x,
      (u_worldHeight == 0.) ? u_resolution.y : givenBoxSize.y
      );
      patternBoxRatio = patternBoxGivenSize.x / patternBoxGivenSize.y;
      float patternBoxNoFitBoxWidth = patternBoxRatio * min(patternBoxGivenSize.x / patternBoxRatio, patternBoxGivenSize.y);
      grain_uv /= (patternBoxNoFitBoxWidth / v_patternBoxSize.x);
    }
    vec2 patternBoxScale = u_resolution.xy / v_patternBoxSize;
    grain_uv -= graphicOffset / patternBoxScale;
    grain_uv *= 1.6;
  }


  float shape = 0.;

  if (u_shape < 1.5) {
    // Sine wave

    float wave = cos(.5 * shape_uv.x - 4. * t) * sin(1.5 * shape_uv.x + 2. * t) * (.75 + .25 * cos(6. * t));
    shape = 1. - smoothstep(-1., 1., shape_uv.y + wave);

  } else if (u_shape < 2.5) {
    // Grid (dots)

    float stripeIdx = floor(2. * shape_uv.x / TWO_PI);
    float rand = hash11(stripeIdx * 100.);
    rand = sign(rand - .5) * pow(4. * abs(rand), .3);
    shape = sin(shape_uv.x) * cos(shape_uv.y - 5. * rand * t);
    shape = pow(abs(shape), 4.);

  } else if (u_shape < 3.5) {
    // Truchet pattern

    float n2 = valueNoiseR(shape_uv * .4 - 3.75 * t);
    shape_uv.x += 10.;
    shape_uv *= .6;

    vec2 tile = truchet(fract(shape_uv), randomR(floor(shape_uv)));

    float distance1 = length(tile);
    float distance2 = length(tile - vec2(1.));

    n2 -= .5;
    n2 *= .1;
    shape = smoothstep(.2, .55, distance1 + n2) * (1. - smoothstep(.45, .8, distance1 - n2));
    shape += smoothstep(.2, .55, distance2 + n2) * (1. - smoothstep(.45, .8, distance2 - n2));

    shape = pow(shape, 1.5);

  } else if (u_shape < 4.5) {
    // Corners

    shape_uv *= .6;
    vec2 outer = vec2(.5);

    vec2 bl = smoothstep(vec2(0.), outer, shape_uv + vec2(.1 + .1 * sin(3. * t), .2 - .1 * sin(5.25 * t)));
    vec2 tr = smoothstep(vec2(0.), outer, 1. - shape_uv);
    shape = 1. - bl.x * bl.y * tr.x * tr.y;

    shape_uv = -shape_uv;
    bl = smoothstep(vec2(0.), outer, shape_uv + vec2(.1 + .1 * sin(3. * t), .2 - .1 * cos(5.25 * t)));
    tr = smoothstep(vec2(0.), outer, 1. - shape_uv);
    shape -= bl.x * bl.y * tr.x * tr.y;

    shape = 1. - smoothstep(0., 1., shape);

  } else if (u_shape < 5.5) {
    // Ripple

    shape_uv *= 2.;
    float dist = length(.4 * shape_uv);
    float waves = sin(pow(dist, 1.2) * 5. - 3. * t) * .5 + .5;
    shape = waves;

  } else if (u_shape < 6.5) {
    // Blob

    t *= 2.;

    vec2 f1_traj = .25 * vec2(1.3 * sin(t), .2 + 1.3 * cos(.6 * t + 4.));
    vec2 f2_traj = .2 * vec2(1.2 * sin(-t), 1.3 * sin(1.6 * t));
    vec2 f3_traj = .25 * vec2(1.7 * cos(-.6 * t), cos(-1.6 * t));
    vec2 f4_traj = .3 * vec2(1.4 * cos(.8 * t), 1.2 * sin(-.6 * t - 3.));

    shape = .5 * pow(1. - clamp(0., 1., length(shape_uv + f1_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f2_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f3_traj)), 5.);
    shape += .5 * pow(1. - clamp(0., 1., length(shape_uv + f4_traj)), 5.);

    shape = smoothstep(.0, .9, shape);
    float edge = smoothstep(.25, .3, shape);
    shape = mix(.0, shape, edge);

  } else {
    // Sphere

    shape_uv *= 2.;
    float d = 1. - pow(length(shape_uv), 2.);
    vec3 pos = vec3(shape_uv, sqrt(max(d, 0.)));
    vec3 lightPos = normalize(vec3(cos(1.5 * t), .8, sin(1.25 * t)));
    shape = .5 + .5 * dot(lightPos, pos);
    shape *= step(0., d);
  }

  float baseNoise = snoise(grain_uv * .5);
  vec4 fbmVals = fbmR(
  .002 * grain_uv + 10.,
  .003 * grain_uv,
  .001 * grain_uv,
  rotate(.4 * grain_uv, 2.)
  );
  float grainDist = baseNoise * snoise(grain_uv * .2) - fbmVals.x - fbmVals.y;
  float rawNoise = .75 * baseNoise - fbmVals.w - fbmVals.z;
  float noise = clamp(rawNoise, 0., 1.);

  shape += u_intensity * 2. / u_colorsCount * (grainDist + .5);
  shape += u_noise * 10. / u_colorsCount * noise;

  float aa = fwidth(shape);

  shape = clamp(shape - .5 / u_colorsCount, 0., 1.);
  float totalShape = smoothstep(0., u_softness + 2. * aa, clamp(shape * u_colorsCount, 0., 1.));
  float mixer = shape * (u_colorsCount - 1.);

  int cntStop = int(u_colorsCount) - 1;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  for (int i = 1; i < ${grainGradientMeta.maxColorCount}; i++) {
    if (i > cntStop) break;

    float localT = clamp(mixer - float(i - 1), 0., 1.);
    localT = smoothstep(.5 - .5 * u_softness - aa, .5 + .5 * u_softness + aa, localT);

    vec4 c = u_colors[i];
    c.rgb *= c.a;
    gradient = mix(gradient, c, localT);
  }

  vec3 color = gradient.rgb * totalShape;
  float opacity = gradient.a * totalShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  fragColor = vec4(color, opacity);
}
`;
var GrainGradientShapes = {
	wave: 1,
	dots: 2,
	truchet: 3,
	corners: 4,
	ripple: 5,
	blob: 6,
	sphere: 7
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/pulsing-border.js
var pulsingBorderMeta = {
	maxColorCount: 5,
	maxSpots: 4
};
var pulsingBorderFragmentShader = `#version 300 es
precision lowp float;

uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${pulsingBorderMeta.maxColorCount}];
uniform float u_colorsCount;
uniform float u_roundness;
uniform float u_thickness;
uniform float u_marginLeft;
uniform float u_marginRight;
uniform float u_marginTop;
uniform float u_marginBottom;
uniform float u_aspectRatio;
uniform float u_softness;
uniform float u_intensity;
uniform float u_bloom;
uniform float u_spotSize;
uniform float u_spots;
uniform float u_pulse;
uniform float u_smoke;
uniform float u_smokeSize;

uniform sampler2D u_noiseTexture;

in vec2 v_responsiveUV;
in vec2 v_responsiveBoxGivenSize;
in vec2 v_patternUV;

out vec4 fragColor;

${declarePI}

float beat(float time) {
  float first = pow(abs(sin(time * TWO_PI)), 10.);
  float second = pow(abs(sin((time - .15) * TWO_PI)), 10.);

  return clamp(first + 0.6 * second, 0.0, 1.0);
}

float sst(float edge0, float edge1, float x) {
  return smoothstep(edge0, edge1, x);
}

float roundedBox(vec2 uv, vec2 halfSize, float distance, float cornerDistance, float thickness, float softness) {
  float borderDistance = abs(distance);
  float aa = 2. * fwidth(distance);
  float border = 1. - sst(min(mix(thickness, -thickness, softness), thickness + aa), max(mix(thickness, -thickness, softness), thickness + aa), borderDistance);
  float cornerFadeCircles = 0.;
  cornerFadeCircles = mix(1., cornerFadeCircles, sst(0., 1., length((uv + halfSize) / thickness)));
  cornerFadeCircles = mix(1., cornerFadeCircles, sst(0., 1., length((uv - vec2(-halfSize.x, halfSize.y)) / thickness)));
  cornerFadeCircles = mix(1., cornerFadeCircles, sst(0., 1., length((uv - vec2(halfSize.x, -halfSize.y)) / thickness)));
  cornerFadeCircles = mix(1., cornerFadeCircles, sst(0., 1., length((uv - halfSize) / thickness)));
  aa = fwidth(cornerDistance);
  float cornerFade = sst(0., mix(aa, thickness, softness), cornerDistance);
  cornerFade *= cornerFadeCircles;
  border += cornerFade;
  return border;
}

${textureRandomizerGB}

float randomG(vec2 p) {
  vec2 uv = floor(p) / 100. + .5;
  return texture(u_noiseTexture, fract(uv)).g;
}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomG(i);
  float b = randomG(i + vec2(1.0, 0.0));
  float c = randomG(i + vec2(0.0, 1.0));
  float d = randomG(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

void main() {
  const float firstFrameOffset = 109.;
  float t = 1.2 * (u_time + firstFrameOffset);

  vec2 borderUV = v_responsiveUV;
  float pulse = u_pulse * beat(.18 * u_time);

  float canvasRatio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
  vec2 halfSize = vec2(.5);
  borderUV.x *= max(canvasRatio, 1.);
  borderUV.y /= min(canvasRatio, 1.);
  halfSize.x *= max(canvasRatio, 1.);
  halfSize.y /= min(canvasRatio, 1.);

  float mL = u_marginLeft;
  float mR = u_marginRight;
  float mT = u_marginTop;
  float mB = u_marginBottom;
  float mX = mL + mR;
  float mY = mT + mB;

  if (u_aspectRatio > 0.) {
    float shapeRatio = canvasRatio * (1. - mX) / max(1. - mY, 1e-6);
    float freeX = shapeRatio > 1. ? (1. - mX) * (1. - 1. / max(abs(shapeRatio), 1e-6)) : 0.;
    float freeY = shapeRatio < 1. ? (1. - mY) * (1. - shapeRatio) : 0.;
    mL += freeX * 0.5;
    mR += freeX * 0.5;
    mT += freeY * 0.5;
    mB += freeY * 0.5;
    mX = mL + mR;
    mY = mT + mB;
  }

  float thickness = .5 * u_thickness * min(halfSize.x, halfSize.y);

  halfSize.x *= (1. - mX);
  halfSize.y *= (1. - mY);

  vec2 centerShift = vec2(
  (mL - mR) * max(canvasRatio, 1.) * 0.5,
  (mB - mT) / min(canvasRatio, 1.) * 0.5
  );

  borderUV -= centerShift;
  halfSize -= mix(thickness, 0., u_softness);

  float radius = mix(0., min(halfSize.x, halfSize.y), u_roundness);
  vec2 d = abs(borderUV) - halfSize + radius;
  float outsideDistance = length(max(d, .0001)) - radius;
  float insideDistance = min(max(d.x, d.y), .0001);
  float cornerDistance = abs(min(max(d.x, d.y) - .45 * radius, .0));
  float distance = outsideDistance + insideDistance;

  float borderThickness = mix(thickness, 3. * thickness, u_softness);
  float border = roundedBox(borderUV, halfSize, distance, cornerDistance, borderThickness, u_softness);
  border = pow(border, 1. + u_softness);

  vec2 smokeUV = .3 * u_smokeSize * v_patternUV;
  float smoke = clamp(3. * valueNoise(2.7 * smokeUV + .5 * t), 0., 1.);
  smoke -= valueNoise(3.4 * smokeUV - .5 * t);
  float smokeThickness = thickness + .2;
  smokeThickness = min(.4, max(smokeThickness, .1));
  smoke *= roundedBox(borderUV, halfSize, distance, cornerDistance, smokeThickness, 1.);
  smoke = 30. * smoke * smoke;
  smoke *= mix(0., .5, pow(u_smoke, 2.));
  smoke *= mix(1., pulse, u_pulse);
  smoke = clamp(smoke, 0., 1.);
  border += smoke;

  border = clamp(border, 0., 1.);

  vec3 blendColor = vec3(0.);
  float blendAlpha = 0.;
  vec3 addColor = vec3(0.);
  float addAlpha = 0.;

  float bloom = 4. * u_bloom;
  float intensity = 1. + (1. + 4. * u_softness) * u_intensity;

  float angle = atan(borderUV.y, borderUV.x) / TWO_PI;

  for (int colorIdx = 0; colorIdx < ${pulsingBorderMeta.maxColorCount}; colorIdx++) {
    if (colorIdx >= int(u_colorsCount)) break;
    float colorIdxF = float(colorIdx);

    vec3 c = u_colors[colorIdx].rgb * u_colors[colorIdx].a;
    float a = u_colors[colorIdx].a;

    for (int spotIdx = 0; spotIdx < ${pulsingBorderMeta.maxSpots}; spotIdx++) {
      if (spotIdx >= int(u_spots)) break;
      float spotIdxF = float(spotIdx);

      vec2 randVal = randomGB(vec2(spotIdxF * 10. + 2., 40. + colorIdxF));

      float time = (.1 + .15 * abs(sin(spotIdxF * (2. + colorIdxF)) * cos(spotIdxF * (2. + 2.5 * colorIdxF)))) * t + randVal.x * 3.;
      time *= mix(1., -1., step(.5, randVal.y));

      float mask = .5 + .5 * mix(
      sin(t + spotIdxF * (5. - 1.5 * colorIdxF)),
      cos(t + spotIdxF * (3. + 1.3 * colorIdxF)),
      step(mod(colorIdxF, 2.), .5)
      );

      float p = clamp(2. * u_pulse - randVal.x, 0., 1.);
      mask = mix(mask, pulse, p);

      float atg1 = fract(angle + time);
      float spotSize = .05 + .6 * pow(u_spotSize, 2.) + .05 * randVal.x;
      spotSize = mix(spotSize, .1, p);
      float sector = sst(.5 - spotSize, .5, atg1) * (1. - sst(.5, .5 + spotSize, atg1));

      sector *= mask;
      sector *= border;
      sector *= intensity;
      sector = clamp(sector, 0., 1.);

      vec3 srcColor = c * sector;
      float srcAlpha = a * sector;

      blendColor += ((1. - blendAlpha) * srcColor);
      blendAlpha = blendAlpha + (1. - blendAlpha) * srcAlpha;
      addColor += srcColor;
      addAlpha += srcAlpha;
    }
  }

  vec3 accumColor = mix(blendColor, addColor, bloom);
  float accumAlpha = mix(blendAlpha, addAlpha, bloom);
  accumAlpha = clamp(accumAlpha, 0., 1.);

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  vec3 color = accumColor + (1. - accumAlpha) * bgColor;
  float opacity = accumAlpha + (1. - accumAlpha) * u_colorBack.a;

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}`;
var PulsingBorderAspectRatios = {
	auto: 0,
	square: 1
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/color-panels.js
var colorPanelsMeta = { maxColorCount: 7 };
var colorPanelsFragmentShader = `#version 300 es
precision lowp float;

uniform float u_time;
uniform mediump float u_scale;

uniform vec4 u_colors[${colorPanelsMeta.maxColorCount}];
uniform float u_colorsCount;
uniform vec4 u_colorBack;
uniform float u_density;
uniform float u_angle1;
uniform float u_angle2;
uniform float u_length;
uniform bool u_edges;
uniform float u_blur;
uniform float u_fadeIn;
uniform float u_fadeOut;
uniform float u_gradient;

in vec2 v_objectUV;

out vec4 fragColor;

${declarePI}

const float zLimit = .5;

vec2 getPanel(float angle, vec2 uv, float invLength, float aa) {
  float sinA = sin(angle);
  float cosA = cos(angle);

  float denom = sinA - uv.y * cosA;
  if (abs(denom) < .01) return vec2(0.);

  float z = uv.y / denom;

  if (z <= 0. || z > zLimit) return vec2(0.);

  float zRatio = z / zLimit;
  float panelMap = 1. - zRatio;
  float x = uv.x * (cosA * z + 1.) * invLength;

  float zOffset = zRatio - .5;
  float left = -.5 + zOffset * u_angle1;
  float right = .5 - zOffset * u_angle2;
  float blurX = aa + 2. * panelMap * u_blur;

  float leftEdge1 = left - blurX;
  float leftEdge2 = left + .25 * blurX;
  float rightEdge1 = right - .25 * blurX;
  float rightEdge2 = right + blurX;

  float panel = smoothstep(leftEdge1, leftEdge2, x) * (1.0 - smoothstep(rightEdge1, rightEdge2, x));
  panel *= mix(0., panel, smoothstep(0., .01 / max(u_scale, 1e-6), panelMap));

  float midScreen = abs(sinA);
  if (u_edges == true) {
    panelMap = mix(.99, panelMap, panel * clamp(panelMap / (.15 * (1. - pow(midScreen, .1))), 0.0, 1.0));
  } else if (midScreen < .07) {
    panel *= (midScreen * 15.);
  }

  return vec2(panel, panelMap);
}

vec4 blendColor(vec4 colorA, float panelMask, float panelMap) {
  float fade = 1. - smoothstep(.97 - .97 * u_fadeIn, 1., panelMap);

  fade *= smoothstep(-.2 * (1. - u_fadeOut), u_fadeOut, panelMap);

  vec3 blendedRGB = mix(vec3(0.), colorA.rgb, fade);
  float blendedAlpha = mix(0., colorA.a, fade);

  return vec4(blendedRGB, blendedAlpha) * panelMask;
}

void main() {
  vec2 uv = v_objectUV;
  uv *= 1.25;

  float t = .02 * u_time;
  t = fract(t);
  bool reverseTime = (t < 0.5);

  vec3 color = vec3(0.);
  float opacity = 0.;

  float aa = .005 / u_scale;
  int colorsCount = int(u_colorsCount);

  vec4 premultipliedColors[${colorPanelsMeta.maxColorCount}];
  for (int i = 0; i < ${colorPanelsMeta.maxColorCount}; i++) {
    if (i >= colorsCount) break;
    vec4 c = u_colors[i];
    c.rgb *= c.a;
    premultipliedColors[i] = c;
  }

  float invLength = 1.5 / max(u_length, .001);

  float totalColorWeight = 0.;
  int panelsNumber = 12;

  float densityNormalizer = 1.;
  if (colorsCount == 4) {
    panelsNumber = 16;
    densityNormalizer = 1.34;
  } else if (colorsCount == 5) {
    panelsNumber = 20;
    densityNormalizer = 1.67;
  } else if (colorsCount == 7) {
    panelsNumber = 14;
    densityNormalizer = 1.17;
  }

  float fPanelsNumber = float(panelsNumber);

  float totalPanelsShape = 0.;
  float panelGrad = 1. - clamp(u_gradient, 0., 1.);

  for (int set = 0; set < 2; set++) {
    bool isForward = (set == 0 && !reverseTime) || (set == 1 && reverseTime);
    if (!isForward) continue;

    for (int i = 0; i <= 20; i++) {
      if (i >= panelsNumber) break;

      int idx = panelsNumber - 1 - i;

      float offset = float(idx) / fPanelsNumber;
      if (set == 1) {
        offset += .5;
      }

      float densityFract = densityNormalizer * fract(t + offset);
      float angleNorm = densityFract / u_density;
      if (densityFract >= .5 || angleNorm >= .3) continue;

      float smoothDensity = clamp((.5 - densityFract) / .1, 0., 1.) * clamp(densityFract / .01, 0., 1.);
      float smoothAngle = clamp((.3 - angleNorm) / .05, 0., 1.);
      if (smoothDensity * smoothAngle < .001) continue;

      if (angleNorm > .5) {
        angleNorm = 0.5;
      }
      vec2 panel = getPanel(angleNorm * TWO_PI + PI, uv, invLength, aa);
      if (panel[0] <= .001) continue;
      float panelMask = panel[0] * smoothDensity * smoothAngle;
      float panelMap = panel[1];

      int colorIdx = idx % colorsCount;
      int nextColorIdx = (idx + 1) % colorsCount;

      vec4 colorA = premultipliedColors[colorIdx];
      vec4 colorB = premultipliedColors[nextColorIdx];

      colorA = mix(colorA, colorB, max(0., smoothstep(.0, .45, panelMap) - panelGrad));
      vec4 blended = blendColor(colorA, panelMask, panelMap);
      color = blended.rgb + color * (1. - blended.a);
      opacity = blended.a + opacity * (1. - blended.a);
    }


    for (int i = 0; i <= 20; i++) {
      if (i >= panelsNumber) break;

      int idx = panelsNumber - 1 - i;

      float offset = float(idx) / fPanelsNumber;
      if (set == 0) {
        offset += .5;
      }

      float densityFract = densityNormalizer * fract(-t + offset);
      float angleNorm = -densityFract / u_density;
      if (densityFract >= .5 || angleNorm < -.3) continue;

      float smoothDensity = clamp((.5 - densityFract) / .1, 0., 1.) * clamp(densityFract / .01, 0., 1.);
      float smoothAngle = clamp((angleNorm + .3) / .05, 0., 1.);
      if (smoothDensity * smoothAngle < .001) continue;

      vec2 panel = getPanel(angleNorm * TWO_PI + PI, uv, invLength, aa);
      float panelMask = panel[0] * smoothDensity * smoothAngle;
      if (panelMask <= .001) continue;
      float panelMap = panel[1];

      int colorIdx = (colorsCount - (idx % colorsCount)) % colorsCount;
      if (colorIdx < 0) colorIdx += colorsCount;
      int nextColorIdx = (colorIdx + 1) % colorsCount;

      vec4 colorA = premultipliedColors[colorIdx];
      vec4 colorB = premultipliedColors[nextColorIdx];

      colorA = mix(colorA, colorB, max(0., smoothstep(.0, .45, panelMap) - panelGrad));
      vec4 blended = blendColor(colorA, panelMask, panelMap);
      color = blended.rgb + color * (1. - blended.a);
      opacity = blended.a + opacity * (1. - blended.a);
    }
  }

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/static-mesh-gradient.js
var staticMeshGradientMeta = { maxColorCount: 10 };
var staticMeshGradientFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_colors[${staticMeshGradientMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_positions;
uniform float u_waveX;
uniform float u_waveXShift;
uniform float u_waveY;
uniform float u_waveYShift;
uniform float u_mixing;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_objectUV;
out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float noise(vec2 n, vec2 seedOffset) {
  return valueNoise(n + seedOffset);
}

vec2 getPosition(int i, float t) {
  float a = float(i) * .37;
  float b = .6 + mod(float(i), 3.) * .3;
  float c = .8 + mod(float(i + 1), 4.) * 0.25;

  float x = sin(t * b + a);
  float y = cos(t * c + a * 1.5);

  return .5 + .5 * vec2(x, y);
}

void main() {
  vec2 uv = v_objectUV;
  uv += .5;
  vec2 grainUV = uv * 1000.;

  float grain = noise(grainUV, vec2(0.));
  float mixerGrain = .4 * u_grainMixer * (grain - .5);

  float radius = smoothstep(0., 1., length(uv - .5));
  float center = 1. - radius;
  for (float i = 1.; i <= 2.; i++) {
    uv.x += u_waveX * center / i * cos(TWO_PI * u_waveXShift + i * 2. * smoothstep(.0, 1., uv.y));
    uv.y += u_waveY * center / i * cos(TWO_PI * u_waveYShift + i * 2. * smoothstep(.0, 1., uv.x));
  }

  vec3 color = vec3(0.);
  float opacity = 0.;
  float totalWeight = 0.;
  float positionSeed = 25. + .33 * u_positions;

  for (int i = 0; i < ${staticMeshGradientMeta.maxColorCount}; i++) {
    if (i >= int(u_colorsCount)) break;

    vec2 pos = getPosition(i, positionSeed) + mixerGrain;
    float dist = length(uv - pos);
    dist = length(uv - pos);

    vec3 colorFraction = u_colors[i].rgb * u_colors[i].a;
    float opacityFraction = u_colors[i].a;

    float mixing = pow(u_mixing, .7);
    float power = mix(2., 1., mixing);
    dist = pow(dist, power);

    float w = 1. / (dist + 1e-3);
    float baseSharpness = mix(.0, 8., clamp(w, 0., 1.));
    float sharpness = mix(baseSharpness, 1., mixing);
    w = pow(w, sharpness);
    color += colorFraction * w;
    opacity += opacityFraction * w;
    totalWeight += w;
  }

  color /= max(1e-4, totalWeight);
  opacity /= max(1e-4, totalWeight);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/static-radial-gradient.js
var staticRadialGradientMeta = { maxColorCount: 10 };
var staticRadialGradientFragmentShader = `#version 300 es
precision mediump float;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${staticRadialGradientMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_radius;
uniform float u_focalDistance;
uniform float u_focalAngle;
uniform float u_falloff;
uniform float u_mixing;
uniform float u_distortion;
uniform float u_distortionShift;
uniform float u_distortionFreq;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_objectUV;
out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float noise(vec2 n, vec2 seedOffset) {
  return valueNoise(n + seedOffset);
}

vec2 getPosition(int i, float t) {
  float a = float(i) * .37;
  float b = .6 + mod(float(i), 3.) * .3;
  float c = .8 + mod(float(i + 1), 4.) * 0.25;

  float x = sin(t * b + a);
  float y = cos(t * c + a * 1.5);

  return .5 + .5 * vec2(x, y);
}

void main() {
  vec2 uv = 2. * v_objectUV;
  vec2 grainUV = uv * 1000.;

  vec2 center = vec2(0.);
  float angleRad = -radians(u_focalAngle + 90.);
  vec2 focalPoint = vec2(cos(angleRad), sin(angleRad)) * u_focalDistance;
  float radius = u_radius;

  vec2 c_to_uv = uv - center;
  vec2 f_to_uv = uv - focalPoint;
  vec2 f_to_c = center - focalPoint;
  float r = length(c_to_uv);

  float fragAngle = atan(c_to_uv.y, c_to_uv.x);
  float angleDiff = fract((fragAngle - angleRad + PI) / TWO_PI) * TWO_PI - PI;

  float halfAngle = acos(clamp(radius / max(u_focalDistance, 1e-4), 0.0, 1.0));
  float e0 = 0.6 * PI, e1 = halfAngle;
  float lo = min(e0, e1), hi = max(e0, e1);
  float s  = smoothstep(lo, hi, abs(angleDiff));
  float isInSector = (e1 >= e0) ? (1.0 - s) : s;

  float a = dot(f_to_uv, f_to_uv);
  float b = -2.0 * dot(f_to_uv, f_to_c);
  float c = dot(f_to_c, f_to_c) - radius * radius;

  float discriminant = b * b - 4.0 * a * c;
  float t = 1.0;

  if (discriminant >= 0.0) {
    float sqrtD = sqrt(discriminant);
    float div = max(1e-4, 2.0 * a);
    float t0 = (-b - sqrtD) / div;
    float t1 = (-b + sqrtD) / div;
    t = max(t0, t1);
    if (t < 0.0) t = 0.0;
  }

  float dist = length(f_to_uv);
  float normalized = dist / max(1e-4, length(f_to_uv * t));
  float shape = clamp(normalized, 0.0, 1.0);

  float falloffMapped = mix(.2 + .8 * max(0., u_falloff + 1.), mix(1., 15., u_falloff * u_falloff), step(.0, u_falloff));

  float falloffExp = mix(falloffMapped, 1., shape);
  shape = pow(shape, falloffExp);
  shape = 1. - clamp(shape, 0., 1.);


  float outerMask = .002;
  float outer = 1.0 - smoothstep(radius - outerMask, radius + outerMask, r);
  outer = mix(outer, 1., isInSector);

  shape = mix(0., shape, outer);
  shape *= 1. - smoothstep(radius - .01, radius, r);

  float angle = atan(f_to_uv.y, f_to_uv.x);
  shape -= pow(u_distortion, 2.) * shape * pow(abs(sin(PI * clamp(length(f_to_uv) - 0.2 + u_distortionShift, 0.0, 1.0))), 4.0) * (sin(u_distortionFreq * angle) + cos(floor(0.65 * u_distortionFreq) * angle));

  float grain = noise(grainUV, vec2(0.));
  float mixerGrain = .4 * u_grainMixer * (grain - .5);

  float mixer = shape * u_colorsCount + mixerGrain;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;

  float outerShape = 0.;
  for (int i = 1; i < ${staticRadialGradientMeta.maxColorCount + 1}; i++) {
    if (i > int(u_colorsCount)) break;
    float mLinear = clamp(mixer - float(i - 1), 0.0, 1.0);

    float aa = fwidth(mLinear);
    float width = min(u_mixing, 0.5);
    float t = clamp((mLinear - (0.5 - width - aa)) / (2. * width + 2. * aa), 0., 1.);
    float p = mix(2., 1., clamp((u_mixing - 0.5) * 2., 0., 1.));
    float m = t < 0.5
      ? 0.5 * pow(2. * t, p)
      : 1. - 0.5 * pow(2. * (1. - t), p);

    float quadBlend = clamp((u_mixing - 0.5) * 2., 0., 1.);
    m = mix(m, m * m, 0.5 * quadBlend);
    
    if (i == 1) {
      outerShape = m;
    }

    vec4 c = u_colors[i - 1];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  vec3 color = gradient.rgb * outerShape;
  float opacity = gradient.a * outerShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/paper-texture.js
var paperTextureFragmentShader = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_contrast;
uniform float u_roughness;
uniform float u_fiber;
uniform float u_fiberSize;
uniform float u_crumples;
uniform float u_crumpleSize;
uniform float u_folds;
uniform float u_foldCount;
uniform float u_drops;
uniform float u_seed;
uniform float u_fade;

uniform sampler2D u_noiseTexture;

in vec2 v_imageUV;

out vec4 fragColor;

float getUvFrame(vec2 uv) {
  float aax = 2. * fwidth(uv.x);
  float aay = 2. * fwidth(uv.y);

  float left   = smoothstep(0., aax, uv.x);
  float right = 1. - smoothstep(1. - aax, 1., uv.x);
  float bottom = smoothstep(0., aay, uv.y);
  float top = 1. - smoothstep(1. - aay, 1., uv.y);

  return left * right * bottom * top;
}

${declarePI}
${rotation2}
${textureRandomizerR}
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = randomR(i);
  float b = randomR(i + vec2(1.0, 0.0));
  float c = randomR(i + vec2(0.0, 1.0));
  float d = randomR(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}
float fbm(vec2 n) {
  float total = 0.0, amplitude = .4;
  for (int i = 0; i < 3; i++) {
    total += valueNoise(n) * amplitude;
    n *= 1.99;
    amplitude *= 0.65;
  }
  return total;
}


float randomG(vec2 p) {
  vec2 uv = floor(p) / 50. + .5;
  return texture(u_noiseTexture, fract(uv)).g;
}
float roughness(vec2 p) {
  p *= .1;
  float o = 0.;
  for (float i = 0.; ++i < 4.; p *= 2.1) {
    vec4 w = vec4(floor(p), ceil(p));
    vec2 f = fract(p);
    o += mix(
    mix(randomG(w.xy), randomG(w.xw), f.y),
    mix(randomG(w.zy), randomG(w.zw), f.y),
    f.x);
    o += .2 / exp(2. * abs(sin(.2 * p.x + .5 * p.y)));
  }
  return o / 3.;
}

${fiberNoise}

vec2 randomGB(vec2 p) {
  vec2 uv = floor(p) / 50. + .5;
  return texture(u_noiseTexture, fract(uv)).gb;
}
float crumpledNoise(vec2 t, float pw) {
  vec2 p = floor(t);
  float wsum = 0.;
  float cl = 0.;
  for (int y = -1; y < 2; y += 1) {
    for (int x = -1; x < 2; x += 1) {
      vec2 b = vec2(float(x), float(y));
      vec2 q = b + p;
      vec2 q2 = q - floor(q / 8.) * 8.;
      vec2 c = q + randomGB(q2);
      vec2 r = c - t;
      float w = pow(smoothstep(0., 1., 1. - abs(r.x)), pw) * pow(smoothstep(0., 1., 1. - abs(r.y)), pw);
      cl += (.5 + .5 * sin((q2.x + q2.y * 5.) * 8.)) * w;
      wsum += w;
    }
  }
  return pow(wsum != 0.0 ? cl / wsum : 0.0, .5) * 2.;
}
float crumplesShape(vec2 uv) {
  return crumpledNoise(uv * .25, 16.) * crumpledNoise(uv * .5, 2.);
}


vec2 folds(vec2 uv) {
  vec3 pp = vec3(0.);
  float l = 9.;
  for (float i = 0.; i < 15.; i++) {
    if (i >= u_foldCount) break;
    vec2 rand = randomGB(vec2(i, i * u_seed));
    float an = rand.x * TWO_PI;
    vec2 p = vec2(cos(an), sin(an)) * rand.y;
    float dist = distance(uv, p);
    l = min(l, dist);

    if (l == dist) {
      pp.xy = (uv - p.xy);
      pp.z = dist;
    }
  }
  return mix(pp.xy, vec2(0.), pow(pp.z, .25));
}

float drops(vec2 uv) {
  vec2 iDropsUV = floor(uv);
  vec2 fDropsUV = fract(uv);
  float dropsMinDist = 1.;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 offset = randomGB(iDropsUV + neighbor);
      offset = .5 + .5 * sin(10. * u_seed + TWO_PI * offset);
      vec2 pos = neighbor + offset - fDropsUV;
      float dist = length(pos);
      dropsMinDist = min(dropsMinDist, dropsMinDist*dist);
    }
  }
  return 1. - smoothstep(.05, .09, pow(dropsMinDist, .5));
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

void main() {

  vec2 imageUV = v_imageUV;
  vec2 patternUV = v_imageUV - .5;
  patternUV = 5. * (patternUV * vec2(u_imageAspectRatio, 1.));

  vec2 roughnessUv = 1.5 * (gl_FragCoord.xy - .5 * u_resolution) / u_pixelRatio;
  float roughness = roughness(roughnessUv + vec2(1., 0.)) - roughness(roughnessUv - vec2(1., 0.));

  vec2 crumplesUV = fract(patternUV * .02 / u_crumpleSize - u_seed) * 32.;
  float crumples = u_crumples * (crumplesShape(crumplesUV + vec2(.05, 0.)) - crumplesShape(crumplesUV));

  vec2 fiberUV = 2. / u_fiberSize * patternUV;
  float fiber = fiberNoise(fiberUV, vec2(0.));
  fiber = .5 * u_fiber * (fiber - 1.);

  vec2 normal = vec2(0.);
  vec2 normalImage = vec2(0.);

  vec2 foldsUV = patternUV * .12;
  foldsUV = rotate(foldsUV, 4. * u_seed);
  vec2 w = folds(foldsUV);
  foldsUV = rotate(foldsUV + .007 * cos(u_seed), .01 * sin(u_seed));
  vec2 w2 = folds(foldsUV);

  float drops = u_drops * drops(patternUV * 2.);

  float fade = u_fade * fbm(.17 * patternUV + 10. * u_seed);
  fade = clamp(8. * fade * fade * fade, 0., 1.);

  w = mix(w, vec2(0.), fade);
  w2 = mix(w2, vec2(0.), fade);
  crumples = mix(crumples, 0., fade);
  drops = mix(drops, 0., fade);
  fiber *= mix(1., .5, fade);
  roughness *= mix(1., .5, fade);

  normal.xy += u_folds * min(5. * u_contrast, 1.) * 4. * max(vec2(0.), w + w2);
  normalImage.xy += u_folds * 2. * w;

  normal.xy += crumples;
  normalImage.xy += 1.5 * crumples;

  normal.xy += 3. * drops;
  normalImage.xy += .2 * drops;

  normal.xy += u_roughness * 1.5 * roughness;
  normal.xy += fiber;

  normalImage += u_roughness * .75 * roughness;
  normalImage += .2 * fiber;

  vec3 lightPos = vec3(1., 2., 1.);
  float res = dot(normalize(vec3(normal, 9.5 - 9. * pow(u_contrast, .1))), normalize(lightPos));

  vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
  float fgOpacity = u_colorFront.a;
  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  float bgOpacity = u_colorBack.a;

  imageUV += .02 * normalImage;
  float frame = getUvFrame(imageUV);
  vec4 image = texture(u_image, imageUV);
  image.rgb += .6 * pow(u_contrast, .4) * (res - .7);

  frame *= image.a;

  vec3 color = fgColor * res;
  float opacity = fgOpacity * res;

  color += bgColor * (1. - opacity);
  opacity += bgOpacity * (1. - opacity);
  opacity = mix(opacity, 1., frame);

  color -= .007 * drops;

  color.rgb = mix(color, image.rgb, frame);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/water.js
var waterFragmentShader = `#version 300 es
precision mediump float;

uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_size;
uniform float u_highlights;
uniform float u_layering;
uniform float u_edges;
uniform float u_caustic;
uniform float u_waves;

in vec2 v_imageUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${simplexNoise}

float getUvFrame(vec2 uv) {
  float aax = 2. * fwidth(uv.x);
  float aay = 2. * fwidth(uv.y);

  float left   = smoothstep(0., aax, uv.x);
  float right = 1.0 - smoothstep(1. - aax, 1., uv.x);
  float bottom = smoothstep(0., aay, uv.y);
  float top = 1.0 - smoothstep(1. - aay, 1., uv.y);

  return left * right * bottom * top;
}

mat2 rotate2D(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

float getCausticNoise(vec2 uv, float t, float scale) {
  vec2 n = vec2(.1);
  vec2 N = vec2(.1);
  mat2 m = rotate2D(.5);
  for (int j = 0; j < 6; j++) {
    uv *= m;
    n *= m;
    vec2 q = uv * scale + float(j) + n + (.5 + .5 * float(j)) * (mod(float(j), 2.) - 1.) * t;
    n += sin(q);
    N += cos(q) / scale;
    scale *= 1.1;
  }
  return (N.x + N.y + 1.);
}

void main() {
  vec2 imageUV = v_imageUV;
  vec2 patternUV = v_imageUV - .5;
  patternUV = (patternUV * vec2(u_imageAspectRatio, 1.));
  patternUV /= (.01 + .09 * u_size);

  float t = u_time;

  float wavesNoise = snoise((.3 + .1 * sin(t)) * .1 * patternUV + vec2(0., .4 * t));

  float causticNoise = getCausticNoise(patternUV + u_waves * vec2(1., -1.) * wavesNoise, 2. * t, 1.5);

  causticNoise += u_layering * getCausticNoise(patternUV + 2. * u_waves * vec2(1., -1.) * wavesNoise, 1.5 * t, 2.);
  causticNoise = causticNoise * causticNoise;

  float edgesDistortion = smoothstep(0., .1, imageUV.x);
  edgesDistortion *= smoothstep(0., .1, imageUV.y);
  edgesDistortion *= (smoothstep(1., 1.1, imageUV.x) + (1.0 - smoothstep(.8, .95, imageUV.x)));
  edgesDistortion *= (1.0 - smoothstep(.9, 1., imageUV.y));
  edgesDistortion = mix(edgesDistortion, 1., u_edges);

  float causticNoiseDistortion = .02 * causticNoise * edgesDistortion;

  float wavesDistortion = .1 * u_waves * wavesNoise;

  imageUV += vec2(wavesDistortion, -wavesDistortion);
  imageUV += (u_caustic * causticNoiseDistortion);

  float frame = getUvFrame(imageUV);

  vec4 image = texture(u_image, imageUV);
  vec4 backColor = u_colorBack;
  backColor.rgb *= backColor.a;

  vec3 color = mix(backColor.rgb, image.rgb, image.a * frame);
  float opacity = backColor.a + image.a * frame;

  causticNoise = max(-.2, causticNoise);

  float hightlight = .025 * u_highlights * causticNoise;
  hightlight *= u_colorHighlight.a;
  color = mix(color, u_colorHighlight.rgb, .05 * u_highlights * causticNoise);
  opacity += hightlight;

  color += hightlight * (.5 + .5 * wavesNoise);
  opacity += hightlight * (.5 + .5 * wavesNoise);

  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/fluted-glass.js
var flutedGlassFragmentShader = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_rotation;

uniform vec4 u_colorBack;
uniform vec4 u_colorShadow;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_size;
uniform float u_shadows;
uniform float u_angle;
uniform float u_stretch;
uniform float u_shape;
uniform float u_distortion;
uniform float u_highlights;
uniform float u_distortionShape;
uniform float u_shift;
uniform float u_blur;
uniform float u_edges;
uniform float u_marginLeft;
uniform float u_marginRight;
uniform float u_marginTop;
uniform float u_marginBottom;
uniform float u_grainMixer;
uniform float u_grainOverlay;

in vec2 v_imageUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float getUvFrame(vec2 uv, float softness) {
  float aax = 2. * fwidth(uv.x);
  float aay = 2. * fwidth(uv.y);
  float left   = smoothstep(0., aax + softness, uv.x);
  float right  = 1. - smoothstep(1. - softness - aax, 1., uv.x);
  float bottom = smoothstep(0., aay + softness, uv.y);
  float top    = 1. - smoothstep(1. - softness - aay, 1., uv.y);
  return left * right * bottom * top;
}

const int MAX_RADIUS = 50;
vec4 samplePremultiplied(sampler2D tex, vec2 uv) {
  vec4 c = texture(tex, uv);
  c.rgb *= c.a;
  return c;
}
vec4 getBlur(sampler2D tex, vec2 uv, vec2 texelSize, vec2 dir, float sigma) {
  if (sigma <= .5) return texture(tex, uv);
  int radius = int(min(float(MAX_RADIUS), ceil(3.0 * sigma)));

  float twoSigma2 = 2.0 * sigma * sigma;
  float gaussianNorm = 1.0 / sqrt(TWO_PI * sigma * sigma);

  vec4 sum = samplePremultiplied(tex, uv) * gaussianNorm;
  float weightSum = gaussianNorm;

  for (int i = 1; i <= MAX_RADIUS; i++) {
    if (i > radius) break;

    float x = float(i);
    float w = exp(-(x * x) / twoSigma2) * gaussianNorm;

    vec2 offset = dir * texelSize * x;
    vec4 s1 = samplePremultiplied(tex, uv + offset);
    vec4 s2 = samplePremultiplied(tex, uv - offset);

    sum += (s1 + s2) * w;
    weightSum += 2.0 * w;
  }

  vec4 result = sum / weightSum;
  if (result.a > 0.) {
    result.rgb /= result.a;
  }

  return result;
}

vec2 rotateAspect(vec2 p, float a, float aspect) {
  p.x *= aspect;
  p = rotate(p, a);
  p.x /= aspect;
  return p;
}

float smoothFract(float x) {
  float f = fract(x);
  float w = fwidth(x);

  float edge = abs(f - 0.5) - 0.5;
  float band = smoothstep(-w, w, edge);

  return mix(f, 1.0 - f, band);
}

void main() {

  float patternRotation = -u_angle * PI / 180.;
  float patternSize = mix(200., 5., u_size);

  vec2 uv = v_imageUV;

  vec2 uvMask = gl_FragCoord.xy / u_resolution.xy;
  vec2 sw = vec2(.005);
  vec4 margins = vec4(u_marginLeft, u_marginTop, u_marginRight, u_marginBottom);
  float mask =
  smoothstep(margins[0], margins[0] + sw.x, uvMask.x + sw.x) *
  smoothstep(margins[2], margins[2] + sw.x, 1.0 - uvMask.x + sw.x) *
  smoothstep(margins[1], margins[1] + sw.y, uvMask.y + sw.y) *
  smoothstep(margins[3], margins[3] + sw.y, 1.0 - uvMask.y + sw.y);
  float maskOuter =
  smoothstep(margins[0] - sw.x, margins[0], uvMask.x + sw.x) *
  smoothstep(margins[2] - sw.x, margins[2], 1.0 - uvMask.x + sw.x) *
  smoothstep(margins[1] - sw.y, margins[1], uvMask.y + sw.y) *
  smoothstep(margins[3] - sw.y, margins[3], 1.0 - uvMask.y + sw.y);
  float maskStroke = maskOuter - mask;
  float maskInner =
  smoothstep(margins[0] - 2. * sw.x, margins[0], uvMask.x) *
  smoothstep(margins[2] - 2. * sw.x, margins[2], 1.0 - uvMask.x) *
  smoothstep(margins[1] - 2. * sw.y, margins[1], uvMask.y) *
  smoothstep(margins[3] - 2. * sw.y, margins[3], 1.0 - uvMask.y);
  float maskStrokeInner = maskInner - mask;

  uv -= .5;
  uv *= patternSize;
  uv = rotateAspect(uv, patternRotation, u_imageAspectRatio);

  float curve = 0.;
  float patternY = uv.y / u_imageAspectRatio;
  if (u_shape > 4.5) {
    // pattern
    curve = .5 + .5 * sin(.5 * PI * uv.x) * cos(.5 * PI * patternY);
  } else if (u_shape > 3.5) {
    // zigzag
    curve = 10. * abs(fract(.1 * patternY) - .5);
  } else if (u_shape > 2.5) {
    // wave
    curve = 4. * sin(.23 * patternY);
  } else if (u_shape > 1.5) {
    // lines irregular
    curve = .5 + .5 * sin(.5 * uv.x) * sin(1.7 * uv.x);
  } else {
    // lines
  }

  vec2 UvToFract = uv + curve;
  vec2 fractOrigUV = fract(uv);
  vec2 floorOrigUV = floor(uv);

  float x = smoothFract(UvToFract.x);
  float xNonSmooth = fract(UvToFract.x) + .0001;

  float highlightsWidth = 2. * max(.001, fwidth(UvToFract.x));
  highlightsWidth += 2. * maskStrokeInner;
  float highlights = smoothstep(0., highlightsWidth, xNonSmooth);
  highlights *= smoothstep(1., 1. - highlightsWidth, xNonSmooth);
  highlights = 1. - highlights;
  highlights *= u_highlights;
  highlights = clamp(highlights, 0., 1.);
  highlights *= mask;

  float shadows = pow(x, 1.3);
  float distortion = 0.;
  float fadeX = 1.;
  float frameFade = 0.;

  float aa = fwidth(xNonSmooth);
  aa = max(aa, fwidth(uv.x));
  aa = max(aa, fwidth(UvToFract.x));
  aa = max(aa, .0001);

  if (u_distortionShape == 1.) {
    distortion = -pow(1.5 * x, 3.);
    distortion += (.5 - u_shift);

    frameFade = pow(1.5 * x, 3.);
    aa = max(.2, aa);
    aa += mix(.2, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion = mix(.5, distortion, fadeX);
  } else if (u_distortionShape == 2.) {
    distortion = 2. * pow(x, 2.);
    distortion -= (.5 + u_shift);

    frameFade = pow(abs(x - .5), 4.);
    aa = max(.2, aa);
    aa += mix(.2, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion = mix(.5, distortion, fadeX);
    frameFade = mix(1., frameFade, .5 * fadeX);
  } else if (u_distortionShape == 3.) {
    distortion = pow(2. * (xNonSmooth - .5), 6.);
    distortion -= .25;
    distortion -= u_shift;

    frameFade = 1. - 2. * pow(abs(x - .4), 2.);
    aa = .15;
    aa += mix(.1, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    frameFade = mix(1., frameFade, fadeX);

  } else if (u_distortionShape == 4.) {
    x = xNonSmooth;
    distortion = sin((x + .25) * TWO_PI);
    shadows = .5 + .5 * asin(distortion) / (.5 * PI);
    distortion *= .5;
    distortion -= u_shift;
    frameFade = .5 + .5 * sin(x * TWO_PI);
  } else if (u_distortionShape == 5.) {
    distortion -= pow(abs(x), .2) * x;
    distortion += .33;
    distortion -= 3. * u_shift;
    distortion *= .33;

    frameFade = .3 * (smoothstep(.0, 1., x));
    shadows = pow(x, 2.5);

    aa = max(.1, aa);
    aa += mix(.1, 0., u_size);
    fadeX = smoothstep(0., aa, xNonSmooth) * smoothstep(1., 1. - aa, xNonSmooth);
    distortion *= fadeX;
  }

  vec2 dudx = dFdx(v_imageUV);
  vec2 dudy = dFdy(v_imageUV);
  vec2 grainUV = v_imageUV - .5;
  grainUV *= (.8 / vec2(length(dudx), length(dudy)));
  grainUV += .5;
  float grain = valueNoise(grainUV);
  grain = smoothstep(.4, .7, grain);
  grain *= u_grainMixer;
  distortion = mix(distortion, 0., grain);

  shadows = min(shadows, 1.);
  shadows += maskStrokeInner;
  shadows *= mask;
  shadows = min(shadows, 1.);
  shadows *= pow(u_shadows, 2.);
  shadows = clamp(shadows, 0., 1.);

  distortion *= 3. * u_distortion;
  frameFade *= u_distortion;

  fractOrigUV.x += distortion;
  floorOrigUV = rotateAspect(floorOrigUV, -patternRotation, u_imageAspectRatio);
  fractOrigUV = rotateAspect(fractOrigUV, -patternRotation, u_imageAspectRatio);

  uv = (floorOrigUV + fractOrigUV) / patternSize;
  uv += pow(maskStroke, 4.);

  uv += vec2(.5);

  uv = mix(v_imageUV, uv, smoothstep(0., .7, mask));
  float blur = mix(0., 50., u_blur);
  blur = mix(0., blur, smoothstep(.5, 1., mask));

  float edgeDistortion = mix(.0, .04, u_edges);
  edgeDistortion += .06 * frameFade * u_edges;
  edgeDistortion *= mask;
  float frame = getUvFrame(uv, edgeDistortion);

  float stretch = 1. - smoothstep(0., .5, xNonSmooth) * smoothstep(1., 1. - .5, xNonSmooth);
  stretch = pow(stretch, 2.);
  stretch *= mask;
  stretch *= getUvFrame(uv, .1 + .05 * mask * frameFade);
  uv.y = mix(uv.y, .5, u_stretch * stretch);

  vec4 image = getBlur(u_image, uv, 1. / u_resolution / u_pixelRatio, vec2(0., 1.), blur);
  image.rgb *= image.a;
  vec4 backColor = u_colorBack;
  backColor.rgb *= backColor.a;
  vec4 highlightColor = u_colorHighlight;
  highlightColor.rgb *= highlightColor.a;
  vec4 shadowColor = u_colorShadow;

  vec3 color = highlightColor.rgb * highlights;
  float opacity = highlightColor.a * highlights;

  shadows = mix(shadows * shadowColor.a, 0., highlights);
  color = mix(color, shadowColor.rgb * shadowColor.a, .5 * shadows);
  color += .5 * pow(shadows, .5) * shadowColor.rgb;
  opacity += shadows;
  color = clamp(color, vec3(0.), vec3(1.));
  opacity = clamp(opacity, 0., 1.);

  color += image.rgb * (1. - opacity) * frame;
  opacity += image.a * (1. - opacity) * frame;

  color += backColor.rgb * (1. - opacity);
  opacity += backColor.a * (1. - opacity);

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  grainOverlayStrength *= mask;
  color = mix(color, grainOverlayColor, .35 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
var GlassGridShapes = {
	lines: 1,
	linesIrregular: 2,
	wave: 3,
	zigzag: 4,
	pattern: 5
};
var GlassDistortionShapes = {
	prism: 1,
	lens: 2,
	contour: 3,
	cascade: 4,
	flat: 5
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/image-dithering.js
var imageDitheringFragmentShader = `#version 300 es
precision mediump float;

uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_originX;
uniform float u_originY;
uniform float u_worldWidth;
uniform float u_worldHeight;
uniform float u_fit;

uniform float u_scale;
uniform float u_rotation;
uniform float u_offsetX;
uniform float u_offsetY;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform vec4 u_colorHighlight;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_type;
uniform float u_pxSize;
uniform bool u_originalColors;
uniform bool u_inverted;
uniform float u_colorSteps;

out vec4 fragColor;


${proceduralHash21}
${declarePI}

float getUvFrame(vec2 uv, vec2 pad) {
  float aa = 0.0001;

  float left   = smoothstep(-pad.x, -pad.x + aa, uv.x);
  float right  = smoothstep(1.0 + pad.x, 1.0 + pad.x - aa, uv.x);
  float bottom = smoothstep(-pad.y, -pad.y + aa, uv.y);
  float top    = smoothstep(1.0 + pad.y, 1.0 + pad.y - aa, uv.y);

  return left * right * bottom * top;
}

vec2 getImageUV(vec2 uv) {
  vec2 boxOrigin = vec2(.5 - u_originX, u_originY - .5);
  float r = u_rotation * PI / 180.;
  mat2 graphicRotation = mat2(cos(r), sin(r), -sin(r), cos(r));
  vec2 graphicOffset = vec2(-u_offsetX, u_offsetY);

  vec2 imageBoxSize;
  if (u_fit == 1.) { // contain
    imageBoxSize.x = min(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else if (u_fit == 2.) { // cover
    imageBoxSize.x = max(u_resolution.x / u_imageAspectRatio, u_resolution.y) * u_imageAspectRatio;
  } else {
    imageBoxSize.x = min(10.0, 10.0 / u_imageAspectRatio * u_imageAspectRatio);
  }
  imageBoxSize.y = imageBoxSize.x / u_imageAspectRatio;
  vec2 imageBoxScale = u_resolution.xy / imageBoxSize;

  vec2 imageUV = uv;
  imageUV *= imageBoxScale;
  imageUV += boxOrigin * (imageBoxScale - 1.);
  imageUV += graphicOffset;
  imageUV /= u_scale;
  imageUV.x *= u_imageAspectRatio;
  imageUV = graphicRotation * imageUV;
  imageUV.x /= u_imageAspectRatio;

  imageUV += .5;
  imageUV.y = 1. - imageUV.y;

  return imageUV;
}

const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
0, 8, 2, 10,
12, 4, 14, 6,
3, 11, 1, 9,
15, 7, 13, 5
);

const int bayer8x8[64] = int[64](
0, 32, 8, 40, 2, 34, 10, 42,
48, 16, 56, 24, 50, 18, 58, 26,
12, 44, 4, 36, 14, 46, 6, 38,
60, 28, 52, 20, 62, 30, 54, 22,
3, 35, 11, 43, 1, 33, 9, 41,
51, 19, 59, 27, 49, 17, 57, 25,
15, 47, 7, 39, 13, 45, 5, 37,
63, 31, 55, 23, 61, 29, 53, 21
);

float getBayerValue(vec2 uv, int size) {
  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return float(bayer2x2[index]) / 4.0;
  } else if (size == 4) {
    return float(bayer4x4[index]) / 16.0;
  } else if (size == 8) {
    return float(bayer8x8[index]) / 64.0;
  }
  return 0.0;
}


void main() {

  float pxSize = u_pxSize * u_pixelRatio;
  vec2 pxSizeUV = gl_FragCoord.xy - .5 * u_resolution;
  pxSizeUV /= pxSize;
  vec2 canvasPixelizedUV = (floor(pxSizeUV) + .5) * pxSize;
  vec2 normalizedUV = canvasPixelizedUV / u_resolution;

  vec2 imageUV = getImageUV(normalizedUV);
  vec2 ditheringNoiseUV = canvasPixelizedUV;
  vec4 image = texture(u_image, imageUV);
  float frame = getUvFrame(imageUV, pxSize / u_resolution);

  int type = int(floor(u_type));
  float dithering = 0.0;

  float lum = dot(vec3(.2126, .7152, .0722), image.rgb);
  lum = u_inverted ? (1. - lum) : lum;

  switch (type) {
    case 1: {
      dithering = step(hash21(ditheringNoiseUV), lum);
    } break;
    case 2:
    dithering = getBayerValue(pxSizeUV, 2);
    break;
    case 3:
    dithering = getBayerValue(pxSizeUV, 4);
    break;
    default :
    dithering = getBayerValue(pxSizeUV, 8);
    break;
  }

  float colorSteps = max(floor(u_colorSteps), 1.);
  vec3 color = vec3(0.0);
  float opacity = 1.;

  dithering -= .5;
  float brightness = clamp(lum + dithering / colorSteps, 0.0, 1.0);
  brightness = mix(0.0, brightness, frame);
  brightness = mix(0.0, brightness, image.a);
  float quantLum = floor(brightness * colorSteps + 0.5) / colorSteps;
  quantLum = mix(0.0, quantLum, frame);

  if (u_originalColors == true) {
    vec3 normColor = image.rgb / max(lum, 0.001);
    color = normColor * quantLum;

    float quantAlpha = floor(image.a * colorSteps + 0.5) / colorSteps;
    opacity = mix(quantLum, 1., quantAlpha);
  } else {
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    float fgOpacity = u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    float bgOpacity = u_colorBack.a;
    vec3 hlColor = u_colorHighlight.rgb * u_colorHighlight.a;
    float hlOpacity = u_colorHighlight.a;

    fgColor = mix(fgColor, hlColor, step(1.02 - .02 * u_colorSteps, brightness));
    fgOpacity = mix(fgOpacity, hlOpacity, step(1.02 - .02 * u_colorSteps, brightness));

    color = fgColor * quantLum;
    opacity = fgOpacity * quantLum;
    color += bgColor * (1.0 - opacity);
    opacity += bgOpacity * (1.0 - opacity);
  }

  fragColor = vec4(color, opacity);
}
`;
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/heatmap.js
var heatmapMeta = { maxColorCount: 10 };
var heatmapFragmentShader = `#version 300 es
precision highp float;

in mediump vec2 v_imageUV;
in mediump vec2 v_objectUV;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_time;
uniform mediump float u_imageAspectRatio;

uniform vec4 u_colorBack;
uniform vec4 u_colors[${heatmapMeta.maxColorCount}];
uniform float u_colorsCount;

uniform float u_angle;
uniform float u_noise;
uniform float u_innerGlow;
uniform float u_outerGlow;
uniform float u_contour;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

float getImgFrame(vec2 uv, float th) {
  float frame = 1.;
  frame *= smoothstep(0., th, uv.y);
  frame *= 1. - smoothstep(1. - th, 1., uv.y);
  frame *= smoothstep(0., th, uv.x);
  frame *= 1. - smoothstep(1. - th, 1., uv.x);
  return frame;
}

float circle(vec2 uv, vec2 c, vec2 r) {
  return 1. - smoothstep(r[0], r[1], length(uv - c));
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float sst(float edge0, float edge1, float x) {
  return smoothstep(edge0, edge1, x);
}

float shadowShape(vec2 uv, float t, float contour) {
  vec2 scaledUV = uv;

  // base shape tranjectory
  float posY = mix(-1., 2., t);

  // scaleX when it's moving down
  scaledUV.y -= .5;
  float mainCircleScale = sst(0., .8, posY) * lst(1.4, .9, posY);
  scaledUV *= vec2(1., 1. + 1.5 * mainCircleScale);
  scaledUV.y += .5;

  // base shape
  float innerR = .4;
  float outerR = 1. - .3 * (sst(.1, .2, t) * (1. - sst(.2, .5, t)));
  float s = circle(scaledUV, vec2(.5, posY - .2), vec2(innerR, outerR));
  float shapeSizing = sst(.2, .3, t) * sst(.6, .3, t);
  s = pow(s, 1.4);
  s *= 1.2;

  // flat gradient to take over the shadow shape
  float topFlattener = 0.;
  {
    float pos = posY - uv.y;
    float edge = 1.2;
    topFlattener = lst(-.4, 0., pos) * (1. - sst(.0, edge, pos));
    topFlattener = pow(topFlattener, 3.);
    float topFlattenerMixer = (1. - sst(.0, .3, pos));
    s = mix(topFlattener, s, topFlattenerMixer);
  }

  // apple right circle
  {
    float visibility = sst(.6, .7, t) * (1. - sst(.8, .9, t));
    float angle = -2. -t * TWO_PI;
    float rightCircle = circle(uv, vec2(.95 - .2 * cos(angle), .4 - .1 * sin(angle)), vec2(.15, .3));
    rightCircle *= visibility;
    s = mix(s, 0., rightCircle);
  }

  // apple top circle
  {
    float topCircle = circle(uv, vec2(.5, .19), vec2(.05, .25));
    topCircle += 2. * contour * circle(uv, vec2(.5, .19), vec2(.2, .5));
    float visibility = .55 * sst(.2, .3, t) * (1. - sst(.3, .45, t));
    topCircle *= visibility;
    s = mix(s, 0., topCircle);
  }

  float leafMask = circle(uv, vec2(.53, .13), vec2(.08, .19));
  leafMask = mix(leafMask, 0., 1. - sst(.4, .54, uv.x));
  leafMask = mix(0., leafMask, sst(.0, .2, uv.y));
  leafMask *= (sst(.5, 1.1, posY) * sst(1.5, 1.3, posY));
  s += leafMask;

  // apple bottom circle
  {
    float visibility = sst(.0, .4, t) * (1. - sst(.6, .8, t));
    s = mix(s, 0., visibility * circle(uv, vec2(.52, .92), vec2(.09, .25)));
  }

  // random balls that are invisible if apple logo is selected
  {
    float pos = sst(.0, .6, t) * (1. - sst(.6, 1., t));
    s = mix(s, .5, circle(uv, vec2(.0, 1.2 - .5 * pos), vec2(.1, .3)));
    s = mix(s, .0, circle(uv, vec2(1., .5 + .5 * pos), vec2(.1, .3)));

    s = mix(s, 1., circle(uv, vec2(.95, .2 + .2 * sst(.3, .4, t) * sst(.7, .5, t)), vec2(.07, .22)));
    s = mix(s, 1., circle(uv, vec2(.95, .2 + .2 * sst(.3, .4, t) * (1. - sst(.5, .7, t))), vec2(.07, .22)));
    s /= max(1e-4, sst(1., .85, uv.y));
  }

  s = clamp(0., 1., s);
  return s;
}

float blurEdge3x3(sampler2D tex, vec2 uv, vec2 dudx, vec2 dudy, float radius, float centerSample) {
  vec2 texel = 1.0 / vec2(textureSize(tex, 0));
  vec2 r = radius * texel;

  float w1 = 1.0, w2 = 2.0, w4 = 4.0;
  float norm = 16.0;
  float sum = w4 * centerSample;

  sum += w2 * textureGrad(tex, uv + vec2(0.0, -r.y), dudx, dudy).g;
  sum += w2 * textureGrad(tex, uv + vec2(0.0, r.y), dudx, dudy).g;
  sum += w2 * textureGrad(tex, uv + vec2(-r.x, 0.0), dudx, dudy).g;
  sum += w2 * textureGrad(tex, uv + vec2(r.x, 0.0), dudx, dudy).g;

  sum += w1 * textureGrad(tex, uv + vec2(-r.x, -r.y), dudx, dudy).g;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, -r.y), dudx, dudy).g;
  sum += w1 * textureGrad(tex, uv + vec2(-r.x, r.y), dudx, dudy).g;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, r.y), dudx, dudy).g;

  return sum / norm;
}

void main() {
  vec2 uv = v_objectUV + .5;
  uv.y = 1. - uv.y;

  vec2 imgUV = v_imageUV;
  imgUV -= .5;
  imgUV *= 0.5714285714285714;
  imgUV += .5;
  float imgSoftFrame = getImgFrame(imgUV, .03);

  vec4 img = texture(u_image, imgUV);
  vec2 dudx = dFdx(imgUV);
  vec2 dudy = dFdy(imgUV);

  if (img.a == 0.) {
    fragColor = u_colorBack;
    return;
  }

  float t = .1 * u_time;
  t -= .3;

  float tCopy = t + 1. / 3.;
  float tCopy2 = t + 2. / 3.;

  t = mod(t, 1.);
  tCopy = mod(tCopy, 1.);
  tCopy2 = mod(tCopy2, 1.);

  vec2 animationUV = imgUV - vec2(.5);
  float angle = -u_angle * PI / 180.;
  float cosA = cos(angle);
  float sinA = sin(angle);
  animationUV = vec2(
  animationUV.x * cosA - animationUV.y * sinA,
  animationUV.x * sinA + animationUV.y * cosA
  ) + vec2(.5);

  float shape = img[0];

  img[1] = blurEdge3x3(u_image, imgUV, dudx, dudy, 8., img[1]);

  float outerBlur = 1. - mix(1., img[1], shape);
  float innerBlur = mix(img[1], 0., shape);
  float contour = mix(img[2], 0., shape);

  outerBlur *= imgSoftFrame;

  float shadow = shadowShape(animationUV, t, innerBlur);
  float shadowCopy = shadowShape(animationUV, tCopy, innerBlur);
  float shadowCopy2 = shadowShape(animationUV, tCopy2, innerBlur);

  float inner = .8 + .8 * innerBlur;
  inner = mix(inner, 0., shadow);
  inner = mix(inner, 0., shadowCopy);
  inner = mix(inner, 0., shadowCopy2);

  inner *= mix(0., 2., u_innerGlow);

  inner += (u_contour * 2.) * contour;
  inner = min(1., inner);
  inner *= (1. - shape);

  float outer = 0.;
  {
    t *= 3.;
    t = mod(t - .1, 1.);

    outer = .9 * pow(outerBlur, .8);
    float y = mod(animationUV.y - t, 1.);
    float animatedMask = sst(.3, .65, y) * (1. - sst(.65, 1., y));
    animatedMask = .5 + animatedMask;
    outer *= animatedMask;
    outer *= mix(0., 5., pow(u_outerGlow, 2.));
    outer *= imgSoftFrame;
  }

  inner = pow(inner, 1.2);
  float heat = clamp(inner + outer, 0., 1.);

  heat += (.005 + .35 * u_noise) * (fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453123) - .5);

  float mixer = heat * u_colorsCount;
  vec4 gradient = u_colors[0];
  gradient.rgb *= gradient.a;
  float outerShape = 0.;
  for (int i = 1; i < ${heatmapMeta.maxColorCount + 1}; i++) {
    if (i > int(u_colorsCount)) break;
    float m = clamp(mixer - float(i - 1), 0., 1.);
    if (i == 1) {
      outerShape = m;
    }
    vec4 c = u_colors[i - 1];
    c.rgb *= c.a;
    gradient = mix(gradient, c, m);
  }

  vec3 color = gradient.rgb * outerShape;
  float opacity = gradient.a * outerShape;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + u_colorBack.a * (1.0 - opacity);

  color += .02 * (fract(sin(dot(uv + 1., vec2(12.9898, 78.233))) * 43758.5453123) - .5);

  fragColor = vec4(color, opacity);
}
`;
function toProcessedHeatmap(file) {
	const canvas = document.createElement("canvas");
	const canvasSize = 1e3;
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.addEventListener("load", () => {
			if (typeof file === "string" ? file.endsWith(".svg") : file.type === "image/svg+xml") {
				image.width = canvasSize;
				image.height = canvasSize;
			}
			const ratio = image.naturalWidth / image.naturalHeight;
			const maxBlur = Math.floor(canvasSize * .15);
			const padding = Math.ceil(maxBlur * 2.5);
			let imgWidth = canvasSize;
			let imgHeight = canvasSize;
			if (ratio > 1) imgHeight = Math.floor(canvasSize / ratio);
			else imgWidth = Math.floor(canvasSize * ratio);
			canvas.width = imgWidth + 2 * padding;
			canvas.height = imgHeight + 2 * padding;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) throw new Error("Failed to get canvas 2d context");
			ctx.fillStyle = "white";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, padding, padding, imgWidth, imgHeight);
			const { width, height } = canvas;
			const src = ctx.getImageData(0, 0, width, height).data;
			const totalPixels = width * height;
			const gray = new Uint8ClampedArray(totalPixels);
			for (let i = 0; i < totalPixels; i++) {
				const px = i * 4;
				const r = src[px] ?? 0;
				const g = src[px + 1] ?? 0;
				const b = src[px + 2] ?? 0;
				gray[i] = .299 * r + .587 * g + .114 * b | 0;
			}
			const bigBlurRadius = maxBlur;
			const innerBlurRadius = Math.max(1, Math.round(.12 * maxBlur));
			const contourRadius = 5;
			const bigBlurGray = multiPassBlurGray(gray, width, height, bigBlurRadius, 3);
			const innerBlurGray = multiPassBlurGray(gray, width, height, innerBlurRadius, 3);
			const contourGray = multiPassBlurGray(gray, width, height, contourRadius, 1);
			const processedImageData = ctx.createImageData(width, height);
			const dst = processedImageData.data;
			for (let i = 0; i < totalPixels; i++) {
				const px = i * 4;
				dst[px] = contourGray[i] ?? 0;
				dst[px + 1] = bigBlurGray[i] ?? 0;
				dst[px + 2] = innerBlurGray[i] ?? 0;
				dst[px + 3] = 255;
			}
			ctx.putImageData(processedImageData, 0, 0);
			canvas.toBlob((blob) => {
				if (!blob) {
					reject(/* @__PURE__ */ new Error("Failed to create PNG blob"));
					return;
				}
				resolve({ blob });
			}, "image/png");
		});
		image.addEventListener("error", () => {
			reject(/* @__PURE__ */ new Error("Failed to load image"));
		});
		image.src = typeof file === "string" ? file : URL.createObjectURL(file);
	});
}
function blurGray(gray, width, height, radius) {
	if (radius <= 0) return gray.slice();
	const out = new Uint8ClampedArray(width * height);
	const integral = new Uint32Array(width * height);
	for (let y = 0; y < height; y++) {
		let rowSum = 0;
		for (let x = 0; x < width; x++) {
			const idx = y * width + x;
			const v = gray[idx] ?? 0;
			rowSum += v;
			integral[idx] = rowSum + (y > 0 ? integral[idx - width] ?? 0 : 0);
		}
	}
	for (let y = 0; y < height; y++) {
		const y1 = Math.max(0, y - radius);
		const y2 = Math.min(height - 1, y + radius);
		for (let x = 0; x < width; x++) {
			const x1 = Math.max(0, x - radius);
			const x2 = Math.min(width - 1, x + radius);
			const idxA = y2 * width + x2;
			const idxB = y2 * width + (x1 - 1);
			const idxC = (y1 - 1) * width + x2;
			const idxD = (y1 - 1) * width + (x1 - 1);
			const A = integral[idxA] ?? 0;
			const B = x1 > 0 ? integral[idxB] ?? 0 : 0;
			const C = y1 > 0 ? integral[idxC] ?? 0 : 0;
			const D = x1 > 0 && y1 > 0 ? integral[idxD] ?? 0 : 0;
			const sum = A - B - C + D;
			const area = (x2 - x1 + 1) * (y2 - y1 + 1);
			out[y * width + x] = Math.round(sum / area);
		}
	}
	return out;
}
function multiPassBlurGray(gray, width, height, radius, passes) {
	if (radius <= 0 || passes <= 1) return blurGray(gray, width, height, radius);
	let input = gray;
	let tmp = gray;
	for (let p = 0; p < passes; p++) {
		tmp = blurGray(input, width, height, radius);
		input = tmp;
	}
	return tmp;
}
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/liquid-metal.js
var liquidMetalFragmentShader = `#version 300 es
precision mediump float;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform vec2 u_resolution;
uniform float u_time;

uniform vec4 u_colorBack;
uniform vec4 u_colorTint;

uniform float u_softness;
uniform float u_repetition;
uniform float u_shiftRed;
uniform float u_shiftBlue;
uniform float u_distortion;
uniform float u_contour;
uniform float u_angle;

uniform float u_shape;
uniform bool u_isImage;

in vec2 v_objectUV;
in vec2 v_responsiveUV;
in vec2 v_responsiveBoxGivenSize;
in vec2 v_imageUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${simplexNoise}

float getColorChanges(float c1, float c2, float stripe_p, vec3 w, float blur, float bump, float tint) {

  float ch = mix(c2, c1, smoothstep(.0, 2. * blur, stripe_p));

  float border = w[0];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  if (u_isImage == true) {
    bump = smoothstep(.2, .8, bump);
  }
  border = w[0] + .4 * (1. - bump) * w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + .5 * (1. - bump) * w[1];
  ch = mix(ch, c2, smoothstep(border, border + 2. * blur, stripe_p));

  border = w[0] + w[1];
  ch = mix(ch, c1, smoothstep(border, border + 2. * blur, stripe_p));

  float gradient_t = (stripe_p - w[0] - w[1]) / w[2];
  float gradient = mix(c1, c2, smoothstep(0., 1., gradient_t));
  ch = mix(ch, gradient, smoothstep(border, border + .5 * blur, stripe_p));

  // Tint color is applied with color burn blending
  ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), u_colorTint.a);
  return ch;
}

float getImgFrame(vec2 uv, float th) {
  float frame = 1.;
  frame *= smoothstep(0., th, uv.y);
  frame *= 1.0 - smoothstep(1. - th, 1., uv.y);
  frame *= smoothstep(0., th, uv.x);
  frame *= 1.0 - smoothstep(1. - th, 1., uv.x);
  return frame;
}

float blurEdge3x3(sampler2D tex, vec2 uv, vec2 dudx, vec2 dudy, float radius, float centerSample) {
  vec2 texel = 1.0 / vec2(textureSize(tex, 0));
  vec2 r = radius * texel;

  float w1 = 1.0, w2 = 2.0, w4 = 4.0;
  float norm = 16.0;
  float sum = w4 * centerSample;

  sum += w2 * textureGrad(tex, uv + vec2(0.0, -r.y), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(0.0, r.y), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(-r.x, 0.0), dudx, dudy).r;
  sum += w2 * textureGrad(tex, uv + vec2(r.x, 0.0), dudx, dudy).r;

  sum += w1 * textureGrad(tex, uv + vec2(-r.x, -r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, -r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(-r.x, r.y), dudx, dudy).r;
  sum += w1 * textureGrad(tex, uv + vec2(r.x, r.y), dudx, dudy).r;

  return sum / norm;
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

void main() {

  const float firstFrameOffset = 2.8;
  float t = .3 * (u_time + firstFrameOffset);

  vec2 uv = v_imageUV;
  vec2 dudx = dFdx(v_imageUV);
  vec2 dudy = dFdy(v_imageUV);
  vec4 img = textureGrad(u_image, uv, dudx, dudy);

  if (u_isImage == false) {
    uv = v_objectUV + .5;
    uv.y = 1. - uv.y;
  }

  float cycleWidth = u_repetition;
  float edge = 0.;
  float contOffset = 1.;

  vec2 rotatedUV = uv - vec2(.5);
  float angle = (-u_angle + 70.) * PI / 180.;
  float cosA = cos(angle);
  float sinA = sin(angle);
  rotatedUV = vec2(
  rotatedUV.x * cosA - rotatedUV.y * sinA,
  rotatedUV.x * sinA + rotatedUV.y * cosA
  ) + vec2(.5);

  if (u_isImage == true) {
    float edgeRaw = img.r;
    edge = blurEdge3x3(u_image, uv, dudx, dudy, 6., edgeRaw);
    edge = pow(edge, 1.6);
    edge *= mix(0.0, 1.0, smoothstep(0.0, 0.4, u_contour));
  } else {
    if (u_shape < 1.) {
      // full-fill on canvas
      vec2 borderUV = v_responsiveUV + .5;
      float ratio = v_responsiveBoxGivenSize.x / v_responsiveBoxGivenSize.y;
      vec2 mask = min(borderUV, 1. - borderUV);
      vec2 pixel_thickness = min(250. / v_responsiveBoxGivenSize, vec2(.5));
      float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
      float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
      maskX = pow(maskX, .25);
      maskY = pow(maskY, .25);
      edge = clamp(1. - maskX * maskY, 0., 1.);

      uv = v_responsiveUV;
      if (ratio > 1.) {
        uv.y /= ratio;
      } else {
        uv.x *= ratio;
      }
      uv += .5;
      uv.y = 1. - uv.y;

      cycleWidth *= 2.;
      contOffset = 1.5;

    } else if (u_shape < 2.) {
      // circle
      vec2 shapeUV = uv - .5;
      shapeUV *= .67;
      edge = pow(clamp(3. * length(shapeUV), 0., 1.), 18.);
    } else if (u_shape < 3.) {
      // daisy
      vec2 shapeUV = uv - .5;
      shapeUV *= 1.68;

      float r = length(shapeUV) * 2.;
      float a = atan(shapeUV.y, shapeUV.x) + .2;
      r *= (1. + .05 * sin(3. * a + 2. * t));
      float f = abs(cos(a * 3.));
      edge = smoothstep(f, f + .7, r);
      edge *= edge;

      uv *= .8;
      cycleWidth *= 1.6;

    } else if (u_shape < 4.) {
      // diamond
      vec2 shapeUV = uv - .5;
      shapeUV = rotate(shapeUV, .25 * PI);
      shapeUV *= 1.42;
      shapeUV += .5;
      vec2 mask = min(shapeUV, 1. - shapeUV);
      vec2 pixel_thickness = vec2(.15);
      float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
      float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
      maskX = pow(maskX, .25);
      maskY = pow(maskY, .25);
      edge = clamp(1. - maskX * maskY, 0., 1.);
    } else if (u_shape < 5.) {
      // metaballs
      vec2 shapeUV = uv - .5;
      shapeUV *= 1.3;
      edge = 0.;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float speed = 1.5 + 2./3. * sin(fi * 12.345);
        float angle = -fi * 1.5;
        vec2 dir1 = vec2(cos(angle), sin(angle));
        vec2 dir2 = vec2(cos(angle + 1.57), sin(angle + 1.));
        vec2 traj = .4 * (dir1 * sin(t * speed + fi * 1.23) + dir2 * cos(t * (speed * 0.7) + fi * 2.17));
        float d = length(shapeUV + traj);
        edge += pow(1.0 - clamp(d, 0.0, 1.0), 4.0);
      }
      edge = 1. - smoothstep(.65, .9, edge);
      edge = pow(edge, 4.);
    }

    edge = mix(smoothstep(.9 - 2. * fwidth(edge), .9, edge), edge, smoothstep(0.0, 0.4, u_contour));

  }

  float opacity = 0.;
  if (u_isImage == true) {
    opacity = img.g;
    float frame = getImgFrame(v_imageUV, 0.);
    opacity *= frame;
  } else {
    opacity = 1. - smoothstep(.9 - 2. * fwidth(edge), .9, edge);
    if (u_shape < 2.) {
      edge = 1.2 * edge;
    } else if (u_shape < 5.) {
      edge = 1.8 * pow(edge, 1.5);
    }
  }

  float diagBLtoTR = rotatedUV.x - rotatedUV.y;
  float diagTLtoBR = rotatedUV.x + rotatedUV.y;

  vec3 color = vec3(0.);
  vec3 color1 = vec3(.98, 0.98, 1.);
  vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, diagTLtoBR));

  vec2 grad_uv = uv - .5;

  float dist = length(grad_uv + vec2(0., .2 * diagBLtoTR));
  grad_uv = rotate(grad_uv, (.25 - .2 * diagBLtoTR) * PI);
  float direction = grad_uv.x;

  float bump = pow(1.8 * dist, 1.2);
  bump = 1. - bump;
  bump *= pow(uv.y, .3);


  float thin_strip_1_ratio = .12 / cycleWidth * (1. - .4 * bump);
  float thin_strip_2_ratio = .07 / cycleWidth * (1. + .4 * bump);
  float wide_strip_ratio = (1. - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  float noise = snoise(uv - t);

  edge += (1. - edge) * u_distortion * noise;

  direction += diagBLtoTR;
  float contour = 0.;
  direction -= 2. * noise * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));
  direction *= mix(1., 1. - edge, smoothstep(.5, 1., u_contour));
  direction -= 1.7 * edge * smoothstep(.5, 1., u_contour);
  direction += .2 * pow(u_contour, 4.) * (1.0 - smoothstep(0., 1., edge));

  bump *= clamp(pow(uv.y, .1), .3, 1.);
  direction *= (.1 + (1.1 - edge) * bump);

  direction *= (.4 + .6 * (1.0 - smoothstep(.5, 1., edge)));
  direction += .18 * (smoothstep(.1, .2, uv.y) * (1.0 - smoothstep(.2, .4, uv.y)));
  direction += .03 * (smoothstep(.1, .2, 1. - uv.y) * (1.0 - smoothstep(.2, .4, 1. - uv.y)));

  direction *= (.5 + .5 * pow(uv.y, 2.));
  direction *= cycleWidth;
  direction -= t;


  float colorDispersion = (1. - bump);
  colorDispersion = clamp(colorDispersion, 0., 1.);
  float dispersionRed = colorDispersion;
  dispersionRed += .03 * bump * noise;
  dispersionRed += 5. * (smoothstep(-.1, .2, uv.y) * (1.0 - smoothstep(.1, .5, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, 1., bump)));
  dispersionRed -= diagBLtoTR;

  float dispersionBlue = colorDispersion;
  dispersionBlue *= 1.3;
  dispersionBlue += (smoothstep(0., .4, uv.y) * (1.0 - smoothstep(.1, .8, uv.y))) * (smoothstep(.4, .6, bump) * (1.0 - smoothstep(.4, .8, bump)));
  dispersionBlue -= .2 * edge;

  dispersionRed *= (u_shiftRed / 20.);
  dispersionBlue *= (u_shiftBlue / 20.);

  float blur = 0.;
  float rExtraBlur = 0.;
  float gExtraBlur = 0.;
  if (u_isImage == true) {
    float softness = 0.05 * u_softness;
    blur = softness + .5 * smoothstep(1., 10., u_repetition) * smoothstep(.0, 1., edge);
    float smallCanvasT = 1.0 - smoothstep(100., 500., min(u_resolution.x, u_resolution.y));
    blur += smallCanvasT * smoothstep(.0, 1., edge);
    rExtraBlur = softness * (0.05 + .1 * (u_shiftRed / 20.) * bump);
    gExtraBlur = softness * 0.05 / max(0.001, abs(1. - diagBLtoTR));
  } else {
    blur = u_softness / 15. + .3 * contour;
  }

  vec3 w = vec3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w[1] -= .02 * smoothstep(.0, 1., edge + bump);
  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + fwidth(stripe_r) + rExtraBlur, bump, u_colorTint.r);
  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + fwidth(stripe_g) + gExtraBlur, bump, u_colorTint.g);
  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + fwidth(stripe_b), bump, u_colorTint.b);

  color = vec3(r, g, b);
  color *= opacity;

  vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
  color = color + bgColor * (1. - opacity);
  opacity = opacity + u_colorBack.a * (1. - opacity);

  ${colorBandingFix}

  fragColor = vec4(color, opacity);
}
`;
var POISSON_CONFIG_OPTIMIZED = {
	measurePerformance: false,
	workingSize: 512,
	iterations: 40
};
function toProcessedLiquidMetal(file) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	const isBlob = typeof file === "string" && file.startsWith("blob:");
	return new Promise((resolve, reject) => {
		if (!file || !ctx) {
			reject(/* @__PURE__ */ new Error("Invalid file or canvas context"));
			return;
		}
		const blobContentTypePromise = isBlob && fetch(file).then((res) => res.headers.get("Content-Type"));
		const img = new Image();
		img.crossOrigin = "anonymous";
		const totalStartTime = performance.now();
		img.onload = async () => {
			let isSVG;
			const blobContentType = await blobContentTypePromise;
			if (blobContentType) isSVG = blobContentType === "image/svg+xml";
			else if (typeof file === "string") isSVG = file.endsWith(".svg") || file.startsWith("data:image/svg+xml");
			else isSVG = file.type === "image/svg+xml";
			let originalWidth = img.width || img.naturalWidth;
			let originalHeight = img.height || img.naturalHeight;
			if (isSVG) {
				const svgMaxSize = 4096;
				const aspectRatio = originalWidth / originalHeight;
				if (originalWidth > originalHeight) {
					originalWidth = svgMaxSize;
					originalHeight = svgMaxSize / aspectRatio;
				} else {
					originalHeight = svgMaxSize;
					originalWidth = svgMaxSize * aspectRatio;
				}
				img.width = originalWidth;
				img.height = originalHeight;
			}
			const minDimension = Math.min(originalWidth, originalHeight);
			const scaleFactor = POISSON_CONFIG_OPTIMIZED.workingSize / minDimension;
			const width = Math.round(originalWidth * scaleFactor);
			const height = Math.round(originalHeight * scaleFactor);
			if (POISSON_CONFIG_OPTIMIZED.measurePerformance) {
				console.log(`[Processing Mode]`);
				console.log(`  Original: ${originalWidth}\xD7${originalHeight}`);
				console.log(`  Working: ${width}\xD7${height} (${(scaleFactor * 100).toFixed(1)}% scale)`);
				if (scaleFactor < 1) console.log(`  Speedup: ~${Math.round(1 / (scaleFactor * scaleFactor))}\xD7`);
			}
			canvas.width = originalWidth;
			canvas.height = originalHeight;
			const shapeCanvas = document.createElement("canvas");
			shapeCanvas.width = width;
			shapeCanvas.height = height;
			const shapeCtx = shapeCanvas.getContext("2d");
			shapeCtx.drawImage(img, 0, 0, width, height);
			const startMask = performance.now();
			const data = shapeCtx.getImageData(0, 0, width, height).data;
			const shapeMask = new Uint8Array(width * height);
			const boundaryMask = new Uint8Array(width * height);
			let shapePixelCount = 0;
			for (let i = 0, idx = 0; i < data.length; i += 4, idx++) {
				const isShape = data[i + 3] === 0 ? 0 : 1;
				shapeMask[idx] = isShape;
				shapePixelCount += isShape;
			}
			const boundaryIndices = [];
			const interiorIndices = [];
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				if (!shapeMask[idx]) continue;
				let isBoundary = false;
				if (x === 0 || x === width - 1 || y === 0 || y === height - 1) isBoundary = true;
				else isBoundary = !shapeMask[idx - 1] || !shapeMask[idx + 1] || !shapeMask[idx - width] || !shapeMask[idx + width] || !shapeMask[idx - width - 1] || !shapeMask[idx - width + 1] || !shapeMask[idx + width - 1] || !shapeMask[idx + width + 1];
				if (isBoundary) {
					boundaryMask[idx] = 1;
					boundaryIndices.push(idx);
				} else interiorIndices.push(idx);
			}
			if (POISSON_CONFIG_OPTIMIZED.measurePerformance) {
				console.log(`[Mask Building] Time: ${(performance.now() - startMask).toFixed(2)}ms`);
				console.log(`  Shape pixels: ${shapePixelCount} / ${width * height} (${(shapePixelCount / (width * height) * 100).toFixed(1)}%)`);
				console.log(`  Interior pixels: ${interiorIndices.length}`);
				console.log(`  Boundary pixels: ${boundaryIndices.length}`);
			}
			const sparseData = buildSparseData(shapeMask, boundaryMask, new Uint32Array(interiorIndices), new Uint32Array(boundaryIndices), width, height);
			const startSolve = performance.now();
			const u = solvePoissonSparse(sparseData, shapeMask, boundaryMask, width, height);
			if (POISSON_CONFIG_OPTIMIZED.measurePerformance) console.log(`[Poisson Solve] Time: ${(performance.now() - startSolve).toFixed(2)}ms`);
			let maxVal = 0;
			let finalImageData;
			for (let i = 0; i < interiorIndices.length; i++) {
				const idx = interiorIndices[i];
				if (u[idx] > maxVal) maxVal = u[idx];
			}
			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = width;
			tempCanvas.height = height;
			const tempCtx = tempCanvas.getContext("2d");
			const tempImg = tempCtx.createImageData(width, height);
			for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				const px = idx * 4;
				if (!shapeMask[idx]) {
					tempImg.data[px] = 255;
					tempImg.data[px + 1] = 255;
					tempImg.data[px + 2] = 255;
					tempImg.data[px + 3] = 0;
				} else {
					const gray = 255 * (1 - u[idx] / maxVal);
					tempImg.data[px] = gray;
					tempImg.data[px + 1] = gray;
					tempImg.data[px + 2] = gray;
					tempImg.data[px + 3] = 255;
				}
			}
			tempCtx.putImageData(tempImg, 0, 0);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, originalWidth, originalHeight);
			const outImg = ctx.getImageData(0, 0, originalWidth, originalHeight);
			const originalCanvas = document.createElement("canvas");
			originalCanvas.width = originalWidth;
			originalCanvas.height = originalHeight;
			const originalCtx = originalCanvas.getContext("2d");
			originalCtx.drawImage(img, 0, 0, originalWidth, originalHeight);
			const originalData = originalCtx.getImageData(0, 0, originalWidth, originalHeight);
			for (let i = 0; i < outImg.data.length; i += 4) {
				const a = originalData.data[i + 3];
				const upscaledAlpha = outImg.data[i + 3];
				if (a === 0) {
					outImg.data[i] = 255;
					outImg.data[i + 1] = 0;
				} else {
					outImg.data[i] = upscaledAlpha === 0 ? 0 : outImg.data[i];
					outImg.data[i + 1] = a;
				}
				outImg.data[i + 2] = 255;
				outImg.data[i + 3] = 255;
			}
			ctx.putImageData(outImg, 0, 0);
			finalImageData = outImg;
			canvas.toBlob((blob) => {
				if (!blob) {
					reject(/* @__PURE__ */ new Error("Failed to create PNG blob"));
					return;
				}
				if (POISSON_CONFIG_OPTIMIZED.measurePerformance) {
					const totalTime = performance.now() - totalStartTime;
					console.log(`[Total Processing Time] ${totalTime.toFixed(2)}ms`);
					if (scaleFactor < 1) {
						const estimatedFullResTime = totalTime * Math.pow(originalWidth * originalHeight / (width * height), 1.5);
						console.log(`[Estimated time at full resolution] ~${estimatedFullResTime.toFixed(0)}ms`);
						console.log(`[Time saved] ~${(estimatedFullResTime - totalTime).toFixed(0)}ms (${Math.round(estimatedFullResTime / totalTime)}\xD7 faster)`);
					}
				}
				resolve({
					imageData: finalImageData,
					pngBlob: blob
				});
			}, "image/png");
		};
		img.onerror = () => reject(/* @__PURE__ */ new Error("Failed to load image"));
		img.src = typeof file === "string" ? file : URL.createObjectURL(file);
	});
}
function buildSparseData(shapeMask, boundaryMask, interiorPixels, boundaryPixels, width, height) {
	const pixelCount = interiorPixels.length;
	const neighborIndices = new Int32Array(pixelCount * 4);
	for (let i = 0; i < pixelCount; i++) {
		const idx = interiorPixels[i];
		const x = idx % width;
		const y = Math.floor(idx / width);
		neighborIndices[i * 4 + 0] = x < width - 1 && shapeMask[idx + 1] ? idx + 1 : -1;
		neighborIndices[i * 4 + 1] = x > 0 && shapeMask[idx - 1] ? idx - 1 : -1;
		neighborIndices[i * 4 + 2] = y > 0 && shapeMask[idx - width] ? idx - width : -1;
		neighborIndices[i * 4 + 3] = y < height - 1 && shapeMask[idx + width] ? idx + width : -1;
	}
	return {
		interiorPixels,
		boundaryPixels,
		pixelCount,
		neighborIndices
	};
}
function solvePoissonSparse(sparseData, shapeMask, boundaryMask, width, height) {
	const ITERATIONS = POISSON_CONFIG_OPTIMIZED.iterations;
	const C = .01;
	const u = new Float32Array(width * height);
	const { interiorPixels, neighborIndices, pixelCount } = sparseData;
	const startTime = performance.now();
	const omega = 1.9;
	const redPixels = [];
	const blackPixels = [];
	for (let i = 0; i < pixelCount; i++) {
		const idx = interiorPixels[i];
		if ((idx % width + Math.floor(idx / width)) % 2 === 0) redPixels.push(i);
		else blackPixels.push(i);
	}
	for (let iter = 0; iter < ITERATIONS; iter++) {
		for (const i of redPixels) {
			const idx = interiorPixels[i];
			const eastIdx = neighborIndices[i * 4 + 0];
			const westIdx = neighborIndices[i * 4 + 1];
			const northIdx = neighborIndices[i * 4 + 2];
			const southIdx = neighborIndices[i * 4 + 3];
			let sumN = 0;
			if (eastIdx >= 0) sumN += u[eastIdx];
			if (westIdx >= 0) sumN += u[westIdx];
			if (northIdx >= 0) sumN += u[northIdx];
			if (southIdx >= 0) sumN += u[southIdx];
			u[idx] = omega * ((C + sumN) / 4) + -.8999999999999999 * u[idx];
		}
		for (const i of blackPixels) {
			const idx = interiorPixels[i];
			const eastIdx = neighborIndices[i * 4 + 0];
			const westIdx = neighborIndices[i * 4 + 1];
			const northIdx = neighborIndices[i * 4 + 2];
			const southIdx = neighborIndices[i * 4 + 3];
			let sumN = 0;
			if (eastIdx >= 0) sumN += u[eastIdx];
			if (westIdx >= 0) sumN += u[westIdx];
			if (northIdx >= 0) sumN += u[northIdx];
			if (southIdx >= 0) sumN += u[southIdx];
			u[idx] = omega * ((C + sumN) / 4) + -.8999999999999999 * u[idx];
		}
	}
	if (POISSON_CONFIG_OPTIMIZED.measurePerformance) {
		const elapsed = performance.now() - startTime;
		console.log(`[Optimized Poisson Solver (SOR \u03C9=${omega})]`);
		console.log(`  Working size: ${width}\xD7${height}`);
		console.log(`  Iterations: ${ITERATIONS}`);
		console.log(`  Time: ${elapsed.toFixed(2)}ms`);
		console.log(`  Interior pixels processed: ${pixelCount}`);
		console.log(`  Speed: ${(ITERATIONS * pixelCount / (elapsed * 1e3)).toFixed(2)} Mpixels/sec`);
	}
	return u;
}
var LiquidMetalShapes = {
	none: 0,
	circle: 1,
	daisy: 2,
	diamond: 3,
	metaballs: 4
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/shaders/halftone-dots.js
var halftoneDotsFragmentShader = `#version 300 es
precision mediump float;

uniform float u_rotation;

uniform float u_time;

uniform vec4 u_colorFront;
uniform vec4 u_colorBack;
uniform float u_radius;
uniform float u_contrast;

uniform sampler2D u_image;
uniform float u_imageAspectRatio;

uniform float u_size;
uniform float u_grainMixer;
uniform float u_grainOverlay;
uniform float u_grainSize;
uniform float u_grid;
uniform bool u_originalColors;
uniform bool u_inverted;
uniform float u_type;

in vec2 v_imageUV;

out vec4 fragColor;

${declarePI}
${rotation2}
${proceduralHash21}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

float lst(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float sst(float edge0, float edge1, float x) {
  return smoothstep(edge0, edge1, x);
}

float getCircle(vec2 uv, float r, float baseR) {
  r = mix(.25 * baseR, 0., r);
  float d = length(uv - .5);
  float aa = fwidth(d);
  return 1. - smoothstep(r - aa, r + aa, d);
}

float getCell(vec2 uv) {
  float insideX = step(0.0, uv.x) * (1.0 - step(1.0, uv.x));
  float insideY = step(0.0, uv.y) * (1.0 - step(1.0, uv.y));
  return insideX * insideY;
}

float getCircleWithHole(vec2 uv, float r, float baseR) {
  float cell = getCell(uv);

  r = mix(.75 * baseR, 0., r);
  float rMod = mod(r, .5);

  float d = length(uv - .5);
  float aa = fwidth(d);
  float circle = 1. - smoothstep(rMod - aa, rMod + aa, d);
  if (r < .5) {
    return circle;
  } else {
    return cell - circle;
  }
}

float getGooeyBall(vec2 uv, float r, float baseR) {
  float d = length(uv - .5);
  float sizeRadius = .3;
  if (u_grid == 1.) {
    sizeRadius = .42;
  }
  sizeRadius = mix(sizeRadius * baseR, 0., r);
  d = 1. - sst(0., sizeRadius, d);

  d = pow(d, 2. + baseR);
  return d;
}

float getSoftBall(vec2 uv, float r, float baseR) {
  float d = length(uv - .5);
  float sizeRadius = clamp(baseR, 0., 1.);
  sizeRadius = mix(.5 * sizeRadius, 0., r);
  d = 1. - lst(0., sizeRadius, d);
  float powRadius = 1. - lst(0., 2., baseR);
  d = pow(d, 4. + 3. * powRadius);
  return d;
}

float getUvFrame(vec2 uv, vec2 pad) {
  float aa = 0.0001;

  float left   = smoothstep(-pad.x, -pad.x + aa, uv.x);
  float right  = smoothstep(1.0 + pad.x, 1.0 + pad.x - aa, uv.x);
  float bottom = smoothstep(-pad.y, -pad.y + aa, uv.y);
  float top    = smoothstep(1.0 + pad.y, 1.0 + pad.y - aa, uv.y);

  return left * right * bottom * top;
}

float sigmoid(float x, float k) {
  return 1.0 / (1.0 + exp(-k * (x - 0.5)));
}

float getLumAtPx(vec2 uv, float contrast) {
  vec4 tex = texture(u_image, uv);
  vec3 color = vec3(
  sigmoid(tex.r, contrast),
  sigmoid(tex.g, contrast),
  sigmoid(tex.b, contrast)
  );
  float lum = dot(vec3(0.2126, 0.7152, 0.0722), color);
  lum = mix(1., lum, tex.a);
  lum = u_inverted ? (1. - lum) : lum;
  return lum;
}

float getLumBall(vec2 p, vec2 pad, vec2 inCellOffset, float contrast, float baseR, float stepSize, out vec4 ballColor) {
  p += inCellOffset;
  vec2 uv_i = floor(p);
  vec2 uv_f = fract(p);
  vec2 samplingUV = (uv_i + .5 - inCellOffset) * pad + vec2(.5);
  float outOfFrame = getUvFrame(samplingUV, pad * stepSize);

  float lum = getLumAtPx(samplingUV, contrast);
  ballColor = texture(u_image, samplingUV);
  ballColor.rgb *= ballColor.a;
  ballColor *= outOfFrame;

  float ball = 0.;
  if (u_type == 0.) {
    // classic
    ball = getCircle(uv_f, lum, baseR);
  } else if (u_type == 1.) {
    // gooey
    ball = getGooeyBall(uv_f, lum, baseR);
  } else if (u_type == 2.) {
    // holes
    ball = getCircleWithHole(uv_f, lum, baseR);
  } else if (u_type == 3.) {
    // soft
    ball = getSoftBall(uv_f, lum, baseR);
  }

  return ball * outOfFrame;
}


void main() {

  float stepMultiplier = 1.;
  if (u_type == 0.) {
    // classic
    stepMultiplier = 2.;
  } else if (u_type == 1. || u_type == 3.) {
    // gooey & soft
    stepMultiplier = 6.;
  }

  float cellsPerSide = mix(300., 7., pow(u_size, .7));
  cellsPerSide /= stepMultiplier;
  float cellSizeY = 1. / cellsPerSide;
  vec2 pad = cellSizeY * vec2(1. / u_imageAspectRatio, 1.);
  if (u_type == 1. && u_grid == 1.) {
    // gooey diagonal grid works differently
    pad *= .7;
  }

  vec2 uv = v_imageUV;
  uv -= vec2(.5);
  uv /= pad;

  float contrast = mix(0., 15., pow(u_contrast, 1.5));
  float baseRadius = u_radius;
  if (u_originalColors == true) {
    contrast = mix(.1, 4., pow(u_contrast, 2.));
    baseRadius = 2. * pow(.5 * u_radius, .3);
  }

  float totalShape = 0.;
  vec3 totalColor = vec3(0.);
  float totalOpacity = 0.;

  vec4 ballColor;
  float shape;
  float stepSize = 1. / stepMultiplier;
  for (float x = -0.5; x < 0.5; x += stepSize) {
    for (float y = -0.5; y < 0.5; y += stepSize) {
      vec2 offset = vec2(x, y);

      if (u_grid == 1.) {
        float rowIndex = floor((y + .5) / stepSize);
        float colIndex = floor((x + .5) / stepSize);
        if (stepSize == 1.) {
          rowIndex = floor(uv.y + y + 1.);
          if (u_type == 1.) {
            colIndex = floor(uv.x + x + 1.);
          }
        }
        if (u_type == 1.) {
          if (mod(rowIndex + colIndex, 2.) == 1.) {
            continue;
          }
        } else {
          if (mod(rowIndex, 2.) == 1.) {
            offset.x += .5 * stepSize;
          }
        }
      }

      shape = getLumBall(uv, pad, offset, contrast, baseRadius, stepSize, ballColor);
      totalColor   += ballColor.rgb * shape;
      totalShape   += shape;
      totalOpacity += shape;
    }
  }

  const float eps = 1e-4;

  totalColor /= max(totalShape, eps);
  totalOpacity /= max(totalShape, eps);

  float finalShape = 0.;
  if (u_type == 0.) {
    finalShape = min(1., totalShape);
  } else if (u_type == 1.) {
    float aa = fwidth(totalShape);
    float th = .5;
    finalShape = smoothstep(th - aa, th + aa, totalShape);
  } else if (u_type == 2.) {
    finalShape = min(1., totalShape);
  } else if (u_type == 3.) {
    finalShape = totalShape;
  }

  vec2 grainSize = mix(2000., 200., u_grainSize) * vec2(1., 1. / u_imageAspectRatio);
  vec2 grainUV = v_imageUV - .5;
  grainUV *= grainSize;
  grainUV += .5;
  float grain = valueNoise(grainUV);
  grain = smoothstep(.55, .7 + .2 * u_grainMixer, grain);
  grain *= u_grainMixer;
  finalShape = mix(finalShape, 0., grain);

  vec3 color = vec3(0.);
  float opacity = 0.;

  if (u_originalColors == true) {
    color = totalColor * finalShape;
    opacity = totalOpacity * finalShape;

    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    color = color + bgColor * (1. - opacity);
    opacity = opacity + u_colorBack.a * (1. - opacity);
  } else {
    vec3 fgColor = u_colorFront.rgb * u_colorFront.a;
    float fgOpacity = u_colorFront.a;
    vec3 bgColor = u_colorBack.rgb * u_colorBack.a;
    float bgOpacity = u_colorBack.a;

    color = fgColor * finalShape;
    opacity = fgOpacity * finalShape;
    color += bgColor * (1. - opacity);
    opacity += bgOpacity * (1. - opacity);
  }

  float grainOverlay = valueNoise(rotate(grainUV, 1.) + vec2(3.));
  grainOverlay = mix(grainOverlay, valueNoise(rotate(grainUV, 2.) + vec2(-1.)), .5);
  grainOverlay = pow(grainOverlay, 1.3);

  float grainOverlayV = grainOverlay * 2. - 1.;
  vec3 grainOverlayColor = vec3(step(0., grainOverlayV));
  float grainOverlayStrength = u_grainOverlay * abs(grainOverlayV);
  grainOverlayStrength = pow(grainOverlayStrength, .8);
  color = mix(color, grainOverlayColor, .5 * grainOverlayStrength);

  opacity += .5 * grainOverlayStrength;
  opacity = clamp(opacity, 0., 1.);

  fragColor = vec4(color, opacity);
}
`;
var HalftoneDotsTypes = {
	classic: 0,
	gooey: 1,
	holes: 2,
	soft: 3
};
var HalftoneDotsGrids = {
	square: 0,
	hex: 1
};
//#endregion
//#region node_modules/@paper-design/shaders/dist/get-shader-color-from-string.js
function getShaderColorFromString(colorString) {
	if (Array.isArray(colorString)) {
		if (colorString.length === 4) return colorString;
		if (colorString.length === 3) return [...colorString, 1];
		return fallbackColor;
	}
	if (typeof colorString !== "string") return fallbackColor;
	let r, g, b, a = 1;
	if (colorString.startsWith("#")) [r, g, b, a] = hexToRgba(colorString);
	else if (colorString.startsWith("rgb")) {
		const rgba = parseRgba(colorString);
		if (rgba === null) return fallbackColor;
		[r, g, b, a] = rgba;
	} else if (colorString.startsWith("hsl")) {
		const hsla = parseHsla(colorString);
		if (hsla === null) return fallbackColor;
		[r, g, b, a] = hslaToRgba(hsla);
	} else {
		console.error("Unsupported color format", colorString);
		return fallbackColor;
	}
	return [
		clamp$2(r, 0, 1),
		clamp$2(g, 0, 1),
		clamp$2(b, 0, 1),
		clamp$2(a, 0, 1)
	];
}
function hexToRgba(hex) {
	hex = hex.replace(/^#/, "");
	if (hex.length === 3 || hex.length === 4) hex = hex.split("").map((char) => char + char).join("");
	if (hex.length === 6) hex = hex + "ff";
	if (!/^[0-9a-f]{8}$/i.test(hex)) {
		console.warn("Invalid hex color");
		return fallbackColor;
	}
	return [
		parseInt(hex.slice(0, 2), 16) / 255,
		parseInt(hex.slice(2, 4), 16) / 255,
		parseInt(hex.slice(4, 6), 16) / 255,
		parseInt(hex.slice(6, 8), 16) / 255
	];
}
function parseRgba(rgba) {
	const match = rgba.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+))?\s*\)$/i);
	if (!match) return null;
	return [
		parseInt(match[1] ?? "0") / 255,
		parseInt(match[2] ?? "0") / 255,
		parseInt(match[3] ?? "0") / 255,
		match[4] === void 0 ? 1 : parseFloat(match[4])
	];
}
function parseHsla(hsla) {
	const match = hsla.match(/^hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*([0-9.]+))?\s*\)$/i);
	if (!match) return null;
	return [
		parseInt(match[1] ?? "0"),
		parseInt(match[2] ?? "0"),
		parseInt(match[3] ?? "0"),
		match[4] === void 0 ? 1 : parseFloat(match[4])
	];
}
function hslaToRgba(hsla) {
	const [h, s, l, a] = hsla;
	const hDecimal = h / 360;
	const sDecimal = s / 100;
	const lDecimal = l / 100;
	let r, g, b;
	if (s === 0) r = g = b = lDecimal;
	else {
		const hue2rgb = (p2, q2, t) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
			if (t < 1 / 2) return q2;
			if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
			return p2;
		};
		const q = lDecimal < .5 ? lDecimal * (1 + sDecimal) : lDecimal + sDecimal - lDecimal * sDecimal;
		const p = 2 * lDecimal - q;
		r = hue2rgb(p, q, hDecimal + 1 / 3);
		g = hue2rgb(p, q, hDecimal);
		b = hue2rgb(p, q, hDecimal - 1 / 3);
	}
	return [
		r,
		g,
		b,
		a
	];
}
var clamp$2 = (n, min, max) => Math.min(Math.max(n, min), max);
var fallbackColor = [
	.5,
	.5,
	.5,
	1
];
//#endregion
//#region node_modules/@paper-design/shaders/dist/get-shader-noise-texture.js
function getShaderNoiseTexture() {
	if (typeof window === "undefined") return;
	const img = new Image();
	img.src = noiseSrc;
	return img;
}
var noiseSrc = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAADAFBMVEUCAQMBAf7/AgMD/wID//7+/wT+A/4FAmYIAqIKnw7+//4EAisEAUgGBIYIewkFVhEJjAoFAuEFA8GWAv6T/gz+AzER/25z/wu1/w1nAggL/049BQUC/y39BrckAQQp/wr+AZYNOvx9AQkN/pELUvMFaAZTBAgIRgsO/7cJNQT+YgkLwRELIf5O/wlP/v79/q4IGAYLK4+kAQ1tAv4IdMpc/4xNMBF2/lQN2vTFAws9BLf9/3kJJgsMRF3+HwkLxfv9BVL8BHEN/9gMsg7cA/13/vv9OAqWA0sOofP9TAsIe/4FQqoF4Q/aAgsQwnKQAwa5BP0JW21NqgmY/f3Z/wkI7whGjAr7oAkLrGGf/JH8jg4zAj4R0Qr+xQ8VZv1Y/8O6//wfA/5bAT79/lQ1AGn8egkKdom0BgYOsfjtBAVDBoz9/zG0A238P/tsbQ/+A9rIig/HCEtvIgrM/1lwBWgIlmr62Q5qA5FndnEIXa+PthUMrqiRfw6SAodE/0cQm6UOirP5swuMCrEOjvo/dBVSA/79KvCgSBL9M1E/TwjUag/e//2WdPZ2TQ9ZMvfPxRD7aPpmOFqXSPu3pww5B/wR00wTgVf3y6dXW137ffv3c7GNj/icJG+4xvYQ61++CZOVll8p//uXzgyTKg6m/1L47w3cAY8EI1T7xvgKbkr7UsGBJPNsB7xL2wuvd5z3svmDmgipcGT8jez8oP0R6bNYuVpUxRn9LZVkqIijYxK7K/dZBtjH/71ZT/1myfz52fVm2WBfk0vxUFj+Vfv9/9plbfz3yl6VUl+flbNijrpfpfz5TZSGRKAI15X14pSt4vwQKMHOTQlKifz1sKW6A9u2A7R65waprffGcfeY/8iyUsFh3rn4lGERMUHJolveAs+PBdb5iZFuX8S8SH7Ekfe8Lwy0t5cLwsD3s2TzbHXa/478nLtNQ6NtstW15QvaKgr25FJm4vyXwFlPInIPId79dUr77fmr18BGdLHIS/mGx6dKw64L7v6k32XMJrWl8ELA3C70AAAgAElEQVR42gTBCTyUeQMA4P97zIx3ZjDvHGaMYQxjhhm33BGTY8h95sodkaNkXVGhKGdUri+SIxQ6nG36VUhS0rnZ6tsVfR2ibKlta7/d5wH7kMaTxlOVozEoHgU29/ayNC9YlrZdyVT+Lf/dAsDDc/xfzX+MLBa2LK23goK0aXhCxZ8qIAdXYj+c8zviDOtRkhEtRxNajHWLuCtdcfQqV2mgRlpDD6wJpKpBrGON27qa4nNeQOU8ViU0pZ2eCMN5mWO7bfR17Q9ItpsqgZJNJcJSq6cSWiV4q1zIDMmkqzAdpqT8gI5G3qm3YEyliPPG9kiwF7P99ghNn7zLs9EXFvFdLmlOdKBAp2ZyGTcI4JuBPYrWyGCYwgFwOhTmHeYC0zEDSp1iX3W71cqoW332M++OAYJUrEySVX0c5lzmDgLcAQ1yFVVOgQ5l+j1k6TEBidTUek7OF4T2kDYo2eVGwOrglKyGBXYyBrxFv9ptR16B+BJ0IFCsryJve0ZEuzNjLeEcw/0aK/kyku6JW0BiicnCBFptKAQRRNRrtmUV/YOn6GNMHXddsFf1YZCHMnFWgcyp2gnLOWTTBcVQVvM/FTgJAHl0NWHHzL0eqzuRXTDCEO03DoThV3kezhrtpNqKW0Bb3MSSAJMmmVnLEpexS8JrmYOr4KXz1cUmByty3N/sbEzBSP8tfGSCJ3caYDhymsPdGbwO4HAl/+PYDCZNf+H6kofkNk4N4Zn6NM4y1lJD7Tt2gyklnrR48dgbfHXgd9uzHvpamm3wKhcaLcawXWxL5T97dL7MeW3aZ7NDWksVZyZv8VQyjm94CDU7UjtbedqOCvB2DdE+wFC6a5JcEIgkKRJ8cfTGmW/2jMS5LEWWKiGY0BFaDNQ++2+sOifPMQ7CcHeFx+PPpcbzRoy4IKmVwHg/1842BwoGc2qlRVoNjCF59oXsrcBgVEP4u1GIX7jshIMqqPdbGTRJzMXcyyyiNG5fr5qFrUVntrktt4QdJugkr1kzNJCK1roWpTraix9JVMpZcsxGYsJlGiSyEgOFZzHy6YVlilnicmxUVkdX/PetzMBk92PNJNkIaLhmA30XPCrMuncWxOZK9kpLnqpYOOsLFFmaf2Mk8OH+BbwPH7HBX2KGI0Ns80gleH+Y6k0YZcF0sWgpoJA30BBbG59XaKyBHoxFtc2p9sFvyXqo2v2aRKN+1HLPshCibfZESAESYsLXmz3tT4wNMp0Wali+VPN93JIJaQ0AcXGrNMnSS0YASPcaNh32NhO0sWHKPhrNVpCBzyk4EWR/PnmKE+3s2cDO+YF6OddPNx7G4AIrZBPldw6tcss4bqzb6hBy6ccf3YaBSNRBFELueRFp7DXWNMFVAT9J1LNTntEyEI2gJS64oyKMKvSRrbpPQGE0rEEmHyqCl2oQravq51FwJXG0m/pPdRA6Xp3sSLdwGwNytaLg3g3VEE2eFESy/GijQPwmYPjwJT+bH/ax0dNT0NZAFQxyIqKzET00vUDuJ+T25QGCclaGZiJBxsjtz3YMZ0PPsq751h0ldwbZstMgHfnauk/7n1eZxEmYIPf5wPt0KJvg2V9bcYWGgua/Lvn/xG5q98tPLcGzHaac2+Cbs3niyPtGgfYgBT2OHgxvhGxzApoPxPoCOtUNCXX+ojW0ug7DOuyrOOG5GkWhaAzx6ZyGE8qbCPS1oxzPjcWSrG/ICNaNMKsra8bIlQVvmRQ/FY4WiHhnrVz/VfdOiOu6u66gG3NKogJ/0rGdbC+iPN1pbZ4HQAZODS+mC2z9dNBqSzd6mTQWKq+EI3fXgJQdqfqz6jY6Fbs4sWT/QkaLUOBnMhWRmSdrpTy769BcCql1UOmaqtFbDA9d7qEox8Lpa+TPXX+xm40jrB7EBK1lwu6IMud9xh7NBZCbq6PNN/QdTu0BVa2neF+s8b1dGns5tMGxQIP/+fiY60jZNp9n5D9MLm4NLWO2gXVG4xwDXHeHXMFEAITOVUGJRoBUwOV3miiTEPPzLrwDm74zFsW9zkfCASQvPi2RaF9qJ2HHWMJNxCHzDym6tNfXiEe28ZnjmHVGwlSvfgBo4afqcoTh4NNq7QQ1KrPJW+1uHEK1VvTghGa0DAePo8D6D1NCYgEPY239D/RQSUMxWJsAIi5KEp/3/9LH1wSTwl8/mfekwWyIhAwMPErzWxVSL7sFnFT1NqJ+Zb8hX4cqwyucXdUVkaqNeVL7abNtJV++aASn/d+Fw9qlVwplz4SqpVw5CBK7nq483nxbZ8p/8TtFwr8oD5uhq+lxfovd0x4+MHo1Wv14SJzqBo9Un1KCZ8NWfbA7jLeoMjnCcS8bjtKuxii0+0RPZlLS6NdhNKHeN2NSdCswa+K+aGFUTD9MLW9R7mhPT5i88TZvV5rWtuek07W/vBev9eJznPGkM8FrCZ53AB8+Ig7vKms99yRb5fpyoQssijTwz0i22O+HvjsjyGXpqseb4t4j6YW86PfJF2cnjmy8EKVF8sIomGUdVGBquOIDIlHsrgPkJEzw7KovqHB/kS+NPgs9nG9FkG1MJiA0GNwTyj5dRS0uiWTfSLf7jpL0ioLExajL/OJPkUbA6CIdKjpU6XrSY/6mE5Z1IDBoHX7tGx9fFkJZQPrPIW49pj9oUEykkiolzaein8mBh/C/0eAzYoFXHWJxYZWrv/ayPmcWsjfWyDy8ndnmPTldcJ05MaxOoIHWPcND2SOan44Wc1Oxyk59KHbiXwbrxB3qvAEA+Pd3zc3MkDFmxjG3K4ZxjHHfFXKNI691kyRLjmRCUmTQWnQo6XS8JNFBsTkqiRQpijalraTe1VPbpa1394/4PM+naUIl5jb9OQw4tXHsFyAoD/x8vmlYJu23hfowcTnJOXSMUdKum4IqKUd4HJguRiprd/Etw9K/NJ+UKE+T2v39ms2JRGhtNDxShw6kmZEdsr6fwVSzZUCgj/xK8CaD46MMqjtVmEE0DTPS7yo7so402lkAAr5A9TA8YbapYO+4tLHK+uBAqCsdrmkNB/tSNQxgrZRiBjhVSt904TQbBmEDW36UhZEwZN9TbWh1vtrLVYdkQKayJHgjO5aVftyaOhbtIVFjq0gImWcFJbXqPp+aGTaOzHzPptvWbli/tEz5BHs2WdU4y01sOWIdG+CPWbxSDnQ/KbYgddG1ggtPPUFvXeLdNH2EoslAveJl8GUVaLs6WWsoo3G2Q8KnvSkrNV13rJm4fF2jG2NKE3FMgjWPyCyVVZXDxk0WKQyzIcdGvhovfXwvS237WZN3PvX9Dh50V1CMuemc5AkPWBJzzlg8giqz/M3mICBajNsO3PSuByw3zV51gCTybHlfu/R+zXwVekhzN1C0gZCgqc3x8EUR5Mt8LndPRv3AbLnf2ZMLJ2TZBapthY8hSsIET5/vpH1T7/l1IKZl4pTp2eMVFT8J+1JyElnizM32GmBQTaTDJOwuvPCV3QDonD/6xjwgR6SA92MF+v+Xlo/BDyOZJpkM7QFh73uKxzX9hlDol/x5HVESyPM/HNyF6MwCg866UWXm9Jd2xsjrXyEKgjl11K41nEwzFzjyP0V9T87dStAustB/MkOwBaQoOCNG0+6dfSw2YIL2d+aAFbtewoPIATWJC+6il2nDFDx8Vlxg2a22oZG4My48gnrQEcDxOuE71wz51mkfvC3B8gjF04baNRpg6SGoHIAc+zB2Qqqn9yEzCXfpmpdN2kxdkiMQ/W/X7iT/RzkpBGvlGrx2Bs4pl3s8Akl3mRTsubk3x+CQH47r1ZNgECzf7IP0nV8lRUj1XqsW9+wNI0+oAx/lOGVsHcmalqdAqT/Rb+rp3wthEPxjXI6irxhTZc9U20OHSbYAJCX6MKHYW/P8XRlyam7KHfk5VTu8Tmebd889NmQ7hiuPb6bQu8inM/FOXkO7iEWd9hgyBVEErR+8P+Om2lFcXGp8DGe734LHfS2Pk7/pzSwPvdrkd7/NgVo0V8s5ir4NYME0CzGbOVoiygQKh+vexBN5PkUBa1bYInKhFqBi7f3FP9xdy5wmH5ByEL6YmlsN4H+lvQJBG8TSvwBmhcGUafV9uPlIYlkx7S81YuG+rzfC3Eb07PGLSnvKO1ujlkiGMoliWkYJ6XYpHzhP4z5odeImZqKxZT1hFN+arPz5Dw2e00ODXsBCGrf4jB+45ZT7UrN7VBRUYgrUJx0WkxNyMCSxRCIYwgyqxP8Zv9VC+6aiUgB0eIt08YI0fh2ZFRqSilUuRRvmt5jejdoSCjfaRFSca6RXh9kVAjX/OeC8Fbgdo+Ffx9K0zF8p4sLEk27kG2vWNThL82M/h1BScI2Kr8fOKkYdh+WXxAYVPhsD11sx5SDIEyx5CGwE1cQ3osdYdlEP3/AZPwvH8oc1WdqXU/OM6fdPELtY9JRSNHEepmC3ZWgsLZss2H2qwq00xxA81SAexVdwbL1ektQlJeVMZAGObIMXLK5lkb95dhjMzkc/Lq17iiAPa1uAovfIZZLe/kaNzRCUCr39gjN5YW18DwBEKdQkVriaJc5BKEHi5s3DEMukQIe9bStXDHyciJ0Xv84FSgb6OW6WuhFqtyjdjWTw/jt87MnpqzC9LTP5d6vqhMo3Y4u6dwfNAzL++6ah0G8ahltlcWiZPeGtcG104UJ67f4QMwOqq/jMIFw8leQ9VsbOhuOtjYqx9cXIaiBcng3fueAQPIz7hl+NJ2ltWAECQIyl81LAaRwlbECUyuuxtH/i/nb25kFilIsdm9q0qzIVxbO2/dyBPwsOdwI/A1NIhXctIgDDfKCMOLIhEHXE0TYiDRDEMkzWtQ9aBbO3WRIhTdI8MGpPh+xE3SEvZM3TsaSkSwo8aIp7vcBPSpNIUWc9dx2ihGIUfcCMA6h6H0sgzlYo2LzwzsSBG/vPLUKBRAIDClNo2hylJMPNHUF6/FyCi7vsPpUBU5f1Zryco/9dyqeIEYzdzRL4fhRqyDTW1lv0jlQjuBtfaUaKBPI7Hr/G7RcawKWd8xytCCHq0tGrABFlLf+tFnXvcFRUS9SdsaU+DOI67yy47KiS86yVHnkbvbnhw7R5+QMX6efQ0ueOVdVkKZ5o+0GzRYPc72WXnZ220/EEPvQ2mJs9umccvaJ9JQDlWujkWdH+bCuOl6OBriPwtt/6D57aofIHy0JVbraWRZDo7xiUeThF4JL+APjur4ftrBDOoDbMmJGGRvnl0iv71YPgcPgMSa8PT1ZvFkRgx3zPM6BFff0dTJbRNIHNd92hlQTTuYNVd2W6Pu7Myx+NgVOiFPeih7aHHc/Dn2tVtPIQZTLWhr1BSVJzNpZo72uzoDQW1D6KG7aCPz+193FdMxFtZ/hYE8idJqfsq7jHo6USnTep5tp8D4LWtSPqIJS9+U4cc8Ym8lJ94wuv8uj5DlIsflhtItJUoeNhAnkdEmUMIsLbGt6thjaw5suLGIwXg96aII8ttrigpcKpcdmqmOegLraj5h8AAQj+90zF3YhqscELTAFaWZuUAQMThYiUb/FNHAlDUttdbQAyP0iCmwvBlXj3bwwGkEZxh7Y8fY1TB+UUdVfjDXKAaoLYaWGWCmVzzxQxUQK7wSFq7btNyjcmKx2vXgKNSocDI3W0q3gacABoST1YfO0NC0OZ3VJ2PUAwXIcsOj7fJ6GGGw3hkT0GAMOIASUuHGB1NI2BNAAuhQtFj2vT4FWOBwA8AZQCJQw8v+fPYq97G8tFNng/7Ieg+y8KHAcI5wACkQOUMBG9bgUsiYNGzPHqgpWonRw8Fzw7aDForw4oGUkSvQQ4H18ev2sHhEVc+aMCAykFFh8LmGKQVJKhIlOdALmkAKIDBkf5txoCxwKdUAz0ToWOJaUGAeneA3pOjwFyZwApO7V3akpwjkl8oyOFoQqEjYfUC0cBHVCoAzuMMH42EggBKSJqxhsQWwBEu1doBqQKAktnbzMzwTSck8w4yPZwGjYeKiAjDxSHIz0HE3EjHAUOAk5RLXQHqIsOrysqUAHM8BmGZRVNw6Mi1QOeAQRaLLABABIkQAM0yABTbYCxYAC+HWBJ00xdN0r3YZU7ubbjAi0CrjFHxLMzaNEjFLz+4ScStCg4r358a5kbAtifbaHcTY18qVrMIdEEISdanHgWFdkBnM8/SEkTKfoHaS1aNTmZvNwAflsqqgZLAjBXyAMFyrIpbAVGV6oAKrCcPqAr45KYS/sfi9mObGiSlB0D+wALckOOCGOriDK83ywNfxUfTw5tHzwDGiJaJ4SU9holF5fx3X6qZhsRAQeNjT8E/kvHIKvUY1sAUZAea4Onlj9sE68EoEUB458HLCDmAB8MIw6JSiQAN73SPLEOfGU31KMYEYrTousmiyRtBTQ7ClaT3ANP6uFYKL84ahsIP6ssogAAK2ks+AYESgB6V3UYAypGWgKVqngClwwJ4MMim9fqCAHJWh0U5DQ7OVAdSk8dtdOMDCrNkgSBo/c0qyIuBDEFbkh0SUHxE+47GQEo0sga4YD6zesDkgAXwjKzLArVShiyFFWSYXkS3iSlNQsBUb4kAQKUESNv4bFLCMoBtfxJAAAACsmEpW4PjIM0DDK2ZbpZmBCz6FoZBgXsbtnLKab9EAxgAVmSeUimBgihp8IvMSfWAwTyz2AE0IhEJxVzmmrwNT0PncoCGQXQtXwua50xk3uPDI1DfqKHdklTBVYAioGcInu/CGIX1GcrkE1cTAHQHxBAprY2Ib/AxT4WBxZveQAd5CwBQsaMPgkdmgYbVQpqCW6JAP29BmFQDW+aDAMuXCMvfT9WrGXn00cmaaaXZvgDOV/4nwXQKgfTiEmisC6eemBCMrpfiElpnHRef3auBiVEA0qLWeFLEAUBBa5BCblqmQV/CgAZ1UEFS2EgCvpyuAMpGyc9BVooZsCBADmIoACXkboDAEwGNNmnABevAQcGNhceIVFDux3uWIIEPQAsjr5l1g8ClQpMAwJsOVsOFi0Uvq4cDl8PEVl0AAdaC6mFaVQiDNeeA9ECv47hpTZ7Qk1VRRwbdRax8vFXryTiYolAIwprBlZ0pa+KKl5wBU1lQRMCjFIw0l0YdXYDC6i9MgDUC6kp3+A48fLH86hBDQILLQBhZJ5hWwInm3QIHgYZEWvbV70xWqoFLAPERDLK4HM5/cWVKbX8bAMEE7o/Am2aue5ZF6OcLqqvVu8EC6f8aJbYBZOWXW5xKyBANEqjA6AskyIoAf5MBQGnKBpoPTABR+0/oFUHAU1VAKsOqV5NYgBBHwZZh1rUncwDCp7sSWwDQTYKBQdpCzmIrMgNN5QDEbEvW2QFgmmkKFOns0WDQamWLPHDNVGTniIfRQ5HqfKsg8Uue/ER8pZHd+ebUSOm7KgF63WiTIhrWg6oJYgEMYc0LhWELTvncXdcgScC3S+BnrjLYYsZK1PXQ4GJZugCuQAClGncjGcMCJwGMHx8c7mRwoVCQAMJPQO/MQBbcs68Zz2lDQgs/R85PVvPAzRJwGkC7MYIF/UDBRoHd1GhwYuAEoXDO6sFqIIUr3wOHGmZFK1zH11Bh8iGFWc8HgEoQwXvQRxHJDEUBTF/AplEfWUmWSMJpiEUvAcghlFGEQtETwA/BxQAeDBBt1IYKa4cADo6WpUuAAMg0w4DBroB1hgTiAJ/RN9REX0qcIM3Fb7b2AEEm+mOawIEXgFg1ne8ByE6fvMKVpI3IjdsAQETBiWUmjZGDQhjQTF8FgldAgNRNiACM16kCBXhkWoUp+4SP+hEEghL9k9wZjlmc6scT6cUqAASj5U5aTAbAwOEl3ICCG25JR4ffsEKYfUNKIkoY2UMcAkXDqEhrGQ2b2RrqaXjAx81CAUWeXVrAI4mGDm6bXtoAwYVMi4GSk5PUVtclscH8gIhvXQ9UiUA1unQH3gHBwkwq/5SRAaUD0GYbE0QL2MAiQbzlasuGxcYAwE0vhmvfgAe3CW/9BQfAiZ8Tnxx5COM3BRtf6U+K/tpYA+lJQO+LQPteW4WmCHRYyCQALcpWAIX8w0S5CQPI1seMBmCcEAegczCb/8FJpCzbAWD3H5NorMaMENXbcyM+SqnzMa1KAA9KRESUQB+C5mbhqFe5lVYhRtCGAK/a7AxcRIgu2O0PwDuLixjUViaEgz3FA0zqDci2tBRCSARPgRBM/NkGRlZeCFnHlEiyaQrgIgQyl66REcXNJslVzwimlyANCOKfrhClEyKOdFL7hiibMlFBQQg1jaLPAADCPz3BFXbRsbE1+oiTTkKCl8XnvRMQbUbRUgqR+ICSw/lJnACx3kIAhaIfB8W/BnkAGo4MoPAYEEA7RTnB5Sg3RinVnQRBQYS8wR+CaYzXT07BdYMDs8Gu44ABtULIyJHDl9wejIEAGo6jg0VoCpEOI0/YewzCgIzcEmGYDY8+rhtRfEyZQblSwUeDSI/X7sFhPM8FQbc4nCqKe0BtEIkeVqJcscyajxYOUfpyk2ANDYfAOmZD6zJTRSBDpgL/N5wnUqyClKcYB05MI1UBooALCvUhuAcyf9sJiv8GyJRzX/IQQCyC3ZBSzwcO9sXB4AIlRE2vh0HBpcF5grsAQPnqAA7obcALildiZ92TM224bdMmAwPQINWrPd+RCgHJxgDfwMv0YKRlEBHJnpxkJytDXXpANUtIEdWWmUSBAcJCSPkZZ0GEy8MDKof72cdh+oTQjqaLH0McSmDa3cQnJ6lQ0N/+aitLGabIwgrEzCvmmp/o49p5V0GNlRLPRbu2UehI31oa8rgCQhEB6mYuZpU0KMCA2URBW47L4EFCEEgFz8IC8xlQBN3t0iRJY+oxFKsIMEPAMBxbQZ5ChYjF24zfKVBA5UGcHmAAsQ3Zgwn9mMueQ53L9/rahkcB2PJEpl5AIasYhP/UBsSETYp00xgawArAIQDBEgPegICAY7xP353eEuT/Ty9fCWnKMRFNQQACMlLA661MINMsM2jlS7bJr8GyFo0bmasanYGCDqsgIONKQqkAGeBYAkHowDYzhhEM59lCAFQLOH9SCzwQAl9AQZI8AdUPFsoFXJbAAEoFp1vvyL6CQ8nDsdymYQNX0B+FM0EBi+IBmIX5R0i5ed+S0/eRBB2EQBmGBUDWLTLNyEHJKJOPiJaTmkSDpwQNgYCGQqA1LUHqtAwOYMi/of0CMIHTBipAIYEO2MKkkC1BQPDFD4Ax8nmll9bNkZ7bmwv1wIH6qkQQndEHQYPeXxUrLUnE28cVsctUWoZGjYVKWe9VAI7RFHZnmsoBWVmYD4xTWNtGZ9wFawr+wAASdAIf6sAjAbfucWuRAx4jNliQHDSAII30QYUYqZ4xSGTct2+WT1bCnw+AJcbNXKKSE8ZFR+fPATWLFkeHQcVH4CxT9sDtA1cAFADBk8ZBBaRRpJovyFHBAEoMwPaXYvvOh8bfQxDvxShtHKe4KQeeg/AXhcIJKBkjxwgXgB+PCAtPifdTwusJGdXJibqGQzCPyySkBZJpz9En7iGYiCX83wDeQbt1TdkV6IAAGxhL0wERTmBBzESBRUdFRMctnmVblQLazgBAsJXtHhcHCclXRoeywgpDynhVqyFWAZBYTWCEviIXzaHwMxdN05xDT5FAwDkBC0TbBYFo2ssKCNOTQkodAEG0uYMXix5sMvSBZxfQ3Egc5k+AjwvJQOEN9rFpuYXv4oFPCULWRr5AKprOYWuCATtAAlKBrcGkIICAd6cnwxqtl0lfz/5+hUR6q/mHdbFA68Qz8syO8Gibp8LetHFNF8tRAV0bEYORkJhTRQFxAMdPwUJMicmXlQKBmMsZwKoAMA1DGAAEQEnMhcBtQZgNggLxcHiAoCFFYEMAd91E7K+4vHKXBbOfJrOAG1E1YEkqxGsNwUr0w0pR2MitIQ5BlqXAA1atwMCSgBYnTuUtAxxNg0ApC4fgrhL7D5sQQM+pLcGg2RmHwIZNZPGC/cI+3Dbb8WlBSCJ/uO2txmjCBULLyHgqeRjEBLnACxYAkBvBQE2owNsMXy0kzWqADm6Oh7HbSK2kQ53AIoKAFWwN02IAuhiBIQgP30OBTUCcpQr5T2fJjB+bUd/2g5Go9sMv5CrnFlpfAWsi+mamCLtIz5VFsBrbb4AM42rGna4cyoQ2eMO3z8NN8BeNKCKBQp3jFrOL+zqP9WWCQukQGBjmPsTAChybv4zgnVctaQ+ynQlaFQJtTPSxEAsRLwRAK0pStgs2M0EBQtIBmKomNWHKHU1uDIsAg2kEHvlUc5/AgICJ34VcpskFZHSgGFydLhFCo6nCXFfWXgIGgY6R9CKIkFdswK6euK1SRkYAxdXV1Z+9UWpQQOzIqloZy0FIoAZfxX7FAEasEKHC04pAAbnGP4CkFFkEZniWC3xBD13ADNArAFjkW8nICQKAOvmzBI8y+QwMBUgcrY0WJdtSxl0hFiiptgP3hDTlmpdVwDTCwZ0BDrZS0eTQt5GALQLQQJcPsQNOkguZZwCIMTEeadTAyR+ijoz4Qo4VzZZAAAlkSVs6VUcZJepUq0Svzx14BNIbWLpMC7XFJGvfVpoWr+cAI4twmWi2I9wqgwAaiwDPtB9E7z2SlYSA4hvaKQ1nAZ/MnZ2kRZ5P60FIq16lCYDVwVsKAx1BqPRgzsOZvKTPIoBn9kCKTDuDtMFqtp2nRYWNRw6ZBc0MvZ2DYu0CLhiWBeCK9jSZwBQ2CySAafnVwKo3rdJXGWGUQv5gHlWsQQUAFUmWXi4AQNX/oqvEnkEUKG6tlZ9QkzDT1jLpmR9fWCg4wByAi0AWeNCBgYJ12ItvmMCNwrVZkYzcU5GBs8aT0XcqZ04IN6FTgQuL9dZDbIa1W0ER64dUb07oB0eE80fZ8/do84xBFGBcwGbppkJq530TW9GuGMsjLJLNAWrBU0KAKYedUoDH3QB0iGTAE7OOxuOVL8BIAMPUxKLA7HUBjHBHEQvFD87HYE40ZqAAXEF3+EI/FQAACAASURBVAA5VAcYSqwlTR4TFY8AFHwtHQXQhYMABwj490xjbrxCQRY1FA0MBmQdfy8KK5JQK5jIhiNb0AgjOAP7zB0TqcsihQUwRXSdVE4CD0RhWQx6EEYLhhYAeoE3P05iEwbgIiTEHEUiq1SOJcmGFl7Xv0dlavCgAliw5QDiemOUAuaucf5lhTXGhc5AoiqoZFu0WZDr+oQYAoJy3YAB2FsNETiWuCXLoc1tIQasfWYAMgQUTgYARFslHwpiRDUs1hBRoB0bQ7+s0NKTRd1E/RCeHiCeUK9JN5EAdJfznAEq8htHb5ADuUQCf8tY/UgQKaRCDSYrhAiA7UateS9WPksK2cYTfUrVpCTmA0SUrFBkXh0Am/veTf7P7Lb4DU8aKbKXz0zdwW3XchzRimAwkx59hHaKO2GnMbYaFW0YBYkNxWp1SEXiNNCm5g3DNIMgtw+ShZNpOpYq/Q8AswmkIiOEHX99N+JMMAC+JKYI7yrXvJWhZgcNbtz2wQA+bk7APAHTMxnOjSWcrcbzX+OZWahITJEaSlVq6X0QGs2kD7jsDlU8ixd3KQOKAgHdAVMANmNMOIuMjEusSjd7Aw4HHBUmlmJgCkxWYk4Veq5jVQ9CFDiuddoVjHF4dDYARDwtTkEhkSROFdWSdDsWaCj4BExuaA8OTiCxBNJIORyAAoMOTk1iT5wDLiZJBrs7VV4uAKKQCxESEKAfymPGhzOP0pVhBGA8ol5iCxpyOoZZFCJJRRXFTm8sA7PfEnuAEgFx0kBskwNQZhyzMLaesB4SdgBuQAKmhMetRhYAICQAP7EL9S9J8rk7xDAYgIxMIlDWBG0DAW8BYAdGkayHGwwrAi4b/r5sA0rCezgdXjtnijaFR5eSBAz/aVQ+mggCDxmYem6hDQtN369pqjuUEgAYD0BSUCT2CaA0BkkSSiDM6jOEQDOFjTDiIQAVX1TPI7bMwK6hF1sFT16bBoFTnVAAFcgndTYODzc/52xpHRZyNxDDkQBPhGMNhklGAbYDJLs3NFGGnC8lCpbuAl06ZWbRM0QQJgfnBAVVCyqR6L9SLIHQDAVNGpYiAIc1AJk8AIAA0TfDOzNArLrhf7hEtVMnMAEBCT81VCmAL7wJ+AKFpQS0Xx0tbQDcQgEJZzcdBW4AOQB2yAAFEeGWwhWAatIHABBbsCfCPlQAikYBjxdYEHgjNAUNL8OWdGkAXgMfOQDJ05gDZyTItT4pIibKF7+xXSp4Shfkxy9Vylsra8P4h50uKHAGw0KZJbkH2GZs1xvMPI3ddzg1sNxcsWHdA6IsCN0GeRJtVDCuDUWwaQAlQj0Ad2Ca6wMJA8+cfEoKOwP0EoXGHg6EdQUZaed7cUveOVMeswMfGy++GDwFsSsb6S9ehSIqVZF71JbZh6LBFLIRDiAACUrQGh3yN1sIIYIkUOeTKl1MTeQYCiMBFATQgh+ynTsCSAOav9AxNUF/AClE0gY7BIsUJiVNABBFJRT2FwgAslkF4mtM9lMDI6AGHrsDBEMhcPQBAnwmdg8o7YkIzxJYkJ77A35vQ2M8AOfeGivv6N1CumQj+RUGPQOXLeEAqgIp1Ig6o3nGdRl8PTUJyQFDEAJ/KNdr3gkIBywcNHDoiAfNW0CHClyw+AbbsU+ruOwbBAncmpU0WePmFgtJd4UAHD+zLgBSQQAugirUKWA8ERwyAjfDPLchDh3EdJRQgbHANWS4bDX2QWzJ2mJZh18YFTBxVgJsBe9gFSoE7VZXKLlzBo5G6q7l1hLxmQMMA6MLWH9PJUb3QgGZC4SBAx0BINreFj822QBjNwMgk00EK/kAtPUvcwxhc8cPRQBSsLgAbRwSGiMBLa5gDN0OekNWCnc1aV9sqeReuiznCC+PLMjJAh4xhq9iAwgOI3IvvyBg2TibaC5IlpM0Lkp8BdcGL9/LB3D9u3oJVwBZDSkkPQIITsjVS5NtqzukBoSUItLaLUeGQlRph9bxmRwAOCK8upGsTd/aP9AhFkwjBnErDQYAAT28k+5LG8IaPTLcvCciEHIbDW8PS3F7ZABuCV2xjgQ+9MHk5jktIvwbTCddCpWOGVBD4QIOfa+MURkdX70FKoRNAA08ttApUKfTq7tHm6YZAJYNRtEWHxgn4AKWIzQrKipAgSK8tk9aOQpky24DUkQGZnVQoRUBP0NDRI/UwgIAMfAoEBSLZDEgLRO1Br6SV38EF7rXIx/JAQ8E3EALBQcSgN0AFFDXMM+Lcw4EFpWDb2knRW/mRYYdfAUdfQLwWhkUCJQyms1ksgTMpHhbAHil+gEBS7anHDTwiRpCrmULHlgkaWl2VL1GDsrg1apysgeLQcKytiGpZUOcDMqz7zAAQwIiuAc+MjjuBK+JmoanK95NcXD4JyZd2Nh5dmU8IRLLDQdeCTYLvtBn6g+P6dw9JTYeVpoGi4ogu1N/K1HYkQC/YBpZAtrEZABeIfY1qIPPzFLFqQ4DDANRwxLNOQFjDca2WfiWsYh/pDePNz8H8AwduiJsSFkTWQRoen8WGw4Ahh81nyQBP5AGhR0E26ZwQ6DHcrwHTrJhA8yogTgLH9PiAFsgFGUJZgB2SLsyWzN9ASa5CB0yXwEJCam2WKEPNT54YlMBn+0OZwAdDwgEA9SnqxNDFoEDQT0NGaOFEHRADFm8F23JWUQQGhMCArWvLhNCfHChBBcNC6QNK40boQEAO+lRHA2CUxLhZyStpJ7pkDc/Cj5S9VMYHgC1PkR/KyVZmwEdKqJACDEcjSYbdxq+AKHVJUhxUMLPdHUdbAACCP33H9UAA8AELkYySGs1NZFvoAsnLu86CBTGMDtrpS3xOIHVHOVVSwUjxA3XFS3diDMPLbOzB9k7Wc9QwVJ5rhsB6E8S1AAGLXom2BIGMhblrl1bFXIYjQSmRiUtBVEKRbNsx4GKS0NiJC+HPpi9LQ76mjyf6OVwqBcGUmYEXgMTd2A6HWqzv7eGEQxBjkcBU/NVLCeshKpDLHJlq2tKGXeSSwFCJS0yAwEd0QEQYULiWW5o1uMgCv2UbVQVInoFKCv7FzYEEgB+31t4HjUs6mheCcGtRwxkMsMlBBHf1b0ADh8dZLtXOJM2kDUSjgxbWZmpAjISVgRbC4sCJugEjdR31gAp7hMAnkgTM5YXSQOZPGsHOAKwefkwknwPEBMqfn0NhJUI15ICbM0TWmmseAWuYeBQiaoWCRAA1AKbxAo92wPXEUQw7wDfnSIrnG4CGV3YXaBnPavwW4OXApQBfZxDwQ1iC6MENCEJAOKZqDFUARg48iFDTDLhNwWjqH4WHAE7PALJFQV7EwMBmYl4Mx4WDqsCAVgA3AQC/Ncp2LMA2aotBnxeNApPDKe9EVSiGS9JMEtKwJUIlwMUDac5oIEPRnapEikLMwAhzQUgJ3QiA/CiOgqWe23hYA0ZAglKDSQZOAEOC72KBJoavjfOPF3IWRciaEYtEzhLKwC2bklkNZgpRwI6WBtPAw+npsDsD6wU0TJ18JCbBy4aNIHPCstFAhRbFzkDOiYSlyULWoWJuUmHMaMPQhe5B3kbXkVL5bZfW0cOMzb+WAAAkGLfDwBkZAAVpGI4umrpsOchSIGKAzcBIjSXoBNokAlDLAFxFpsCbPTQTw5xswgtiyR9QVUGBDzWTAaVDqEAbCsATiO9za1IUezkU2NfcW/LHFaJ0Z8ACSpJVAV9AnL57hOjBs+jBFaPVyvne8dqLUfbF8GOEKVCDVsBLgxdJgBoClkAqUMmZS9cZrUUCgko/DTSHhYGPC75Dm1CIhnzGV44TgJ57DncEMTOEBWMAIEzFCASqi8BMQDtz2WwAChwVFEFYF5qEVJU837Uyx7fUGxE1YBGgu1N0nEsGiYBARCJGiv7nw4CCctmfyoGrnruhwzdwJUyHQMCWypq8T6caAAE20uVHZAlymbvOgSEAwDthEIcfAVjEQBvBRkXkhxrAm2ikI8RNt45FNuOoFokRRdegaaQOtexKJK1HiUAJWEDJgZz22IINjqFaReWG/QEzfsCRBPGyDdYRgcCrzIksE9ZRSXiAdKtH2VYAuzuqgMa3rADi5QGUH9vDzLeOQIEWwAJV4ubXVPDh5EkEzIVBjBkdMcxmAdVxQcDjxzkZr7HeTUzAQ3p9AaLaZGNHWb007EKkvOzc+9NfzgpIllL5myLFbQLygM4XgYF1J2Tvk0uFwIOEtlkSmFFA/yLJ80NAoMAXcbeHgxwl1jcouxbixCh2lPHTFx3qtaG2fp20wrwOgAL5yMrCgRJvQQtg38vXwf6doIW284PZBpHpsBJPzedw5AHCAEMS7YabRQzbkW6L7ndADPqNCkhAZiLdAMYfiZIPOYjGAwGD9Y6vGuiItqzLShPPJ6nT1V7ZoqepyOwL/dvFVxifBwAiHaMARYTQUxgAgACKxRvBh4kjk4AAwUq3gAAEeZC8yAMw5i22C0+GDtgBDwBXg98AwkROUA8S8YCBF903leViZjUa90cdTEOBrwDXHw1Bg8SIAD9EsSgIQwFDEcasGfBcl/3AGhtMD6YjLVaO7gLSl0BA32wU8o5AecqKYOtbh4BdQNIjo0geknWgXWS7wGzHxZ0A3NqHQEBcwCtNqlyt+c0AOkASngGAApBSYNSsGARwxoqz0NA/ggLh2AmkXEAlkauySUDu3QbBNpQUzkdYm+uYokbAjUmTZkCjHh5Zg4uAQ1OY2Z3mUl9vCwNoKYnFjSlbmiP4RmPUKK7eZ0DPgnn0ZqDmJDuA98yAQ+aL1PCSm9NBjcyE3BMmwCmEOyvBOilD8z03gZJS04dEK5yxwBKUnLULgA795xy0+1MXWEPe0MSTWdOSllnH4JfHofxViJmgMVAnbIMYSY+wAUMGScQ1g8AYqARnwEBAwBI5pMFeFOj84MHBNMeuweIjvkDExPKh9omslGCSVgAiN7YEB44Qpp2LiBjPdarEADOBIQdaOdMeA1XMJ8TpvwQ2tGMe61kiAcdEAoCrtBNJ2/Rhs5WfILCBiM/lIG64B5EVH5MfuQS8x03Za2ACu7cEw7NMQ8fIgA9EhYzJYmjV4svwhdqDI+guRTTWvBAXB1UdpDG1QI4DIY3NMjq48cHAg/PbAeQEFlY8rE5ClIACwBx5RxSJp0jQxFhGENVSjUQBQw2iMOKTHxkGjWS9SnbArELcrY0rwyMZT8ShykQV+FwUJMuUgaIWSeyRBZdbRACRCCiiSAml2AEGGImDUh7HGwsHG5KaxaGKsADQ18qC6KJsaYtDUsAATMPnDFfNa8EAH09YH2HsN5GykhFWAxNkwAGCSh0Vh/nMSOlhmUY7RVMBADQmDc6QPpXOVQoBbAMOyECuunUyxPgsQ0ETnBwRXQBAD4Z9IYX3tRMpbUBBbEOtydiCAIYue+9ssJjHgR/2AeVIIGbAmlLYUymQyRwZQTXBlCWmgNl48hVM7QSIL0CdJNSu2lFnk8fiZUZPRFODQCEH0ExjxJKSHJHTWlhSvJmIZZqczI+ADBfRQ6D4Q78UtkAAwsBw2I4MWsZlxhDLwD/BwD4WAUGCne4shiGGyeronSUAQXP5UkAOZ+BfwIRRANQS2eyNSEDcP67cPQAAA5dPwTl5Eg5FHSFGiQZF6BZBxttv2GoyEQFB0xSNBUW/EssG1aRABX0L0oXTk9w9P/nm+ZVMmhBQhcIGxhYOHHoHwNzJldxFQB0KHapYgBDkY+WKIQBBS3cJQYOvmYAR0qKAE8GApuhVQDTKawrE0mPBQG0gt28GoU0YHBDwfqHHhjbkDpoSWVWA6kEs0e1jAIvmkyegpM6G1IBXUzELwUOM2kAISwmADRsQ0MwYxeYL/A6RQABzliwKBgSK4MIxgogDTzGA86dDMa+XUMCLkazOuVDGApvbCfg4CQac2iJU8SvkQMoMrD+PQICV+oinEEdBm0iJT4MyAhTZgFYEnkWnG9xn0y74ilvXe25Jbli4UIJQAJDDjXiA4QDDSiVdiMi/rXIbh7VAPAPxA4UU/bFj9kDQwQKkZtHAlmRGwAt1n4c5uKmg4kORgd5WBq/V17bNiFuAu4AXIauVmwyb1tJ3gLMkljMvYJpCGEM79RBkhofAX06o1gaLwLwTDaMDQEFuzw6UlE9ASVc4VhyijlwMBC8q5TXBwY+MsgHe0VJoAJjlgAUvh8zAAcyNgUYl0e7u2JdGR5GbEOPBQRZBIQBZnrZAvJGzYKVQg8nTwskXgRp1hvgBRwEizz0V35fMqtosBADNwJ5EsGJBAriES8rADV+1ohgBwcBL3YBFAiISgIAAaiaHtpdDgh2Oj1Dg8G1gzdxdGkYQwW7CQCTNDW1GGtT5qJptqfhAAM2bhqP/YwZCWvDU8wVZmt9qQ2yMo6+KHLZ/dslAgWy5BanAIcBnb5hcjI7WBZ6AqTuASP9LHZRiHh0WQ1dJzgqMXGNqSWF7duSohXEqt3EAck4ZwUVVX45ChZEIBYeFnpOC5wPIwA/Gt0cIcKsoqTJPZ1UTRMBWA9OMqWcK8/YAIvfnzBhEwXifwgthgYgEecXBAsQZSVfVQ0ER3w4TgE8iE6ZEIwoFTYzUwGwt2El03Wp4Q2IALsOJnVYBGZdKCUBwQAqAFqlQEZJRbtrwqcgXlIIUx2NcEShuvIBbgq0XVCNBAKhUT4JQB/OBgqIf3FzY6V7OyKAOAoBASg2GU9GAA4AfSMKojG0m5gyqAe3MXWTUgDAAgxFtBcbx3gCmAYBRCEIaWdBmXYDgQdPhQMSeVkjt+IFTuC6Ij8N8+cIOhMxFvN0DJU7rf6eCTpJ9QNR1LoQQQMgEY26fApxVC5HOGr9sKU9GORpdSRjAW4rUEs3GgRFo9IJvYmKIxn3EuAwADMMjc+dCqyePSGpQbkhEXoVHwb9SJ5eMR3zbXZ4JW2BqZVw2l7pIXRrAhSAEAVRS84yK4rNO2l2wNVcCFW7FQwbADpohDhH+ALV5AgD4rQpGReMQ9tkmLIzbxPPHStlIdXCbS1hCEj4yktcH8cO9QspuSFFc2sfFMjhw8WBfwH4AL00SwUDOthSQB54xEsG0i0ACE7WuddaHtLJZxcCSUEYrDRF7xRceFE3AC2x0k8HnShj+8mn1AICDQvHh7yrNLLpdSMBOF7XG0MIKTpg3XePZSgxj4EUDQW6ERczAmkHACMqRzp7jwLBHE1J+9rgGE0jMKR9eAC3iUeONakBJAvMALJ5jyVnHDpo4HcqIQQqJDKFNBhoGQpAAb6m34tpMCwA0p2et1pv9wIkr2yOkSgpxQLKc1IqDDsWJgQWiFnICOdG5B2pQ1FQEqBk2k0FSQ8oLkFGe38tCE61lDAABt0AMaACES7m5uDMWkOQJp0/Hg41dp5mhRNyv+xrYjkRExpXAACXB7ToUYIOVBcRGpltVbe8OYgfXFsByY4hGhkpkyoB7hcF6K0uvEqfZ3griUwBA1c/lD66CQFPcuK8UwRxQHrjeyZEa4w1vRQqYTgxzxgQEhpdGRUUHRNnf4vqR4ObYGCWlrtDMwhWI0ZhExohPDYcfbYDowruYrcukRU+j0IGABZOTatOWA6DbwRHWnODFRc4PImVa24k7ATGb0kbQpcSsL4YFbkgARWhBHl6vFpBPRSyVmOdTmIXefPQCLgLUWUpNV+MAwdW3p10p0eu5BxC504BVIXy9c4JWFeJA2BjBxPZAnIBVQAZhQU1ADH4DjnMGeNHLOhzGY0L6yQtbYoXAJyb6u1PF7UZ5yAt4JwGYldYBd0VembYLQBnVTpvhSA/ckID5KwqDCHKBp0YAiR0oOcfXFD5GQY+oUJH5JqHAR8UBB9QqIcTPwQDE/cukJsaOVIbAuUBaxEVKvd3i2+Q8BAfV8nGOwKY/DtMAgkLMOnoHpCTARcGXgIUhPyYDnVrAExDQSJ1gGIMGgtYAytm5mAuUxtoB58TXTtv6wUAa0NdRSmbkMUEc15QPzEmWRQCSiw5cA1VoRQfWtxc+T0F03kr1T9b7QirrbwAXiw9TpIQLwMRz1BPIlLVz2C9KLQez0US9jMGnUkwCDWWKKWkjQlmXDZjQFxL7nsoey5VQwonAARTHV+7T2o2FlIjAghKc4pLVFWlP5YBH+iWBrccMUpWvxfLgF2Uc3GlpxBgKSA1C26DD6lECOuPBZ1vBhzxaoJkOfOGBXEfH4SpqLmcqQgHLqpA2FJvoLGFBTTtEVwPgIAWD5czgF1YKwbKK0omhid9pnsG3sdBFgMCnWEwrAt/AAxsDcl3PWYuBXYZt/VAEHZFRyu9ERMlZA7aGdcCBgAJCPb3D2AtAxKrHCcRQEh3PMxxSgZzhpKkABTYngRSabRPLwAEwOdIZ7q4CXUDSQBW4y0NAs3GAJEzApI+A3ch8L5wJxDHl31utHwtomsfuOkYFHczQFQ9YpEkspI90XQaQREGQDYArfYUTT1n+WnEVRlkMK0YFEehewNFXB9Qf7NnPPRJozTB8ggFWhokACEeqsVTFD4NFOtfQSlGkYutE1BndA5zBjM1zCAsKWfDYBYCKsZanqqU8mgF3ANrEAI/HOsHDjgi8oycUYmlahbDEym+E2RZoJ7CuZQvFIZ+Jo+CNsk+dvgAXSsCovgCRS0tyH+aFYaA2V8ApQLIFAW2ZfgiAlIEuwIO4Ap2I1xnL9wAdig3UgIGf6YE6DbBBHsBdxUYPHjSAHNWkIRV4yToTJo9fHKeIa32X0luKS0KMxP3Ko1eRBJCWkIMxCT0QmGFVau4JCE8fyjMBrtGXRFQD0ey3ylvRggAFQMds0jrARM9SsnGPBPwES6Nxm00yQBywllTABaqCdwPMUoO5Qd85Skqddq+OgvwnB0cAXVO92EWHA4IdbRkNjHKtgz1P9igRVKWJTcjwZrR8wLfBG0HCOFOoHq8bxdTQkAxKg8nE1DGHtA3kQgro0sY9PUYwjnZqgN5FQeHiEMAFRkElNIELGVYpCzs7psuagceOx6VnFMNPy/MDQe9BwEqPVUNBAhc0tpXAFewAxZ+AKsGSriss+52JIsIOj6JVHuNtiQnblFpaV8ED8LHvw4EmBgHL1UP5gNrBQ0SQdz+AxUBqnMDNuBtmgbCMweoGxIq9AbOQIyvOd0DVEUOXzQAcJCuFF52j5Jz5aHRQ5YwMny8QQJcFYgAF1sGkRMQBTDDzDdfK4SKytaorCm44gSOswA1lc1IVWqFuh+6x3LnBSUAE2QIWigFHb3YC1BVDwWdb4eIFzrNRimjqSKpwzltIIWEdI49Mh06XQYKBw41oWjUAHwgEoKXEKItKQEDAAsANWhxAN8K2QR2g1UjAts3mDkh2jA/LHK7BM5OEQ6oBqLLHj0aA3U3MX2Kb1wEBNIHNul/ogAnOGEERQWVVxvZA01dshtiBA9sUJqjJEs0APzrxA5TLhld+ImbOIIBSAJ5CsWQ9nwDE4EAmwYAFsoF28p6D1uFMYMFfgYtE6qkNwAATiwqvE9QADoAAQBqF4wG3QAumBeeN0klpFMCJGmFA9QrBAiYUiAsAFvNnm/HCXOBHKIZXyFlQikDC34xeT4IqQES+kh8NAMYAUEAvgB0HiVoCiMIbI4DGSYNQndiOymW01MRHDwWzs/FkmNBosBbZlMJj0LSAQJUiguvPQAHSxcATgAEbkceKlAmA966PQGGvYaul2NcZG64cOS55stIjxIVAZyuYlwBAVoJLrV6cSQeOwLpDQQb3gMFBUOMOKCAHgTAJd/0fsZGRCZz9eoBhQZ9Lx+BmQgjUNWgNZEbkzIzJz7Kn22XMHV5p49UihqXk6EAeqS6kDqzQcAcjElhAwsAIw4bkjXuBXHmkwJFAT8NLgCQSA9fAmoWAII8yBinKIFM5qNFDVITCBY3q1P2BKNnIPIJoA1wSGtOVkMVL0wuW3qGmRItFEJdIwMNRwI4VlZyFA5ntqYu3bk8FuzvX73m+0e8MiSObrkfXIS3PqwgW30csgKb+sNWNAqkAUAHHBcAHisPF8KyNVwdjib4CQEEqB8BBk3RmxoOcAYqEdnBQnikHk+GCzazSTmuSQXIjV1IPVWWBJEz61wSEA0AQA89r+DVIWexHfEtWzwaxWhXkAxh4jFolqsEVsMROEk9ijfAAR5jTmj6exsBtYRyIiMoZ/4tVhPlPMTKWBfLMQIxUwEAmQxJGCMFSwPjJwj2GUxYFhcWg5u0ntEASB9dCwNnhlcp7wADVo2t9ZEqG8wJWw3bW4IBpoWxDiGWcPxTjgYaN78JGGW0oA4BFsFpqTAKAAQ80REueg8DlcPFnx1jXTAK5NnxwgEb60cNmUb1gDo4IDUGyQgCAW8uBE8AClg+kQEACiJyVT5uW8RBG87AFApFlOwHAicmhoIYJ5YKAQzVZCfCeuuSnEUSeZckEiordDgJUX3LlPazKnfNjiIeqMxVZAZZADTEEkZ8EXGL+gFGwrjaTHyCEb//H6AY7NQKJgsWLAEZPFuLZnZGRnQtp1EuJRVuJTGdca2pHwCthB51+ZgAuXp+lRMyJ2SAgrYB6m0Q+/4YDM6aKGi/fSuVCQVuWtMBKztbqWEoa85PVdo7zihmsFxiXjnaYQAUn5bbKOh6s08RBhjdaU82QD8htgUalV8OGmIHAFTgUJyiMgTgxg8fON4ZAaBIgnxJeaqd1gRvBBMITAdGJWRKWx0lAVHR0j4AdvYAdQNaQJUDRHlHml5cSLMjaYxAqHmbAaTZAZcZ5s6JLJGip7sCXaw2LCRnK1YMO4sFRAgVWgfXMfc+zt038JeI6lkCDQU5yCGeZRBOA9aMG3e0AZ7cmQmKjgeCWvmJnn7yAwY8uoEEL1wLBADizps1VFIzm5UYtBHFT5Qy46UAsQTBZCwPgljNPekNGEwdic0FR1JmP5AAhShTl4MCWwq2By1NKlUqzQQGAidkywDoSgYGtQ8JRdefJLqPjw5YsD85GiBWlRsDZ2GzVDkCvRSyUzIq16YUXEBLd2kGn+rLIwAAAK1JREFUf54DD3C0WwmGPi9OSjpCA0A7fFwUZTm0ktDZLl5VXmbFDDQACl7+QSry5QCM2bfNC+WAFj1LAzLsiwEBaQCW/1EGcMN/tG8OViQtylulBUxRADYm5SEBRAcAARkeMC5iRNgZhOoxnz4oHApa6gD3ASdbmF188wxpDZVKUL4RUhTSSRvrQAZLDcgauImabgJzkXIaALePAXot1j6Bdwe3AXoQAnXMFVuCApGWbjuRvTu7AAAAAElFTkSuQmCC";
//#endregion
//#region src/features/shader-options.ts
/** Pure option metadata shared by UI and the source automation model. */
function shaderOptions(preset, field) {
	if (field === "fit") return [
		"contain",
		"cover",
		"none"
	];
	if (preset === "pulsing-border" && field === "aspectRatio") return Object.keys(PulsingBorderAspectRatios);
	const maps = {
		dithering: {
			shape: DitheringShapes,
			type: DitheringTypes
		},
		"image-dithering": { type: DitheringTypes },
		"dot-grid": { shape: DotGridShapes },
		warp: { shape: WarpPatterns },
		"grain-gradient": { shape: GrainGradientShapes },
		"fluted-glass": {
			shape: GlassGridShapes,
			distortionShape: GlassDistortionShapes
		},
		"liquid-metal": { shape: LiquidMetalShapes },
		"halftone-dots": {
			type: HalftoneDotsTypes,
			grid: HalftoneDotsGrids
		}
	};
	return maps[preset]?.[field] ? Object.keys(maps[preset][field]) : void 0;
}
//#endregion
//#region src/source-color.ts
var clamp$1 = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
var names = {
	transparent: "#00000000",
	black: "#000000",
	white: "#ffffff",
	red: "#ff0000",
	green: "#008000",
	lime: "#00ff00",
	blue: "#0000ff",
	yellow: "#ffff00",
	cyan: "#00ffff",
	aqua: "#00ffff",
	magenta: "#ff00ff",
	fuchsia: "#ff00ff",
	gray: "#808080",
	grey: "#808080",
	silver: "#c0c0c0",
	maroon: "#800000",
	olive: "#808000",
	purple: "#800080",
	teal: "#008080",
	navy: "#000080",
	orange: "#ffa500"
};
function sourceColor(value) {
	let raw = value.trim().toLowerCase();
	raw = Object.hasOwn(names, raw) ? names[raw] : raw;
	let rgba;
	if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(raw)) {
		let hex = raw.slice(1);
		if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
		rgba = [
			0,
			2,
			4
		].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
		rgba.push(hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1);
	} else {
		const m = /^(rgba?|hsla?)\(([^()]*)\)$/.exec(raw);
		if (!m) return;
		const parts = m[2].trim().split(/[\s,/]+/);
		if (parts.length < 3 || parts.length > 4) return;
		const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(%|deg|turn|rad|grad)?$/;
		if (!parts.every((p) => numeric.test(p) && Number.isFinite(parseFloat(p)))) return;
		const alpha = parts[3] === void 0 ? 1 : parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1);
		if (parts[3] && /deg|turn|rad/.test(parts[3])) return;
		if (m[1].startsWith("rgb")) {
			if (parts.slice(0, 3).some((p) => /deg|turn|rad/.test(p))) return;
			rgba = parts.slice(0, 3).map((p) => clamp$1(parseFloat(p) / (p.endsWith("%") ? 100 : 255)));
			rgba.push(clamp$1(alpha));
		} else {
			if (!parts[1].endsWith("%") || !parts[2].endsWith("%") || parts[0].endsWith("%")) return;
			let h = parseFloat(parts[0]);
			if (parts[0].endsWith("turn")) h *= 360;
			else if (parts[0].endsWith("grad")) h *= .9;
			else if (parts[0].endsWith("rad")) h *= 180 / Math.PI;
			if (!Number.isFinite(h)) return;
			h = (h % 360 + 360) % 360 / 60;
			const s = clamp$1(parseFloat(parts[1]) / 100), l = clamp$1(parseFloat(parts[2]) / 100), c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h % 2 - 1)), base = l - c / 2;
			rgba = [...(h < 1 ? [
				c,
				x,
				0
			] : h < 2 ? [
				x,
				c,
				0
			] : h < 3 ? [
				0,
				c,
				x
			] : h < 4 ? [
				0,
				x,
				c
			] : h < 5 ? [
				x,
				0,
				c
			] : [
				c,
				0,
				x
			]).map((v) => v + base), clamp$1(alpha)];
		}
	}
	const [r, g, b, a] = rgba, max = Math.max(r, g, b), delta = max - Math.min(r, g, b);
	return {
		hueDeg: ((delta === 0 ? 0 : max === r ? (g - b) / delta % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 % 360 + 360) % 360,
		saturationPercent: max ? delta / max * 100 : 0,
		brightnessPercent: max * 100,
		alphaPercent: a * 100
	};
}
function sourceColorHex(color, alpha = true) {
	const h = (color.hueDeg % 360 + 360) % 360 / 60, s = clamp$1(color.saturationPercent / 100), v = clamp$1(color.brightnessPercent / 100), c = v * s, x = c * (1 - Math.abs(h % 2 - 1));
	const bytes = (h < 1 ? [
		c,
		x,
		0
	] : h < 2 ? [
		x,
		c,
		0
	] : h < 3 ? [
		0,
		c,
		x
	] : h < 4 ? [
		0,
		x,
		c
	] : h < 5 ? [
		x,
		0,
		c
	] : [
		c,
		0,
		x
	]).map((n) => n + v - c);
	if (alpha && color.alphaPercent < 100) bytes.push(clamp$1(color.alphaPercent / 100));
	return "#" + bytes.map((n) => Math.round(clamp$1(n) * 255).toString(16).padStart(2, "0")).join("");
}
//#endregion
//#region src/source-controls.ts
var COLOR_CHANNELS = [
	{
		key: "hueDeg",
		label: "Hue",
		min: 0,
		max: 360,
		unit: "°",
		step: .1
	},
	{
		key: "saturationPercent",
		label: "Saturation",
		min: 0,
		max: 100,
		unit: "%",
		step: .1
	},
	{
		key: "brightnessPercent",
		label: "Brightness",
		min: 0,
		max: 100,
		unit: "%",
		step: .1
	},
	{
		key: "alphaPercent",
		label: "Alpha",
		min: 0,
		max: 100,
		unit: "%",
		step: .1
	}
];
var label = (key) => key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
var parameterName = (name) => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name) && ![
	"constructor",
	"prototype",
	"__proto__",
	"style",
	"children",
	"ref",
	"image",
	"frame"
].includes(name);
/** Strict syntax bounds storage recovery; active source bindings bound actual values. */
function extendedSourceSpec(key) {
	const color = /^color:(fill|text|textBackground|tracker|chroma|gradient:(?:[0-9]|1[0-5])|shader:palette:[0-9]|shader:parameter:([a-zA-Z][a-zA-Z0-9_]{0,63})):(hueDeg|saturationPercent|brightnessPercent|alphaPercent)$/.exec(key);
	if (color && (!color[2] || parameterName(color[2]))) return {
		...COLOR_CHANNELS.find((c) => c.key === color[3]),
		key
	};
	const choice = /^choice:(textAlign|textItalic|fit|testPattern|gradientKind|drawingLoop|cameraMirror|cameraFlip|trackerStyle|trackerHand|shader:([a-zA-Z][a-zA-Z0-9_]{0,63}))$/.exec(key);
	if (choice && (!choice[2] || parameterName(choice[2]))) return {
		key,
		label: key,
		min: 0,
		max: 63,
		unit: "",
		step: 1,
		discrete: true
	};
}
function bindings(source, media) {
	const colors = [], choices = [];
	const color = (id, name, value, write, opacity, opaque = false) => {
		if (sourceColor(value)) colors.push({
			id,
			label: name,
			color: value,
			write,
			opacity,
			opaque
		});
	};
	const choice = (id, name, value, values, write) => {
		if (values.includes(value)) choices.push({
			id,
			label: name,
			value,
			values,
			write
		});
	};
	if (source.tracker || source.webcam) {
		const camera = source.tracker ?? source.webcam;
		for (const [id, name, key] of [[
			"cameraMirror",
			"Camera mirror",
			"mirror"
		], [
			"cameraFlip",
			"Camera flip",
			"flipY"
		]]) choice(id, name, camera[key], [false, true], (s, v) => source.tracker ? {
			...s,
			tracker: {
				...s.tracker,
				[key]: v
			}
		} : {
			...s,
			webcam: {
				...s.webcam,
				[key]: v
			}
		});
		if (source.tracker) {
			color("tracker", "Tracker color", source.tracker.color, (s, c) => ({
				...s,
				tracker: {
					...s.tracker,
					color: c
				}
			}));
			choice("trackerStyle", "Tracker style", source.tracker.style, [
				"skin",
				"silhouette",
				"wire",
				"metal"
			], (s, v) => ({
				...s,
				tracker: {
					...s.tracker,
					style: v
				}
			}));
			choice("trackerHand", "Tracker hand", source.tracker.hand, [
				"both",
				"left",
				"right"
			], (s, v) => ({
				...s,
				tracker: {
					...s.tracker,
					hand: v
				}
			}));
		}
	} else if (source.shader) {
		const shader = source.shader;
		shader.colors.slice(0, 10).forEach((c, i) => color(`shader:palette:${i}`, `Palette ${i + 1}`, c, (s, c) => ({
			...s,
			shader: {
				...s.shader,
				colors: s.shader.colors.map((old, n) => n === i ? c : old)
			}
		}), void 0, NATIVE_SHADER_IDS.has(shader.preset)));
		for (const [key, v] of Object.entries(shader.parameters).slice(0, 256)) {
			if (!parameterName(key)) continue;
			const options = shaderOptions(shader.preset, key);
			const write = (s, v) => ({
				...s,
				shader: {
					...s.shader,
					parameters: {
						...s.shader.parameters,
						[key]: v
					}
				}
			});
			if (options) choice(`shader:${key}`, `Shader ${label(key)}`, String(v), options, (s, v) => write(s, typeof shader.parameters[key] === "number" ? Number(v) : v));
			else if (typeof v === "boolean") choice(`shader:${key}`, `Shader ${label(key)}`, v, [false, true], write);
			else if (typeof v === "string") color(`shader:parameter:${key}`, `Shader ${label(key)}`, v, (s, c) => write(s, c));
		}
	} else if (source.drawing) {
		if (source.drawing.replay) choice("drawingLoop", "Drawing loop", source.drawing.replay.loop, [false, true], (s, v) => ({
			...s,
			drawing: {
				...s.drawing,
				replay: {
					...s.drawing.replay,
					loop: v
				}
			}
		}));
	} else if (source.testPattern) choice("testPattern", "Test pattern", source.testPattern, ["grid", "bars"], (s, v) => ({
		...s,
		testPattern: v
	}));
	else if (source.text) {
		color("text", "Text color", source.text.color, (s, c) => ({
			...s,
			text: {
				...s.text,
				color: c
			}
		}));
		color("textBackground", "Text background", source.text.background, (s, c) => ({
			...s,
			text: {
				...s.text,
				background: c
			}
		}));
		choice("textAlign", "Text alignment", source.text.align, [
			"left",
			"center",
			"right",
			"justify"
		], (s, v) => ({
			...s,
			text: {
				...s.text,
				align: v
			}
		}));
		choice("textItalic", "Text italic", source.text.italic ?? false, [false, true], (s, v) => ({
			...s,
			text: {
				...s.text,
				italic: v
			}
		}));
	} else if (source.fill || source.fillGradient) {
		if (source.fillGradient) {
			source.fillGradient.stops.slice(0, 16).forEach((stop, i) => color(`gradient:${i}`, `Gradient stop ${i + 1}`, stop.color, (s, c, a) => ({
				...s,
				fillGradient: {
					...s.fillGradient,
					stops: s.fillGradient.stops.map((old, n) => n === i ? {
						...old,
						color: c,
						opacity: a
					} : old)
				}
			}), stop.opacity));
			choice("gradientKind", "Gradient type", source.fillGradient.kind, ["linear", "radial"], (s, v) => ({
				...s,
				fillGradient: {
					...s.fillGradient,
					kind: v
				}
			}));
		} else if (source.fill) color("fill", "Fill color", source.fill, (s, c) => ({
			...s,
			fill: c
		}));
	} else if (source.mediaId && media?.kind !== "audio") {
		choice("fit", "Media fit", source.fit ?? "stretch", [
			"contain",
			"cover",
			"stretch"
		], (s, v) => ({
			...s,
			fit: v
		}));
		if (source.chromaKey?.enabled) color("chroma", "Key color", source.chromaKey.color, (s, c) => ({
			...s,
			chromaKey: {
				...s.chromaKey,
				color: c
			}
		}), void 0, true);
	}
	return {
		colors,
		choices
	};
}
function extendedSourceParameters(source, media) {
	const { colors, choices } = bindings(source, media);
	return [...colors.flatMap((b) => {
		const c = sourceColor(b.color);
		if (b.opacity !== void 0) c.alphaPercent = b.opacity * 100;
		return COLOR_CHANNELS.filter((ch) => !b.opaque || ch.key !== "alphaPercent").map((ch) => ({
			...ch,
			key: `color:${b.id}:${ch.key}`,
			label: `${b.label} · ${ch.label}`,
			base: c[ch.key],
			binding: b.id
		}));
	}), ...choices.map((b) => ({
		key: `choice:${b.id}`,
		label: b.label,
		min: 0,
		max: b.values.length - 1,
		step: 1,
		unit: "",
		base: b.values.indexOf(b.value),
		options: b.values.map((v) => typeof v === "boolean" ? v ? "On" : "Off" : label(String(v)))
	}))].slice(0, 242);
}
function writeExtendedSourceValues(source, values, media) {
	let next = source;
	const { colors, choices } = bindings(source, media);
	for (const b of colors) {
		const c = sourceColor(b.color);
		if (b.opacity !== void 0) c.alphaPercent = b.opacity * 100;
		let changed = false;
		for (const ch of COLOR_CHANNELS) {
			if (b.opaque && ch.key === "alphaPercent") continue;
			const v = values[`color:${b.id}:${ch.key}`];
			if (v === void 0 || !Number.isFinite(v)) continue;
			c[ch.key] = Math.min(ch.max, Math.max(ch.min, v));
			changed = true;
		}
		if (changed) next = b.write(next, sourceColorHex(c, !b.opaque && b.opacity === void 0), c.alphaPercent / 100);
	}
	for (const b of choices) {
		const v = values[`choice:${b.id}`];
		if (v !== void 0 && Number.isFinite(v)) next = b.write(next, b.values[Math.min(b.values.length - 1, Math.max(0, Math.round(v)))]);
	}
	return next;
}
//#endregion
//#region node_modules/@aether/sketch/dist-lib/curves.js
function samplePath(path, tolerance = .25) {
	const { points, curves, closed } = path;
	if (!curves?.some(Boolean)) return points;
	const result = [];
	const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	const flatten = (a, b, c, d, depth) => {
		const length = Math.hypot(d[0] - a[0], d[1] - a[1]);
		const deviation = (p) => length < 1e-8 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs((d[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (d[1] - a[1])) / length;
		const excess = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]) + Math.hypot(d[0] - c[0], d[1] - c[1]) - length;
		if (depth >= 10 || excess < tolerance && Math.max(deviation(b), deviation(c)) < tolerance) {
			result.push(a);
			return;
		}
		const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), center = mid(abc, bcd);
		flatten(a, ab, abc, center, depth + 1);
		flatten(center, bcd, cd, d, depth + 1);
	};
	points.slice(0, closed ? points.length : Math.max(0, points.length - 1)).forEach((a, i) => {
		const c = curves[i], b = points[(i + 1) % points.length];
		if (c) flatten(a, c.c1, c.c2, b, 0);
		else result.push(a);
	});
	if (!closed && points.length) result.push(points[points.length - 1]);
	return result;
}
//#endregion
//#region node_modules/@aether/sketch/dist-lib/paint.js
function isVectorGradient(value) {
	if (!value || typeof value !== "object") return false;
	const g = value;
	return ["linear", "radial"].includes(g.kind) && Number.isFinite(g.angleDeg) && Math.abs(g.angleDeg) <= 36e3 && Array.isArray(g.stops) && g.stops.length >= 2 && g.stops.length <= 16 && g.stops.every((s, i) => !!s && Number.isFinite(s.offset) && s.offset >= 0 && s.offset <= 1 && (!i || s.offset >= g.stops[i - 1].offset) && typeof s.color === "string" && /^#[\da-f]{6}$/i.test(s.color) && Number.isFinite(s.opacity) && s.opacity >= 0 && s.opacity <= 1);
}
//#endregion
//#region node_modules/splaytree/dist/splaytree.js
var f = class {
	constructor(t, e) {
		this.next = null, this.key = t, this.data = e, this.left = null, this.right = null;
	}
};
function d(n, t) {
	return n > t ? 1 : n < t ? -1 : 0;
}
function u$3(n, t, e) {
	const r = new f(null, null);
	let l = r, i = r;
	for (;;) {
		const o = e(n, t.key);
		if (o < 0) {
			if (t.left === null) break;
			if (e(n, t.left.key) < 0) {
				const s = t.left;
				if (t.left = s.right, s.right = t, t = s, t.left === null) break;
			}
			i.left = t, i = t, t = t.left;
		} else if (o > 0) {
			if (t.right === null) break;
			if (e(n, t.right.key) > 0) {
				const s = t.right;
				if (t.right = s.left, s.left = t, t = s, t.right === null) break;
			}
			l.right = t, l = t, t = t.right;
		} else break;
	}
	return l.right = t.left, i.left = t.right, t.left = r.right, t.right = r.left, t;
}
function c(n, t, e, r) {
	const l = new f(n, t);
	if (e === null) return l.left = l.right = null, l;
	e = u$3(n, e, r);
	const i = r(n, e.key);
	return i < 0 ? (l.left = e.left, l.right = e, e.left = null) : i >= 0 && (l.right = e.right, l.left = e, e.right = null), l;
}
function m(n, t, e) {
	let r = null, l = null;
	if (t) {
		t = u$3(n, t, e);
		const i = e(t.key, n);
		i === 0 ? (r = t.left, l = t.right) : i < 0 ? (l = t.right, t.right = null, r = t) : (r = t.left, t.left = null, l = t);
	}
	return {
		left: r,
		right: l
	};
}
function w(n, t, e) {
	return t === null ? n : (n === null || (t = u$3(n.key, t, e), t.left = n), t);
}
function _(n, t, e, r, l) {
	if (n) {
		r(`${t}${e ? "└── " : "├── "}${l(n)}
`);
		const i = t + (e ? "    " : "│   ");
		n.left && _(n.left, i, !1, r, l), n.right && _(n.right, i, !0, r, l);
	}
}
var z = class {
	constructor(t = d) {
		this._root = null, this._size = 0, this._comparator = t;
	}
	/**
	* Inserts a key, allows duplicates
	*/
	insert(t, e) {
		return this._size++, this._root = c(t, e, this._root, this._comparator);
	}
	/**
	* Adds a key, if it is not present in the tree
	*/
	add(t, e) {
		const r = new f(t, e);
		this._root === null && (r.left = r.right = null, this._size++, this._root = r);
		const l = this._comparator, i = u$3(t, this._root, l), o = l(t, i.key);
		return o === 0 ? this._root = i : (o < 0 ? (r.left = i.left, r.right = i, i.left = null) : o > 0 && (r.right = i.right, r.left = i, i.right = null), this._size++, this._root = r), this._root;
	}
	/**
	* @param  {Key} key
	* @return {Node|null}
	*/
	remove(t) {
		this._root = this._remove(t, this._root, this._comparator);
	}
	/**
	* Deletes i from the tree if it's there
	*/
	_remove(t, e, r) {
		let l;
		return e === null ? null : (e = u$3(t, e, r), r(t, e.key) === 0 ? (e.left === null ? l = e.right : (l = u$3(t, e.left, r), l.right = e.right), this._size--, l) : e);
	}
	/**
	* Removes and returns the node with smallest key
	*/
	pop() {
		let t = this._root;
		if (t) {
			for (; t.left;) t = t.left;
			return this._root = u$3(t.key, this._root, this._comparator), this._root = this._remove(t.key, this._root, this._comparator), {
				key: t.key,
				data: t.data
			};
		}
		return null;
	}
	/**
	* Find without splaying
	*/
	findStatic(t) {
		let e = this._root;
		const r = this._comparator;
		for (; e;) {
			const l = r(t, e.key);
			if (l === 0) return e;
			l < 0 ? e = e.left : e = e.right;
		}
		return null;
	}
	find(t) {
		return this._root && (this._root = u$3(t, this._root, this._comparator), this._comparator(t, this._root.key) !== 0) ? null : this._root;
	}
	contains(t) {
		let e = this._root;
		const r = this._comparator;
		for (; e;) {
			const l = r(t, e.key);
			if (l === 0) return !0;
			l < 0 ? e = e.left : e = e.right;
		}
		return !1;
	}
	forEach(t, e) {
		let r = this._root;
		const l = [];
		let i = !1;
		for (; !i;) r !== null ? (l.push(r), r = r.left) : l.length !== 0 ? (r = l.pop(), t.call(e, r), r = r.right) : i = !0;
		return this;
	}
	/**
	* Walk key range from `low` to `high`. Stops if `fn` returns a value.
	*/
	range(t, e, r, l) {
		const i = [], o = this._comparator;
		let s = this._root, h;
		for (; i.length !== 0 || s;) if (s) i.push(s), s = s.left;
		else {
			if (s = i.pop(), h = o(s.key, e), h > 0) break;
			if (o(s.key, t) >= 0 && r.call(l, s)) return this;
			s = s.right;
		}
		return this;
	}
	/**
	* Returns array of keys
	*/
	keys() {
		const t = [];
		return this.forEach(({ key: e }) => {
			t.push(e);
		}), t;
	}
	/**
	* Returns array of all the data in the nodes
	*/
	values() {
		const t = [];
		return this.forEach(({ data: e }) => {
			t.push(e);
		}), t;
	}
	min() {
		return this._root ? this.minNode(this._root).key : null;
	}
	max() {
		return this._root ? this.maxNode(this._root).key : null;
	}
	minNode(t = this._root) {
		if (t) for (; t.left;) t = t.left;
		return t;
	}
	maxNode(t = this._root) {
		if (t) for (; t.right;) t = t.right;
		return t;
	}
	/**
	* Returns node at given index
	*/
	at(t) {
		let e = this._root, r = !1, l = 0;
		const i = [];
		for (; !r;) if (e) i.push(e), e = e.left;
		else if (i.length > 0) {
			if (e = i.pop(), l === t) return e;
			l++, e = e.right;
		} else r = !0;
		return null;
	}
	next(t) {
		let e = this._root, r = null;
		if (t.right) {
			for (r = t.right; r.left;) r = r.left;
			return r;
		}
		const l = this._comparator;
		for (; e;) {
			const i = l(t.key, e.key);
			if (i === 0) break;
			i < 0 ? (r = e, e = e.left) : e = e.right;
		}
		return r;
	}
	prev(t) {
		let e = this._root, r = null;
		if (t.left !== null) {
			for (r = t.left; r.right;) r = r.right;
			return r;
		}
		const l = this._comparator;
		for (; e;) {
			const i = l(t.key, e.key);
			if (i === 0) break;
			i < 0 ? e = e.left : (r = e, e = e.right);
		}
		return r;
	}
	clear() {
		return this._root = null, this._size = 0, this;
	}
	toList() {
		return k(this._root);
	}
	/**
	* Bulk-load items. Both array have to be same size
	*/
	load(t, e = [], r = !1) {
		let l = t.length;
		const i = this._comparator;
		if (r && g(t, e, 0, l - 1, i), this._root === null) this._root = a(t, e, 0, l), this._size = l;
		else {
			const o = y(this.toList(), x(t, e), i);
			l = this._size + l, this._root = p({ head: o }, 0, l);
		}
		return this;
	}
	isEmpty() {
		return this._root === null;
	}
	get size() {
		return this._size;
	}
	get root() {
		return this._root;
	}
	toString(t = (e) => String(e.key)) {
		const e = [];
		return _(this._root, "", !0, (r) => e.push(r), t), e.join("");
	}
	update(t, e, r) {
		const l = this._comparator;
		let { left: i, right: o } = m(t, this._root, l);
		l(t, e) < 0 ? o = c(e, r, o, l) : i = c(e, r, i, l), this._root = w(i, o, l);
	}
	split(t) {
		return m(t, this._root, this._comparator);
	}
	*[Symbol.iterator]() {
		let t = this._root;
		const e = [];
		let r = !1;
		for (; !r;) t !== null ? (e.push(t), t = t.left) : e.length !== 0 ? (t = e.pop(), yield t, t = t.right) : r = !0;
	}
};
function a(n, t, e, r) {
	const l = r - e;
	if (l > 0) {
		const i = e + Math.floor(l / 2), o = n[i], s = t[i], h = new f(o, s);
		return h.left = a(n, t, e, i), h.right = a(n, t, i + 1, r), h;
	}
	return null;
}
function x(n, t) {
	const e = new f(null, null);
	let r = e;
	for (let l = 0; l < n.length; l++) r = r.next = new f(n[l], t[l]);
	return r.next = null, e.next;
}
function k(n) {
	let t = n;
	const e = [];
	let r = !1;
	const l = new f(null, null);
	let i = l;
	for (; !r;) t ? (e.push(t), t = t.left) : e.length > 0 ? (t = i = i.next = e.pop(), t = t.right) : r = !0;
	return i.next = null, l.next;
}
function p(n, t, e) {
	const r = e - t;
	if (r > 0) {
		const l = t + Math.floor(r / 2), i = p(n, t, l), o = n.head;
		return o.left = i, n.head = n.head.next, o.right = p(n, l + 1, e), o;
	}
	return null;
}
function y(n, t, e) {
	const r = new f(null, null);
	let l = r, i = n, o = t;
	for (; i !== null && o !== null;) e(i.key, o.key) < 0 ? (l.next = i, i = i.next) : (l.next = o, o = o.next), l = l.next;
	return i !== null ? l.next = i : o !== null && (l.next = o), r.next;
}
function g(n, t, e, r, l) {
	if (e >= r) return;
	const i = n[e + r >> 1];
	let o = e - 1, s = r + 1;
	for (;;) {
		do
			o++;
		while (l(n[o], i) < 0);
		do
			s--;
		while (l(n[s], i) > 0);
		if (o >= s) break;
		let h = n[o];
		n[o] = n[s], n[s] = h, h = t[o], t[o] = t[s], t[s] = h;
	}
	g(n, t, e, s, l), g(n, t, s + 1, r, l);
}
//#endregion
//#region node_modules/robust-predicates/esm/util.js
var epsilon$1 = 11102230246251565e-32;
var splitter = 134217729;
var resulterrbound = 3.000000000000001 * epsilon$1;
function sum(elen, e, flen, f, h) {
	let Q, Qnew, hh, bvirt;
	let enow = e[0];
	let fnow = f[0];
	let eindex = 0;
	let findex = 0;
	if (fnow > enow === fnow > -enow) {
		Q = enow;
		enow = e[++eindex];
	} else {
		Q = fnow;
		fnow = f[++findex];
	}
	let hindex = 0;
	if (eindex < elen && findex < flen) {
		if (fnow > enow === fnow > -enow) {
			Qnew = enow + Q;
			hh = Q - (Qnew - enow);
			enow = e[++eindex];
		} else {
			Qnew = fnow + Q;
			hh = Q - (Qnew - fnow);
			fnow = f[++findex];
		}
		Q = Qnew;
		if (hh !== 0) h[hindex++] = hh;
		while (eindex < elen && findex < flen) {
			if (fnow > enow === fnow > -enow) {
				Qnew = Q + enow;
				bvirt = Qnew - Q;
				hh = Q - (Qnew - bvirt) + (enow - bvirt);
				enow = e[++eindex];
			} else {
				Qnew = Q + fnow;
				bvirt = Qnew - Q;
				hh = Q - (Qnew - bvirt) + (fnow - bvirt);
				fnow = f[++findex];
			}
			Q = Qnew;
			if (hh !== 0) h[hindex++] = hh;
		}
	}
	while (eindex < elen) {
		Qnew = Q + enow;
		bvirt = Qnew - Q;
		hh = Q - (Qnew - bvirt) + (enow - bvirt);
		enow = e[++eindex];
		Q = Qnew;
		if (hh !== 0) h[hindex++] = hh;
	}
	while (findex < flen) {
		Qnew = Q + fnow;
		bvirt = Qnew - Q;
		hh = Q - (Qnew - bvirt) + (fnow - bvirt);
		fnow = f[++findex];
		Q = Qnew;
		if (hh !== 0) h[hindex++] = hh;
	}
	if (Q !== 0 || hindex === 0) h[hindex++] = Q;
	return hindex;
}
function estimate(elen, e) {
	let Q = e[0];
	for (let i = 1; i < elen; i++) Q += e[i];
	return Q;
}
function vec(n) {
	return new Float64Array(n);
}
//#endregion
//#region node_modules/robust-predicates/esm/orient2d.js
var ccwerrboundA = (3 + 16 * epsilon$1) * epsilon$1;
var ccwerrboundB = (2 + 12 * epsilon$1) * epsilon$1;
var ccwerrboundC = (9 + 64 * epsilon$1) * epsilon$1 * epsilon$1;
var B = vec(4);
var C1 = vec(8);
var C2 = vec(12);
var D = vec(16);
var u$2 = vec(4);
function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
	let acxtail, acytail, bcxtail, bcytail;
	let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;
	const acx = ax - cx;
	const bcx = bx - cx;
	const acy = ay - cy;
	const bcy = by - cy;
	s1 = acx * bcy;
	c = splitter * acx;
	ahi = c - (c - acx);
	alo = acx - ahi;
	c = splitter * bcy;
	bhi = c - (c - bcy);
	blo = bcy - bhi;
	s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
	t1 = acy * bcx;
	c = splitter * acy;
	ahi = c - (c - acy);
	alo = acy - ahi;
	c = splitter * bcx;
	bhi = c - (c - bcx);
	blo = bcx - bhi;
	t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
	_i = s0 - t0;
	bvirt = s0 - _i;
	B[0] = s0 - (_i + bvirt) + (bvirt - t0);
	_j = s1 + _i;
	bvirt = _j - s1;
	_0 = s1 - (_j - bvirt) + (_i - bvirt);
	_i = _0 - t1;
	bvirt = _0 - _i;
	B[1] = _0 - (_i + bvirt) + (bvirt - t1);
	u3 = _j + _i;
	bvirt = u3 - _j;
	B[2] = _j - (u3 - bvirt) + (_i - bvirt);
	B[3] = u3;
	let det = estimate(4, B);
	let errbound = ccwerrboundB * detsum;
	if (det >= errbound || -det >= errbound) return det;
	bvirt = ax - acx;
	acxtail = ax - (acx + bvirt) + (bvirt - cx);
	bvirt = bx - bcx;
	bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
	bvirt = ay - acy;
	acytail = ay - (acy + bvirt) + (bvirt - cy);
	bvirt = by - bcy;
	bcytail = by - (bcy + bvirt) + (bvirt - cy);
	if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) return det;
	errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
	det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
	if (det >= errbound || -det >= errbound) return det;
	s1 = acxtail * bcy;
	c = splitter * acxtail;
	ahi = c - (c - acxtail);
	alo = acxtail - ahi;
	c = splitter * bcy;
	bhi = c - (c - bcy);
	blo = bcy - bhi;
	s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
	t1 = acytail * bcx;
	c = splitter * acytail;
	ahi = c - (c - acytail);
	alo = acytail - ahi;
	c = splitter * bcx;
	bhi = c - (c - bcx);
	blo = bcx - bhi;
	t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
	_i = s0 - t0;
	bvirt = s0 - _i;
	u$2[0] = s0 - (_i + bvirt) + (bvirt - t0);
	_j = s1 + _i;
	bvirt = _j - s1;
	_0 = s1 - (_j - bvirt) + (_i - bvirt);
	_i = _0 - t1;
	bvirt = _0 - _i;
	u$2[1] = _0 - (_i + bvirt) + (bvirt - t1);
	u3 = _j + _i;
	bvirt = u3 - _j;
	u$2[2] = _j - (u3 - bvirt) + (_i - bvirt);
	u$2[3] = u3;
	const C1len = sum(4, B, 4, u$2, C1);
	s1 = acx * bcytail;
	c = splitter * acx;
	ahi = c - (c - acx);
	alo = acx - ahi;
	c = splitter * bcytail;
	bhi = c - (c - bcytail);
	blo = bcytail - bhi;
	s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
	t1 = acy * bcxtail;
	c = splitter * acy;
	ahi = c - (c - acy);
	alo = acy - ahi;
	c = splitter * bcxtail;
	bhi = c - (c - bcxtail);
	blo = bcxtail - bhi;
	t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
	_i = s0 - t0;
	bvirt = s0 - _i;
	u$2[0] = s0 - (_i + bvirt) + (bvirt - t0);
	_j = s1 + _i;
	bvirt = _j - s1;
	_0 = s1 - (_j - bvirt) + (_i - bvirt);
	_i = _0 - t1;
	bvirt = _0 - _i;
	u$2[1] = _0 - (_i + bvirt) + (bvirt - t1);
	u3 = _j + _i;
	bvirt = u3 - _j;
	u$2[2] = _j - (u3 - bvirt) + (_i - bvirt);
	u$2[3] = u3;
	const C2len = sum(C1len, C1, 4, u$2, C2);
	s1 = acxtail * bcytail;
	c = splitter * acxtail;
	ahi = c - (c - acxtail);
	alo = acxtail - ahi;
	c = splitter * bcytail;
	bhi = c - (c - bcytail);
	blo = bcytail - bhi;
	s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
	t1 = acytail * bcxtail;
	c = splitter * acytail;
	ahi = c - (c - acytail);
	alo = acytail - ahi;
	c = splitter * bcxtail;
	bhi = c - (c - bcxtail);
	blo = bcxtail - bhi;
	t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
	_i = s0 - t0;
	bvirt = s0 - _i;
	u$2[0] = s0 - (_i + bvirt) + (bvirt - t0);
	_j = s1 + _i;
	bvirt = _j - s1;
	_0 = s1 - (_j - bvirt) + (_i - bvirt);
	_i = _0 - t1;
	bvirt = _0 - _i;
	u$2[1] = _0 - (_i + bvirt) + (bvirt - t1);
	u3 = _j + _i;
	bvirt = u3 - _j;
	u$2[2] = _j - (u3 - bvirt) + (_i - bvirt);
	u$2[3] = u3;
	return D[sum(C2len, C2, 4, u$2, D) - 1];
}
function orient2d(ax, ay, bx, by, cx, cy) {
	const detleft = (ay - cy) * (bx - cx);
	const detright = (ax - cx) * (by - cy);
	const det = detleft - detright;
	const detsum = Math.abs(detleft + detright);
	if (Math.abs(det) >= ccwerrboundA * detsum) return det;
	return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}
(7 + 56 * epsilon$1) * epsilon$1;
(3 + 28 * epsilon$1) * epsilon$1;
(26 + 288 * epsilon$1) * epsilon$1 * epsilon$1;
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(8);
vec(8);
vec(8);
vec(4);
vec(8);
vec(8);
vec(16);
vec(12);
vec(192);
vec(192);
(10 + 96 * epsilon$1) * epsilon$1;
(4 + 48 * epsilon$1) * epsilon$1;
(44 + 576 * epsilon$1) * epsilon$1 * epsilon$1;
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(8);
vec(8);
vec(8);
vec(8);
vec(8);
vec(8);
vec(8);
vec(8);
vec(8);
vec(4);
vec(4);
vec(4);
vec(8);
vec(16);
vec(16);
vec(16);
vec(32);
vec(32);
vec(48);
vec(64);
vec(1152);
vec(1152);
(16 + 224 * epsilon$1) * epsilon$1;
(5 + 72 * epsilon$1) * epsilon$1;
(71 + 1408 * epsilon$1) * epsilon$1 * epsilon$1;
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(4);
vec(24);
vec(24);
vec(24);
vec(24);
vec(24);
vec(24);
vec(24);
vec(24);
vec(24);
vec(24);
vec(1152);
vec(1152);
vec(1152);
vec(1152);
vec(1152);
vec(2304);
vec(2304);
vec(3456);
vec(5760);
vec(8);
vec(8);
vec(8);
vec(16);
vec(24);
vec(48);
vec(48);
vec(96);
vec(192);
vec(384);
vec(384);
vec(384);
vec(768);
vec(96);
vec(96);
vec(96);
vec(1152);
//#endregion
//#region node_modules/polygon-clipping/dist/polygon-clipping.esm.js
/**
* A bounding box has the format:
*
*  { ll: { x: xmin, y: ymin }, ur: { x: xmax, y: ymax } }
*
*/
var isInBbox = (bbox, point) => {
	return bbox.ll.x <= point.x && point.x <= bbox.ur.x && bbox.ll.y <= point.y && point.y <= bbox.ur.y;
};
var getBboxOverlap = (b1, b2) => {
	if (b2.ur.x < b1.ll.x || b1.ur.x < b2.ll.x || b2.ur.y < b1.ll.y || b1.ur.y < b2.ll.y) return null;
	const lowerX = b1.ll.x < b2.ll.x ? b2.ll.x : b1.ll.x;
	const upperX = b1.ur.x < b2.ur.x ? b1.ur.x : b2.ur.x;
	const lowerY = b1.ll.y < b2.ll.y ? b2.ll.y : b1.ll.y;
	const upperY = b1.ur.y < b2.ur.y ? b1.ur.y : b2.ur.y;
	return {
		ll: {
			x: lowerX,
			y: lowerY
		},
		ur: {
			x: upperX,
			y: upperY
		}
	};
};
var epsilon = Number.EPSILON;
if (epsilon === void 0) epsilon = Math.pow(2, -52);
var EPSILON_SQ = epsilon * epsilon;
var cmp = (a, b) => {
	if (-epsilon < a && a < epsilon) {
		if (-epsilon < b && b < epsilon) return 0;
	}
	const ab = a - b;
	if (ab * ab < EPSILON_SQ * a * b) return 0;
	return a < b ? -1 : 1;
};
/**
* This class rounds incoming values sufficiently so that
* floating points problems are, for the most part, avoided.
*
* Incoming points are have their x & y values tested against
* all previously seen x & y values. If either is 'too close'
* to a previously seen value, it's value is 'snapped' to the
* previously seen value.
*
* All points should be rounded by this class before being
* stored in any data structures in the rest of this algorithm.
*/
var PtRounder = class {
	constructor() {
		this.reset();
	}
	reset() {
		this.xRounder = new CoordRounder();
		this.yRounder = new CoordRounder();
	}
	round(x, y) {
		return {
			x: this.xRounder.round(x),
			y: this.yRounder.round(y)
		};
	}
};
var CoordRounder = class {
	constructor() {
		this.tree = new z();
		this.round(0);
	}
	round(coord) {
		const node = this.tree.add(coord);
		const prevNode = this.tree.prev(node);
		if (prevNode !== null && cmp(node.key, prevNode.key) === 0) {
			this.tree.remove(coord);
			return prevNode.key;
		}
		const nextNode = this.tree.next(node);
		if (nextNode !== null && cmp(node.key, nextNode.key) === 0) {
			this.tree.remove(coord);
			return nextNode.key;
		}
		return coord;
	}
};
var rounder = new PtRounder();
var crossProduct = (a, b) => a.x * b.y - a.y * b.x;
var dotProduct = (a, b) => a.x * b.x + a.y * b.y;
var compareVectorAngles = (basePt, endPt1, endPt2) => {
	const res = orient2d(basePt.x, basePt.y, endPt1.x, endPt1.y, endPt2.x, endPt2.y);
	if (res > 0) return -1;
	if (res < 0) return 1;
	return 0;
};
var length = (v) => Math.sqrt(dotProduct(v, v));
var sineOfAngle = (pShared, pBase, pAngle) => {
	const vBase = {
		x: pBase.x - pShared.x,
		y: pBase.y - pShared.y
	};
	const vAngle = {
		x: pAngle.x - pShared.x,
		y: pAngle.y - pShared.y
	};
	return crossProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
var cosineOfAngle = (pShared, pBase, pAngle) => {
	const vBase = {
		x: pBase.x - pShared.x,
		y: pBase.y - pShared.y
	};
	const vAngle = {
		x: pAngle.x - pShared.x,
		y: pAngle.y - pShared.y
	};
	return dotProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
var horizontalIntersection = (pt, v, y) => {
	if (v.y === 0) return null;
	return {
		x: pt.x + v.x / v.y * (y - pt.y),
		y
	};
};
var verticalIntersection = (pt, v, x) => {
	if (v.x === 0) return null;
	return {
		x,
		y: pt.y + v.y / v.x * (x - pt.x)
	};
};
var intersection$1 = (pt1, v1, pt2, v2) => {
	if (v1.x === 0) return verticalIntersection(pt2, v2, pt1.x);
	if (v2.x === 0) return verticalIntersection(pt1, v1, pt2.x);
	if (v1.y === 0) return horizontalIntersection(pt2, v2, pt1.y);
	if (v2.y === 0) return horizontalIntersection(pt1, v1, pt2.y);
	const kross = crossProduct(v1, v2);
	if (kross == 0) return null;
	const ve = {
		x: pt2.x - pt1.x,
		y: pt2.y - pt1.y
	};
	const d1 = crossProduct(ve, v1) / kross;
	const d2 = crossProduct(ve, v2) / kross;
	const x1 = pt1.x + d2 * v1.x, x2 = pt2.x + d1 * v2.x;
	const y1 = pt1.y + d2 * v1.y, y2 = pt2.y + d1 * v2.y;
	return {
		x: (x1 + x2) / 2,
		y: (y1 + y2) / 2
	};
};
var SweepEvent = class SweepEvent {
	static compare(a, b) {
		const ptCmp = SweepEvent.comparePoints(a.point, b.point);
		if (ptCmp !== 0) return ptCmp;
		if (a.point !== b.point) a.link(b);
		if (a.isLeft !== b.isLeft) return a.isLeft ? 1 : -1;
		return Segment.compare(a.segment, b.segment);
	}
	static comparePoints(aPt, bPt) {
		if (aPt.x < bPt.x) return -1;
		if (aPt.x > bPt.x) return 1;
		if (aPt.y < bPt.y) return -1;
		if (aPt.y > bPt.y) return 1;
		return 0;
	}
	constructor(point, isLeft) {
		if (point.events === void 0) point.events = [this];
		else point.events.push(this);
		this.point = point;
		this.isLeft = isLeft;
	}
	link(other) {
		if (other.point === this.point) throw new Error("Tried to link already linked events");
		const otherEvents = other.point.events;
		for (let i = 0, iMax = otherEvents.length; i < iMax; i++) {
			const evt = otherEvents[i];
			this.point.events.push(evt);
			evt.point = this.point;
		}
		this.checkForConsuming();
	}
	checkForConsuming() {
		const numEvents = this.point.events.length;
		for (let i = 0; i < numEvents; i++) {
			const evt1 = this.point.events[i];
			if (evt1.segment.consumedBy !== void 0) continue;
			for (let j = i + 1; j < numEvents; j++) {
				const evt2 = this.point.events[j];
				if (evt2.consumedBy !== void 0) continue;
				if (evt1.otherSE.point.events !== evt2.otherSE.point.events) continue;
				evt1.segment.consume(evt2.segment);
			}
		}
	}
	getAvailableLinkedEvents() {
		const events = [];
		for (let i = 0, iMax = this.point.events.length; i < iMax; i++) {
			const evt = this.point.events[i];
			if (evt !== this && !evt.segment.ringOut && evt.segment.isInResult()) events.push(evt);
		}
		return events;
	}
	/**
	* Returns a comparator function for sorting linked events that will
	* favor the event that will give us the smallest left-side angle.
	* All ring construction starts as low as possible heading to the right,
	* so by always turning left as sharp as possible we'll get polygons
	* without uncessary loops & holes.
	*
	* The comparator function has a compute cache such that it avoids
	* re-computing already-computed values.
	*/
	getLeftmostComparator(baseEvent) {
		const cache = /* @__PURE__ */ new Map();
		const fillCache = (linkedEvent) => {
			const nextEvent = linkedEvent.otherSE;
			cache.set(linkedEvent, {
				sine: sineOfAngle(this.point, baseEvent.point, nextEvent.point),
				cosine: cosineOfAngle(this.point, baseEvent.point, nextEvent.point)
			});
		};
		return (a, b) => {
			if (!cache.has(a)) fillCache(a);
			if (!cache.has(b)) fillCache(b);
			const { sine: asine, cosine: acosine } = cache.get(a);
			const { sine: bsine, cosine: bcosine } = cache.get(b);
			if (asine >= 0 && bsine >= 0) {
				if (acosine < bcosine) return 1;
				if (acosine > bcosine) return -1;
				return 0;
			}
			if (asine < 0 && bsine < 0) {
				if (acosine < bcosine) return -1;
				if (acosine > bcosine) return 1;
				return 0;
			}
			if (bsine < asine) return -1;
			if (bsine > asine) return 1;
			return 0;
		};
	}
};
var segmentId = 0;
var Segment = class Segment {
	static compare(a, b) {
		const alx = a.leftSE.point.x;
		const blx = b.leftSE.point.x;
		const arx = a.rightSE.point.x;
		const brx = b.rightSE.point.x;
		if (brx < alx) return 1;
		if (arx < blx) return -1;
		const aly = a.leftSE.point.y;
		const bly = b.leftSE.point.y;
		const ary = a.rightSE.point.y;
		const bry = b.rightSE.point.y;
		if (alx < blx) {
			if (bly < aly && bly < ary) return 1;
			if (bly > aly && bly > ary) return -1;
			const aCmpBLeft = a.comparePoint(b.leftSE.point);
			if (aCmpBLeft < 0) return 1;
			if (aCmpBLeft > 0) return -1;
			const bCmpARight = b.comparePoint(a.rightSE.point);
			if (bCmpARight !== 0) return bCmpARight;
			return -1;
		}
		if (alx > blx) {
			if (aly < bly && aly < bry) return -1;
			if (aly > bly && aly > bry) return 1;
			const bCmpALeft = b.comparePoint(a.leftSE.point);
			if (bCmpALeft !== 0) return bCmpALeft;
			const aCmpBRight = a.comparePoint(b.rightSE.point);
			if (aCmpBRight < 0) return 1;
			if (aCmpBRight > 0) return -1;
			return 1;
		}
		if (aly < bly) return -1;
		if (aly > bly) return 1;
		if (arx < brx) {
			const bCmpARight = b.comparePoint(a.rightSE.point);
			if (bCmpARight !== 0) return bCmpARight;
		}
		if (arx > brx) {
			const aCmpBRight = a.comparePoint(b.rightSE.point);
			if (aCmpBRight < 0) return 1;
			if (aCmpBRight > 0) return -1;
		}
		if (arx !== brx) {
			const ay = ary - aly;
			const ax = arx - alx;
			const by = bry - bly;
			const bx = brx - blx;
			if (ay > ax && by < bx) return 1;
			if (ay < ax && by > bx) return -1;
		}
		if (arx > brx) return 1;
		if (arx < brx) return -1;
		if (ary < bry) return -1;
		if (ary > bry) return 1;
		if (a.id < b.id) return -1;
		if (a.id > b.id) return 1;
		return 0;
	}
	constructor(leftSE, rightSE, rings, windings) {
		this.id = ++segmentId;
		this.leftSE = leftSE;
		leftSE.segment = this;
		leftSE.otherSE = rightSE;
		this.rightSE = rightSE;
		rightSE.segment = this;
		rightSE.otherSE = leftSE;
		this.rings = rings;
		this.windings = windings;
	}
	static fromRing(pt1, pt2, ring) {
		let leftPt, rightPt, winding;
		const cmpPts = SweepEvent.comparePoints(pt1, pt2);
		if (cmpPts < 0) {
			leftPt = pt1;
			rightPt = pt2;
			winding = 1;
		} else if (cmpPts > 0) {
			leftPt = pt2;
			rightPt = pt1;
			winding = -1;
		} else throw new Error(`Tried to create degenerate segment at [${pt1.x}, ${pt1.y}]`);
		const leftSE = new SweepEvent(leftPt, true);
		const rightSE = new SweepEvent(rightPt, false);
		return new Segment(leftSE, rightSE, [ring], [winding]);
	}
	replaceRightSE(newRightSE) {
		this.rightSE = newRightSE;
		this.rightSE.segment = this;
		this.rightSE.otherSE = this.leftSE;
		this.leftSE.otherSE = this.rightSE;
	}
	bbox() {
		const y1 = this.leftSE.point.y;
		const y2 = this.rightSE.point.y;
		return {
			ll: {
				x: this.leftSE.point.x,
				y: y1 < y2 ? y1 : y2
			},
			ur: {
				x: this.rightSE.point.x,
				y: y1 > y2 ? y1 : y2
			}
		};
	}
	vector() {
		return {
			x: this.rightSE.point.x - this.leftSE.point.x,
			y: this.rightSE.point.y - this.leftSE.point.y
		};
	}
	isAnEndpoint(pt) {
		return pt.x === this.leftSE.point.x && pt.y === this.leftSE.point.y || pt.x === this.rightSE.point.x && pt.y === this.rightSE.point.y;
	}
	comparePoint(point) {
		if (this.isAnEndpoint(point)) return 0;
		const lPt = this.leftSE.point;
		const rPt = this.rightSE.point;
		const v = this.vector();
		if (lPt.x === rPt.x) {
			if (point.x === lPt.x) return 0;
			return point.x < lPt.x ? 1 : -1;
		}
		const yDist = (point.y - lPt.y) / v.y;
		const xFromYDist = lPt.x + yDist * v.x;
		if (point.x === xFromYDist) return 0;
		const xDist = (point.x - lPt.x) / v.x;
		const yFromXDist = lPt.y + xDist * v.y;
		if (point.y === yFromXDist) return 0;
		return point.y < yFromXDist ? -1 : 1;
	}
	/**
	* Given another segment, returns the first non-trivial intersection
	* between the two segments (in terms of sweep line ordering), if it exists.
	*
	* A 'non-trivial' intersection is one that will cause one or both of the
	* segments to be split(). As such, 'trivial' vs. 'non-trivial' intersection:
	*
	*   * endpoint of segA with endpoint of segB --> trivial
	*   * endpoint of segA with point along segB --> non-trivial
	*   * endpoint of segB with point along segA --> non-trivial
	*   * point along segA with point along segB --> non-trivial
	*
	* If no non-trivial intersection exists, return null
	* Else, return null.
	*/
	getIntersection(other) {
		const tBbox = this.bbox();
		const oBbox = other.bbox();
		const bboxOverlap = getBboxOverlap(tBbox, oBbox);
		if (bboxOverlap === null) return null;
		const tlp = this.leftSE.point;
		const trp = this.rightSE.point;
		const olp = other.leftSE.point;
		const orp = other.rightSE.point;
		const touchesOtherLSE = isInBbox(tBbox, olp) && this.comparePoint(olp) === 0;
		const touchesThisLSE = isInBbox(oBbox, tlp) && other.comparePoint(tlp) === 0;
		const touchesOtherRSE = isInBbox(tBbox, orp) && this.comparePoint(orp) === 0;
		const touchesThisRSE = isInBbox(oBbox, trp) && other.comparePoint(trp) === 0;
		if (touchesThisLSE && touchesOtherLSE) {
			if (touchesThisRSE && !touchesOtherRSE) return trp;
			if (!touchesThisRSE && touchesOtherRSE) return orp;
			return null;
		}
		if (touchesThisLSE) {
			if (touchesOtherRSE) {
				if (tlp.x === orp.x && tlp.y === orp.y) return null;
			}
			return tlp;
		}
		if (touchesOtherLSE) {
			if (touchesThisRSE) {
				if (trp.x === olp.x && trp.y === olp.y) return null;
			}
			return olp;
		}
		if (touchesThisRSE && touchesOtherRSE) return null;
		if (touchesThisRSE) return trp;
		if (touchesOtherRSE) return orp;
		const pt = intersection$1(tlp, this.vector(), olp, other.vector());
		if (pt === null) return null;
		if (!isInBbox(bboxOverlap, pt)) return null;
		return rounder.round(pt.x, pt.y);
	}
	/**
	* Split the given segment into multiple segments on the given points.
	*  * Each existing segment will retain its leftSE and a new rightSE will be
	*    generated for it.
	*  * A new segment will be generated which will adopt the original segment's
	*    rightSE, and a new leftSE will be generated for it.
	*  * If there are more than two points given to split on, new segments
	*    in the middle will be generated with new leftSE and rightSE's.
	*  * An array of the newly generated SweepEvents will be returned.
	*
	* Warning: input array of points is modified
	*/
	split(point) {
		const newEvents = [];
		const alreadyLinked = point.events !== void 0;
		const newLeftSE = new SweepEvent(point, true);
		const newRightSE = new SweepEvent(point, false);
		const oldRightSE = this.rightSE;
		this.replaceRightSE(newRightSE);
		newEvents.push(newRightSE);
		newEvents.push(newLeftSE);
		const newSeg = new Segment(newLeftSE, oldRightSE, this.rings.slice(), this.windings.slice());
		if (SweepEvent.comparePoints(newSeg.leftSE.point, newSeg.rightSE.point) > 0) newSeg.swapEvents();
		if (SweepEvent.comparePoints(this.leftSE.point, this.rightSE.point) > 0) this.swapEvents();
		if (alreadyLinked) {
			newLeftSE.checkForConsuming();
			newRightSE.checkForConsuming();
		}
		return newEvents;
	}
	swapEvents() {
		const tmpEvt = this.rightSE;
		this.rightSE = this.leftSE;
		this.leftSE = tmpEvt;
		this.leftSE.isLeft = true;
		this.rightSE.isLeft = false;
		for (let i = 0, iMax = this.windings.length; i < iMax; i++) this.windings[i] *= -1;
	}
	consume(other) {
		let consumer = this;
		let consumee = other;
		while (consumer.consumedBy) consumer = consumer.consumedBy;
		while (consumee.consumedBy) consumee = consumee.consumedBy;
		const cmp = Segment.compare(consumer, consumee);
		if (cmp === 0) return;
		if (cmp > 0) {
			const tmp = consumer;
			consumer = consumee;
			consumee = tmp;
		}
		if (consumer.prev === consumee) {
			const tmp = consumer;
			consumer = consumee;
			consumee = tmp;
		}
		for (let i = 0, iMax = consumee.rings.length; i < iMax; i++) {
			const ring = consumee.rings[i];
			const winding = consumee.windings[i];
			const index = consumer.rings.indexOf(ring);
			if (index === -1) {
				consumer.rings.push(ring);
				consumer.windings.push(winding);
			} else consumer.windings[index] += winding;
		}
		consumee.rings = null;
		consumee.windings = null;
		consumee.consumedBy = consumer;
		consumee.leftSE.consumedBy = consumer.leftSE;
		consumee.rightSE.consumedBy = consumer.rightSE;
	}
	prevInResult() {
		if (this._prevInResult !== void 0) return this._prevInResult;
		if (!this.prev) this._prevInResult = null;
		else if (this.prev.isInResult()) this._prevInResult = this.prev;
		else this._prevInResult = this.prev.prevInResult();
		return this._prevInResult;
	}
	beforeState() {
		if (this._beforeState !== void 0) return this._beforeState;
		if (!this.prev) this._beforeState = {
			rings: [],
			windings: [],
			multiPolys: []
		};
		else {
			const seg = this.prev.consumedBy || this.prev;
			this._beforeState = seg.afterState();
		}
		return this._beforeState;
	}
	afterState() {
		if (this._afterState !== void 0) return this._afterState;
		const beforeState = this.beforeState();
		this._afterState = {
			rings: beforeState.rings.slice(0),
			windings: beforeState.windings.slice(0),
			multiPolys: []
		};
		const ringsAfter = this._afterState.rings;
		const windingsAfter = this._afterState.windings;
		const mpsAfter = this._afterState.multiPolys;
		for (let i = 0, iMax = this.rings.length; i < iMax; i++) {
			const ring = this.rings[i];
			const winding = this.windings[i];
			const index = ringsAfter.indexOf(ring);
			if (index === -1) {
				ringsAfter.push(ring);
				windingsAfter.push(winding);
			} else windingsAfter[index] += winding;
		}
		const polysAfter = [];
		const polysExclude = [];
		for (let i = 0, iMax = ringsAfter.length; i < iMax; i++) {
			if (windingsAfter[i] === 0) continue;
			const ring = ringsAfter[i];
			const poly = ring.poly;
			if (polysExclude.indexOf(poly) !== -1) continue;
			if (ring.isExterior) polysAfter.push(poly);
			else {
				if (polysExclude.indexOf(poly) === -1) polysExclude.push(poly);
				const index = polysAfter.indexOf(ring.poly);
				if (index !== -1) polysAfter.splice(index, 1);
			}
		}
		for (let i = 0, iMax = polysAfter.length; i < iMax; i++) {
			const mp = polysAfter[i].multiPoly;
			if (mpsAfter.indexOf(mp) === -1) mpsAfter.push(mp);
		}
		return this._afterState;
	}
	isInResult() {
		if (this.consumedBy) return false;
		if (this._isInResult !== void 0) return this._isInResult;
		const mpsBefore = this.beforeState().multiPolys;
		const mpsAfter = this.afterState().multiPolys;
		switch (operation.type) {
			case "union": {
				const noBefores = mpsBefore.length === 0;
				const noAfters = mpsAfter.length === 0;
				this._isInResult = noBefores !== noAfters;
				break;
			}
			case "intersection": {
				let least;
				let most;
				if (mpsBefore.length < mpsAfter.length) {
					least = mpsBefore.length;
					most = mpsAfter.length;
				} else {
					least = mpsAfter.length;
					most = mpsBefore.length;
				}
				this._isInResult = most === operation.numMultiPolys && least < most;
				break;
			}
			case "xor": {
				const diff = Math.abs(mpsBefore.length - mpsAfter.length);
				this._isInResult = diff % 2 === 1;
				break;
			}
			case "difference": {
				const isJustSubject = (mps) => mps.length === 1 && mps[0].isSubject;
				this._isInResult = isJustSubject(mpsBefore) !== isJustSubject(mpsAfter);
				break;
			}
			default: throw new Error(`Unrecognized operation type found ${operation.type}`);
		}
		return this._isInResult;
	}
};
var RingIn = class {
	constructor(geomRing, poly, isExterior) {
		if (!Array.isArray(geomRing) || geomRing.length === 0) throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
		this.poly = poly;
		this.isExterior = isExterior;
		this.segments = [];
		if (typeof geomRing[0][0] !== "number" || typeof geomRing[0][1] !== "number") throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
		const firstPoint = rounder.round(geomRing[0][0], geomRing[0][1]);
		this.bbox = {
			ll: {
				x: firstPoint.x,
				y: firstPoint.y
			},
			ur: {
				x: firstPoint.x,
				y: firstPoint.y
			}
		};
		let prevPoint = firstPoint;
		for (let i = 1, iMax = geomRing.length; i < iMax; i++) {
			if (typeof geomRing[i][0] !== "number" || typeof geomRing[i][1] !== "number") throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
			let point = rounder.round(geomRing[i][0], geomRing[i][1]);
			if (point.x === prevPoint.x && point.y === prevPoint.y) continue;
			this.segments.push(Segment.fromRing(prevPoint, point, this));
			if (point.x < this.bbox.ll.x) this.bbox.ll.x = point.x;
			if (point.y < this.bbox.ll.y) this.bbox.ll.y = point.y;
			if (point.x > this.bbox.ur.x) this.bbox.ur.x = point.x;
			if (point.y > this.bbox.ur.y) this.bbox.ur.y = point.y;
			prevPoint = point;
		}
		if (firstPoint.x !== prevPoint.x || firstPoint.y !== prevPoint.y) this.segments.push(Segment.fromRing(prevPoint, firstPoint, this));
	}
	getSweepEvents() {
		const sweepEvents = [];
		for (let i = 0, iMax = this.segments.length; i < iMax; i++) {
			const segment = this.segments[i];
			sweepEvents.push(segment.leftSE);
			sweepEvents.push(segment.rightSE);
		}
		return sweepEvents;
	}
};
var PolyIn = class {
	constructor(geomPoly, multiPoly) {
		if (!Array.isArray(geomPoly)) throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
		this.exteriorRing = new RingIn(geomPoly[0], this, true);
		this.bbox = {
			ll: {
				x: this.exteriorRing.bbox.ll.x,
				y: this.exteriorRing.bbox.ll.y
			},
			ur: {
				x: this.exteriorRing.bbox.ur.x,
				y: this.exteriorRing.bbox.ur.y
			}
		};
		this.interiorRings = [];
		for (let i = 1, iMax = geomPoly.length; i < iMax; i++) {
			const ring = new RingIn(geomPoly[i], this, false);
			if (ring.bbox.ll.x < this.bbox.ll.x) this.bbox.ll.x = ring.bbox.ll.x;
			if (ring.bbox.ll.y < this.bbox.ll.y) this.bbox.ll.y = ring.bbox.ll.y;
			if (ring.bbox.ur.x > this.bbox.ur.x) this.bbox.ur.x = ring.bbox.ur.x;
			if (ring.bbox.ur.y > this.bbox.ur.y) this.bbox.ur.y = ring.bbox.ur.y;
			this.interiorRings.push(ring);
		}
		this.multiPoly = multiPoly;
	}
	getSweepEvents() {
		const sweepEvents = this.exteriorRing.getSweepEvents();
		for (let i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
			const ringSweepEvents = this.interiorRings[i].getSweepEvents();
			for (let j = 0, jMax = ringSweepEvents.length; j < jMax; j++) sweepEvents.push(ringSweepEvents[j]);
		}
		return sweepEvents;
	}
};
var MultiPolyIn = class {
	constructor(geom, isSubject) {
		if (!Array.isArray(geom)) throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
		try {
			if (typeof geom[0][0][0] === "number") geom = [geom];
		} catch (ex) {}
		this.polys = [];
		this.bbox = {
			ll: {
				x: Number.POSITIVE_INFINITY,
				y: Number.POSITIVE_INFINITY
			},
			ur: {
				x: Number.NEGATIVE_INFINITY,
				y: Number.NEGATIVE_INFINITY
			}
		};
		for (let i = 0, iMax = geom.length; i < iMax; i++) {
			const poly = new PolyIn(geom[i], this);
			if (poly.bbox.ll.x < this.bbox.ll.x) this.bbox.ll.x = poly.bbox.ll.x;
			if (poly.bbox.ll.y < this.bbox.ll.y) this.bbox.ll.y = poly.bbox.ll.y;
			if (poly.bbox.ur.x > this.bbox.ur.x) this.bbox.ur.x = poly.bbox.ur.x;
			if (poly.bbox.ur.y > this.bbox.ur.y) this.bbox.ur.y = poly.bbox.ur.y;
			this.polys.push(poly);
		}
		this.isSubject = isSubject;
	}
	getSweepEvents() {
		const sweepEvents = [];
		for (let i = 0, iMax = this.polys.length; i < iMax; i++) {
			const polySweepEvents = this.polys[i].getSweepEvents();
			for (let j = 0, jMax = polySweepEvents.length; j < jMax; j++) sweepEvents.push(polySweepEvents[j]);
		}
		return sweepEvents;
	}
};
var RingOut = class RingOut {
	static factory(allSegments) {
		const ringsOut = [];
		for (let i = 0, iMax = allSegments.length; i < iMax; i++) {
			const segment = allSegments[i];
			if (!segment.isInResult() || segment.ringOut) continue;
			let prevEvent = null;
			let event = segment.leftSE;
			let nextEvent = segment.rightSE;
			const events = [event];
			const startingPoint = event.point;
			const intersectionLEs = [];
			while (true) {
				prevEvent = event;
				event = nextEvent;
				events.push(event);
				if (event.point === startingPoint) break;
				while (true) {
					const availableLEs = event.getAvailableLinkedEvents();
					if (availableLEs.length === 0) {
						const firstPt = events[0].point;
						const lastPt = events[events.length - 1].point;
						throw new Error(`Unable to complete output ring starting at [${firstPt.x}, ${firstPt.y}]. Last matching segment found ends at [${lastPt.x}, ${lastPt.y}].`);
					}
					if (availableLEs.length === 1) {
						nextEvent = availableLEs[0].otherSE;
						break;
					}
					let indexLE = null;
					for (let j = 0, jMax = intersectionLEs.length; j < jMax; j++) if (intersectionLEs[j].point === event.point) {
						indexLE = j;
						break;
					}
					if (indexLE !== null) {
						const intersectionLE = intersectionLEs.splice(indexLE)[0];
						const ringEvents = events.splice(intersectionLE.index);
						ringEvents.unshift(ringEvents[0].otherSE);
						ringsOut.push(new RingOut(ringEvents.reverse()));
						continue;
					}
					intersectionLEs.push({
						index: events.length,
						point: event.point
					});
					const comparator = event.getLeftmostComparator(prevEvent);
					nextEvent = availableLEs.sort(comparator)[0].otherSE;
					break;
				}
			}
			ringsOut.push(new RingOut(events));
		}
		return ringsOut;
	}
	constructor(events) {
		this.events = events;
		for (let i = 0, iMax = events.length; i < iMax; i++) events[i].segment.ringOut = this;
		this.poly = null;
	}
	getGeom() {
		let prevPt = this.events[0].point;
		const points = [prevPt];
		for (let i = 1, iMax = this.events.length - 1; i < iMax; i++) {
			const pt = this.events[i].point;
			const nextPt = this.events[i + 1].point;
			if (compareVectorAngles(pt, prevPt, nextPt) === 0) continue;
			points.push(pt);
			prevPt = pt;
		}
		if (points.length === 1) return null;
		const pt = points[0];
		const nextPt = points[1];
		if (compareVectorAngles(pt, prevPt, nextPt) === 0) points.shift();
		points.push(points[0]);
		const step = this.isExteriorRing() ? 1 : -1;
		const iStart = this.isExteriorRing() ? 0 : points.length - 1;
		const iEnd = this.isExteriorRing() ? points.length : -1;
		const orderedPoints = [];
		for (let i = iStart; i != iEnd; i += step) orderedPoints.push([points[i].x, points[i].y]);
		return orderedPoints;
	}
	isExteriorRing() {
		if (this._isExteriorRing === void 0) {
			const enclosing = this.enclosingRing();
			this._isExteriorRing = enclosing ? !enclosing.isExteriorRing() : true;
		}
		return this._isExteriorRing;
	}
	enclosingRing() {
		if (this._enclosingRing === void 0) this._enclosingRing = this._calcEnclosingRing();
		return this._enclosingRing;
	}
	_calcEnclosingRing() {
		let leftMostEvt = this.events[0];
		for (let i = 1, iMax = this.events.length; i < iMax; i++) {
			const evt = this.events[i];
			if (SweepEvent.compare(leftMostEvt, evt) > 0) leftMostEvt = evt;
		}
		let prevSeg = leftMostEvt.segment.prevInResult();
		let prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
		while (true) {
			if (!prevSeg) return null;
			if (!prevPrevSeg) return prevSeg.ringOut;
			if (prevPrevSeg.ringOut !== prevSeg.ringOut) {
				if (prevPrevSeg.ringOut.enclosingRing() !== prevSeg.ringOut) return prevSeg.ringOut;
				else return prevSeg.ringOut.enclosingRing();
			}
			prevSeg = prevPrevSeg.prevInResult();
			prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
		}
	}
};
var PolyOut = class {
	constructor(exteriorRing) {
		this.exteriorRing = exteriorRing;
		exteriorRing.poly = this;
		this.interiorRings = [];
	}
	addInterior(ring) {
		this.interiorRings.push(ring);
		ring.poly = this;
	}
	getGeom() {
		const geom = [this.exteriorRing.getGeom()];
		if (geom[0] === null) return null;
		for (let i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
			const ringGeom = this.interiorRings[i].getGeom();
			if (ringGeom === null) continue;
			geom.push(ringGeom);
		}
		return geom;
	}
};
var MultiPolyOut = class {
	constructor(rings) {
		this.rings = rings;
		this.polys = this._composePolys(rings);
	}
	getGeom() {
		const geom = [];
		for (let i = 0, iMax = this.polys.length; i < iMax; i++) {
			const polyGeom = this.polys[i].getGeom();
			if (polyGeom === null) continue;
			geom.push(polyGeom);
		}
		return geom;
	}
	_composePolys(rings) {
		const polys = [];
		for (let i = 0, iMax = rings.length; i < iMax; i++) {
			const ring = rings[i];
			if (ring.poly) continue;
			if (ring.isExteriorRing()) polys.push(new PolyOut(ring));
			else {
				const enclosingRing = ring.enclosingRing();
				if (!enclosingRing.poly) polys.push(new PolyOut(enclosingRing));
				enclosingRing.poly.addInterior(ring);
			}
		}
		return polys;
	}
};
/**
* NOTE:  We must be careful not to change any segments while
*        they are in the SplayTree. AFAIK, there's no way to tell
*        the tree to rebalance itself - thus before splitting
*        a segment that's in the tree, we remove it from the tree,
*        do the split, then re-insert it. (Even though splitting a
*        segment *shouldn't* change its correct position in the
*        sweep line tree, the reality is because of rounding errors,
*        it sometimes does.)
*/
var SweepLine = class {
	constructor(queue) {
		let comparator = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : Segment.compare;
		this.queue = queue;
		this.tree = new z(comparator);
		this.segments = [];
	}
	process(event) {
		const segment = event.segment;
		const newEvents = [];
		if (event.consumedBy) {
			if (event.isLeft) this.queue.remove(event.otherSE);
			else this.tree.remove(segment);
			return newEvents;
		}
		const node = event.isLeft ? this.tree.add(segment) : this.tree.find(segment);
		if (!node) throw new Error(`Unable to find segment #${segment.id} [${segment.leftSE.point.x}, ${segment.leftSE.point.y}] -> [${segment.rightSE.point.x}, ${segment.rightSE.point.y}] in SweepLine tree.`);
		let prevNode = node;
		let nextNode = node;
		let prevSeg = void 0;
		let nextSeg = void 0;
		while (prevSeg === void 0) {
			prevNode = this.tree.prev(prevNode);
			if (prevNode === null) prevSeg = null;
			else if (prevNode.key.consumedBy === void 0) prevSeg = prevNode.key;
		}
		while (nextSeg === void 0) {
			nextNode = this.tree.next(nextNode);
			if (nextNode === null) nextSeg = null;
			else if (nextNode.key.consumedBy === void 0) nextSeg = nextNode.key;
		}
		if (event.isLeft) {
			let prevMySplitter = null;
			if (prevSeg) {
				const prevInter = prevSeg.getIntersection(segment);
				if (prevInter !== null) {
					if (!segment.isAnEndpoint(prevInter)) prevMySplitter = prevInter;
					if (!prevSeg.isAnEndpoint(prevInter)) {
						const newEventsFromSplit = this._splitSafely(prevSeg, prevInter);
						for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
					}
				}
			}
			let nextMySplitter = null;
			if (nextSeg) {
				const nextInter = nextSeg.getIntersection(segment);
				if (nextInter !== null) {
					if (!segment.isAnEndpoint(nextInter)) nextMySplitter = nextInter;
					if (!nextSeg.isAnEndpoint(nextInter)) {
						const newEventsFromSplit = this._splitSafely(nextSeg, nextInter);
						for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
					}
				}
			}
			if (prevMySplitter !== null || nextMySplitter !== null) {
				let mySplitter = null;
				if (prevMySplitter === null) mySplitter = nextMySplitter;
				else if (nextMySplitter === null) mySplitter = prevMySplitter;
				else mySplitter = SweepEvent.comparePoints(prevMySplitter, nextMySplitter) <= 0 ? prevMySplitter : nextMySplitter;
				this.queue.remove(segment.rightSE);
				newEvents.push(segment.rightSE);
				const newEventsFromSplit = segment.split(mySplitter);
				for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
			}
			if (newEvents.length > 0) {
				this.tree.remove(segment);
				newEvents.push(event);
			} else {
				this.segments.push(segment);
				segment.prev = prevSeg;
			}
		} else {
			if (prevSeg && nextSeg) {
				const inter = prevSeg.getIntersection(nextSeg);
				if (inter !== null) {
					if (!prevSeg.isAnEndpoint(inter)) {
						const newEventsFromSplit = this._splitSafely(prevSeg, inter);
						for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
					}
					if (!nextSeg.isAnEndpoint(inter)) {
						const newEventsFromSplit = this._splitSafely(nextSeg, inter);
						for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) newEvents.push(newEventsFromSplit[i]);
					}
				}
			}
			this.tree.remove(segment);
		}
		return newEvents;
	}
	_splitSafely(seg, pt) {
		this.tree.remove(seg);
		const rightSE = seg.rightSE;
		this.queue.remove(rightSE);
		const newEvents = seg.split(pt);
		newEvents.push(rightSE);
		if (seg.consumedBy === void 0) this.tree.add(seg);
		return newEvents;
	}
};
var POLYGON_CLIPPING_MAX_QUEUE_SIZE = typeof process !== "undefined" && process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE || 1e6;
var POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS = typeof process !== "undefined" && process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS || 1e6;
var Operation = class {
	run(type, geom, moreGeoms) {
		operation.type = type;
		rounder.reset();
		const multipolys = [new MultiPolyIn(geom, true)];
		for (let i = 0, iMax = moreGeoms.length; i < iMax; i++) multipolys.push(new MultiPolyIn(moreGeoms[i], false));
		operation.numMultiPolys = multipolys.length;
		if (operation.type === "difference") {
			const subject = multipolys[0];
			let i = 1;
			while (i < multipolys.length) if (getBboxOverlap(multipolys[i].bbox, subject.bbox) !== null) i++;
			else multipolys.splice(i, 1);
		}
		if (operation.type === "intersection") for (let i = 0, iMax = multipolys.length; i < iMax; i++) {
			const mpA = multipolys[i];
			for (let j = i + 1, jMax = multipolys.length; j < jMax; j++) if (getBboxOverlap(mpA.bbox, multipolys[j].bbox) === null) return [];
		}
		const queue = new z(SweepEvent.compare);
		for (let i = 0, iMax = multipolys.length; i < iMax; i++) {
			const sweepEvents = multipolys[i].getSweepEvents();
			for (let j = 0, jMax = sweepEvents.length; j < jMax; j++) {
				queue.insert(sweepEvents[j]);
				if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) throw new Error("Infinite loop when putting segment endpoints in a priority queue (queue size too big).");
			}
		}
		const sweepLine = new SweepLine(queue);
		let prevQueueSize = queue.size;
		let node = queue.pop();
		while (node) {
			const evt = node.key;
			if (queue.size === prevQueueSize) {
				const seg = evt.segment;
				throw new Error(`Unable to pop() ${evt.isLeft ? "left" : "right"} SweepEvent [${evt.point.x}, ${evt.point.y}] from segment #${seg.id} [${seg.leftSE.point.x}, ${seg.leftSE.point.y}] -> [${seg.rightSE.point.x}, ${seg.rightSE.point.y}] from queue.`);
			}
			if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) throw new Error("Infinite loop when passing sweep line over endpoints (queue size too big).");
			if (sweepLine.segments.length > POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS) throw new Error("Infinite loop when passing sweep line over endpoints (too many sweep line segments).");
			const newEvents = sweepLine.process(evt);
			for (let i = 0, iMax = newEvents.length; i < iMax; i++) {
				const evt = newEvents[i];
				if (evt.consumedBy === void 0) queue.insert(evt);
			}
			prevQueueSize = queue.size;
			node = queue.pop();
		}
		rounder.reset();
		return new MultiPolyOut(RingOut.factory(sweepLine.segments)).getGeom();
	}
};
var operation = new Operation();
//#endregion
//#region node_modules/svgpath/lib/path_parse.js
var require_path_parse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var paramCounts = {
		a: 7,
		c: 6,
		h: 1,
		l: 2,
		m: 2,
		r: 4,
		q: 4,
		s: 4,
		t: 2,
		v: 1,
		z: 0
	};
	var SPECIAL_SPACES = [
		5760,
		6158,
		8192,
		8193,
		8194,
		8195,
		8196,
		8197,
		8198,
		8199,
		8200,
		8201,
		8202,
		8239,
		8287,
		12288,
		65279
	];
	function isSpace(ch) {
		return ch === 10 || ch === 13 || ch === 8232 || ch === 8233 || ch === 32 || ch === 9 || ch === 11 || ch === 12 || ch === 160 || ch >= 5760 && SPECIAL_SPACES.indexOf(ch) >= 0;
	}
	function isCommand(code) {
		switch (code | 32) {
			case 109:
			case 122:
			case 108:
			case 104:
			case 118:
			case 99:
			case 115:
			case 113:
			case 116:
			case 97:
			case 114: return true;
		}
		return false;
	}
	function isArc(code) {
		return (code | 32) === 97;
	}
	function isDigit(code) {
		return code >= 48 && code <= 57;
	}
	function isDigitStart(code) {
		return code >= 48 && code <= 57 || code === 43 || code === 45 || code === 46;
	}
	function State(path) {
		this.index = 0;
		this.path = path;
		this.max = path.length;
		this.result = [];
		this.param = 0;
		this.err = "";
		this.segmentStart = 0;
		this.data = [];
	}
	function skipSpaces(state) {
		while (state.index < state.max && isSpace(state.path.charCodeAt(state.index))) state.index++;
	}
	function scanFlag(state) {
		var ch = state.path.charCodeAt(state.index);
		if (ch === 48) {
			state.param = 0;
			state.index++;
			return;
		}
		if (ch === 49) {
			state.param = 1;
			state.index++;
			return;
		}
		state.err = "SvgPath: arc flag can be 0 or 1 only (at pos " + state.index + ")";
	}
	function scanParam(state) {
		var start = state.index, index = start, max = state.max, zeroFirst = false, hasCeiling = false, hasDecimal = false, hasDot = false, ch;
		if (index >= max) {
			state.err = "SvgPath: missed param (at pos " + index + ")";
			return;
		}
		ch = state.path.charCodeAt(index);
		if (ch === 43 || ch === 45) {
			index++;
			ch = index < max ? state.path.charCodeAt(index) : 0;
		}
		if (!isDigit(ch) && ch !== 46) {
			state.err = "SvgPath: param should start with 0..9 or `.` (at pos " + index + ")";
			return;
		}
		if (ch !== 46) {
			zeroFirst = ch === 48;
			index++;
			ch = index < max ? state.path.charCodeAt(index) : 0;
			if (zeroFirst && index < max) {
				if (ch && isDigit(ch)) {
					state.err = "SvgPath: numbers started with `0` such as `09` are illegal (at pos " + start + ")";
					return;
				}
			}
			while (index < max && isDigit(state.path.charCodeAt(index))) {
				index++;
				hasCeiling = true;
			}
			ch = index < max ? state.path.charCodeAt(index) : 0;
		}
		if (ch === 46) {
			hasDot = true;
			index++;
			while (isDigit(state.path.charCodeAt(index))) {
				index++;
				hasDecimal = true;
			}
			ch = index < max ? state.path.charCodeAt(index) : 0;
		}
		if (ch === 101 || ch === 69) {
			if (hasDot && !hasCeiling && !hasDecimal) {
				state.err = "SvgPath: invalid float exponent (at pos " + index + ")";
				return;
			}
			index++;
			ch = index < max ? state.path.charCodeAt(index) : 0;
			if (ch === 43 || ch === 45) index++;
			if (index < max && isDigit(state.path.charCodeAt(index))) while (index < max && isDigit(state.path.charCodeAt(index))) index++;
			else {
				state.err = "SvgPath: invalid float exponent (at pos " + index + ")";
				return;
			}
		}
		state.index = index;
		state.param = parseFloat(state.path.slice(start, index)) + 0;
	}
	function finalizeSegment(state) {
		var cmd = state.path[state.segmentStart], cmdLC = cmd.toLowerCase();
		var params = state.data;
		if (cmdLC === "m" && params.length > 2) {
			state.result.push([
				cmd,
				params[0],
				params[1]
			]);
			params = params.slice(2);
			cmdLC = "l";
			cmd = cmd === "m" ? "l" : "L";
		}
		if (cmdLC === "r") state.result.push([cmd].concat(params));
		else while (params.length >= paramCounts[cmdLC]) {
			state.result.push([cmd].concat(params.splice(0, paramCounts[cmdLC])));
			if (!paramCounts[cmdLC]) break;
		}
	}
	function scanSegment(state) {
		var max = state.max, cmdCode, is_arc, comma_found, need_params, i;
		state.segmentStart = state.index;
		cmdCode = state.path.charCodeAt(state.index);
		is_arc = isArc(cmdCode);
		if (!isCommand(cmdCode)) {
			state.err = "SvgPath: bad command " + state.path[state.index] + " (at pos " + state.index + ")";
			return;
		}
		need_params = paramCounts[state.path[state.index].toLowerCase()];
		state.index++;
		skipSpaces(state);
		state.data = [];
		if (!need_params) {
			finalizeSegment(state);
			return;
		}
		comma_found = false;
		for (;;) {
			for (i = need_params; i > 0; i--) {
				if (is_arc && (i === 3 || i === 4)) scanFlag(state);
				else scanParam(state);
				if (state.err.length) {
					finalizeSegment(state);
					return;
				}
				state.data.push(state.param);
				skipSpaces(state);
				comma_found = false;
				if (state.index < max && state.path.charCodeAt(state.index) === 44) {
					state.index++;
					skipSpaces(state);
					comma_found = true;
				}
			}
			if (comma_found) continue;
			if (state.index >= state.max) break;
			if (!isDigitStart(state.path.charCodeAt(state.index))) break;
		}
		finalizeSegment(state);
	}
	module.exports = function pathParse(svgPath) {
		var state = new State(svgPath);
		var max = state.max;
		skipSpaces(state);
		while (state.index < max && !state.err.length) scanSegment(state);
		if (state.result.length) {
			if ("mM".indexOf(state.result[0][0]) < 0) {
				state.err = "SvgPath: string should start with `M` or `m`";
				state.result = [];
			} else state.result[0][0] = "M";
		}
		return {
			err: state.err,
			segments: state.result
		};
	};
}));
//#endregion
//#region node_modules/svgpath/lib/matrix.js
var require_matrix = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function combine(m1, m2) {
		return [
			m1[0] * m2[0] + m1[2] * m2[1],
			m1[1] * m2[0] + m1[3] * m2[1],
			m1[0] * m2[2] + m1[2] * m2[3],
			m1[1] * m2[2] + m1[3] * m2[3],
			m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
			m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
		];
	}
	function Matrix() {
		if (!(this instanceof Matrix)) return new Matrix();
		this.queue = [];
		this.cache = null;
	}
	Matrix.prototype.matrix = function(m) {
		if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) return this;
		this.cache = null;
		this.queue.push(m);
		return this;
	};
	Matrix.prototype.translate = function(tx, ty) {
		if (tx !== 0 || ty !== 0) {
			this.cache = null;
			this.queue.push([
				1,
				0,
				0,
				1,
				tx,
				ty
			]);
		}
		return this;
	};
	Matrix.prototype.scale = function(sx, sy) {
		if (sx !== 1 || sy !== 1) {
			this.cache = null;
			this.queue.push([
				sx,
				0,
				0,
				sy,
				0,
				0
			]);
		}
		return this;
	};
	Matrix.prototype.rotate = function(angle, rx, ry) {
		var rad, cos, sin;
		if (angle !== 0) {
			this.translate(rx, ry);
			rad = angle * Math.PI / 180;
			cos = Math.cos(rad);
			sin = Math.sin(rad);
			this.queue.push([
				cos,
				sin,
				-sin,
				cos,
				0,
				0
			]);
			this.cache = null;
			this.translate(-rx, -ry);
		}
		return this;
	};
	Matrix.prototype.skewX = function(angle) {
		if (angle !== 0) {
			this.cache = null;
			this.queue.push([
				1,
				0,
				Math.tan(angle * Math.PI / 180),
				1,
				0,
				0
			]);
		}
		return this;
	};
	Matrix.prototype.skewY = function(angle) {
		if (angle !== 0) {
			this.cache = null;
			this.queue.push([
				1,
				Math.tan(angle * Math.PI / 180),
				0,
				1,
				0,
				0
			]);
		}
		return this;
	};
	Matrix.prototype.toArray = function() {
		if (this.cache) return this.cache;
		if (!this.queue.length) {
			this.cache = [
				1,
				0,
				0,
				1,
				0,
				0
			];
			return this.cache;
		}
		this.cache = this.queue[0];
		if (this.queue.length === 1) return this.cache;
		for (var i = 1; i < this.queue.length; i++) this.cache = combine(this.cache, this.queue[i]);
		return this.cache;
	};
	Matrix.prototype.calc = function(x, y, isRelative) {
		var m;
		if (!this.queue.length) return [x, y];
		if (!this.cache) this.cache = this.toArray();
		m = this.cache;
		return [x * m[0] + y * m[2] + (isRelative ? 0 : m[4]), x * m[1] + y * m[3] + (isRelative ? 0 : m[5])];
	};
	module.exports = Matrix;
}));
//#endregion
//#region node_modules/svgpath/lib/transform_parse.js
var require_transform_parse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var Matrix = require_matrix();
	var operations = {
		matrix: true,
		scale: true,
		rotate: true,
		translate: true,
		skewX: true,
		skewY: true
	};
	var CMD_SPLIT_RE = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(\s*(.+?)\s*\)[\s,]*/;
	var PARAMS_SPLIT_RE = /[\s,]+/;
	module.exports = function transformParse(transformString) {
		var matrix = new Matrix();
		var cmd, params;
		transformString.split(CMD_SPLIT_RE).forEach(function(item) {
			if (!item.length) return;
			if (typeof operations[item] !== "undefined") {
				cmd = item;
				return;
			}
			params = item.split(PARAMS_SPLIT_RE).map(function(i) {
				return +i || 0;
			});
			switch (cmd) {
				case "matrix":
					if (params.length === 6) matrix.matrix(params);
					return;
				case "scale":
					if (params.length === 1) matrix.scale(params[0], params[0]);
					else if (params.length === 2) matrix.scale(params[0], params[1]);
					return;
				case "rotate":
					if (params.length === 1) matrix.rotate(params[0], 0, 0);
					else if (params.length === 3) matrix.rotate(params[0], params[1], params[2]);
					return;
				case "translate":
					if (params.length === 1) matrix.translate(params[0], 0);
					else if (params.length === 2) matrix.translate(params[0], params[1]);
					return;
				case "skewX":
					if (params.length === 1) matrix.skewX(params[0]);
					return;
				case "skewY":
					if (params.length === 1) matrix.skewY(params[0]);
					return;
			}
		});
		return matrix;
	};
}));
//#endregion
//#region node_modules/svgpath/lib/a2c.js
var require_a2c = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var TAU = Math.PI * 2;
	function unit_vector_angle(ux, uy, vx, vy) {
		var sign = ux * vy - uy * vx < 0 ? -1 : 1;
		var dot = ux * vx + uy * vy;
		if (dot > 1) dot = 1;
		if (dot < -1) dot = -1;
		return sign * Math.acos(dot);
	}
	function get_arc_center(x1, y1, x2, y2, fa, fs, rx, ry, sin_phi, cos_phi) {
		var x1p = cos_phi * (x1 - x2) / 2 + sin_phi * (y1 - y2) / 2;
		var y1p = -sin_phi * (x1 - x2) / 2 + cos_phi * (y1 - y2) / 2;
		var rx_sq = rx * rx;
		var ry_sq = ry * ry;
		var x1p_sq = x1p * x1p;
		var y1p_sq = y1p * y1p;
		var radicant = rx_sq * ry_sq - rx_sq * y1p_sq - ry_sq * x1p_sq;
		if (radicant < 0) radicant = 0;
		radicant /= rx_sq * y1p_sq + ry_sq * x1p_sq;
		radicant = Math.sqrt(radicant) * (fa === fs ? -1 : 1);
		var cxp = radicant * rx / ry * y1p;
		var cyp = radicant * -ry / rx * x1p;
		var cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2;
		var cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2;
		var v1x = (x1p - cxp) / rx;
		var v1y = (y1p - cyp) / ry;
		var v2x = (-x1p - cxp) / rx;
		var v2y = (-y1p - cyp) / ry;
		var theta1 = unit_vector_angle(1, 0, v1x, v1y);
		var delta_theta = unit_vector_angle(v1x, v1y, v2x, v2y);
		if (fs === 0 && delta_theta > 0) delta_theta -= TAU;
		if (fs === 1 && delta_theta < 0) delta_theta += TAU;
		return [
			cx,
			cy,
			theta1,
			delta_theta
		];
	}
	function approximate_unit_arc(theta1, delta_theta) {
		var alpha = 4 / 3 * Math.tan(delta_theta / 4);
		var x1 = Math.cos(theta1);
		var y1 = Math.sin(theta1);
		var x2 = Math.cos(theta1 + delta_theta);
		var y2 = Math.sin(theta1 + delta_theta);
		return [
			x1,
			y1,
			x1 - y1 * alpha,
			y1 + x1 * alpha,
			x2 + y2 * alpha,
			y2 - x2 * alpha,
			x2,
			y2
		];
	}
	module.exports = function a2c(x1, y1, x2, y2, fa, fs, rx, ry, phi) {
		var sin_phi = Math.sin(phi * TAU / 360);
		var cos_phi = Math.cos(phi * TAU / 360);
		var x1p = cos_phi * (x1 - x2) / 2 + sin_phi * (y1 - y2) / 2;
		var y1p = -sin_phi * (x1 - x2) / 2 + cos_phi * (y1 - y2) / 2;
		if (x1p === 0 && y1p === 0) return [];
		if (rx === 0 || ry === 0) return [];
		rx = Math.abs(rx);
		ry = Math.abs(ry);
		var lambda = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
		if (lambda > 1) {
			rx *= Math.sqrt(lambda);
			ry *= Math.sqrt(lambda);
		}
		var cc = get_arc_center(x1, y1, x2, y2, fa, fs, rx, ry, sin_phi, cos_phi);
		var result = [];
		var theta1 = cc[2];
		var delta_theta = cc[3];
		var segments = Math.max(Math.ceil(Math.abs(delta_theta) / (TAU / 4)), 1);
		delta_theta /= segments;
		for (var i = 0; i < segments; i++) {
			result.push(approximate_unit_arc(theta1, delta_theta));
			theta1 += delta_theta;
		}
		return result.map(function(curve) {
			for (var i = 0; i < curve.length; i += 2) {
				var x = curve[i + 0];
				var y = curve[i + 1];
				x *= rx;
				y *= ry;
				var xp = cos_phi * x - sin_phi * y;
				var yp = sin_phi * x + cos_phi * y;
				curve[i + 0] = xp + cc[0];
				curve[i + 1] = yp + cc[1];
			}
			return curve;
		});
	};
}));
//#endregion
//#region node_modules/svgpath/lib/ellipse.js
var require_ellipse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var epsilon = 1e-10;
	var torad = Math.PI / 180;
	function Ellipse(rx, ry, ax) {
		if (!(this instanceof Ellipse)) return new Ellipse(rx, ry, ax);
		this.rx = rx;
		this.ry = ry;
		this.ax = ax;
	}
	Ellipse.prototype.transform = function(m) {
		var c = Math.cos(this.ax * torad), s = Math.sin(this.ax * torad);
		var ma = [
			this.rx * (m[0] * c + m[2] * s),
			this.rx * (m[1] * c + m[3] * s),
			this.ry * (-m[0] * s + m[2] * c),
			this.ry * (-m[1] * s + m[3] * c)
		];
		var J = ma[0] * ma[0] + ma[2] * ma[2], K = ma[1] * ma[1] + ma[3] * ma[3];
		var D = ((ma[0] - ma[3]) * (ma[0] - ma[3]) + (ma[2] + ma[1]) * (ma[2] + ma[1])) * ((ma[0] + ma[3]) * (ma[0] + ma[3]) + (ma[2] - ma[1]) * (ma[2] - ma[1]));
		var JK = (J + K) / 2;
		if (D < epsilon * JK) {
			this.rx = this.ry = Math.sqrt(JK);
			this.ax = 0;
			return this;
		}
		var L = ma[0] * ma[1] + ma[2] * ma[3];
		D = Math.sqrt(D);
		var l1 = JK + D / 2, l2 = JK - D / 2;
		this.ax = Math.abs(L) < epsilon && Math.abs(l1 - K) < epsilon ? 90 : Math.atan(Math.abs(L) > Math.abs(l1 - K) ? (l1 - J) / L : L / (l1 - K)) * 180 / Math.PI;
		if (this.ax >= 0) {
			this.rx = Math.sqrt(l1);
			this.ry = Math.sqrt(l2);
		} else {
			this.ax += 90;
			this.rx = Math.sqrt(l2);
			this.ry = Math.sqrt(l1);
		}
		return this;
	};
	Ellipse.prototype.isDegenerate = function() {
		return this.rx < epsilon * this.ry || this.ry < epsilon * this.rx;
	};
	module.exports = Ellipse;
}));
//#endregion
//#region node_modules/svgpath/lib/svgpath.js
var require_svgpath$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var pathParse = require_path_parse();
	var transformParse = require_transform_parse();
	var matrix = require_matrix();
	var a2c = require_a2c();
	var ellipse = require_ellipse();
	function SvgPath(path) {
		if (!(this instanceof SvgPath)) return new SvgPath(path);
		var pstate = pathParse(path);
		this.segments = pstate.segments;
		this.err = pstate.err;
		this.__stack = [];
	}
	SvgPath.from = function(src) {
		if (typeof src === "string") return new SvgPath(src);
		if (src instanceof SvgPath) {
			var s = new SvgPath("");
			s.err = src.err;
			s.segments = src.segments.map(function(sgm) {
				return sgm.slice();
			});
			s.__stack = src.__stack.map(function(m) {
				return matrix().matrix(m.toArray());
			});
			return s;
		}
		throw new Error("SvgPath.from: invalid param type " + src);
	};
	SvgPath.prototype.__matrix = function(m) {
		var self = this, i;
		if (!m.queue.length) return;
		this.iterate(function(s, index, x, y) {
			var p, result, name, isRelative;
			switch (s[0]) {
				case "v":
					p = m.calc(0, s[1], true);
					result = p[0] === 0 ? ["v", p[1]] : [
						"l",
						p[0],
						p[1]
					];
					break;
				case "V":
					p = m.calc(x, s[1], false);
					result = p[0] === m.calc(x, y, false)[0] ? ["V", p[1]] : [
						"L",
						p[0],
						p[1]
					];
					break;
				case "h":
					p = m.calc(s[1], 0, true);
					result = p[1] === 0 ? ["h", p[0]] : [
						"l",
						p[0],
						p[1]
					];
					break;
				case "H":
					p = m.calc(s[1], y, false);
					result = p[1] === m.calc(x, y, false)[1] ? ["H", p[0]] : [
						"L",
						p[0],
						p[1]
					];
					break;
				case "a":
				case "A":
					var ma = m.toArray();
					var e = ellipse(s[1], s[2], s[3]).transform(ma);
					if (ma[0] * ma[3] - ma[1] * ma[2] < 0) s[5] = s[5] ? "0" : "1";
					p = m.calc(s[6], s[7], s[0] === "a");
					if (s[0] === "A" && s[6] === x && s[7] === y || s[0] === "a" && s[6] === 0 && s[7] === 0) {
						result = [
							s[0] === "a" ? "l" : "L",
							p[0],
							p[1]
						];
						break;
					}
					if (e.isDegenerate()) result = [
						s[0] === "a" ? "l" : "L",
						p[0],
						p[1]
					];
					else result = [
						s[0],
						e.rx,
						e.ry,
						e.ax,
						s[4],
						s[5],
						p[0],
						p[1]
					];
					break;
				case "m":
					isRelative = index > 0;
					p = m.calc(s[1], s[2], isRelative);
					result = [
						"m",
						p[0],
						p[1]
					];
					break;
				default:
					name = s[0];
					result = [name];
					isRelative = name.toLowerCase() === name;
					for (i = 1; i < s.length; i += 2) {
						p = m.calc(s[i], s[i + 1], isRelative);
						result.push(p[0], p[1]);
					}
			}
			self.segments[index] = result;
		}, true);
	};
	SvgPath.prototype.__evaluateStack = function() {
		var m, i;
		if (!this.__stack.length) return;
		if (this.__stack.length === 1) {
			this.__matrix(this.__stack[0]);
			this.__stack = [];
			return;
		}
		m = matrix();
		i = this.__stack.length;
		while (--i >= 0) m.matrix(this.__stack[i].toArray());
		this.__matrix(m);
		this.__stack = [];
	};
	SvgPath.prototype.toString = function() {
		var result = "", prevCmd = "", cmdSkipped = false;
		this.__evaluateStack();
		for (var i = 0, len = this.segments.length; i < len; i++) {
			var segment = this.segments[i];
			var cmd = segment[0];
			if (cmd !== prevCmd || cmd === "m" || cmd === "M") {
				if (cmd === "m" && prevCmd === "z") result += " ";
				result += cmd;
				cmdSkipped = false;
			} else cmdSkipped = true;
			for (var pos = 1; pos < segment.length; pos++) {
				var val = segment[pos];
				if (pos === 1) {
					if (cmdSkipped && val >= 0) result += " ";
				} else if (val >= 0) result += " ";
				result += val;
			}
			prevCmd = cmd;
		}
		return result;
	};
	SvgPath.prototype.translate = function(x, y) {
		this.__stack.push(matrix().translate(x, y || 0));
		return this;
	};
	SvgPath.prototype.scale = function(sx, sy) {
		this.__stack.push(matrix().scale(sx, !sy && sy !== 0 ? sx : sy));
		return this;
	};
	SvgPath.prototype.rotate = function(angle, rx, ry) {
		this.__stack.push(matrix().rotate(angle, rx || 0, ry || 0));
		return this;
	};
	SvgPath.prototype.skewX = function(degrees) {
		this.__stack.push(matrix().skewX(degrees));
		return this;
	};
	SvgPath.prototype.skewY = function(degrees) {
		this.__stack.push(matrix().skewY(degrees));
		return this;
	};
	SvgPath.prototype.matrix = function(m) {
		this.__stack.push(matrix().matrix(m));
		return this;
	};
	SvgPath.prototype.transform = function(transformString) {
		if (!transformString.trim()) return this;
		this.__stack.push(transformParse(transformString));
		return this;
	};
	SvgPath.prototype.round = function(d) {
		var contourStartDeltaX = 0, contourStartDeltaY = 0, deltaX = 0, deltaY = 0, l;
		d = d || 0;
		this.__evaluateStack();
		this.segments.forEach(function(s) {
			var isRelative = s[0].toLowerCase() === s[0];
			switch (s[0]) {
				case "H":
				case "h":
					if (isRelative) s[1] += deltaX;
					deltaX = s[1] - s[1].toFixed(d);
					s[1] = +s[1].toFixed(d);
					return;
				case "V":
				case "v":
					if (isRelative) s[1] += deltaY;
					deltaY = s[1] - s[1].toFixed(d);
					s[1] = +s[1].toFixed(d);
					return;
				case "Z":
				case "z":
					deltaX = contourStartDeltaX;
					deltaY = contourStartDeltaY;
					return;
				case "M":
				case "m":
					if (isRelative) {
						s[1] += deltaX;
						s[2] += deltaY;
					}
					deltaX = s[1] - s[1].toFixed(d);
					deltaY = s[2] - s[2].toFixed(d);
					contourStartDeltaX = deltaX;
					contourStartDeltaY = deltaY;
					s[1] = +s[1].toFixed(d);
					s[2] = +s[2].toFixed(d);
					return;
				case "A":
				case "a":
					if (isRelative) {
						s[6] += deltaX;
						s[7] += deltaY;
					}
					deltaX = s[6] - s[6].toFixed(d);
					deltaY = s[7] - s[7].toFixed(d);
					s[1] = +s[1].toFixed(d);
					s[2] = +s[2].toFixed(d);
					s[3] = +s[3].toFixed(d + 2);
					s[6] = +s[6].toFixed(d);
					s[7] = +s[7].toFixed(d);
					return;
				default:
					l = s.length;
					if (isRelative) {
						s[l - 2] += deltaX;
						s[l - 1] += deltaY;
					}
					deltaX = s[l - 2] - s[l - 2].toFixed(d);
					deltaY = s[l - 1] - s[l - 1].toFixed(d);
					s.forEach(function(val, i) {
						if (!i) return;
						s[i] = +s[i].toFixed(d);
					});
					return;
			}
		});
		return this;
	};
	SvgPath.prototype.iterate = function(iterator, keepLazyStack) {
		var segments = this.segments, replacements = {}, needReplace = false, lastX = 0, lastY = 0, countourStartX = 0, countourStartY = 0;
		var i, j, newSegments;
		if (!keepLazyStack) this.__evaluateStack();
		segments.forEach(function(s, index) {
			var res = iterator(s, index, lastX, lastY);
			if (Array.isArray(res)) {
				replacements[index] = res;
				needReplace = true;
			}
			var isRelative = s[0] === s[0].toLowerCase();
			switch (s[0]) {
				case "m":
				case "M":
					lastX = s[1] + (isRelative ? lastX : 0);
					lastY = s[2] + (isRelative ? lastY : 0);
					countourStartX = lastX;
					countourStartY = lastY;
					return;
				case "h":
				case "H":
					lastX = s[1] + (isRelative ? lastX : 0);
					return;
				case "v":
				case "V":
					lastY = s[1] + (isRelative ? lastY : 0);
					return;
				case "z":
				case "Z":
					lastX = countourStartX;
					lastY = countourStartY;
					return;
				default:
					lastX = s[s.length - 2] + (isRelative ? lastX : 0);
					lastY = s[s.length - 1] + (isRelative ? lastY : 0);
			}
		});
		if (!needReplace) return this;
		newSegments = [];
		for (i = 0; i < segments.length; i++) if (typeof replacements[i] !== "undefined") for (j = 0; j < replacements[i].length; j++) newSegments.push(replacements[i][j]);
		else newSegments.push(segments[i]);
		this.segments = newSegments;
		return this;
	};
	SvgPath.prototype.abs = function() {
		this.iterate(function(s, index, x, y) {
			var name = s[0], nameUC = name.toUpperCase(), i;
			if (name === nameUC) return;
			s[0] = nameUC;
			switch (name) {
				case "v":
					s[1] += y;
					return;
				case "a":
					s[6] += x;
					s[7] += y;
					return;
				default: for (i = 1; i < s.length; i++) s[i] += i % 2 ? x : y;
			}
		}, true);
		return this;
	};
	SvgPath.prototype.rel = function() {
		this.iterate(function(s, index, x, y) {
			var name = s[0], nameLC = name.toLowerCase(), i;
			if (name === nameLC) return;
			if (index === 0 && name === "M") return;
			s[0] = nameLC;
			switch (name) {
				case "V":
					s[1] -= y;
					return;
				case "A":
					s[6] -= x;
					s[7] -= y;
					return;
				default: for (i = 1; i < s.length; i++) s[i] -= i % 2 ? x : y;
			}
		}, true);
		return this;
	};
	SvgPath.prototype.unarc = function() {
		this.iterate(function(s, index, x, y) {
			var new_segments, nextX, nextY, result = [], name = s[0];
			if (name !== "A" && name !== "a") return null;
			if (name === "a") {
				nextX = x + s[6];
				nextY = y + s[7];
			} else {
				nextX = s[6];
				nextY = s[7];
			}
			new_segments = a2c(x, y, nextX, nextY, s[4], s[5], s[1], s[2], s[3]);
			if (new_segments.length === 0) return [[
				s[0] === "a" ? "l" : "L",
				s[6],
				s[7]
			]];
			new_segments.forEach(function(s) {
				result.push([
					"C",
					s[2],
					s[3],
					s[4],
					s[5],
					s[6],
					s[7]
				]);
			});
			return result;
		});
		return this;
	};
	SvgPath.prototype.unshort = function() {
		var segments = this.segments;
		var prevControlX, prevControlY, prevSegment;
		var curControlX, curControlY;
		this.iterate(function(s, idx, x, y) {
			var name = s[0], nameUC = name.toUpperCase(), isRelative;
			if (!idx) return;
			if (nameUC === "T") {
				isRelative = name === "t";
				prevSegment = segments[idx - 1];
				if (prevSegment[0] === "Q") {
					prevControlX = prevSegment[1] - x;
					prevControlY = prevSegment[2] - y;
				} else if (prevSegment[0] === "q") {
					prevControlX = prevSegment[1] - prevSegment[3];
					prevControlY = prevSegment[2] - prevSegment[4];
				} else {
					prevControlX = 0;
					prevControlY = 0;
				}
				curControlX = -prevControlX;
				curControlY = -prevControlY;
				if (!isRelative) {
					curControlX += x;
					curControlY += y;
				}
				segments[idx] = [
					isRelative ? "q" : "Q",
					curControlX,
					curControlY,
					s[1],
					s[2]
				];
			} else if (nameUC === "S") {
				isRelative = name === "s";
				prevSegment = segments[idx - 1];
				if (prevSegment[0] === "C") {
					prevControlX = prevSegment[3] - x;
					prevControlY = prevSegment[4] - y;
				} else if (prevSegment[0] === "c") {
					prevControlX = prevSegment[3] - prevSegment[5];
					prevControlY = prevSegment[4] - prevSegment[6];
				} else {
					prevControlX = 0;
					prevControlY = 0;
				}
				curControlX = -prevControlX;
				curControlY = -prevControlY;
				if (!isRelative) {
					curControlX += x;
					curControlY += y;
				}
				segments[idx] = [
					isRelative ? "c" : "C",
					curControlX,
					curControlY,
					s[1],
					s[2],
					s[3],
					s[4]
				];
			}
		});
		return this;
	};
	module.exports = SvgPath;
}));
(/* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_svgpath$1();
})))();
//#endregion
//#region src/mask/curves.ts
function mapMaskCurves(curves, map) {
	return curves?.map((shape) => shape.map((c) => c ? {
		c1: map(c.c1),
		c2: map(c.c2)
	} : null));
}
function sampleMask(surface, shape) {
	return samplePath({
		points: surface.masks[shape] ?? [],
		curves: surface.maskCurves?.[shape],
		closed: true
	});
}
function readMaskCurves(raw, masks) {
	if (!Array.isArray(raw)) return void 0;
	const point = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
	return masks.map((shape, i) => shape.map((_, j) => {
		const c = Array.isArray(raw[i]) ? raw[i][j] : null;
		return c && typeof c === "object" && point(c.c1) && point(c.c2) ? {
			c1: c.c1,
			c2: c.c2
		} : null;
	}));
}
function readMaskNodeModes(raw, masks) {
	if (!Array.isArray(raw)) return void 0;
	return masks.map((points, i) => points.map((_, j) => [
		"corner",
		"smooth",
		"symmetric"
	].includes(raw[i]?.[j]) ? raw[i][j] : "corner"));
}
//#endregion
//#region src/features/types.ts
var DEFAULT_SHADER_TIME = {
	offsetS: 0,
	loopS: 0,
	direction: "forward",
	frozen: false
};
var DEFAULT_MODULATION = {
	source: "time",
	amount: 1,
	periodS: 4,
	waveform: "sine",
	phase: 0
};
var DEFAULT_CAMERA = {
	deviceId: "",
	aspect: "16:9",
	mirror: true,
	flipY: false
};
var DEFAULT_TRACKER = {
	...DEFAULT_CAMERA,
	style: "skin",
	color: "#ffccaa",
	hand: "both",
	handCount: 2,
	scale: 1
};
var DEFAULT_TRANSFORM = {
	xPx: 0,
	yPx: 0,
	scaleX: 1,
	scaleY: 1,
	rotationDeg: 0
};
var DEFAULT_LFOS = [
	4,
	8,
	2,
	16
].map((periodS) => ({
	periodS,
	phase: 0,
	waveform: "sine"
}));
//#endregion
//#region src/features/surface-parameters.ts
/** Surface geometry uses scene pixels and degrees, independent of source content. */
var SURFACE_PARAMETERS = [
	{
		key: "opacity",
		label: "Opacity",
		min: 0,
		max: 1,
		step: .01,
		unit: ""
	},
	{
		key: "xPx",
		label: "Horizontal offset",
		min: -1e6,
		max: 1e6,
		step: 1,
		unit: "px"
	},
	{
		key: "yPx",
		label: "Vertical offset",
		min: -1e6,
		max: 1e6,
		step: 1,
		unit: "px"
	},
	{
		key: "scaleX",
		label: "Horizontal scale",
		min: .01,
		max: 100,
		step: .01,
		unit: "×"
	},
	{
		key: "scaleY",
		label: "Vertical scale",
		min: .01,
		max: 100,
		step: .01,
		unit: "×"
	},
	{
		key: "rotationDeg",
		label: "Rotation",
		min: -3600,
		max: 3600,
		step: 1,
		unit: "°"
	},
	{
		key: "radiusPx",
		label: "Corner radius",
		min: 0,
		max: 16384,
		step: 1,
		unit: "px"
	},
	{
		key: "bendAngleDeg",
		label: "Bend angle",
		min: -170,
		max: 170,
		step: 1,
		unit: "°"
	}
];
function surfaceParameterBase(surface, property) {
	if (property === "opacity") return surface.opacity;
	if (property === "radiusPx") return surface.radiusPx ?? 0;
	if (property === "bendAngleDeg") return surface.bend?.angleDeg ?? 0;
	return surface.transform?.[property] ?? DEFAULT_TRANSFORM[property];
}
function surfaceMotionVersion(show) {
	const surfaces = [...show.scenes.flatMap((s) => s.surfaces), ...show.unassignedSurfaces ?? []];
	return show.version < 12 && surfaces.some((s) => Object.keys(s.modulation ?? {}).length || s.animation?.radiusPx?.length || s.animation?.bendAngleDeg?.length) ? {
		...show,
		version: 12
	} : show;
}
//#endregion
//#region src/features/shader-motion.ts
/** Positive modulo: show time before a surface's offset is still a valid phase. */
var wrap = (value, span) => (value % span + span) % span;
/**
* The seconds this shader should see at `timeS`. Everything about a shader's
* motion is here, because the effect itself is a pure function of the time it
* is handed — which is also why the editor and the projector agree without
* sharing a frame.
*/
function shaderTimeS(time, timeS) {
	const t = {
		...DEFAULT_SHADER_TIME,
		...time
	};
	if (t.frozen) return t.offsetS;
	const seconds = t.direction === "reverse" ? -(timeS + t.offsetS) : timeS + t.offsetS;
	if (t.loopS <= 0) return seconds;
	if (t.direction !== "pingpong") return wrap(seconds, t.loopS);
	const position = wrap(seconds, t.loopS * 2);
	return position > t.loopS ? t.loopS * 2 - position : position;
}
/**
* One modulation's contribution, in the parameter's own units, always between
* −amount and +amount.
*
* An audio-driven one is not a cycle at all: it is the level, scaled. It stays
* a pure function by taking the level as an argument rather than reading the
* microphone, so a show's motion is still testable without a sound card.
*
* For a time-driven one: sine and triangle leave zero and rise, so swapping
* between them does not jump the value; square and ramp start at an extreme
* because that is what they are, and `phase` shifts either.
*/
function modulationAt(modulation, timeS, levels, controls, lfos = DEFAULT_LFOS) {
	const m = {
		...DEFAULT_MODULATION,
		...modulation
	};
	if (m.invert) return -modulationAt({
		...m,
		invert: false
	}, timeS, levels, controls, lfos);
	if (m.source === "lfo") {
		const lfo = lfos[m.lfoIndex ?? 0] ?? DEFAULT_LFOS[0];
		return modulationAt({
			...m,
			...lfo,
			source: "time"
		}, timeS, levels, controls);
	}
	if (m.source === "audio") return m.amount * clamp01$2(levels?.[m.audioSignal === "beat" ? "beat" : m.band ?? "level"] ?? 0);
	if (m.source === "body") return m.amount * clamp01$2(levels?.[`body:${m.bodySignal ?? "x"}`] ?? 0);
	if (m.source === "midi") return m.amount * clamp01$2(controls?.[m.control ?? 1] ?? 0);
	if (m.periodS <= 0) return 0;
	const phase = wrap(timeS / m.periodS + m.phase, 1);
	if (m.waveform === "square") return phase < .5 ? m.amount : -m.amount;
	if (m.waveform === "ramp") return m.amount * (phase * 2 - 1);
	if (m.waveform === "triangle") return m.amount * (phase < .25 ? phase * 4 : phase < .75 ? 2 - phase * 4 : phase * 4 - 4);
	return m.amount * Math.sin(phase * Math.PI * 2);
}
/** Range assignments are absolute, while legacy assignments add to the base value. */
function modulatedValue(base, modulation, timeS, levels, controls, lfos = DEFAULT_LFOS) {
	if (!modulation.range) return base + modulationAt(modulation, timeS, levels, controls, lfos);
	const value = modulationAt({
		...modulation,
		amount: 1,
		invert: false
	}, timeS, levels, controls, lfos);
	const position = clamp01$2(modulation.source === "audio" || modulation.source === "midi" || modulation.source === "body" ? value : (value + 1) / 2);
	const fraction = modulation.invert ? 1 - position : position;
	const min = Math.min(modulation.range.min, modulation.range.max);
	return min + (Math.max(modulation.range.min, modulation.range.max) - min) * fraction;
}
/**
* The shader as it stands at `timeS`: its numeric parameters with their cycles
* applied. Color and held-choice motion is evaluated by sourceMotionAt before
* this numeric stage. An unknown parameter name is ignored rather than
* invented, so an effect that drops a control does not gain a stray one.
*/
function shaderAt(shader, timeS, levels, controls, lfos = DEFAULT_LFOS, showTimeS = timeS) {
	const entries = Object.entries(shader.modulation ?? {});
	if (!entries.length && !Object.keys(shader.animation ?? {}).length) return shader;
	const parameters = { ...shader.parameters };
	for (const [key, keys] of Object.entries(shader.animation ?? {})) if (typeof parameters[key] === "number") parameters[key] = keyframeValue(keys, timeS, parameters[key]);
	for (const [key, modulation] of entries) {
		const base = parameters[key];
		if (typeof base !== "number") continue;
		parameters[key] = modulatedValue(base, modulation, modulation.source === "lfo" || modulation.clock === "scene" ? showTimeS : timeS, levels, controls, lfos);
	}
	return {
		...shader,
		parameters
	};
}
/** Silence and a dead microphone must look the same, and neither may go negative. */
var clamp01$2 = (value) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
//#endregion
//#region src/features/animation.ts
function surfaceParameterAt(surface, property, timeS, context = {}) {
	const base = surfaceParameterBase(surface, property);
	const keyed = keyframeValue(surface.animation?.[property] ?? [], timeS, base);
	const m = context.modulation === false ? void 0 : surface.modulation?.[property];
	const value = m ? modulatedValue(keyed, m, m.source === "lfo" || m.clock === "scene" ? context.sceneTimeS ?? timeS : timeS, context.levels, context.controls, context.lfos) : keyed;
	if (!m && property !== "radiusPx" && property !== "bendAngleDeg" && property !== "opacity") return value;
	const spec = SURFACE_PARAMETERS.find((p) => p.key === property);
	return Number.isFinite(value) ? Math.max(spec.min, Math.min(spec.max, value)) : base;
}
/** Stable sorted evaluation: a key's interpolation controls the segment after it. */
function keyframeValue(keys, timeS, fallback) {
	const sorted = [...keys].sort((a, b) => a.timeS - b.timeS);
	if (!sorted.length) return fallback;
	if (timeS < sorted[0].timeS) return sorted[0].value;
	let left = sorted[0];
	for (const right of sorted.slice(1)) {
		if (right.timeS > timeS) {
			if (left.interpolation === "hold") return left.value;
			let t = (timeS - left.timeS) / (right.timeS - left.timeS);
			if (left.interpolation === "smooth") t = t * t * (3 - 2 * t);
			return left.value + (right.value - left.value) * t;
		}
		left = right;
	}
	return left.value;
}
function transformPoints(points, transform, pivot) {
	const r = transform.rotationDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
	return points.map(([x, y]) => {
		const dx = (x - pivot[0]) * transform.scaleX, dy = (y - pivot[1]) * transform.scaleY;
		return [pivot[0] + dx * c - dy * s + transform.xPx, pivot[1] + dx * s + dy * c + transform.yPx];
	});
}
function featureTransformAt(surface, timeS, context = { modulation: false }) {
	const transform = {
		...DEFAULT_TRANSFORM,
		...surface.transform
	};
	for (const property of Object.keys(transform)) transform[property] = surfaceParameterAt(surface, property, timeS, context);
	return transform;
}
function animateSurface(surface, timeS, context = { modulation: false }) {
	if (!surface.transform && !surface.animation && !surface.modulation) return surface;
	const transform = featureTransformAt(surface, timeS, context);
	const opacity = surfaceParameterAt(surface, "opacity", timeS, context);
	const radius = surface.animation?.radiusPx?.length || surface.modulation?.radiusPx;
	const bend = surface.animation?.bendAngleDeg?.length || surface.modulation?.bendAngleDeg;
	const pivot = [surface.corners.reduce((a, p) => a + p[0], 0) / 4, surface.corners.reduce((a, p) => a + p[1], 0) / 4];
	return {
		...surface,
		opacity,
		corners: transformPoints(surface.corners, transform, pivot),
		...radius ? { radiusPx: surfaceParameterAt(surface, "radiusPx", timeS, context) } : {},
		...bend ? { bend: {
			axis: surface.bend?.axis ?? "horizontal",
			angleDeg: surfaceParameterAt(surface, "bendAngleDeg", timeS, context)
		} } : {},
		masks: surface.masks.map((shape) => transformPoints(shape, transform, pivot)),
		...surface.maskCurves ? { maskCurves: mapMaskCurves(surface.maskCurves, (p) => transformPoints([p], transform, pivot)[0]) } : {}
	};
}
function putKeyframe(keys, key) {
	return [...keys.filter((other) => other.id !== key.id && Math.abs(other.timeS - key.timeS) > 1e-4), key].sort((a, b) => a.timeS - b.timeS);
}
SURFACE_PARAMETERS.map(({ key, label }) => ({
	value: key,
	label
}));
//#endregion
//#region src/body/signals.ts
/** Renderer-independent pose measurements. No frames or device IDs enter a show. */
var BODY_SIGNALS = [
	{
		value: "x",
		label: "Body left / right",
		help: "Center of the shoulders and hips across the camera frame."
	},
	{
		value: "y",
		label: "Body height",
		help: "Center of the torso from bottom to top of the camera frame."
	},
	{
		value: "size",
		label: "Body size",
		help: "Visible head-to-ankle height; move toward or away from the camera."
	},
	{
		value: "leftHand",
		label: "Left hand height",
		help: "Your left wrist from bottom to top of the camera frame."
	},
	{
		value: "rightHand",
		label: "Right hand height",
		help: "Your right wrist from bottom to top of the camera frame."
	},
	{
		value: "spread",
		label: "Hand spread",
		help: "Horizontal distance between your wrists across the frame."
	},
	{
		value: "lean",
		label: "Body lean",
		help: "Shoulder center relative to hip center: left is 0, upright is 0.5, right is 1."
	},
	{
		value: "presence",
		label: "Body visible",
		help: "1 when the torso is confidently visible; 0 when tracking is lost."
	}
];
var isBodySignal = (value) => BODY_SIGNALS.some((s) => s.value === value);
//#endregion
//#region src/features/parameter-animation.ts
var MAX_PARAMETER_KEYS = 1e3;
var MAX_PARAMETER_TIME_S = 604800;
/** File recovery is bounded and deterministic; commands validate before calling it. */
function readParameterKeys(value, min = -1e6, max = 1e6) {
	if (!Array.isArray(value)) return [];
	let keys = [];
	for (const [index, raw] of value.slice(0, MAX_PARAMETER_KEYS).entries()) {
		if (!raw || typeof raw !== "object" || !Number.isFinite(raw.timeS) || !Number.isFinite(raw.value)) continue;
		keys = putKeyframe(keys, {
			id: typeof raw.id === "string" && raw.id ? raw.id : `parameter-key-${index}`,
			timeS: Math.max(0, Math.min(MAX_PARAMETER_TIME_S, raw.timeS)),
			value: Math.max(min, Math.min(max, raw.value)),
			interpolation: raw.interpolation === "hold" || raw.interpolation === "smooth" ? raw.interpolation : "linear"
		});
	}
	return keys;
}
function readParameterAnimation(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value).slice(0, 256).flatMap(([name, raw]) => {
		if ([
			"__proto__",
			"constructor",
			"prototype"
		].includes(name)) return [];
		const keys = readParameterKeys(raw);
		return keys.length ? [[name, keys]] : [];
	}));
}
//#endregion
//#region src/features/read-features.ts
var record$2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v) ? v : {};
var number$1 = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
var text = (v, fallback) => typeof v === "string" ? v : fallback;
var clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function readCamera(value) {
	const r = record$2(value);
	return {
		deviceId: text(r.deviceId, ""),
		aspect: r.aspect === "4:3" || r.aspect === "1:1" ? r.aspect : "16:9",
		mirror: r.mirror !== false,
		flipY: r.flipY === true
	};
}
function readGeneratedSources(source) {
	const result = {};
	if (source.webcam) result.webcam = readCamera(source.webcam);
	if (source.cast === true) result.cast = true;
	if (source.web) {
		const url = text(record$2(source.web).url, "");
		result.web = { url: /^https:\/\/\S{1,2040}$/.test(url) ? url : "" };
	}
	if (source.drawing) result.drawing = readDrawing(source.drawing);
	if (source.testPattern === "grid" || source.testPattern === "bars") result.testPattern = source.testPattern;
	if (source.shader) {
		const r = record$2(source.shader);
		result.shader = {
			preset: text(r.preset, "mesh-gradient"),
			colors: Array.isArray(r.colors) ? r.colors.filter((c) => typeof c === "string").slice(0, 10) : [],
			parameters: Object.fromEntries(Object.entries(record$2(r.parameters)).filter(([k, v]) => ![
				"__proto__",
				"constructor",
				"style",
				"children",
				"ref",
				"image",
				"frame"
			].includes(k) && (typeof v === "boolean" || typeof v === "string" || typeof v === "number" && Number.isFinite(v)))),
			...r.time ? { time: readShaderTime(r.time) } : {},
			...r.modulation ? { modulation: readModulation(r.modulation) } : {},
			...r.animation ? { animation: readParameterAnimation(r.animation) } : {}
		};
		if (r.looks) {
			const looks = {};
			for (const slot of [
				"A",
				"B",
				"C"
			]) {
				const raw = record$2(record$2(r.looks)[slot]);
				if (typeof raw.preset !== "string") continue;
				const look = readGeneratedSources({ shader: {
					...raw,
					looks: void 0
				} }).shader;
				if (look) looks[slot] = look;
			}
			result.shader.looks = looks;
		}
	}
	if (source.tracker) {
		const r = record$2(source.tracker);
		const tracker = {
			...DEFAULT_TRACKER,
			...readCamera(r),
			style: [
				"skin",
				"silhouette",
				"wire",
				"metal"
			].includes(String(r.style)) ? r.style : "skin",
			color: text(r.color, DEFAULT_TRACKER.color),
			hand: r.hand === "left" || r.hand === "right" ? r.hand : "both",
			handCount: r.handCount === 1 ? 1 : 2,
			scale: clamp(number$1(r.scale, 1), .1, 5),
			...r.subject === "face" ? { subject: "face" } : {}
		};
		const rec = record$2(r.recording);
		if (Array.isArray(rec.frames)) tracker.recording = {
			durationS: Math.max(.001, number$1(rec.durationS, 1)),
			loop: rec.loop !== false,
			frames: rec.frames.slice(0, 36e3).map((frame) => {
				const f = record$2(frame);
				return {
					timeS: Math.max(0, number$1(f.timeS, 0)),
					hands: Array.isArray(f.hands) ? f.hands.slice(0, 2).flatMap((hand) => {
						const h = record$2(hand);
						if (!Array.isArray(h.points) || h.points.length !== 21) return [];
						return [{
							side: h.side === "Left" ? "Left" : "Right",
							points: h.points.map((p) => Array.isArray(p) ? [
								number$1(p[0], 0),
								number$1(p[1], 0),
								number$1(p[2], 0)
							] : [
								0,
								0,
								0
							])
						}];
					}) : []
				};
			}).sort((a, b) => a.timeS - b.timeS)
		};
		result.tracker = tracker;
	}
	return result;
}
function readFeatureFields(raw) {
	const fields = {};
	if ([
		"surface",
		"mask",
		"text",
		"shader",
		"webcam",
		"tracker",
		"stream",
		"web"
	].includes(String(raw.kind))) fields.kind = raw.kind;
	if (typeof raw.locked === "boolean") fields.locked = raw.locked;
	if (raw.shape === "ellipse" || raw.shape === "rectangle") fields.shape = raw.shape;
	if (raw.radiusPx !== void 0) fields.radiusPx = Math.max(0, number$1(raw.radiusPx, 0));
	if (raw.transform) {
		const r = record$2(raw.transform);
		fields.transform = { ...DEFAULT_TRANSFORM };
		for (const key of Object.keys(DEFAULT_TRANSFORM)) fields.transform[key] = number$1(r[key], DEFAULT_TRANSFORM[key]);
	}
	if (raw.animation) {
		const animation = {};
		for (const property of [
			"opacity",
			"xPx",
			"yPx",
			"scaleX",
			"scaleY",
			"rotationDeg"
		]) {
			const keys = record$2(raw.animation)[property];
			if (Array.isArray(keys)) animation[property] = keys.slice(0, 1e4).map((key, index) => {
				const k = record$2(key);
				return {
					id: text(k.id, `${property}-${index}`),
					timeS: Math.max(0, number$1(k.timeS, 0)),
					value: number$1(k.value, property === "opacity" ? 1 : DEFAULT_TRANSFORM[property]),
					interpolation: k.interpolation === "hold" ? "hold" : k.interpolation === "smooth" ? "smooth" : "linear"
				};
			});
		}
		fields.animation = animation;
		for (const spec of SURFACE_PARAMETERS.filter((p) => p.key === "radiusPx" || p.key === "bendAngleDeg")) {
			const keys = readParameterKeys(record$2(raw.animation)[spec.key], spec.min, spec.max);
			if (keys.length) animation[spec.key] = keys;
		}
	}
	const modulation = {};
	for (const spec of SURFACE_PARAMETERS) {
		const entry = record$2(raw.modulation)[spec.key];
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const m = readModulation({ value: entry }).value;
		if (m) modulation[spec.key] = {
			...m,
			...m.range ? { range: {
				min: clamp(m.range.min, spec.min, spec.max),
				max: clamp(m.range.max, spec.min, spec.max)
			} } : {}
		};
	}
	if (Object.keys(modulation).length) fields.modulation = modulation;
	return fields;
}
function readOutputCrop(raw) {
	if (!raw) return void 0;
	const c = record$2(raw);
	return {
		xPx: number$1(c.xPx, 0),
		yPx: number$1(c.yPx, 0),
		widthPx: Math.max(1, number$1(c.widthPx, 1920)),
		heightPx: Math.max(1, number$1(c.heightPx, 1080)),
		fit: c.fit === "contain" || c.fit === "stretch" ? c.fit : "cover"
	};
}
function readShaderTime(value) {
	const r = record$2(value);
	return {
		offsetS: number$1(r.offsetS, 0),
		loopS: Math.max(0, number$1(r.loopS, 0)),
		direction: r.direction === "reverse" || r.direction === "pingpong" ? r.direction : "forward",
		frozen: r.frozen === true
	};
}
/** Only real cycles survive a read: a zero period is off, not a divide by zero. */
function readModulation(value) {
	return Object.fromEntries(Object.entries(record$2(value)).flatMap(([key, entry]) => {
		if (["__proto__", "constructor"].includes(key)) return [];
		const r = record$2(entry);
		const periodS = number$1(r.periodS, DEFAULT_MODULATION.periodS);
		if (periodS <= 0 && r.source !== "audio" && r.source !== "midi" && r.source !== "lfo" && r.source !== "body") return [];
		return [[key, {
			...r.source === "audio" || r.source === "midi" || r.source === "lfo" || r.source === "body" ? { source: r.source } : {},
			...typeof r.control === "number" && Number.isInteger(r.control) && r.control >= 0 && r.control <= 127 ? { control: r.control } : {},
			...r.band === "low" || r.band === "mid" || r.band === "high" || r.band === "level" ? { band: r.band } : {},
			...r.audioSignal === "beat" ? { audioSignal: "beat" } : {},
			...isBodySignal(r.bodySignal) ? { bodySignal: r.bodySignal } : {},
			...r.clock === "scene" ? { clock: "scene" } : {},
			...r.source === "lfo" ? { lfoIndex: clamp(Math.round(number$1(r.lfoIndex, 0)), 0, 3) } : {},
			...r.invert === true ? { invert: true } : {},
			...typeof record$2(r.range).min === "number" && Number.isFinite(record$2(r.range).min) && typeof record$2(r.range).max === "number" && Number.isFinite(record$2(r.range).max) ? { range: {
				min: Math.min(Number(record$2(r.range).min), Number(record$2(r.range).max)),
				max: Math.max(Number(record$2(r.range).min), Number(record$2(r.range).max))
			} } : {},
			amount: number$1(r.amount, DEFAULT_MODULATION.amount),
			periodS,
			waveform: r.waveform === "triangle" || r.waveform === "square" || r.waveform === "ramp" ? r.waveform : "sine",
			phase: number$1(r.phase, 0)
		}]];
	}));
}
/** Painted strokes. A stroke needs two points to be a line; anything shorter is
*  dropped rather than reaching the renderer as a degenerate path. */
function readDrawing(value) {
	const raw = record$2(value);
	const replay = record$2(raw.replay);
	const strokes = Array.isArray(raw.strokes) ? raw.strokes : [];
	return {
		...raw.replay ? { replay: {
			durationS: clamp(number$1(replay.durationS, 5), .1, 3600),
			loop: replay.loop !== false
		} } : {},
		strokes: strokes.flatMap((entry) => {
			const stroke = record$2(entry);
			const points = Array.isArray(stroke.points) ? stroke.points.flatMap((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) ? [[Number(point[0]), Number(point[1])]] : []) : [];
			if (points.length < 2) return [];
			return [{
				points,
				color: text(stroke.color, "#ffffff"),
				widthPx: Math.max(.5, number$1(stroke.widthPx, 6))
			}];
		})
	};
}
function readLfos(value) {
	const entries = Array.isArray(value) ? value : [];
	return DEFAULT_LFOS.map((fallback, i) => {
		const r = record$2(entries[i]);
		return {
			periodS: clamp(number$1(r.periodS, fallback.periodS), .02, 3600),
			phase: number$1(r.phase, 0),
			waveform: r.waveform === "triangle" || r.waveform === "square" || r.waveform === "ramp" ? r.waveform : "sine"
		};
	});
}
//#endregion
//#region src/source-motion.ts
var SOURCE_MOTION_PARAMETERS = [
	{
		key: "cropLeftPx",
		label: "Crop left",
		unit: "px",
		min: 0,
		max: 1e6,
		step: .1
	},
	{
		key: "cropTopPx",
		label: "Crop top",
		unit: "px",
		min: 0,
		max: 1e6,
		step: .1
	},
	{
		key: "cropWidthPx",
		label: "Crop width",
		unit: "px",
		min: 1,
		max: 1e6,
		step: .1
	},
	{
		key: "cropHeightPx",
		label: "Crop height",
		unit: "px",
		min: 1,
		max: 1e6,
		step: .1
	},
	{
		key: "textSizePx",
		label: "Text size",
		unit: "px",
		min: 1,
		max: 1e4,
		step: .1
	},
	{
		key: "textLineHeight",
		label: "Line height",
		unit: "",
		min: .1,
		max: 20,
		step: .01
	},
	{
		key: "textLetterSpacingPx",
		label: "Letter spacing",
		unit: "px",
		min: -1e3,
		max: 1e3,
		step: .1
	},
	{
		key: "fillOpacityPercent",
		label: "Fill opacity",
		unit: "%",
		min: 0,
		max: 100,
		step: .1
	},
	{
		key: "gradientAngleDeg",
		label: "Gradient angle",
		unit: "°",
		min: -3600,
		max: 3600,
		step: .1
	},
	{
		key: "trackerScale",
		label: "Tracker size",
		unit: "",
		min: .1,
		max: 5,
		step: .01
	},
	{
		key: "drawingDurationS",
		label: "Drawing duration",
		unit: "s",
		min: .1,
		max: 3600,
		step: .1
	},
	{
		key: "keySimilarityPercent",
		label: "Key tolerance",
		unit: "%",
		min: 0,
		max: 100,
		step: .1
	},
	{
		key: "keySoftnessPercent",
		label: "Key softness",
		unit: "%",
		min: 0,
		max: 100,
		step: .1
	},
	{
		key: "keySpillPercent",
		label: "Key spill suppression",
		unit: "%",
		min: 0,
		max: 100,
		step: .1
	}
];
var record$1 = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var bound = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
function sourceMotionIsFull(source, key) {
	const keys = /* @__PURE__ */ new Set([...Object.keys(source.motion?.animation ?? {}), ...Object.keys(source.motion?.modulation ?? {})]);
	return keys.size >= 256 && !keys.has(key);
}
function hasSourceMotion(source) {
	return !!(Object.keys(source.motion?.animation ?? {}).length || Object.keys(source.motion?.modulation ?? {}).length);
}
function sourceMotionVersion(show) {
	if (show.version >= 10) return show;
	const surfaces = [...show.unassignedSurfaces ?? [], ...(show.scenes ?? []).flatMap((s) => s.surfaces ?? [])];
	const sources = [
		...(show.pool ?? []).map((a) => a.source),
		...(show.visuals ?? []).flatMap((v) => v.source ? [v.source] : []),
		...surfaces.flatMap((s) => [s.source, ...(s.clips ?? []).flatMap((c) => c.source ? [c.source] : [])])
	];
	return sources.some((s) => s && [...Object.keys(s.motion?.animation ?? {}), ...Object.keys(s.motion?.modulation ?? {})].some((key) => extendedSourceSpec(key))) ? {
		...show,
		version: 10
	} : show.version < 9 && sources.some((s) => s && hasSourceMotion(s)) ? {
		...show,
		version: 9
	} : show;
}
function readSourceMotion(value) {
	const raw = record$1(value), curves = record$1(raw.animation), assignments = record$1(raw.modulation);
	const animation = {}, modulation = {};
	const specs = [...SOURCE_MOTION_PARAMETERS, ...[.../* @__PURE__ */ new Set([...Object.keys(curves), ...Object.keys(assignments)])].filter((k) => extendedSourceSpec(k)).slice(0, 256).map((k) => extendedSourceSpec(k))];
	for (const spec of specs) {
		if ((/* @__PURE__ */ new Set([...Object.keys(animation), ...Object.keys(modulation)])).size >= 256) break;
		const parsed = readParameterKeys(curves[spec.key], spec.min, spec.max);
		const keys = spec.key.startsWith("choice:") ? parsed.map((k) => ({
			...k,
			value: Math.round(k.value),
			interpolation: "hold"
		})) : parsed;
		if (keys.length) animation[spec.key] = keys;
		const entry = assignments[spec.key];
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const m = readModulation({ value: entry }).value;
		if (!m) continue;
		modulation[spec.key] = {
			...m,
			...m.range ? { range: {
				min: bound(m.range.min, spec.min, spec.max, spec.min),
				max: bound(m.range.max, spec.min, spec.max, spec.max)
			} } : {}
		};
	}
	return Object.keys(animation).length || Object.keys(modulation).length ? {
		...Object.keys(animation).length ? { animation } : {},
		...Object.keys(modulation).length ? { modulation } : {}
	} : void 0;
}
/** Only controls used by the active renderer are offered. Inactive assignments survive toggles. */
function sourceParameters(source, media) {
	const values = {};
	if (source.tracker) values.trackerScale = source.tracker.scale;
	else if (source.webcam || source.shader) {} else if (source.drawing) {
		if (source.drawing.replay) values.drawingDurationS = source.drawing.replay.durationS;
	} else if (source.testPattern) {} else if (source.text) Object.assign(values, {
		textSizePx: source.text.sizePx,
		textLineHeight: source.text.lineHeight ?? 1.2,
		textLetterSpacingPx: source.text.letterSpacingPx ?? 0
	});
	else if (source.fill || source.fillGradient) {
		values.fillOpacityPercent = (source.fillOpacity ?? 1) * 100;
		if (source.fillGradient?.kind === "linear") values.gradientAngleDeg = source.fillGradient.angleDeg;
	} else if (source.mediaId && media?.kind !== "audio") {
		Object.assign(values, {
			cropLeftPx: source.rect[0],
			cropTopPx: source.rect[1],
			cropWidthPx: source.rect[2],
			cropHeightPx: source.rect[3]
		});
		if (source.chromaKey?.enabled) Object.assign(values, {
			keySimilarityPercent: source.chromaKey.similarity * 100,
			keySoftnessPercent: source.chromaKey.softness * 100,
			keySpillPercent: source.chromaKey.spill * 100
		});
	}
	return [...SOURCE_MOTION_PARAMETERS.flatMap((spec) => {
		const base = values[spec.key];
		if (base === void 0) return [];
		const dimension = spec.key === "cropLeftPx" || spec.key === "cropWidthPx" ? media?.width : spec.key === "cropTopPx" || spec.key === "cropHeightPx" ? media?.height : void 0;
		const max = dimension && Number.isFinite(dimension) ? Math.min(spec.max, Math.max(spec.min, dimension - (spec.min === 0 ? 1 : 0))) : spec.max;
		return [{
			...spec,
			max,
			base
		}];
	}), ...extendedSourceParameters(source, media)];
}
function writeValues(source, values, media) {
	let next = source;
	let rect;
	for (const spec of sourceParameters(source, media)) {
		const raw = values[spec.key];
		if (raw === void 0 || !Number.isFinite(raw)) continue;
		const v = bound(raw, spec.min, spec.max, spec.base);
		switch (spec.key) {
			case "cropLeftPx":
			case "cropTopPx":
			case "cropWidthPx":
			case "cropHeightPx":
				rect ??= [...source.rect];
				rect[[
					"cropLeftPx",
					"cropTopPx",
					"cropWidthPx",
					"cropHeightPx"
				].indexOf(spec.key)] = v;
				break;
			case "textSizePx":
				next = {
					...next,
					text: {
						...next.text,
						sizePx: v
					}
				};
				break;
			case "textLineHeight":
				next = {
					...next,
					text: {
						...next.text,
						lineHeight: v
					}
				};
				break;
			case "textLetterSpacingPx":
				next = {
					...next,
					text: {
						...next.text,
						letterSpacingPx: v
					}
				};
				break;
			case "fillOpacityPercent":
				next = {
					...next,
					fillOpacity: v / 100
				};
				break;
			case "gradientAngleDeg":
				next = {
					...next,
					fillGradient: {
						...next.fillGradient,
						angleDeg: v
					}
				};
				break;
			case "trackerScale":
				next = {
					...next,
					tracker: {
						...next.tracker,
						scale: v
					}
				};
				break;
			case "drawingDurationS":
				next = {
					...next,
					drawing: {
						...next.drawing,
						replay: {
							...next.drawing.replay,
							durationS: v
						}
					}
				};
				break;
			case "keySimilarityPercent":
				next = {
					...next,
					chromaKey: {
						...next.chromaKey,
						similarity: v / 100
					}
				};
				break;
			case "keySoftnessPercent":
				next = {
					...next,
					chromaKey: {
						...next.chromaKey,
						softness: v / 100
					}
				};
				break;
			case "keySpillPercent": next = {
				...next,
				chromaKey: {
					...next.chromaKey,
					spill: v / 100
				}
			};
		}
	}
	if (rect) {
		if (media) {
			const w = Math.max(1, media.width), h = Math.max(1, media.height);
			rect = [
				Math.min(w - 1, rect[0]),
				Math.min(h - 1, rect[1]),
				rect[2],
				rect[3]
			];
			rect[2] = Math.min(w - rect[0], rect[2]);
			rect[3] = Math.min(h - rect[1], rect[3]);
		}
		next = {
			...next,
			rect
		};
	}
	return writeExtendedSourceValues(next, values, media);
}
/** Shader colors/choices share its trim/reverse/loop/freeze clock with numeric controls. */
function sourceParameterTime(source, key, timeS) {
	return source.shader && (key.startsWith("color:shader:") || key.startsWith("choice:shader:")) ? shaderTimeS(source.shader.time, timeS) : timeS;
}
function sourceMotionAt(source, sourceTimeS, sceneTimeS, inputs = {}, lfos, media) {
	if (!hasSourceMotion(source)) return source;
	const values = {};
	for (const spec of sourceParameters(source, media)) {
		const keys = source.motion?.animation?.[spec.key], m = source.motion?.modulation?.[spec.key];
		if (!keys?.length && !m) continue;
		const parameterTime = sourceParameterTime(source, spec.key, sourceTimeS);
		const keyed = keyframeValue(spec.options ? (keys ?? []).map((k) => ({
			...k,
			interpolation: "hold"
		})) : keys ?? [], parameterTime, spec.base);
		values[spec.key] = bound(m ? modulatedValue(keyed, m, m.source === "lfo" || m.clock === "scene" ? sceneTimeS : parameterTime, inputs.levels, inputs.controls, lfos) : keyed, spec.min, spec.max, spec.base);
	}
	return writeValues(source, values, media);
}
function setSourceMotion(source, key, value) {
	if ((value.keys?.length || value.modulation) && sourceMotionIsFull(source, key)) return source;
	const animation = { ...source.motion?.animation }, modulation = { ...source.motion?.modulation };
	if (value.keys?.length) animation[key] = value.keys;
	else delete animation[key];
	if (value.modulation) modulation[key] = value.modulation;
	else delete modulation[key];
	return {
		...source,
		motion: readSourceMotion({
			animation,
			modulation
		})
	};
}
function setSourceMotionBases(source, values, media) {
	return writeValues(source, values, media);
}
/** Ordinary inspector edits take over touched channels, leaving all other motion intact. */
function manualSourceEdit(before, after) {
	let next = after;
	const values = new Map(sourceParameters(after).map((p) => [p.key, p.base]));
	const specs = sourceParameters(before), changedColors = new Set(specs.filter((p) => p.binding && values.has(p.key) && values.get(p.key) !== p.base).map((p) => p.binding));
	for (const spec of specs) if (values.has(spec.key) && (values.get(spec.key) !== spec.base || spec.binding && changedColors.has(spec.binding))) next = setSourceMotion(next, spec.key, {});
	return next;
}
//#endregion
//#region src/clips.ts
var MIN_CLIP_S = .5;
function clipEnd(clip) {
	return clip.startS + clip.durationS;
}
/** The clip covering `timeS`, if any. Earlier clips win an overlap. */
function clipAt(clips, timeS) {
	return clips.find((clip) => clip.enabled !== false && timeS >= clip.startS && timeS < clipEnd(clip)) ?? null;
}
/**
* Where in the asset to be at `timeS`. A looping clip wraps around the
* asset's length; a non-looping one holds on its last frame.
*/
function mediaTime(clip, media, timeS) {
	const local = clip.inS + Math.max(timeS - clip.startS, 0);
	const length = media?.duration;
	if (!length || length <= 0) return local;
	return clip.loop ? local % length : Math.min(local, length);
}
/** Drag a clip's right edge. */
function trimEnd(clip, toEndS, sceneDurationS) {
	const endS = Math.max(clip.startS + MIN_CLIP_S, Math.min(toEndS, sceneDurationS));
	return {
		...clip,
		durationS: round(endS - clip.startS)
	};
}
/** Drag a clip's left edge; the asset's in-point moves with it so the picture does not jump. */
function trimStart(clip, toStartS) {
	const end = clipEnd(clip);
	const startS = Math.max(0, Math.min(toStartS, end - MIN_CLIP_S));
	const shift = startS - clip.startS;
	return {
		...clip,
		startS: round(startS),
		durationS: round(end - startS),
		inS: round(Math.max(0, clip.inS + shift))
	};
}
function round(value) {
	return Math.round(value * 1e3) / 1e3;
}
//#endregion
//#region src/surface-assets.ts
var sourceHasContent = (source) => Boolean(source.drawing || source.mediaId || source.text || source.fill || source.fillGradient || source.shader || source.webcam || source.tracker || source.testPattern);
function clipSource(surface, clip, media) {
	if (clip.source) return clip.source;
	const asset = media.find((m) => m.id === clip.mediaId);
	return {
		mediaId: clip.mediaId ?? null,
		rect: asset && asset.id !== surface.source.mediaId ? [
			0,
			0,
			asset.width,
			asset.height
		] : surface.source.rect
	};
}
function sourceKind(source) {
	return source.drawing ? "Drawing" : source.tracker ? "Tracker" : source.webcam ? "Webcam" : source.shader ? "Shader" : source.text ? "Text" : source.fill || source.fillGradient ? "Colour" : source.testPattern ? "Test pattern" : "Media";
}
function sourceName(source, media) {
	return source.mediaId && sourceKind(source) === "Media" ? media.find((m) => m.id === source.mediaId)?.name ?? "Missing asset" : source.text ? source.text.text.trim().split("\n")[0] || "Text" : sourceKind(source);
}
var sourceID = (surfaceID) => `source:${surfaceID}`;
function contentClip(source, media, atS = 0, id = nextId("k")) {
	const asset = media.find((m) => m.id === source.mediaId);
	const durationS = source.shader ? 15 : asset && asset.kind !== "image" && asset.duration ? asset.duration : source.tracker?.recording?.durationS ?? 30;
	return {
		id,
		source: structuredClone(source),
		startS: Math.max(0, atS),
		durationS: Math.max(.001, durationS),
		inS: 0,
		loop: Boolean(source.shader)
	};
}
//#endregion
//#region src/media-pool.ts
/** Clip source overrides are explicit, independent edits; otherwise use the pool definition. */
function visualSource(show, visual) {
	return visual.source ?? show.pool?.find((a) => a.id === visual.assetID)?.source ?? {
		mediaId: null,
		rect: [
			0,
			0,
			1920,
			1080
		]
	};
}
/** Legacy content becomes reusable without changing clip identity, targets or timing. */
function normalizeMediaPool(show) {
	const pool = [...show.pool ?? []], tracks = [...show.tracks ?? []];
	let changed = show.version < 6 || !show.pool || !show.tracks;
	const visuals = (show.visuals ?? []).map((v) => {
		let next = v;
		if (!v.assetID && !v.mask && !v.timelineRefID) {
			const source = visualSource(show, v), signature = JSON.stringify(source);
			let asset = pool.find((a) => JSON.stringify(a.source) === signature);
			if (!asset) {
				asset = {
					id: `pool-${v.id}`,
					name: v.name,
					source: structuredClone(source)
				};
				pool.push(asset);
			}
			const { source: _source, ...rest } = next;
			next = {
				...rest,
				assetID: asset.id
			};
			changed = true;
		}
		if (!next.trackID) {
			const timelineID = (v.targets.length === 1 && v.targets[0].surfaceID ? show.timelines?.find((t) => t.surfaceID === v.targets[0].surfaceID) : void 0)?.id ?? currentTimelineID(show);
			const kind = show.media.find((m) => m.id === visualSource({
				...show,
				pool
			}, next).mediaId)?.kind === "audio" ? "audio" : "video";
			let track = timelineID === "main" ? void 0 : tracks.find((t) => (t.timelineID ?? "main") === timelineID && (t.kind ?? "video") === kind && !t.locked && JSON.stringify(t.targets) === JSON.stringify(v.targets));
			if (!track) {
				track = {
					...timelineID !== "main" ? { timelineID } : {},
					id: `track-${v.id}`,
					name: kind === "audio" ? "A1" : "V1",
					kind,
					targets: v.targets.map((t) => ({ ...t })),
					enabled: true,
					locked: false
				};
				tracks.push(track);
			}
			next = {
				...next,
				trackID: track.id
			};
			changed = true;
		}
		return next;
	});
	for (const scene of show.scenes) for (const kind of ["video", "audio"]) {
		if (tracks.some((t) => !t.timelineID && (t.kind ?? "video") === kind && t.targets.some((a) => a.sceneID === scene.id))) continue;
		tracks.push({
			id: `track-default-${scene.id}-${kind}`,
			name: kind === "video" ? "V1" : "A1",
			kind,
			targets: [{ sceneID: scene.id }],
			enabled: true,
			locked: false
		});
		changed = true;
	}
	for (const media of show.media) {
		if (pool.some((a) => a.source.mediaId === media.id)) continue;
		pool.push({
			id: `pool-media-${media.id}`,
			name: media.name,
			source: {
				mediaId: media.id,
				rect: [
					0,
					0,
					media.width,
					media.height
				]
			}
		});
		changed = true;
	}
	return changed ? {
		...show,
		version: show.version >= 7 ? show.version : 6,
		pool,
		tracks,
		visuals
	} : show;
}
function addPoolAsset(show, source, name = sourceName(source, show.media)) {
	return {
		...show,
		version: show.version >= 7 ? show.version : 6,
		pool: [...show.pool ?? [], {
			id: nextId("pool"),
			name,
			source: structuredClone(source)
		}]
	};
}
function addVisualTrack(show, targets, name, kind = "video") {
	return {
		...show,
		tracks: [...show.tracks ?? [], {
			id: nextId("track"),
			...currentTimelineID(show) !== "main" ? { timelineID: currentTimelineID(show) } : {},
			kind,
			name: name ?? `${kind === "audio" ? "A" : "V"}${(show.tracks?.filter((t) => (t.timelineID ?? "main") === currentTimelineID(show) && (t.kind ?? "video") === kind && t.targets.some((a) => targets.some((b) => b.sceneID === a.sceneID))).length ?? 0) + 1}`,
			targets,
			enabled: true,
			locked: false
		}]
	};
}
/** Every drop creates a distinct clip. No source duplication, implicit replacement or shared clock. */
function placePoolAsset(show, assetID, trackID, startS) {
	const asset = show.pool?.find((a) => a.id === assetID), track = show.tracks?.find((t) => t.id === trackID);
	if (!asset || !track || track.locked || !trackAcceptsSource(show, track, asset.source)) return show;
	const source = asset.source;
	const end = Math.max(0, ...(show.visuals ?? []).filter((v) => v.trackID === trackID).map((v) => v.startS + v.durationS));
	const { source: _source, ...clip } = contentClip(source, show.media, startS === void 0 ? end : Math.max(0, startS));
	const visual = {
		...clip,
		name: asset.name,
		assetID,
		trackID,
		targets: track.targets.map((t) => ({ ...t })),
		mapping: "repeat",
		color: layerColor(show.tracks?.indexOf(track) ?? 0),
		opacity: 1
	};
	return {
		...show,
		visuals: [...show.visuals ?? [], visual]
	};
}
function trackAcceptsSource(show, track, source) {
	const media = show.media.find((m) => m.id === source.mediaId);
	return track.kind === "audio" ? !!media && (media.kind === "audio" || media.kind === "video") : media?.kind !== "audio";
}
//#endregion
//#region src/visual-placement.ts
var DEFAULT_PLACEMENT = {
	xPercent: 50,
	yPercent: 50,
	widthPercent: 100,
	heightPercent: 100,
	rotationDeg: 0
};
function readVisualPlacement(value) {
	const raw = value && typeof value === "object" ? value : {};
	const n = (key, min, max) => typeof raw[key] === "number" && Number.isFinite(raw[key]) ? Math.min(max, Math.max(min, raw[key])) : DEFAULT_PLACEMENT[key];
	return {
		xPercent: n("xPercent", -1e3, 1e3),
		yPercent: n("yPercent", -1e3, 1e3),
		widthPercent: n("widthPercent", .1, 2e3),
		heightPercent: n("heightPercent", .1, 2e3),
		rotationDeg: n("rotationDeg", -3600, 3600)
	};
}
/** Place a content-sized rectangle through the same transform as its full frame. */
function contentPlacementCorners(value, frame, bounds) {
	const p = readVisualPlacement(value), r = p.rotationDeg * Math.PI / 180;
	return [
		[bounds[0], bounds[1]],
		[bounds[0] + bounds[2], bounds[1]],
		[bounds[0] + bounds[2], bounds[1] + bounds[3]],
		[bounds[0], bounds[1] + bounds[3]]
	].map(([x, y]) => {
		const dx = (x - frame[0] - frame[2] / 2) * p.widthPercent / 100, dy = (y - frame[1] - frame[3] / 2) * p.heightPercent / 100;
		return [frame[0] + frame[2] * p.xPercent / 100 + dx * Math.cos(r) - dy * Math.sin(r), frame[1] + frame[3] * p.yPercent / 100 + dx * Math.sin(r) + dy * Math.cos(r)];
	});
}
//#endregion
//#region src/visual-motion.ts
var VISUAL_MOTION_PARAMETERS = [
	{
		key: "opacityPercent",
		label: "Opacity",
		group: "Visual",
		unit: "%",
		min: 0,
		max: 100,
		step: .1,
		sliderMin: 0,
		sliderMax: 100
	},
	{
		key: "xPercent",
		label: "Position X",
		group: "Position",
		unit: "%",
		min: -1e3,
		max: 1e3,
		step: .1,
		sliderMin: -100,
		sliderMax: 200
	},
	{
		key: "yPercent",
		label: "Position Y",
		group: "Position",
		unit: "%",
		min: -1e3,
		max: 1e3,
		step: .1,
		sliderMin: -100,
		sliderMax: 200
	},
	{
		key: "widthPercent",
		label: "Width",
		group: "Position",
		unit: "%",
		min: .1,
		max: 2e3,
		step: .1,
		sliderMin: .1,
		sliderMax: 200
	},
	{
		key: "heightPercent",
		label: "Height",
		group: "Position",
		unit: "%",
		min: .1,
		max: 2e3,
		step: .1,
		sliderMin: .1,
		sliderMax: 200
	},
	{
		key: "rotationDeg",
		label: "Rotation",
		group: "Position",
		unit: "°",
		min: -3600,
		max: 3600,
		step: .1,
		sliderMin: -180,
		sliderMax: 180
	}
];
var record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var bounded = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
function visualMotionBase(visual) {
	return {
		...readVisualPlacement(visual.placement),
		opacityPercent: visual.opacity * 100
	};
}
function hasVisualMotion(visual) {
	return !!(Object.keys(visual.motion?.animation ?? {}).length || Object.keys(visual.motion?.modulation ?? {}).length);
}
function visualMotionVersion(show) {
	return show.version < 8 && show.visuals?.some(hasVisualMotion) ? {
		...show,
		version: 8
	} : show;
}
/** Recover only supported numeric channels; malformed files cannot invent controls. */
function readVisualMotion(value, opacityOnly = false) {
	const raw = record(value), curves = record(raw.animation), assignments = record(raw.modulation);
	const animation = {}, modulation = {};
	for (const spec of VISUAL_MOTION_PARAMETERS) {
		if (opacityOnly && spec.key !== "opacityPercent") continue;
		const keys = readParameterKeys(curves[spec.key], spec.min, spec.max);
		if (keys.length) animation[spec.key] = keys;
		const entry = assignments[spec.key];
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const m = readModulation({ value: entry }).value;
		if (!m) continue;
		modulation[spec.key] = {
			...m,
			...m.range ? { range: {
				min: bounded(m.range.min, spec.min, spec.max, spec.min),
				max: bounded(m.range.max, spec.min, spec.max, spec.max)
			} } : {}
		};
	}
	return Object.keys(animation).length || Object.keys(modulation).length ? {
		...Object.keys(animation).length ? { animation } : {},
		...Object.keys(modulation).length ? { modulation } : {}
	} : void 0;
}
/** Source-time curves precede live/scene-time modulation. Authored bases stay unchanged. */
function visualMotionAt(visual, sourceTimeS, sceneTimeS, inputs = {}, lfos) {
	if (!hasVisualMotion(visual)) return visual;
	const values = visualMotionBase(visual), placement = readVisualPlacement(visual.placement);
	let opacity = visual.opacity, positionChanged = false;
	for (const spec of VISUAL_MOTION_PARAMETERS) {
		if (visual.timelineRefID && spec.key !== "opacityPercent") continue;
		const keys = visual.motion?.animation?.[spec.key], m = visual.motion?.modulation?.[spec.key];
		if (!keys?.length && !m) continue;
		const base = values[spec.key], keyed = keyframeValue(keys ?? [], sourceTimeS, base);
		const value = bounded(m ? modulatedValue(keyed, m, m.source === "lfo" || m.clock === "scene" ? sceneTimeS : sourceTimeS, inputs.levels, inputs.controls, lfos) : keyed, spec.min, spec.max, base);
		if (spec.key === "opacityPercent") opacity = value / 100;
		else {
			placement[spec.key] = value;
			positionChanged = true;
		}
	}
	return {
		...visual,
		opacity,
		...positionChanged ? { placement } : {}
	};
}
//#endregion
//#region src/visual-clock.ts
/** Clip-local source time; a compound use samples its child timeline's duration. */
function visualSourceTime(show, visual, timeS) {
	if (visual.continuous) return timeS;
	if (visual.timelineRefID) {
		const duration = show.timelines?.find((t) => t.id === visual.timelineRefID)?.durationS ?? 0, local = visual.inS + timeS - visual.startS;
		return duration > 0 ? visual.loop ? (local % duration + duration) % duration : Math.max(0, Math.min(local, duration - 1e-6)) : 0;
	}
	const source = visualSource(show, visual);
	return mediaTime(visual, show.media.find((m) => m.id === source.mediaId), timeS);
}
//#endregion
//#region src/timelines.ts
var MAIN_TIMELINE = "main";
var isClip = (t) => !!t?.board;
function currentTimelineID(show) {
	return show.timelines?.some((t) => t.id === show.activeTimelineID && (isClip(t) || t.sceneID === show.activeSceneId)) ? show.activeTimelineID : MAIN_TIMELINE;
}
function timelineDuration(show, id = currentTimelineID(show)) {
	return show.timelines?.find((t) => t.id === id)?.durationS ?? activeScene(show)?.durationS ?? 60;
}
function timelineTracks(show, id = currentTimelineID(show)) {
	return (show.tracks ?? []).filter((t) => (t.timelineID ?? "main") === id);
}
function timelineVisuals(show, id = currentTimelineID(show)) {
	const tracks = new Map((show.tracks ?? []).map((t) => [t.id, t]));
	return (show.visuals ?? []).filter((v) => (tracks.get(v.trackID ?? "")?.timelineID ?? "main") === id);
}
function canNestTimeline(show, childID, parentID = currentTimelineID(show)) {
	const child = show.timelines?.find((t) => t.id === childID);
	if (!child || childID === parentID) return false;
	if (!isClip(child) && (child.sceneID !== show.activeSceneId || isClip(show.timelines?.find((t) => t.id === parentID)))) return false;
	const seen = /* @__PURE__ */ new Set();
	const reaches = (id) => {
		if (id === parentID) return true;
		if (seen.has(id)) return false;
		seen.add(id);
		return timelineVisuals(show, id).some((v) => v.timelineRefID && reaches(v.timelineRefID));
	};
	return !reaches(childID);
}
function scheduledVisuals(show, timeS, id = currentTimelineID(show), inputs = {}) {
	const result = [];
	const visit = (timelineID, time, path, opacity, gain, hosts, uses = [], board) => {
		const tracks = timelineTracks(show, timelineID), ranks = new Map(tracks.map((t, i) => [t.id, i]));
		const solo = tracks.some((t) => t.kind === "audio" && t.enabled && t.solo);
		const clips = timelineVisuals(show, timelineID).sort((a, b) => (ranks.get(a.trackID ?? "") ?? -1) - (ranks.get(b.trackID ?? "") ?? -1));
		for (const authored of clips) {
			let visual = visualMotionAt(authored, visualSourceTime(show, authored, time), timeS, inputs, show.lfos);
			if (!visual.timelineRefID) {
				const source = visualSource(show, visual);
				if (hasSourceMotion(source)) visual = {
					...visual,
					source: sourceMotionAt(source, visualSourceTime(show, authored, time), timeS, inputs, show.lfos, show.media.find((m) => m.id === source.mediaId))
				};
			}
			const track = tracks.find((t) => t.id === visual.trackID);
			if (track?.enabled === false || visual.enabled === false || track?.kind === "audio" && solo && !track.solo) continue;
			if (visual.timelineRefID) {
				const child = show.timelines?.find((t) => t.id === visual.timelineRefID);
				if (!child || path.includes(child.id) || time < visual.startS || time >= visual.startS + visual.durationS) continue;
				const clock = visualSourceTime(show, visual, time);
				const surfaces = visual.targets.flatMap((t) => t.surfaceID ? [t.surfaceID] : []);
				const next = [
					...path,
					visual.id,
					child.id
				];
				if (visual.transitionS) opacity *= Math.min(1, Math.max(0, (time - visual.startS) / visual.transitionS));
				if (isClip(child)) {
					const step = {
						board: child.board,
						fit: visual.clipFit ?? "stretch",
						...visual.placement ? { placement: visual.placement } : {},
						...!board && surfaces.length ? { hosts: surfaces } : {}
					};
					visit(child.id, clock, next, opacity * visual.opacity, gain, hosts, [step, ...uses], child.board);
				} else if (!board) visit(child.id, clock, next, opacity * visual.opacity, gain, hosts ?? (surfaces.length ? surfaces : void 0));
			} else result.push({
				visual: path.length ? {
					...visual,
					id: `${path.join("/")}/${visual.id}`,
					opacity: visual.opacity * opacity,
					legacyTrack: visual.legacyTrack ? `${path.join("/")}/${visual.legacyTrack}` : void 0
				} : visual,
				track,
				timeS: time,
				gain,
				...hosts ? { hosts } : {},
				...board ? {
					board,
					clips: uses
				} : {}
			});
		}
	};
	const root = show.timelines?.find((t) => t.id === id);
	visit(id, timeS, [], 1, 1, void 0, [], root?.board);
	return result;
}
function validateTimelines(show) {
	const ids = new Set(show.timelines?.map((t) => t.id));
	if (ids.size !== (show.timelines?.length ?? 0) || ids.has("main")) throw new Error("Invalid or duplicate timeline identity.");
	for (const t of show.timelines ?? []) if (!isClip(t) && !show.scenes.some((s) => s.id === t.sceneID)) throw new Error(`Missing scene for timeline ${t.name}.`);
	for (const track of show.tracks ?? []) if (track.timelineID && !ids.has(track.timelineID)) throw new Error("Missing timeline for track.");
	for (const v of show.visuals ?? []) if (v.timelineRefID) {
		const parent = show.tracks?.find((t) => t.id === v.trackID);
		const child = show.timelines?.find((t) => t.id === v.timelineRefID);
		if (!parent || parent.kind === "audio" || !child || !isClip(child) && !parent.targets.some((t) => t.sceneID === child.sceneID) || !canNestTimeline({
			...show,
			activeSceneId: child.sceneID
		}, child.id, parent.timelineID ?? "main")) throw new Error("Missing or cyclic nested timeline.");
	}
}
//#endregion
//#region src/show-timeline.ts
/** The show being edited in the Show workspace. */
var activeShow = (show) => show.shows?.find((p) => p.id === show.activeShowID) ?? show.shows?.[0];
/** Replace the active show's timeline. */
function withActiveShow(show, change) {
	const current = activeShow(show);
	if (!current) return show;
	return {
		...show,
		shows: show.shows.map((p) => p.id === current.id ? change(p) : p)
	};
}
var finite$1 = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
var ACTIONS = [
	"play",
	"pause",
	"stop",
	"jump",
	"blackout-on",
	"blackout-off"
];
/** The default show for a document that has none: every canvas plays its Main
* for the canvas's duration, looping, from 0. */
function defaultShowTimeline(show) {
	return {
		tracks: show.scenes.map((c) => ({
			id: `track-${c.id}`,
			canvasID: c.id,
			clips: [{
				id: `clip-${c.id}`,
				sceneID: MAIN_TIMELINE,
				startS: 0,
				durationS: c.durationS,
				inS: 0,
				loop: true
			}]
		})),
		cues: [],
		durationS: Math.max(1, ...show.scenes.map((c) => c.durationS))
	};
}
/** Keeps the show in step with the canvases: a new canvas gets a track playing
* its Main; a deleted canvas's track goes. Pure; returns the same show when
* nothing changes. */
function normalizeShowTimeline(input) {
	let show = input;
	if (!show.shows?.length) {
		const { showTimeline, ...rest } = show;
		show = {
			...rest,
			shows: [{
				id: "show-1",
				name: "Show 1",
				...showTimeline ?? defaultShowTimeline(show)
			}]
		};
	}
	const ids = new Set(show.scenes.map((c) => c.id));
	let changed = show !== input;
	const shows = show.shows.map((program) => {
		const kept = program.tracks.filter((t) => ids.has(t.canvasID));
		const missing = show.scenes.filter((c) => !kept.some((t) => t.canvasID === c.id));
		if (kept.length === program.tracks.length && !missing.length) return program;
		changed = true;
		return {
			...program,
			tracks: [...kept, ...defaultShowTimeline({
				...show,
				scenes: missing
			}).tracks]
		};
	});
	return changed ? {
		...show,
		shows
	} : input;
}
function readShows(raw) {
	if (!Array.isArray(raw)) return void 0;
	return raw.flatMap((entry, index) => {
		const timeline = readShowTimeline(entry);
		const value = entry;
		return timeline ? [{
			id: typeof value.id === "string" ? value.id : `show-${index + 1}`,
			name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 120) : `Show ${index + 1}`,
			...timeline
		}] : [];
	});
}
function readShowTimeline(raw) {
	if (!raw || typeof raw !== "object") return void 0;
	const value = raw;
	const records = (list) => Array.isArray(list) ? list.filter((x) => !!x && typeof x === "object") : [];
	return {
		durationS: Math.max(1, finite$1(value.durationS, 60)),
		tracks: records(value.tracks).map((t) => ({
			id: String(t.id),
			canvasID: String(t.canvasID),
			clips: records(t.clips).map((c) => ({
				id: String(c.id),
				sceneID: String(c.sceneID ?? "main"),
				startS: Math.max(0, finite$1(c.startS, 0)),
				durationS: Math.max(.1, finite$1(c.durationS, 10)),
				inS: Math.max(0, finite$1(c.inS, 0)),
				...typeof c.showID === "string" ? { showID: c.showID } : {},
				...c.loop === true ? { loop: true } : {},
				...typeof c.speed === "number" && c.speed > 0 ? { speed: c.speed } : {},
				...c.roleOverrides && typeof c.roleOverrides === "object" ? { roleOverrides: Object.fromEntries(Object.entries(c.roleOverrides).filter(([, v]) => typeof v === "string")) } : {}
			}))
		})),
		...Array.isArray(value.audio) ? { audio: records(value.audio).filter((a) => typeof a.mediaId === "string").map((a) => ({
			id: String(a.id),
			mediaId: String(a.mediaId),
			startS: Math.max(0, finite$1(a.startS, 0)),
			durationS: Math.max(.1, finite$1(a.durationS, 10)),
			inS: Math.max(0, finite$1(a.inS, 0)),
			...typeof a.gain === "number" ? { gain: Math.max(0, Math.min(2, a.gain)) } : {}
		})) } : {},
		cues: records(value.cues).map((c) => ({
			id: String(c.id),
			name: String(c.name ?? "Cue"),
			trigger: [
				"timeline",
				"go",
				"midi"
			].includes(String(c.trigger)) ? c.trigger : "go",
			action: ACTIONS.includes(c.action) ? c.action : "play",
			...typeof c.atS === "number" ? { atS: Math.max(0, c.atS) } : {},
			...typeof c.toS === "number" ? { toS: Math.max(0, c.toS) } : {},
			...typeof c.control === "number" ? { control: Math.round(c.control) } : {},
			...typeof c.times === "number" && c.times >= 1 ? { times: Math.round(c.times) } : {},
			...c.when && typeof c.when === "object" && typeof c.when.control === "number" ? { when: {
				control: Math.round(c.when.control),
				above: Math.max(0, Math.min(127, Number(c.when.above) || 0))
			} } : {}
		}))
	};
}
function newSceneClip(sceneID, startS, durationS) {
	return {
		id: nextId("clip"),
		sceneID,
		startS,
		durationS,
		inS: 0,
		loop: true
	};
}
//#endregion
//#region src/simple-visuals.ts
function visualIsLocked(show, visual) {
	return !!(visual.locked || show.tracks?.find((t) => t.id === visual.trackID)?.locked);
}
/** A new visual gets its own compositing track and loops until the show stops.
* Existing schedules are never converted merely by opening the simple editor. */
function addSimpleVisual(show, source, name, poolID, visualID) {
	if (show.media.some((m) => m.id === source.mediaId && m.kind === "audio")) return show;
	const scene = activeScene(show);
	const timeline = show.timelines?.find((t) => t.id === currentTimelineID(show));
	const surfaces = scene.surfaces.filter((s) => !s.sceneCanvas && s.kind !== "mask");
	const targets = isClip(timeline) ? [] : timeline?.surfaceID ? [{
		sceneID: scene.id,
		surfaceID: timeline.surfaceID
	}] : surfaces.length ? surfaces.map((s) => ({
		sceneID: scene.id,
		surfaceID: s.id
	})) : [{ sceneID: scene.id }];
	let next = poolID ? show : addPoolAsset(show, source, name);
	const assetID = poolID ?? next.pool.at(-1).id;
	if (!next.pool?.some((a) => a.id === assetID)) return show;
	next = addVisualTrack(next, targets, name);
	next = placePoolAsset(next, assetID, next.tracks.at(-1).id, 0);
	const id = next.visuals.at(-1).id;
	return {
		...next,
		visuals: next.visuals.map((v) => v.id === id ? {
			...v,
			...visualID ? { id: visualID } : {},
			name,
			continuous: true,
			loop: true,
			durationS: timelineDuration(show)
		} : v)
	};
}
/** Replace this use only; reused pool assets and the advanced schedule survive. */
function replaceSimpleVisual(show, id, source, name) {
	const visual = show.visuals?.find((v) => v.id === id);
	if (!visual || visual.timelineRefID || visualIsLocked(show, visual) || show.media.some((m) => m.id === source.mediaId && m.kind === "audio")) return show;
	return {
		...show,
		visuals: show.visuals.map((v) => v.id === id ? {
			...v,
			source: structuredClone(source),
			name
		} : v)
	};
}
//#endregion
//#region node_modules/react/cjs/react.production.js
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
	var REACT_PORTAL_TYPE = Symbol.for("react.portal");
	var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
	var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
	var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
	var REACT_CONTEXT_TYPE = Symbol.for("react.context");
	var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
	var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
	var REACT_MEMO_TYPE = Symbol.for("react.memo");
	var REACT_LAZY_TYPE = Symbol.for("react.lazy");
	var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
	var REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition");
	var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
	function getIteratorFn(maybeIterable) {
		if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
		maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
		return "function" === typeof maybeIterable ? maybeIterable : null;
	}
	var ReactNoopUpdateQueue = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var assign = Object.assign;
	var emptyObject = {};
	function Component(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	Component.prototype.isReactComponent = {};
	Component.prototype.setState = function(partialState, callback) {
		if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, partialState, callback, "setState");
	};
	Component.prototype.forceUpdate = function(callback) {
		this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
	};
	function ComponentDummy() {}
	ComponentDummy.prototype = Component.prototype;
	function PureComponent(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
	pureComponentPrototype.constructor = PureComponent;
	assign(pureComponentPrototype, Component.prototype);
	pureComponentPrototype.isPureReactComponent = !0;
	var isArrayImpl = Array.isArray;
	function noop() {}
	var ReactSharedInternals = {
		H: null,
		A: null,
		T: null,
		S: null
	};
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	function ReactElement(type, key, props) {
		var refProp = props.ref;
		return {
			$$typeof: REACT_ELEMENT_TYPE,
			type,
			key,
			ref: void 0 !== refProp ? refProp : null,
			props
		};
	}
	function cloneAndReplaceKey(oldElement, newKey) {
		return ReactElement(oldElement.type, newKey, oldElement.props);
	}
	function isValidElement(object) {
		return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
	}
	function escape(key) {
		var escaperLookup = {
			"=": "=0",
			":": "=2"
		};
		return "$" + key.replace(/[=:]/g, function(match) {
			return escaperLookup[match];
		});
	}
	var userProvidedKeyEscapeRegex = /\/+/g;
	function getElementKey(element, index) {
		return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
	}
	function resolveThenable(thenable) {
		switch (thenable.status) {
			case "fulfilled": return thenable.value;
			case "rejected": throw thenable.reason;
			default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
				"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
			}, function(error) {
				"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			})), thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
			}
		}
		throw thenable;
	}
	function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
		var type = typeof children;
		if ("undefined" === type || "boolean" === type) children = null;
		var invokeCallback = !1;
		if (null === children) invokeCallback = !0;
		else switch (type) {
			case "bigint":
			case "string":
			case "number":
				invokeCallback = !0;
				break;
			case "object": switch (children.$$typeof) {
				case REACT_ELEMENT_TYPE:
				case REACT_PORTAL_TYPE:
					invokeCallback = !0;
					break;
				case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
			}
		}
		if (invokeCallback) return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
			return c;
		})) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + invokeCallback)), array.push(callback)), 1;
		invokeCallback = 0;
		var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
		if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if (i = getIteratorFn(children), "function" === typeof i) for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if ("object" === type) {
			if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
			array = String(children);
			throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
		}
		return invokeCallback;
	}
	function mapChildren(children, func, context) {
		if (null == children) return children;
		var result = [], count = 0;
		mapIntoArray(children, result, "", "", function(child) {
			return func.call(context, child, count++);
		});
		return result;
	}
	function lazyInitializer(payload) {
		if (-1 === payload._status) {
			var ctor = payload._result, thenable = ctor();
			thenable.then(function(moduleObject) {
				if (0 === payload._status || -1 === payload._status) payload._status = 1, payload._result = moduleObject, void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
			}, function(error) {
				if (0 === payload._status || -1 === payload._status) payload._status = 2, payload._result = error, void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			});
			-1 === payload._status && (payload._status = 0, payload._result = thenable);
		}
		if (1 === payload._status) return payload._result.default;
		throw payload._result;
	}
	var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
		if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
			var event = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
				error
			});
			if (!window.dispatchEvent(event)) return;
		} else if ("object" === typeof process && "function" === typeof process.emit) {
			process.emit("uncaughtException", error);
			return;
		}
		console.error(error);
	};
	function startTransition(scope) {
		var prevTransition = ReactSharedInternals.T, currentTransition = {};
		currentTransition.types = null !== prevTransition ? prevTransition.types : null;
		ReactSharedInternals.T = currentTransition;
		try {
			var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
			null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
			"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
		} catch (error) {
			reportGlobalError(error);
		} finally {
			null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
		}
	}
	function addTransitionType(type) {
		var transition = ReactSharedInternals.T;
		if (null !== transition) {
			var transitionTypes = transition.types;
			null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
		} else startTransition(addTransitionType.bind(null, type));
	}
	var Children = {
		map: mapChildren,
		forEach: function(children, forEachFunc, forEachContext) {
			mapChildren(children, function() {
				forEachFunc.apply(this, arguments);
			}, forEachContext);
		},
		count: function(children) {
			var n = 0;
			mapChildren(children, function() {
				n++;
			});
			return n;
		},
		toArray: function(children) {
			return mapChildren(children, function(child) {
				return child;
			}) || [];
		},
		only: function(children) {
			if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
			return children;
		}
	};
	exports.Activity = REACT_ACTIVITY_TYPE;
	exports.Children = Children;
	exports.Component = Component;
	exports.Fragment = REACT_FRAGMENT_TYPE;
	exports.Profiler = REACT_PROFILER_TYPE;
	exports.PureComponent = PureComponent;
	exports.StrictMode = REACT_STRICT_MODE_TYPE;
	exports.Suspense = REACT_SUSPENSE_TYPE;
	exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
	exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
	exports.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(size) {
			return ReactSharedInternals.H.useMemoCache(size);
		}
	};
	exports.addTransitionType = addTransitionType;
	exports.cache = function(fn) {
		return function() {
			return fn.apply(null, arguments);
		};
	};
	exports.cacheSignal = function() {
		return null;
	};
	exports.cloneElement = function(element, config, children) {
		if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
		var props = assign({}, element.props), key = element.key;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
		var propName = arguments.length - 2;
		if (1 === propName) props.children = children;
		else if (1 < propName) {
			for (var childArray = Array(propName), i = 0; i < propName; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		return ReactElement(element.type, key, props);
	};
	exports.createContext = function(defaultValue) {
		defaultValue = {
			$$typeof: REACT_CONTEXT_TYPE,
			_currentValue: defaultValue,
			_currentValue2: defaultValue,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		};
		defaultValue.Provider = defaultValue;
		defaultValue.Consumer = {
			$$typeof: REACT_CONSUMER_TYPE,
			_context: defaultValue
		};
		return defaultValue;
	};
	exports.createElement = function(type, config, children) {
		var propName, props = {}, key = null;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
		var childrenLength = arguments.length - 2;
		if (1 === childrenLength) props.children = children;
		else if (1 < childrenLength) {
			for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === props[propName] && (props[propName] = childrenLength[propName]);
		return ReactElement(type, key, props);
	};
	exports.createRef = function() {
		return { current: null };
	};
	exports.forwardRef = function(render) {
		return {
			$$typeof: REACT_FORWARD_REF_TYPE,
			render
		};
	};
	exports.isValidElement = isValidElement;
	exports.lazy = function(ctor) {
		return {
			$$typeof: REACT_LAZY_TYPE,
			_payload: {
				_status: -1,
				_result: ctor
			},
			_init: lazyInitializer
		};
	};
	exports.memo = function(type, compare) {
		return {
			$$typeof: REACT_MEMO_TYPE,
			type,
			compare: void 0 === compare ? null : compare
		};
	};
	exports.startTransition = startTransition;
	exports.unstable_useCacheRefresh = function() {
		return ReactSharedInternals.H.useCacheRefresh();
	};
	exports.use = function(usable) {
		return ReactSharedInternals.H.use(usable);
	};
	exports.useActionState = function(action, initialState, permalink) {
		return ReactSharedInternals.H.useActionState(action, initialState, permalink);
	};
	exports.useCallback = function(callback, deps) {
		return ReactSharedInternals.H.useCallback(callback, deps);
	};
	exports.useContext = function(Context) {
		return ReactSharedInternals.H.useContext(Context);
	};
	exports.useDebugValue = function() {};
	exports.useDeferredValue = function(value, initialValue) {
		return ReactSharedInternals.H.useDeferredValue(value, initialValue);
	};
	exports.useEffect = function(create, deps) {
		return ReactSharedInternals.H.useEffect(create, deps);
	};
	exports.useEffectEvent = function(callback) {
		return ReactSharedInternals.H.useEffectEvent(callback);
	};
	exports.useId = function() {
		return ReactSharedInternals.H.useId();
	};
	exports.useImperativeHandle = function(ref, create, deps) {
		return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
	};
	exports.useInsertionEffect = function(create, deps) {
		return ReactSharedInternals.H.useInsertionEffect(create, deps);
	};
	exports.useLayoutEffect = function(create, deps) {
		return ReactSharedInternals.H.useLayoutEffect(create, deps);
	};
	exports.useMemo = function(create, deps) {
		return ReactSharedInternals.H.useMemo(create, deps);
	};
	exports.useOptimistic = function(passthrough, reducer) {
		return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
	};
	exports.useReducer = function(reducer, initialArg, init) {
		return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
	};
	exports.useRef = function(initialValue) {
		return ReactSharedInternals.H.useRef(initialValue);
	};
	exports.useState = function(initialState) {
		return ReactSharedInternals.H.useState(initialState);
	};
	exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
		return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	};
	exports.useTransition = function() {
		return ReactSharedInternals.H.useTransition();
	};
	exports.version = "19.3.0";
}));
//#endregion
//#region node_modules/react/cjs/react.development.js
/**
* @license React
* react.development.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_development = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	"production" !== process.env.NODE_ENV && (function() {
		function defineDeprecationWarning(methodName, info) {
			Object.defineProperty(Component.prototype, methodName, { get: function() {
				console.warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
			} });
		}
		function getIteratorFn(maybeIterable) {
			if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
			maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
			return "function" === typeof maybeIterable ? maybeIterable : null;
		}
		function warnNoop(publicInstance, callerName) {
			publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
			var warningKey = publicInstance + "." + callerName;
			didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, publicInstance), didWarnStateUpdateForUnmountedComponent[warningKey] = !0);
		}
		function Component(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function ComponentDummy() {}
		function PureComponent(props, context, updater) {
			this.props = props;
			this.context = context;
			this.refs = emptyObject;
			this.updater = updater || ReactNoopUpdateQueue;
		}
		function noop() {}
		function testStringCoercion(value) {
			return "" + value;
		}
		function checkKeyStringCoercion(value) {
			try {
				testStringCoercion(value);
				var JSCompiler_inline_result = !1;
			} catch (e) {
				JSCompiler_inline_result = !0;
			}
			if (JSCompiler_inline_result) {
				JSCompiler_inline_result = console;
				var JSCompiler_temp_const = JSCompiler_inline_result.error;
				var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
				JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
				return testStringCoercion(value);
			}
		}
		function getComponentNameFromType(type) {
			if (null == type) return null;
			if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
			if ("string" === typeof type) return type;
			switch (type) {
				case REACT_FRAGMENT_TYPE: return "Fragment";
				case REACT_PROFILER_TYPE: return "Profiler";
				case REACT_STRICT_MODE_TYPE: return "StrictMode";
				case REACT_SUSPENSE_TYPE: return "Suspense";
				case REACT_SUSPENSE_LIST_TYPE: return "SuspenseList";
				case REACT_ACTIVITY_TYPE: return "Activity";
				case REACT_VIEW_TRANSITION_TYPE: return "ViewTransition";
			}
			if ("object" === typeof type) switch ("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof) {
				case REACT_PORTAL_TYPE: return "Portal";
				case REACT_CONTEXT_TYPE: return type.displayName || "Context";
				case REACT_CONSUMER_TYPE: return (type._context.displayName || "Context") + ".Consumer";
				case REACT_FORWARD_REF_TYPE:
					var innerType = type.render;
					type = type.displayName;
					type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
					return type;
				case REACT_MEMO_TYPE: return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
				case REACT_LAZY_TYPE:
					innerType = type._payload;
					type = type._init;
					try {
						return getComponentNameFromType(type(innerType));
					} catch (x) {}
			}
			return null;
		}
		function getTaskName(type) {
			if (type === REACT_FRAGMENT_TYPE) return "<>";
			if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
			try {
				var name = getComponentNameFromType(type);
				return name ? "<" + name + ">" : "<...>";
			} catch (x) {
				return "<...>";
			}
		}
		function getOwner() {
			var dispatcher = ReactSharedInternals.A;
			return null === dispatcher ? null : dispatcher.getOwner();
		}
		function UnknownOwner() {
			return Error("react-stack-top-frame");
		}
		function hasValidKey(config) {
			if (hasOwnProperty.call(config, "key")) {
				var getter = Object.getOwnPropertyDescriptor(config, "key").get;
				if (getter && getter.isReactWarning) return !1;
			}
			return void 0 !== config.key;
		}
		function defineKeyPropWarningGetter(props, displayName) {
			function warnAboutAccessingKey() {
				specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
			}
			warnAboutAccessingKey.isReactWarning = !0;
			Object.defineProperty(props, "key", {
				get: warnAboutAccessingKey,
				configurable: !0
			});
		}
		function elementRefGetterWithDeprecationWarning() {
			var componentName = getComponentNameFromType(this.type);
			didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
			componentName = this.props.ref;
			return void 0 !== componentName ? componentName : null;
		}
		function ReactElement(type, key, props, owner, debugStack, debugTask) {
			var refProp = props.ref;
			type = {
				$$typeof: REACT_ELEMENT_TYPE,
				type,
				key,
				props,
				_owner: owner
			};
			null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
				enumerable: !1,
				get: elementRefGetterWithDeprecationWarning
			}) : Object.defineProperty(type, "ref", {
				enumerable: !1,
				value: null
			});
			type._store = {};
			Object.defineProperty(type._store, "validated", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: 0
			});
			Object.defineProperty(type, "_debugInfo", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: null
			});
			Object.defineProperty(type, "_debugStack", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugStack
			});
			Object.defineProperty(type, "_debugTask", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugTask
			});
			Object.freeze && (Object.freeze(type.props), Object.freeze(type));
			return type;
		}
		function cloneAndReplaceKey(oldElement, newKey) {
			newKey = ReactElement(oldElement.type, newKey, oldElement.props, oldElement._owner, oldElement._debugStack, oldElement._debugTask);
			oldElement._store && (newKey._store.validated = oldElement._store.validated);
			return newKey;
		}
		function validateChildKeys(node) {
			isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
		}
		function isValidElement(object) {
			return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
		}
		function escape(key) {
			var escaperLookup = {
				"=": "=0",
				":": "=2"
			};
			return "$" + key.replace(/[=:]/g, function(match) {
				return escaperLookup[match];
			});
		}
		function getElementKey(element, index) {
			return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
		}
		function resolveThenable(thenable) {
			switch (thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
				default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
					"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
				}, function(error) {
					"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
				})), thenable.status) {
					case "fulfilled": return thenable.value;
					case "rejected": throw thenable.reason;
				}
			}
			throw thenable;
		}
		function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
			var type = typeof children;
			if ("undefined" === type || "boolean" === type) children = null;
			var invokeCallback = !1;
			if (null === children) invokeCallback = !0;
			else switch (type) {
				case "bigint":
				case "string":
				case "number":
					invokeCallback = !0;
					break;
				case "object": switch (children.$$typeof) {
					case REACT_ELEMENT_TYPE:
					case REACT_PORTAL_TYPE:
						invokeCallback = !0;
						break;
					case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
				}
			}
			if (invokeCallback) {
				invokeCallback = children;
				callback = callback(invokeCallback);
				var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
				isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
					return c;
				})) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + childKey), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
				return 1;
			}
			invokeCallback = 0;
			childKey = "" === nameSoFar ? "." : nameSoFar + ":";
			if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if (i = getIteratorFn(children), "function" === typeof i) for (i === children.entries && (didWarnAboutMaps || console.warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead."), didWarnAboutMaps = !0), children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
			else if ("object" === type) {
				if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
				array = String(children);
				throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
			}
			return invokeCallback;
		}
		function mapChildren(children, func, context) {
			if (null == children) return children;
			var result = [], count = 0;
			mapIntoArray(children, result, "", "", function(child) {
				return func.call(context, child, count++);
			});
			return result;
		}
		function lazyInitializer(payload) {
			if (-1 === payload._status) {
				var resolveDebugValue = null, rejectDebugValue = null, ioInfo = payload._ioInfo;
				null != ioInfo && (ioInfo.start = ioInfo.end = performance.now(), ioInfo.value = new Promise(function(resolve, reject) {
					resolveDebugValue = resolve;
					rejectDebugValue = reject;
				}));
				ioInfo = payload._result;
				var thenable = ioInfo();
				thenable.then(function(moduleObject) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 1;
						payload._result = moduleObject;
						var _ioInfo = payload._ioInfo;
						if (null != _ioInfo) {
							_ioInfo.end = performance.now();
							var debugValue = null == moduleObject ? void 0 : moduleObject.default;
							resolveDebugValue(debugValue);
							_ioInfo.value.status = "fulfilled";
							_ioInfo.value.value = debugValue;
						}
						void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
					}
				}, function(error) {
					if (0 === payload._status || -1 === payload._status) {
						payload._status = 2;
						payload._result = error;
						var _ioInfo2 = payload._ioInfo;
						null != _ioInfo2 && (_ioInfo2.end = performance.now(), _ioInfo2.value.then(noop, noop), rejectDebugValue(error), _ioInfo2.value.status = "rejected", _ioInfo2.value.reason = error);
						void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
					}
				});
				ioInfo = payload._ioInfo;
				if (null != ioInfo) {
					var displayName = thenable.displayName;
					"string" === typeof displayName && (ioInfo.name = displayName);
				}
				-1 === payload._status && (payload._status = 0, payload._result = thenable);
			}
			if (1 === payload._status) return ioInfo = payload._result, void 0 === ioInfo && console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", ioInfo), "default" in ioInfo || console.error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", ioInfo), ioInfo.default;
			throw payload._result;
		}
		function resolveDispatcher() {
			var dispatcher = ReactSharedInternals.H;
			null === dispatcher && console.error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.");
			return dispatcher;
		}
		function releaseAsyncTransition() {
			ReactSharedInternals.asyncTransitions--;
		}
		function startTransition(scope) {
			var prevTransition = ReactSharedInternals.T, currentTransition = {};
			currentTransition.types = null !== prevTransition ? prevTransition.types : null;
			currentTransition._updatedFibers = /* @__PURE__ */ new Set();
			ReactSharedInternals.T = currentTransition;
			try {
				var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
				null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
				"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
			} catch (error) {
				reportGlobalError(error);
			} finally {
				null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.")), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
			}
		}
		function addTransitionType(type) {
			var transition = ReactSharedInternals.T;
			if (null !== transition) {
				var transitionTypes = transition.types;
				null === transitionTypes ? transition.types = [type] : -1 === transitionTypes.indexOf(type) && transitionTypes.push(type);
			} else 0 === ReactSharedInternals.asyncTransitions && console.error("addTransitionType can only be called inside a `startTransition()` callback. It must be associated with a specific Transition."), startTransition(addTransitionType.bind(null, type));
		}
		function enqueueTask(task) {
			if (null === enqueueTaskImpl) try {
				var requireString = ("require" + Math.random()).slice(0, 7);
				enqueueTaskImpl = (module && module[requireString]).call(module, "timers").setImmediate;
			} catch (_err) {
				enqueueTaskImpl = function(callback) {
					!1 === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = !0, "undefined" === typeof MessageChannel && console.error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."));
					var channel = new MessageChannel();
					channel.port1.onmessage = callback;
					channel.port2.postMessage(void 0);
				};
			}
			return enqueueTaskImpl(task);
		}
		function aggregateErrors(errors) {
			return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
		}
		function popActScope(prevActQueue, prevActScopeDepth) {
			prevActScopeDepth !== actScopeDepth - 1 && console.error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
			actScopeDepth = prevActScopeDepth;
		}
		function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
			var queue = ReactSharedInternals.actQueue;
			if (null !== queue) if (0 !== queue.length) try {
				flushActQueue(queue);
				enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
				});
				return;
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			else ReactSharedInternals.actQueue = null;
			0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
		}
		function flushActQueue(queue) {
			if (!isFlushing) {
				isFlushing = !0;
				var i = 0;
				try {
					for (; i < queue.length; i++) {
						var callback = queue[i];
						do {
							ReactSharedInternals.didUsePromise = !1;
							var continuation = callback(!1);
							if (null !== continuation) {
								if (ReactSharedInternals.didUsePromise) {
									queue[i] = callback;
									queue.splice(0, i);
									return;
								}
								callback = continuation;
							} else break;
						} while (1);
					}
					queue.length = 0;
				} catch (error) {
					queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
				} finally {
					isFlushing = !1;
				}
			}
		}
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
		var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
			isMounted: function() {
				return !1;
			},
			enqueueForceUpdate: function(publicInstance) {
				warnNoop(publicInstance, "forceUpdate");
			},
			enqueueReplaceState: function(publicInstance) {
				warnNoop(publicInstance, "replaceState");
			},
			enqueueSetState: function(publicInstance) {
				warnNoop(publicInstance, "setState");
			}
		}, assign = Object.assign, emptyObject = {};
		Object.freeze(emptyObject);
		Component.prototype.isReactComponent = {};
		Component.prototype.setState = function(partialState, callback) {
			if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
			this.updater.enqueueSetState(this, partialState, callback, "setState");
		};
		Component.prototype.forceUpdate = function(callback) {
			this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
		};
		var deprecatedAPIs = {
			isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
			replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
		};
		for (fnName in deprecatedAPIs) deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
		ComponentDummy.prototype = Component.prototype;
		deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
		deprecatedAPIs.constructor = PureComponent;
		assign(deprecatedAPIs, Component.prototype);
		deprecatedAPIs.isPureReactComponent = !0;
		var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = {
			H: null,
			A: null,
			T: null,
			S: null,
			actQueue: null,
			asyncTransitions: 0,
			isBatchingLegacy: !1,
			didScheduleLegacyUpdate: !1,
			didUsePromise: !1,
			thrownErrors: [],
			getCurrentStack: null,
			recentlyCreatedOwnerStacks: 0
		}, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
			return null;
		};
		deprecatedAPIs = { react_stack_bottom_frame: function(callStackForError) {
			return callStackForError();
		} };
		var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
		var didWarnAboutElementRef = {};
		var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(deprecatedAPIs, UnknownOwner)();
		var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
		var didWarnAboutMaps = !1, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
			if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
				var event = new window.ErrorEvent("error", {
					bubbles: !0,
					cancelable: !0,
					message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
					error
				});
				if (!window.dispatchEvent(event)) return;
			} else if ("object" === typeof process && "function" === typeof process.emit) {
				process.emit("uncaughtException", error);
				return;
			}
			console.error(error);
		}, didWarnAboutMessageChannel = !1, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = !1, isFlushing = !1, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
			queueMicrotask(function() {
				return queueMicrotask(callback);
			});
		} : enqueueTask;
		deprecatedAPIs = Object.freeze({
			__proto__: null,
			c: function(size) {
				return resolveDispatcher().useMemoCache(size);
			}
		});
		var fnName = {
			map: mapChildren,
			forEach: function(children, forEachFunc, forEachContext) {
				mapChildren(children, function() {
					forEachFunc.apply(this, arguments);
				}, forEachContext);
			},
			count: function(children) {
				var n = 0;
				mapChildren(children, function() {
					n++;
				});
				return n;
			},
			toArray: function(children) {
				return mapChildren(children, function(child) {
					return child;
				}) || [];
			},
			only: function(children) {
				if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
				return children;
			}
		};
		exports.Activity = REACT_ACTIVITY_TYPE;
		exports.Children = fnName;
		exports.Component = Component;
		exports.Fragment = REACT_FRAGMENT_TYPE;
		exports.Profiler = REACT_PROFILER_TYPE;
		exports.PureComponent = PureComponent;
		exports.StrictMode = REACT_STRICT_MODE_TYPE;
		exports.Suspense = REACT_SUSPENSE_TYPE;
		exports.ViewTransition = REACT_VIEW_TRANSITION_TYPE;
		exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
		exports.__COMPILER_RUNTIME = deprecatedAPIs;
		exports.act = function(callback) {
			var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
			actScopeDepth++;
			var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = !1;
			try {
				var result = callback();
			} catch (error) {
				ReactSharedInternals.thrownErrors.push(error);
			}
			if (0 < ReactSharedInternals.thrownErrors.length) throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			if (null !== result && "object" === typeof result && "function" === typeof result.then) {
				var thenable = result;
				queueSeveralMicrotasks(function() {
					didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"));
				});
				return { then: function(resolve, reject) {
					didAwaitActCall = !0;
					thenable.then(function(returnValue) {
						popActScope(prevActQueue, prevActScopeDepth);
						if (0 === prevActScopeDepth) {
							try {
								flushActQueue(queue), enqueueTask(function() {
									return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
								});
							} catch (error$0) {
								ReactSharedInternals.thrownErrors.push(error$0);
							}
							if (0 < ReactSharedInternals.thrownErrors.length) {
								var _thrownError = aggregateErrors(ReactSharedInternals.thrownErrors);
								ReactSharedInternals.thrownErrors.length = 0;
								reject(_thrownError);
							}
						} else resolve(returnValue);
					}, function(error) {
						popActScope(prevActQueue, prevActScopeDepth);
						0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
					});
				} };
			}
			var returnValue$jscomp$0 = result;
			popActScope(prevActQueue, prevActScopeDepth);
			0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
				didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = !0, console.error("A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"));
			}), ReactSharedInternals.actQueue = null);
			if (0 < ReactSharedInternals.thrownErrors.length) throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
			return { then: function(resolve, reject) {
				didAwaitActCall = !0;
				0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
					return recursivelyFlushAsyncActWork(returnValue$jscomp$0, resolve, reject);
				})) : resolve(returnValue$jscomp$0);
			} };
		};
		exports.addTransitionType = addTransitionType;
		exports.cache = function(fn) {
			return function() {
				return fn.apply(null, arguments);
			};
		};
		exports.cacheSignal = function() {
			return null;
		};
		exports.captureOwnerStack = function() {
			var getCurrentStack = ReactSharedInternals.getCurrentStack;
			return null === getCurrentStack ? null : getCurrentStack();
		};
		exports.cloneElement = function(element, config, children) {
			if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
			var props = assign({}, element.props), key = element.key, owner = element._owner;
			if (null != config) {
				var JSCompiler_inline_result;
				a: {
					if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(config, "ref").get) && JSCompiler_inline_result.isReactWarning) {
						JSCompiler_inline_result = !1;
						break a;
					}
					JSCompiler_inline_result = void 0 !== config.ref;
				}
				JSCompiler_inline_result && (owner = getOwner());
				hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key);
				for (propName in config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
			}
			var propName = arguments.length - 2;
			if (1 === propName) props.children = children;
			else if (1 < propName) {
				JSCompiler_inline_result = Array(propName);
				for (var i = 0; i < propName; i++) JSCompiler_inline_result[i] = arguments[i + 2];
				props.children = JSCompiler_inline_result;
			}
			props = ReactElement(element.type, key, props, owner, element._debugStack, element._debugTask);
			for (key = 2; key < arguments.length; key++) validateChildKeys(arguments[key]);
			return props;
		};
		exports.createContext = function(defaultValue) {
			defaultValue = {
				$$typeof: REACT_CONTEXT_TYPE,
				_currentValue: defaultValue,
				_currentValue2: defaultValue,
				_threadCount: 0,
				Provider: null,
				Consumer: null
			};
			defaultValue.Provider = defaultValue;
			defaultValue.Consumer = {
				$$typeof: REACT_CONSUMER_TYPE,
				_context: defaultValue
			};
			defaultValue._currentRenderer = null;
			defaultValue._currentRenderer2 = null;
			return defaultValue;
		};
		exports.createElement = function(type, config, children) {
			for (var i = 2; i < arguments.length; i++) validateChildKeys(arguments[i]);
			var propName;
			i = {};
			var key = null;
			if (null != config) for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = !0, console.warn("Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform")), hasValidKey(config) && (checkKeyStringCoercion(config.key), key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
			var childrenLength = arguments.length - 2;
			if (1 === childrenLength) i.children = children;
			else if (1 < childrenLength) {
				for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++) childArray[_i] = arguments[_i + 2];
				Object.freeze && Object.freeze(childArray);
				i.children = childArray;
			}
			if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === i[propName] && (i[propName] = childrenLength[propName]);
			key && defineKeyPropWarningGetter(i, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
			(propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++) ? (childArray = Error.stackTraceLimit, Error.stackTraceLimit = 10, childrenLength = Error("react-stack-top-frame"), Error.stackTraceLimit = childArray) : childrenLength = unknownOwnerDebugStack;
			return ReactElement(type, key, i, getOwner(), childrenLength, propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
		};
		exports.createRef = function() {
			var refObject = { current: null };
			Object.seal(refObject);
			return refObject;
		};
		exports.forwardRef = function(render) {
			null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).") : "function" !== typeof render ? console.error("forwardRef requires a render function but was given %s.", null === render ? "null" : typeof render) : 0 !== render.length && 2 !== render.length && console.error("forwardRef render functions accept exactly two parameters: props and ref. %s", 1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
			null != render && null != render.defaultProps && console.error("forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?");
			var elementType = {
				$$typeof: REACT_FORWARD_REF_TYPE,
				render
			}, ownName;
			Object.defineProperty(elementType, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
				}
			});
			return elementType;
		};
		exports.isValidElement = isValidElement;
		exports.lazy = function(ctor) {
			ctor = {
				_status: -1,
				_result: ctor
			};
			var lazyType = {
				$$typeof: REACT_LAZY_TYPE,
				_payload: ctor,
				_init: lazyInitializer
			}, ioInfo = {
				name: "lazy",
				start: -1,
				end: -1,
				value: null,
				owner: null,
				debugStack: Error("react-stack-top-frame"),
				debugTask: console.createTask ? console.createTask("lazy()") : null
			};
			ctor._ioInfo = ioInfo;
			lazyType._debugInfo = [{ awaited: ioInfo }];
			return lazyType;
		};
		exports.memo = function(type, compare) {
			type ?? console.error("memo: The first argument must be a component. Instead received: %s", null === type ? "null" : typeof type);
			compare = {
				$$typeof: REACT_MEMO_TYPE,
				type,
				compare: void 0 === compare ? null : compare
			};
			var ownName;
			Object.defineProperty(compare, "displayName", {
				enumerable: !1,
				configurable: !0,
				get: function() {
					return ownName;
				},
				set: function(name) {
					ownName = name;
					type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
				}
			});
			return compare;
		};
		exports.startTransition = startTransition;
		exports.unstable_useCacheRefresh = function() {
			return resolveDispatcher().useCacheRefresh();
		};
		exports.use = function(usable) {
			return resolveDispatcher().use(usable);
		};
		exports.useActionState = function(action, initialState, permalink) {
			return resolveDispatcher().useActionState(action, initialState, permalink);
		};
		exports.useCallback = function(callback, deps) {
			return resolveDispatcher().useCallback(callback, deps);
		};
		exports.useContext = function(Context) {
			var dispatcher = resolveDispatcher();
			Context.$$typeof === REACT_CONSUMER_TYPE && console.error("Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?");
			return dispatcher.useContext(Context);
		};
		exports.useDebugValue = function(value, formatterFn) {
			return resolveDispatcher().useDebugValue(value, formatterFn);
		};
		exports.useDeferredValue = function(value, initialValue) {
			return resolveDispatcher().useDeferredValue(value, initialValue);
		};
		exports.useEffect = function(create, deps) {
			create ?? console.warn("React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useEffect(create, deps);
		};
		exports.useEffectEvent = function(callback) {
			return resolveDispatcher().useEffectEvent(callback);
		};
		exports.useId = function() {
			return resolveDispatcher().useId();
		};
		exports.useImperativeHandle = function(ref, create, deps) {
			return resolveDispatcher().useImperativeHandle(ref, create, deps);
		};
		exports.useInsertionEffect = function(create, deps) {
			create ?? console.warn("React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useInsertionEffect(create, deps);
		};
		exports.useLayoutEffect = function(create, deps) {
			create ?? console.warn("React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?");
			return resolveDispatcher().useLayoutEffect(create, deps);
		};
		exports.useMemo = function(create, deps) {
			return resolveDispatcher().useMemo(create, deps);
		};
		exports.useOptimistic = function(passthrough, reducer) {
			return resolveDispatcher().useOptimistic(passthrough, reducer);
		};
		exports.useReducer = function(reducer, initialArg, init) {
			return resolveDispatcher().useReducer(reducer, initialArg, init);
		};
		exports.useRef = function(initialValue) {
			return resolveDispatcher().useRef(initialValue);
		};
		exports.useState = function(initialState) {
			return resolveDispatcher().useState(initialState);
		};
		exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
			return resolveDispatcher().useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
		};
		exports.useTransition = function() {
			return resolveDispatcher().useTransition();
		};
		exports.version = "19.3.0";
		"undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
	})();
}));
//#endregion
//#region node_modules/react/index.js
var require_react = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	if (process.env.NODE_ENV === "production") module.exports = require_react_production();
	else module.exports = require_react_development();
}));
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/use-merge-refs.js
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function useMergeRefs(refs) {
	const cleanupRef = import_react.useRef(void 0);
	const refEffect = import_react.useCallback((instance) => {
		const cleanups = refs.map((ref) => {
			if (ref == null) return;
			if (typeof ref === "function") {
				const refCallback = ref;
				const refCleanup = refCallback(instance);
				return typeof refCleanup === "function" ? refCleanup : () => {
					refCallback(null);
				};
			}
			ref.current = instance;
			return () => {
				ref.current = null;
			};
		});
		return () => {
			cleanups.forEach((refCleanup) => refCleanup?.());
		};
	}, refs);
	return import_react.useMemo(() => {
		if (refs.every((ref) => ref == null)) return null;
		return (value) => {
			if (cleanupRef.current) {
				cleanupRef.current();
				cleanupRef.current = void 0;
			}
			if (value != null) cleanupRef.current = refEffect(value);
		};
	}, refs);
}
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/set-min-image-size.js
function setMinImageSize(img) {
	if (img.naturalWidth < 1024 && img.naturalHeight < 1024) {
		if (img.naturalWidth < 1 || img.naturalHeight < 1) return;
		const aspect = img.naturalWidth / img.naturalHeight;
		img.width = Math.round(aspect > 1 ? 1024 * aspect : 1024);
		img.height = Math.round(aspect > 1 ? 1024 : 1024 / aspect);
	}
}
//#endregion
//#region node_modules/react/cjs/react-jsx-runtime.production.js
/**
* @license React
* react-jsx-runtime.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_jsx_runtime_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
	var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	function jsxProd(type, config, maybeKey) {
		var key = null;
		void 0 !== maybeKey && (key = "" + maybeKey);
		void 0 !== config.key && (key = "" + config.key);
		if ("key" in config) {
			maybeKey = {};
			for (var propName in config) "key" !== propName && (maybeKey[propName] = config[propName]);
		} else maybeKey = config;
		config = maybeKey.ref;
		return {
			$$typeof: REACT_ELEMENT_TYPE,
			type,
			key,
			ref: void 0 !== config ? config : null,
			props: maybeKey
		};
	}
	exports.Fragment = REACT_FRAGMENT_TYPE;
	exports.jsx = jsxProd;
	exports.jsxs = jsxProd;
}));
//#endregion
//#region node_modules/react/cjs/react-jsx-runtime.development.js
/**
* @license React
* react-jsx-runtime.development.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_jsx_runtime_development = /* @__PURE__ */ __commonJSMin(((exports) => {
	"production" !== process.env.NODE_ENV && (function() {
		function getComponentNameFromType(type) {
			if (null == type) return null;
			if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
			if ("string" === typeof type) return type;
			switch (type) {
				case REACT_FRAGMENT_TYPE: return "Fragment";
				case REACT_PROFILER_TYPE: return "Profiler";
				case REACT_STRICT_MODE_TYPE: return "StrictMode";
				case REACT_SUSPENSE_TYPE: return "Suspense";
				case REACT_SUSPENSE_LIST_TYPE: return "SuspenseList";
				case REACT_ACTIVITY_TYPE: return "Activity";
				case REACT_VIEW_TRANSITION_TYPE: return "ViewTransition";
			}
			if ("object" === typeof type) switch ("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof) {
				case REACT_PORTAL_TYPE: return "Portal";
				case REACT_CONTEXT_TYPE: return type.displayName || "Context";
				case REACT_CONSUMER_TYPE: return (type._context.displayName || "Context") + ".Consumer";
				case REACT_FORWARD_REF_TYPE:
					var innerType = type.render;
					type = type.displayName;
					type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
					return type;
				case REACT_MEMO_TYPE: return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
				case REACT_LAZY_TYPE:
					innerType = type._payload;
					type = type._init;
					try {
						return getComponentNameFromType(type(innerType));
					} catch (x) {}
			}
			return null;
		}
		function testStringCoercion(value) {
			return "" + value;
		}
		function checkKeyStringCoercion(value) {
			try {
				testStringCoercion(value);
				var JSCompiler_inline_result = !1;
			} catch (e) {
				JSCompiler_inline_result = !0;
			}
			if (JSCompiler_inline_result) {
				JSCompiler_inline_result = console;
				var JSCompiler_temp_const = JSCompiler_inline_result.error;
				var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
				JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
				return testStringCoercion(value);
			}
		}
		function getTaskName(type) {
			if (type === REACT_FRAGMENT_TYPE) return "<>";
			if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
			try {
				var name = getComponentNameFromType(type);
				return name ? "<" + name + ">" : "<...>";
			} catch (x) {
				return "<...>";
			}
		}
		function getOwner() {
			var dispatcher = ReactSharedInternals.A;
			return null === dispatcher ? null : dispatcher.getOwner();
		}
		function UnknownOwner() {
			return Error("react-stack-top-frame");
		}
		function hasValidKey(config) {
			if (hasOwnProperty.call(config, "key")) {
				var getter = Object.getOwnPropertyDescriptor(config, "key").get;
				if (getter && getter.isReactWarning) return !1;
			}
			return void 0 !== config.key;
		}
		function defineKeyPropWarningGetter(props, displayName) {
			function warnAboutAccessingKey() {
				specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
			}
			warnAboutAccessingKey.isReactWarning = !0;
			Object.defineProperty(props, "key", {
				get: warnAboutAccessingKey,
				configurable: !0
			});
		}
		function elementRefGetterWithDeprecationWarning() {
			var componentName = getComponentNameFromType(this.type);
			didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
			componentName = this.props.ref;
			return void 0 !== componentName ? componentName : null;
		}
		function ReactElement(type, key, props, owner, debugStack, debugTask) {
			var refProp = props.ref;
			type = {
				$$typeof: REACT_ELEMENT_TYPE,
				type,
				key,
				props,
				_owner: owner
			};
			null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
				enumerable: !1,
				get: elementRefGetterWithDeprecationWarning
			}) : Object.defineProperty(type, "ref", {
				enumerable: !1,
				value: null
			});
			type._store = {};
			Object.defineProperty(type._store, "validated", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: 0
			});
			Object.defineProperty(type, "_debugInfo", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: null
			});
			Object.defineProperty(type, "_debugStack", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugStack
			});
			Object.defineProperty(type, "_debugTask", {
				configurable: !1,
				enumerable: !1,
				writable: !0,
				value: debugTask
			});
			Object.freeze && (Object.freeze(type.props), Object.freeze(type));
			return type;
		}
		function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
			var children = config.children;
			if (void 0 !== children) if (isStaticChildren) if (isArrayImpl(children)) {
				for (isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++) validateChildKeys(children[isStaticChildren]);
				Object.freeze && Object.freeze(children);
			} else console.error("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
			else validateChildKeys(children);
			if (hasOwnProperty.call(config, "key")) {
				children = getComponentNameFromType(type);
				var keys = Object.keys(config).filter(function(k) {
					return "key" !== k;
				});
				isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
				didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error("A props object containing a \"key\" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />", isStaticChildren, children, keys, children), didWarnAboutKeySpread[children + isStaticChildren] = !0);
			}
			children = null;
			void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
			hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
			if ("key" in config) {
				maybeKey = {};
				for (var propName in config) "key" !== propName && (maybeKey[propName] = config[propName]);
			} else maybeKey = config;
			children && defineKeyPropWarningGetter(maybeKey, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
			return ReactElement(type, children, maybeKey, getOwner(), debugStack, debugTask);
		}
		function validateChildKeys(node) {
			isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
		}
		function isValidElement(object) {
			return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
		}
		var React = require_react(), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
			return null;
		};
		React = { react_stack_bottom_frame: function(callStackForError) {
			return callStackForError();
		} };
		var specialPropKeyWarningShown;
		var didWarnAboutElementRef = {};
		var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(React, UnknownOwner)();
		var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
		var didWarnAboutKeySpread = {};
		exports.Fragment = REACT_FRAGMENT_TYPE;
		exports.jsx = function(type, config, maybeKey) {
			var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
			if (trackActualOwner) {
				var previousStackTraceLimit = Error.stackTraceLimit;
				Error.stackTraceLimit = 10;
				var debugStackDEV = Error("react-stack-top-frame");
				Error.stackTraceLimit = previousStackTraceLimit;
			} else debugStackDEV = unknownOwnerDebugStack;
			return jsxDEVImpl(type, config, maybeKey, !1, debugStackDEV, trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
		};
		exports.jsxs = function(type, config, maybeKey) {
			var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
			if (trackActualOwner) {
				var previousStackTraceLimit = Error.stackTraceLimit;
				Error.stackTraceLimit = 10;
				var debugStackDEV = Error("react-stack-top-frame");
				Error.stackTraceLimit = previousStackTraceLimit;
			} else debugStackDEV = unknownOwnerDebugStack;
			return jsxDEVImpl(type, config, maybeKey, !0, debugStackDEV, trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
		};
	})();
}));
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shader-mount.js
var import_jsx_runtime = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
	if (process.env.NODE_ENV === "production") module.exports = require_react_jsx_runtime_production();
	else module.exports = require_react_jsx_runtime_development();
})))();
async function processUniforms(uniformsProp) {
	const processedUniforms = {};
	const imageLoadPromises = [];
	const isValidUrl = (url) => {
		try {
			if (url.startsWith("/")) return true;
			new URL(url);
			return true;
		} catch {
			return false;
		}
	};
	const isExternalUrl = (url) => {
		try {
			if (url.startsWith("/")) return false;
			return new URL(url, window.location.origin).origin !== window.location.origin;
		} catch {
			return false;
		}
	};
	Object.entries(uniformsProp).forEach(([key, value]) => {
		if (typeof value === "string") {
			const url = value || "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
			if (!isValidUrl(url)) {
				console.warn(`Uniform "${key}" has invalid URL "${url}". Skipping image loading.`);
				return;
			}
			const imagePromise = new Promise((resolve, reject) => {
				const img = new Image();
				if (isExternalUrl(url)) img.crossOrigin = "anonymous";
				img.onload = () => {
					setMinImageSize(img);
					processedUniforms[key] = img;
					resolve();
				};
				img.onerror = () => {
					console.error(`Could not set uniforms. Failed to load image at ${url}`);
					reject();
				};
				img.src = url;
			});
			imageLoadPromises.push(imagePromise);
		} else if (value instanceof HTMLImageElement) {
			const imagePromise = value.decode().then(() => {
				setMinImageSize(value);
				processedUniforms[key] = value;
			});
			imageLoadPromises.push(imagePromise);
		} else processedUniforms[key] = value;
	});
	await Promise.all(imageLoadPromises);
	return processedUniforms;
}
var ShaderMount = (0, import_react.forwardRef)(function ShaderMountImpl({ fragmentShader, uniforms: uniformsProp, webGlContextAttributes, speed = 0, frame = 0, width, height, minPixelRatio, maxPixelCount, mipmaps, style, ...divProps }, forwardedRef) {
	const [isInitialized, setIsInitialized] = (0, import_react.useState)(false);
	const divRef = (0, import_react.useRef)(null);
	const shaderMountRef = (0, import_react.useRef)(null);
	const webGlContextAttributesRef = (0, import_react.useRef)(webGlContextAttributes);
	(0, import_react.useEffect)(() => {
		const initShader = async () => {
			const uniforms = await processUniforms(uniformsProp);
			if (divRef.current && !shaderMountRef.current) {
				shaderMountRef.current = new ShaderMount$1(divRef.current, fragmentShader, uniforms, webGlContextAttributesRef.current, speed, frame, minPixelRatio, maxPixelCount, mipmaps);
				setIsInitialized(true);
			}
		};
		initShader();
		return () => {
			shaderMountRef.current?.dispose();
			shaderMountRef.current = null;
		};
	}, [fragmentShader]);
	(0, import_react.useEffect)(() => {
		let isStale = false;
		const updateUniforms = async () => {
			const uniforms = await processUniforms(uniformsProp);
			if (!isStale) shaderMountRef.current?.setUniforms(uniforms);
		};
		updateUniforms();
		return () => {
			isStale = true;
		};
	}, [uniformsProp, isInitialized]);
	(0, import_react.useEffect)(() => {
		shaderMountRef.current?.setSpeed(speed);
	}, [speed, isInitialized]);
	(0, import_react.useEffect)(() => {
		shaderMountRef.current?.setMaxPixelCount(maxPixelCount);
	}, [maxPixelCount, isInitialized]);
	(0, import_react.useEffect)(() => {
		shaderMountRef.current?.setMinPixelRatio(minPixelRatio);
	}, [minPixelRatio, isInitialized]);
	(0, import_react.useEffect)(() => {
		shaderMountRef.current?.setFrame(frame);
	}, [frame, isInitialized]);
	const mergedRef = useMergeRefs([divRef, forwardedRef]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: mergedRef,
		style: width !== void 0 || height !== void 0 ? {
			width: typeof width === "string" && isNaN(+width) === false ? +width : width,
			height: typeof height === "string" && isNaN(+height) === false ? +height : height,
			...style
		} : style,
		...divProps
	});
});
ShaderMount.displayName = "ShaderMount";
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/color-props-are-equal.js
function colorPropsAreEqual(prevProps, nextProps) {
	if (Object.keys(prevProps).length !== Object.keys(nextProps).length) return false;
	for (const key in prevProps) {
		if (key === "colors") {
			const prevIsArray = Array.isArray(prevProps.colors);
			const nextIsArray = Array.isArray(nextProps.colors);
			if (!prevIsArray || !nextIsArray) {
				if (Object.is(prevProps.colors, nextProps.colors) === false) return false;
				continue;
			}
			if (prevProps.colors?.length !== nextProps.colors?.length) return false;
			if (!prevProps.colors?.every((color, index) => color === nextProps.colors?.[index])) return false;
			continue;
		}
		if (Object.is(prevProps[key], nextProps[key]) === false) return false;
	}
	return true;
}
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/mesh-gradient.js
var defaultPreset$26 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colors: [
			"#e0eaff",
			"#241d9a",
			"#f75092",
			"#9f50d3"
		],
		distortion: .8,
		swirl: .1,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var purplePreset = {
	name: "Purple",
	params: {
		...defaultObjectSizing,
		speed: .6,
		frame: 0,
		colors: ["#aaa7d7", "#3c2b8e"],
		distortion: 1,
		swirl: 1,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var beachPreset = {
	name: "Beach",
	params: {
		...defaultObjectSizing,
		speed: .1,
		frame: 0,
		colors: [
			"#bcecf6",
			"#00aaff",
			"#00f7ff",
			"#ffd447"
		],
		distortion: .8,
		swirl: .35,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var meshGradientPresets = [
	defaultPreset$26,
	{
		name: "Ink",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colors: ["#ffffff", "#000000"],
			distortion: 1,
			swirl: .2,
			rotation: 90,
			grainMixer: 0,
			grainOverlay: 0
		}
	},
	purplePreset,
	beachPreset
];
var MeshGradient = (0, import_react.memo)(function MeshGradientImpl({ speed = defaultPreset$26.params.speed, frame = defaultPreset$26.params.frame, colors = defaultPreset$26.params.colors, distortion = defaultPreset$26.params.distortion, swirl = defaultPreset$26.params.swirl, grainMixer = defaultPreset$26.params.grainMixer, grainOverlay = defaultPreset$26.params.grainOverlay, fit = defaultPreset$26.params.fit, rotation = defaultPreset$26.params.rotation, scale = defaultPreset$26.params.scale, originX = defaultPreset$26.params.originX, originY = defaultPreset$26.params.originY, offsetX = defaultPreset$26.params.offsetX, offsetY = defaultPreset$26.params.offsetY, worldWidth = defaultPreset$26.params.worldWidth, worldHeight = defaultPreset$26.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_distortion: distortion,
		u_swirl: swirl,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: meshGradientFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/smoke-ring.js
var defaultPreset$25 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: .5,
		frame: 0,
		colorBack: "#000000",
		colors: ["#ffffff"],
		noiseScale: 3,
		noiseIterations: 8,
		radius: .25,
		thickness: .65,
		innerShape: .7,
		scale: .8
	}
};
var solarPreset$1 = {
	name: "Solar",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#ffffff",
			"#ffca0a",
			"#fc6203",
			"#fc620366"
		],
		noiseScale: 2,
		noiseIterations: 3,
		radius: .4,
		thickness: .8,
		innerShape: 4,
		scale: 2,
		offsetY: 1
	}
};
var smokeRingPresets = [
	defaultPreset$25,
	{
		name: "Line",
		params: {
			...defaultObjectSizing,
			frame: 0,
			colorBack: "#000000",
			colors: ["#4540a4", "#1fe8ff"],
			noiseScale: 1.1,
			noiseIterations: 2,
			radius: .38,
			thickness: .01,
			innerShape: .88,
			speed: 4
		}
	},
	solarPreset$1,
	{
		name: "Cloud",
		params: {
			...defaultObjectSizing,
			frame: 0,
			colorBack: "#81ADEC",
			colors: ["#ffffff"],
			noiseScale: 3,
			noiseIterations: 10,
			radius: .5,
			thickness: .65,
			innerShape: .85,
			speed: .5,
			scale: 2.5
		}
	}
];
var SmokeRing = (0, import_react.memo)(function SmokeRingImpl({ speed = defaultPreset$25.params.speed, frame = defaultPreset$25.params.frame, colorBack = defaultPreset$25.params.colorBack, colors = defaultPreset$25.params.colors, noiseScale = defaultPreset$25.params.noiseScale, thickness = defaultPreset$25.params.thickness, radius = defaultPreset$25.params.radius, innerShape = defaultPreset$25.params.innerShape, noiseIterations = defaultPreset$25.params.noiseIterations, fit = defaultPreset$25.params.fit, scale = defaultPreset$25.params.scale, rotation = defaultPreset$25.params.rotation, originX = defaultPreset$25.params.originX, originY = defaultPreset$25.params.originY, offsetX = defaultPreset$25.params.offsetX, offsetY = defaultPreset$25.params.offsetY, worldWidth = defaultPreset$25.params.worldWidth, worldHeight = defaultPreset$25.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_noiseScale: noiseScale,
		u_thickness: thickness,
		u_radius: radius,
		u_innerShape: innerShape,
		u_noiseIterations: noiseIterations,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: smokeRingFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/neuro-noise.js
var defaultPreset$24 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: 1,
		frame: 0,
		colorFront: "#ffffff",
		colorMid: "#47a6ff",
		colorBack: "#000000",
		brightness: .05,
		contrast: .3
	}
};
var neuroNoisePresets = [
	defaultPreset$24,
	{
		name: "Sensation",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorFront: "#00c8ff",
			colorMid: "#fbff00",
			colorBack: "#8b42ff",
			brightness: .19,
			contrast: .12,
			scale: 3
		}
	},
	{
		name: "Bloodstream",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorFront: "#ff0000",
			colorMid: "#ff0000",
			colorBack: "#ffffff",
			brightness: .24,
			contrast: .17,
			scale: .7
		}
	},
	{
		name: "Ghost",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorFront: "#ffffff",
			colorMid: "#000000",
			colorBack: "#ffffff",
			brightness: 0,
			contrast: 1,
			scale: .55
		}
	}
];
var NeuroNoise = (0, import_react.memo)(function NeuroNoiseImpl({ speed = defaultPreset$24.params.speed, frame = defaultPreset$24.params.frame, colorFront = defaultPreset$24.params.colorFront, colorMid = defaultPreset$24.params.colorMid, colorBack = defaultPreset$24.params.colorBack, brightness = defaultPreset$24.params.brightness, contrast = defaultPreset$24.params.contrast, fit = defaultPreset$24.params.fit, scale = defaultPreset$24.params.scale, rotation = defaultPreset$24.params.rotation, originX = defaultPreset$24.params.originX, originY = defaultPreset$24.params.originY, offsetX = defaultPreset$24.params.offsetX, offsetY = defaultPreset$24.params.offsetY, worldWidth = defaultPreset$24.params.worldWidth, worldHeight = defaultPreset$24.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorMid: getShaderColorFromString(colorMid),
		u_colorBack: getShaderColorFromString(colorBack),
		u_brightness: brightness,
		u_contrast: contrast,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: neuroNoiseFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/dot-orbit.js
var defaultPreset$23 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: 1.5,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#ffc96b",
			"#ff6200",
			"#ff2f00",
			"#421100",
			"#1a0000"
		],
		size: 1,
		sizeRange: 0,
		spreading: 1,
		stepsPerColor: 4
	}
};
var shinePreset = {
	name: "Shine",
	params: {
		...defaultPatternSizing,
		speed: .1,
		frame: 0,
		colors: [
			"#ffffff",
			"#006aff",
			"#fff675"
		],
		colorBack: "#000000",
		stepsPerColor: 4,
		size: .3,
		sizeRange: .2,
		spreading: 1,
		scale: .4
	}
};
var dotOrbitPresets = [
	defaultPreset$23,
	{
		name: "Bubbles",
		params: {
			...defaultPatternSizing,
			speed: .4,
			frame: 0,
			colors: ["#D0D2D5"],
			colorBack: "#989CA4",
			stepsPerColor: 2,
			size: .9,
			sizeRange: .7,
			spreading: 1,
			scale: 1.64
		}
	},
	shinePreset,
	{
		name: "Hallucinatory",
		params: {
			...defaultPatternSizing,
			speed: 5,
			frame: 0,
			colors: ["#000000"],
			colorBack: "#ffe500",
			stepsPerColor: 2,
			size: .65,
			sizeRange: 0,
			spreading: .3,
			scale: .5
		}
	}
];
var DotOrbit = (0, import_react.memo)(function DotOrbitImpl({ speed = defaultPreset$23.params.speed, frame = defaultPreset$23.params.frame, colorBack = defaultPreset$23.params.colorBack, colors = defaultPreset$23.params.colors, size = defaultPreset$23.params.size, sizeRange = defaultPreset$23.params.sizeRange, spreading = defaultPreset$23.params.spreading, stepsPerColor = defaultPreset$23.params.stepsPerColor, fit = defaultPreset$23.params.fit, scale = defaultPreset$23.params.scale, rotation = defaultPreset$23.params.rotation, originX = defaultPreset$23.params.originX, originY = defaultPreset$23.params.originY, offsetX = defaultPreset$23.params.offsetX, offsetY = defaultPreset$23.params.offsetY, worldWidth = defaultPreset$23.params.worldWidth, worldHeight = defaultPreset$23.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_size: size,
		u_sizeRange: sizeRange,
		u_spreading: spreading,
		u_stepsPerColor: stepsPerColor,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: dotOrbitFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/dot-grid.js
var defaultPreset$22 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		colorBack: "#000000",
		colorFill: "#ffffff",
		colorStroke: "#ffaa00",
		size: 2,
		gapX: 32,
		gapY: 32,
		strokeWidth: 0,
		sizeRange: 0,
		opacityRange: 0,
		shape: "circle"
	}
};
var dotGridPresets = [
	defaultPreset$22,
	{
		name: "Triangles",
		params: {
			...defaultPatternSizing,
			colorBack: "#ffffff",
			colorFill: "#ffffff",
			colorStroke: "#808080",
			size: 5,
			gapX: 32,
			gapY: 32,
			strokeWidth: 1,
			sizeRange: 0,
			opacityRange: 0,
			shape: "triangle"
		}
	},
	{
		name: "Tree line",
		params: {
			...defaultPatternSizing,
			colorBack: "#f4fce7",
			colorFill: "#052e19",
			colorStroke: "#000000",
			size: 8,
			gapX: 20,
			gapY: 90,
			strokeWidth: 0,
			sizeRange: 1,
			opacityRange: .6,
			shape: "circle"
		}
	},
	{
		name: "Wallpaper",
		params: {
			...defaultPatternSizing,
			colorBack: "#204030",
			colorFill: "#000000",
			colorStroke: "#bd955b",
			size: 9,
			gapX: 32,
			gapY: 32,
			strokeWidth: 1,
			sizeRange: 0,
			opacityRange: 0,
			shape: "diamond"
		}
	}
];
var DotGrid = (0, import_react.memo)(function DotGridImpl({ colorBack = defaultPreset$22.params.colorBack, colorFill = defaultPreset$22.params.colorFill, colorStroke = defaultPreset$22.params.colorStroke, size = defaultPreset$22.params.size, gapX = defaultPreset$22.params.gapX, gapY = defaultPreset$22.params.gapY, strokeWidth = defaultPreset$22.params.strokeWidth, sizeRange = defaultPreset$22.params.sizeRange, opacityRange = defaultPreset$22.params.opacityRange, shape = defaultPreset$22.params.shape, fit = defaultPreset$22.params.fit, scale = defaultPreset$22.params.scale, rotation = defaultPreset$22.params.rotation, originX = defaultPreset$22.params.originX, originY = defaultPreset$22.params.originY, offsetX = defaultPreset$22.params.offsetX, offsetY = defaultPreset$22.params.offsetY, worldWidth = defaultPreset$22.params.worldWidth, worldHeight = defaultPreset$22.params.worldHeight, maxPixelCount = 20358144, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorFill: getShaderColorFromString(colorFill),
		u_colorStroke: getShaderColorFromString(colorStroke),
		u_dotSize: size,
		u_gapX: gapX,
		u_gapY: gapY,
		u_strokeWidth: strokeWidth,
		u_sizeRange: sizeRange,
		u_opacityRange: opacityRange,
		u_shape: DotGridShapes[shape],
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		maxPixelCount,
		fragmentShader: dotGridFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/simplex-noise.js
var defaultPreset$21 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		scale: .6,
		speed: .5,
		frame: 0,
		colors: [
			"#4449CF",
			"#FFD1E0",
			"#F94446",
			"#FFD36B",
			"#FFFFFF"
		],
		stepsPerColor: 2,
		softness: 0
	}
};
var bubblegumPreset = {
	name: "Bubblegum",
	params: {
		...defaultPatternSizing,
		speed: 2,
		frame: 0,
		colors: [
			"#ffffff",
			"#ff9e9e",
			"#5f57ff",
			"#00f7ff"
		],
		stepsPerColor: 1,
		softness: 1,
		scale: 1.6
	}
};
var simplexNoisePresets = [
	defaultPreset$21,
	{
		name: "Spots",
		params: {
			...defaultPatternSizing,
			speed: .6,
			frame: 0,
			colors: [
				"#ff7b00",
				"#f9ffeb",
				"#320d82"
			],
			stepsPerColor: 1,
			softness: 0,
			scale: 1
		}
	},
	{
		name: "First contact",
		params: {
			...defaultPatternSizing,
			speed: 2,
			frame: 0,
			colors: [
				"#e8cce6",
				"#120d22",
				"#442c44",
				"#e6baba",
				"#fff5f5"
			],
			stepsPerColor: 2,
			softness: 0,
			scale: .2
		}
	},
	bubblegumPreset
];
var SimplexNoise = (0, import_react.memo)(function SimplexNoiseImpl({ speed = defaultPreset$21.params.speed, frame = defaultPreset$21.params.frame, colors = defaultPreset$21.params.colors, stepsPerColor = defaultPreset$21.params.stepsPerColor, softness = defaultPreset$21.params.softness, fit = defaultPreset$21.params.fit, scale = defaultPreset$21.params.scale, rotation = defaultPreset$21.params.rotation, originX = defaultPreset$21.params.originX, originY = defaultPreset$21.params.originY, offsetX = defaultPreset$21.params.offsetX, offsetY = defaultPreset$21.params.offsetY, worldWidth = defaultPreset$21.params.worldWidth, worldHeight = defaultPreset$21.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_stepsPerColor: stepsPerColor,
		u_softness: softness,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: simplexNoiseFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/metaballs.js
var defaultPreset$20 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#6e33cc",
			"#ff5500",
			"#ffc105",
			"#ffc800",
			"#f585ff"
		],
		count: 10,
		size: .83
	}
};
var inkDropsPreset = {
	name: "Ink Drops",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 2,
		frame: 0,
		colorBack: "#ffffff00",
		colors: ["#000000"],
		count: 18,
		size: .1
	}
};
var backgroundPreset = {
	name: "Background",
	params: {
		...defaultObjectSizing,
		speed: .5,
		frame: 0,
		colors: [
			"#ae00ff",
			"#00ff95",
			"#ffc105"
		],
		colorBack: "#2a273f",
		count: 13,
		size: .81,
		scale: 4,
		rotation: 0,
		offsetX: -.3
	}
};
var metaballsPresets = [
	defaultPreset$20,
	inkDropsPreset,
	{
		name: "Solar",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colors: [
				"#ffc800",
				"#ff5500",
				"#ffc105"
			],
			colorBack: "#102f84",
			count: 7,
			size: .75,
			scale: 1
		}
	},
	backgroundPreset
];
var Metaballs = (0, import_react.memo)(function MetaballsImpl({ speed = defaultPreset$20.params.speed, frame = defaultPreset$20.params.frame, colorBack = defaultPreset$20.params.colorBack, colors = defaultPreset$20.params.colors, size = defaultPreset$20.params.size, count = defaultPreset$20.params.count, fit = defaultPreset$20.params.fit, rotation = defaultPreset$20.params.rotation, scale = defaultPreset$20.params.scale, originX = defaultPreset$20.params.originX, originY = defaultPreset$20.params.originY, offsetX = defaultPreset$20.params.offsetX, offsetY = defaultPreset$20.params.offsetY, worldWidth = defaultPreset$20.params.worldWidth, worldHeight = defaultPreset$20.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_size: size,
		u_count: count,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: metaballsFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/waves.js
var defaultPreset$19 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		scale: .6,
		colorFront: "#ffbb00",
		colorBack: "#000000",
		shape: 0,
		frequency: .5,
		amplitude: .5,
		spacing: 1.2,
		proportion: .1,
		softness: 0
	}
};
var wavesPresets = [
	defaultPreset$19,
	{
		name: "Groovy",
		params: {
			...defaultPatternSizing,
			scale: 5,
			rotation: 90,
			colorFront: "#fcfcee",
			colorBack: "#ff896b",
			shape: 3,
			frequency: .2,
			amplitude: .25,
			spacing: 1.17,
			proportion: .57,
			softness: 0
		}
	},
	{
		name: "Tangled up",
		params: {
			...defaultPatternSizing,
			scale: .5,
			rotation: 0,
			colorFront: "#133a41",
			colorBack: "#c2d8b6",
			shape: 2.07,
			frequency: .44,
			amplitude: .57,
			spacing: 1.05,
			proportion: .75,
			softness: 0
		}
	},
	{
		name: "Ride the wave",
		params: {
			...defaultPatternSizing,
			scale: 1.7,
			rotation: 0,
			colorFront: "#fdffe6",
			colorBack: "#1f1f1f",
			shape: 2.25,
			frequency: .2,
			amplitude: 1,
			spacing: 1.25,
			proportion: 1,
			softness: 0
		}
	}
];
var Waves = (0, import_react.memo)(function WavesImpl({ colorFront = defaultPreset$19.params.colorFront, colorBack = defaultPreset$19.params.colorBack, shape = defaultPreset$19.params.shape, frequency = defaultPreset$19.params.frequency, amplitude = defaultPreset$19.params.amplitude, spacing = defaultPreset$19.params.spacing, proportion = defaultPreset$19.params.proportion, softness = defaultPreset$19.params.softness, fit = defaultPreset$19.params.fit, scale = defaultPreset$19.params.scale, rotation = defaultPreset$19.params.rotation, offsetX = defaultPreset$19.params.offsetX, offsetY = defaultPreset$19.params.offsetY, originX = defaultPreset$19.params.originX, originY = defaultPreset$19.params.originY, worldWidth = defaultPreset$19.params.worldWidth, worldHeight = defaultPreset$19.params.worldHeight, maxPixelCount = 20358144, ...props }) {
	const uniforms = {
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorBack: getShaderColorFromString(colorBack),
		u_shape: shape,
		u_frequency: frequency,
		u_amplitude: amplitude,
		u_spacing: spacing,
		u_proportion: proportion,
		u_softness: softness,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		fragmentShader: wavesFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/perlin-noise.js
var defaultPreset$18 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: .5,
		frame: 0,
		colorBack: "#632ad5",
		colorFront: "#fccff7",
		proportion: .35,
		softness: .1,
		octaveCount: 1,
		persistence: 1,
		lacunarity: 1.5
	}
};
var perlinNoisePresets = [
	defaultPreset$18,
	{
		name: "Nintendo Water",
		params: {
			...defaultPatternSizing,
			scale: 5,
			speed: .4,
			frame: 0,
			colorBack: "#2d69d4",
			colorFront: "#d1eefc",
			proportion: .42,
			softness: 0,
			octaveCount: 2,
			persistence: .55,
			lacunarity: 1.8
		}
	},
	{
		name: "Moss",
		params: {
			...defaultPatternSizing,
			scale: 1 / .15,
			speed: .02,
			frame: 0,
			colorBack: "#05ff4a",
			colorFront: "#262626",
			proportion: .65,
			softness: .35,
			octaveCount: 6,
			persistence: 1,
			lacunarity: 2.55
		}
	},
	{
		name: "Worms",
		params: {
			...defaultPatternSizing,
			scale: .9,
			speed: 0,
			frame: 0,
			colorBack: "#ffffff00",
			colorFront: "#595959",
			proportion: .5,
			softness: 0,
			octaveCount: 1,
			persistence: 1,
			lacunarity: 1.5
		}
	}
];
var PerlinNoise = (0, import_react.memo)(function PerlinNoiseImpl({ speed = defaultPreset$18.params.speed, frame = defaultPreset$18.params.frame, colorFront = defaultPreset$18.params.colorFront, colorBack = defaultPreset$18.params.colorBack, proportion = defaultPreset$18.params.proportion, softness = defaultPreset$18.params.softness, octaveCount = defaultPreset$18.params.octaveCount, persistence = defaultPreset$18.params.persistence, lacunarity, fit = defaultPreset$18.params.fit, worldWidth = defaultPreset$18.params.worldWidth, worldHeight = defaultPreset$18.params.worldHeight, scale = defaultPreset$18.params.scale, rotation = defaultPreset$18.params.rotation, originX = defaultPreset$18.params.originX, originY = defaultPreset$18.params.originY, offsetX = defaultPreset$18.params.offsetX, offsetY = defaultPreset$18.params.offsetY, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorFront: getShaderColorFromString(colorFront),
		u_proportion: proportion,
		u_softness: softness ?? defaultPreset$18.params.softness,
		u_octaveCount: octaveCount ?? defaultPreset$18.params.octaveCount,
		u_persistence: persistence ?? defaultPreset$18.params.persistence,
		u_lacunarity: lacunarity ?? defaultPreset$18.params.lacunarity,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: perlinNoiseFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/voronoi.js
var defaultPreset$17 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: .5,
		frame: 0,
		colors: ["#ff8247", "#ffe53d"],
		stepsPerColor: 3,
		colorGlow: "#ffffff",
		colorGap: "#2e0000",
		distortion: .4,
		gap: .04,
		glow: 0,
		scale: .5
	}
};
var cellsPreset = {
	name: "Cells",
	params: {
		...defaultPatternSizing,
		scale: .5,
		speed: .5,
		frame: 0,
		colors: ["#ffffff"],
		stepsPerColor: 1,
		colorGlow: "#ffffff",
		colorGap: "#000000",
		distortion: .5,
		gap: .03,
		glow: .8
	}
};
var bubblesPreset = {
	name: "Bubbles",
	params: {
		...defaultPatternSizing,
		scale: .75,
		speed: .5,
		frame: 0,
		colors: ["#83c9fb"],
		stepsPerColor: 1,
		colorGlow: "#ffffff",
		colorGap: "#ffffff",
		distortion: .4,
		gap: 0,
		glow: 1
	}
};
var voronoiPresets = [
	defaultPreset$17,
	{
		name: "Lights",
		params: {
			...defaultPatternSizing,
			scale: 3.3,
			speed: .5,
			frame: 0,
			colors: [
				"#fffffffc",
				"#bbff00",
				"#00ffff"
			],
			colorGlow: "#ff00d0",
			colorGap: "#ff00d0",
			stepsPerColor: 2,
			distortion: .38,
			gap: 0,
			glow: 1
		}
	},
	cellsPreset,
	bubblesPreset
];
var Voronoi = (0, import_react.memo)(function VoronoiImpl({ speed = defaultPreset$17.params.speed, frame = defaultPreset$17.params.frame, colors = defaultPreset$17.params.colors, stepsPerColor = defaultPreset$17.params.stepsPerColor, colorGlow = defaultPreset$17.params.colorGlow, colorGap = defaultPreset$17.params.colorGap, distortion = defaultPreset$17.params.distortion, gap = defaultPreset$17.params.gap, glow = defaultPreset$17.params.glow, fit = defaultPreset$17.params.fit, scale = defaultPreset$17.params.scale, rotation = defaultPreset$17.params.rotation, originX = defaultPreset$17.params.originX, originY = defaultPreset$17.params.originY, offsetX = defaultPreset$17.params.offsetX, offsetY = defaultPreset$17.params.offsetY, worldWidth = defaultPreset$17.params.worldWidth, worldHeight = defaultPreset$17.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_stepsPerColor: stepsPerColor,
		u_colorGlow: getShaderColorFromString(colorGlow),
		u_colorGap: getShaderColorFromString(colorGap),
		u_distortion: distortion,
		u_gap: gap,
		u_glow: glow,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: voronoiFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/warp.js
var defaultPreset$16 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		rotation: 0,
		speed: 1,
		frame: 0,
		colors: [
			"#121212",
			"#9470ff",
			"#121212",
			"#8838ff"
		],
		proportion: .45,
		softness: 1,
		distortion: .25,
		swirl: .8,
		swirlIterations: 10,
		shapeScale: .1,
		shape: "checks"
	}
};
var warpPresets = [
	defaultPreset$16,
	{
		name: "Cauldron Pot",
		params: {
			...defaultPatternSizing,
			scale: .9,
			rotation: 160,
			speed: 10,
			frame: 0,
			colors: [
				"#a7e58b",
				"#324472",
				"#0a180d"
			],
			proportion: .64,
			softness: 1.5,
			distortion: .2,
			swirl: .86,
			swirlIterations: 7,
			shapeScale: .6,
			shape: "edge"
		}
	},
	{
		name: "Live Ink",
		params: {
			...defaultPatternSizing,
			scale: 1.2,
			rotation: 44,
			offsetY: -.3,
			speed: 2.5,
			frame: 0,
			colors: [
				"#111314",
				"#9faeab",
				"#f3fee7",
				"#f3fee7"
			],
			proportion: .05,
			softness: 0,
			distortion: .25,
			swirl: .8,
			swirlIterations: 10,
			shapeScale: .28,
			shape: "checks"
		}
	},
	{
		name: "Kelp",
		params: {
			...defaultPatternSizing,
			scale: .8,
			rotation: 50,
			speed: 20,
			frame: 0,
			colors: [
				"#dbff8f",
				"#404f3e",
				"#091316"
			],
			proportion: .67,
			softness: 0,
			distortion: 0,
			swirl: .2,
			swirlIterations: 3,
			shapeScale: 1,
			shape: "stripes"
		}
	},
	{
		name: "Nectar",
		params: {
			...defaultPatternSizing,
			scale: 2,
			offsetY: .6,
			rotation: 0,
			speed: 4.2,
			frame: 0,
			colors: [
				"#151310",
				"#d3a86b",
				"#f0edea"
			],
			proportion: .24,
			softness: 1,
			distortion: .21,
			swirl: .57,
			swirlIterations: 10,
			shapeScale: .75,
			shape: "edge"
		}
	},
	{
		name: "Passion",
		params: {
			...defaultPatternSizing,
			scale: 2.5,
			rotation: 1.35,
			speed: 3,
			frame: 0,
			colors: [
				"#3b1515",
				"#954751",
				"#ffc085"
			],
			proportion: .5,
			softness: 1,
			distortion: .09,
			swirl: .9,
			swirlIterations: 6,
			shapeScale: .25,
			shape: "checks"
		}
	}
];
var Warp = (0, import_react.memo)(function WarpImpl({ speed = defaultPreset$16.params.speed, frame = defaultPreset$16.params.frame, colors = defaultPreset$16.params.colors, proportion = defaultPreset$16.params.proportion, softness = defaultPreset$16.params.softness, distortion = defaultPreset$16.params.distortion, swirl = defaultPreset$16.params.swirl, swirlIterations = defaultPreset$16.params.swirlIterations, shapeScale = defaultPreset$16.params.shapeScale, shape = defaultPreset$16.params.shape, fit = defaultPreset$16.params.fit, scale = defaultPreset$16.params.scale, rotation = defaultPreset$16.params.rotation, originX = defaultPreset$16.params.originX, originY = defaultPreset$16.params.originY, offsetX = defaultPreset$16.params.offsetX, offsetY = defaultPreset$16.params.offsetY, worldWidth = defaultPreset$16.params.worldWidth, worldHeight = defaultPreset$16.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_proportion: proportion,
		u_softness: softness,
		u_distortion: distortion,
		u_swirl: swirl,
		u_swirlIterations: swirlIterations,
		u_shapeScale: shapeScale,
		u_shape: WarpPatterns[shape],
		u_noiseTexture: getShaderNoiseTexture(),
		u_scale: scale,
		u_rotation: rotation,
		u_fit: ShaderFitOptions[fit],
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: warpFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/god-rays.js
var defaultPreset$15 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		offsetX: 0,
		offsetY: -.55,
		colorBack: "#000000",
		colorBloom: "#0000ff",
		colors: [
			"#a600ff6e",
			"#6200fff0",
			"#ffffff",
			"#33fff5"
		],
		density: .3,
		spotty: .3,
		midIntensity: .4,
		midSize: .2,
		intensity: .8,
		bloom: .4,
		speed: .75,
		frame: 0
	}
};
var godRaysPresets = [
	defaultPreset$15,
	{
		name: "Warp",
		params: {
			...defaultObjectSizing,
			colorBack: "#000000",
			colorBloom: "#222288",
			colors: [
				"#ff47d4",
				"#ff8c00",
				"#ffffff"
			],
			density: .45,
			spotty: .15,
			midIntensity: .4,
			midSize: .33,
			intensity: .79,
			bloom: .4,
			speed: 2,
			frame: 0
		}
	},
	{
		name: "Linear",
		params: {
			...defaultObjectSizing,
			offsetX: .2,
			offsetY: -.8,
			colorBack: "#000000",
			colorBloom: "#eeeeee",
			colors: [
				"#ffffff1f",
				"#ffffff3d",
				"#ffffff29"
			],
			density: .41,
			spotty: .25,
			midSize: .1,
			midIntensity: .75,
			intensity: .79,
			bloom: 1,
			speed: .5,
			frame: 0
		}
	},
	{
		name: "Ether",
		params: {
			...defaultObjectSizing,
			offsetX: -.6,
			colorBack: "#090f1d",
			colorBloom: "#ffffff",
			colors: [
				"#148effa6",
				"#c4dffebe",
				"#232a47"
			],
			density: .03,
			spotty: .77,
			midSize: .1,
			midIntensity: .6,
			intensity: .6,
			bloom: .6,
			speed: 1,
			frame: 0
		}
	}
];
var GodRays = (0, import_react.memo)(function GodRaysImpl({ speed = defaultPreset$15.params.speed, frame = defaultPreset$15.params.frame, colorBloom = defaultPreset$15.params.colorBloom, colorBack = defaultPreset$15.params.colorBack, colors = defaultPreset$15.params.colors, density = defaultPreset$15.params.density, spotty = defaultPreset$15.params.spotty, midIntensity = defaultPreset$15.params.midIntensity, midSize = defaultPreset$15.params.midSize, intensity = defaultPreset$15.params.intensity, bloom = defaultPreset$15.params.bloom, fit = defaultPreset$15.params.fit, scale = defaultPreset$15.params.scale, rotation = defaultPreset$15.params.rotation, originX = defaultPreset$15.params.originX, originY = defaultPreset$15.params.originY, offsetX = defaultPreset$15.params.offsetX, offsetY = defaultPreset$15.params.offsetY, worldWidth = defaultPreset$15.params.worldWidth, worldHeight = defaultPreset$15.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBloom: getShaderColorFromString(colorBloom),
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_density: density,
		u_spotty: spotty,
		u_midIntensity: midIntensity,
		u_midSize: midSize,
		u_intensity: intensity,
		u_bloom: bloom,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: godRaysFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/spiral.js
var defaultPreset$14 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		scale: 1,
		colorBack: "#001429",
		colorFront: "#79D1FF",
		density: 1,
		distortion: 0,
		strokeWidth: .5,
		strokeTaper: 0,
		strokeCap: 0,
		noise: 0,
		noiseFrequency: 0,
		softness: 0,
		speed: 1,
		frame: 0
	}
};
var dropletPreset = {
	name: "Droplet",
	params: {
		...defaultPatternSizing,
		colorBack: "#effafe",
		colorFront: "#bf40a0",
		density: .9,
		distortion: 0,
		strokeWidth: .75,
		strokeTaper: .18,
		strokeCap: 1,
		noise: .74,
		noiseFrequency: .33,
		softness: .02,
		speed: 1,
		frame: 0
	}
};
var spiralPresets = [
	defaultPreset$14,
	{
		name: "Jungle",
		params: {
			...defaultPatternSizing,
			scale: 1.3,
			density: .5,
			colorBack: "#a0ef2a",
			colorFront: "#288b18",
			distortion: 0,
			strokeWidth: .5,
			strokeTaper: 0,
			strokeCap: 0,
			noise: 1,
			noiseFrequency: .25,
			softness: 0,
			speed: .75,
			frame: 0
		}
	},
	dropletPreset,
	{
		name: "Swirl",
		params: {
			...defaultPatternSizing,
			scale: .45,
			colorBack: "#b3e6d9",
			colorFront: "#1a2b4d",
			density: .2,
			distortion: 0,
			strokeWidth: .5,
			strokeTaper: 0,
			strokeCap: 0,
			noise: 0,
			noiseFrequency: .3,
			softness: .5,
			speed: 1,
			frame: 0
		}
	}
];
var Spiral = (0, import_react.memo)(function SpiralImpl({ speed = defaultPreset$14.params.speed, frame = defaultPreset$14.params.frame, colorBack = defaultPreset$14.params.colorBack, colorFront = defaultPreset$14.params.colorFront, density = defaultPreset$14.params.density, distortion = defaultPreset$14.params.distortion, strokeWidth = defaultPreset$14.params.strokeWidth, strokeTaper = defaultPreset$14.params.strokeTaper, strokeCap = defaultPreset$14.params.strokeCap, noiseFrequency = defaultPreset$14.params.noiseFrequency, noise = defaultPreset$14.params.noise, softness = defaultPreset$14.params.softness, fit = defaultPreset$14.params.fit, rotation = defaultPreset$14.params.rotation, scale = defaultPreset$14.params.scale, originX = defaultPreset$14.params.originX, originY = defaultPreset$14.params.originY, offsetX = defaultPreset$14.params.offsetX, offsetY = defaultPreset$14.params.offsetY, worldWidth = defaultPreset$14.params.worldWidth, worldHeight = defaultPreset$14.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorFront: getShaderColorFromString(colorFront),
		u_density: density,
		u_distortion: distortion,
		u_strokeWidth: strokeWidth,
		u_strokeTaper: strokeTaper,
		u_strokeCap: strokeCap,
		u_noiseFrequency: noiseFrequency,
		u_noise: noise,
		u_softness: softness,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: spiralFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/swirl.js
var defaultPreset$13 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: .32,
		frame: 0,
		colorBack: "#330000",
		colors: [
			"#ffd1d1",
			"#ff8a8a",
			"#660000"
		],
		bandCount: 4,
		twist: .1,
		center: .2,
		proportion: .5,
		softness: 0,
		noiseFrequency: .4,
		noise: .2
	}
};
var openingPreset$1 = {
	name: "Opening",
	params: {
		...defaultObjectSizing,
		offsetX: -.4,
		offsetY: 1,
		speed: .5,
		frame: 0,
		colorBack: "#ff8b61",
		colors: [
			"#fefff0",
			"#ffd8bd",
			"#ff8b61"
		],
		bandCount: 2,
		twist: .3,
		center: .2,
		proportion: .5,
		softness: 0,
		noiseFrequency: 0,
		noise: 0,
		scale: 1
	}
};
var swirlPresets = [
	defaultPreset$13,
	{
		name: "007",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colorBack: "#E9E7DA",
			colors: ["#000000"],
			bandCount: 5,
			twist: .3,
			center: 0,
			proportion: 0,
			softness: 0,
			noiseFrequency: .5,
			noise: 0
		}
	},
	openingPreset$1,
	{
		name: "Candy",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colorBack: "#ffcd66",
			colors: [
				"#6bbceb",
				"#d7b3ff",
				"#ff9fff"
			],
			bandCount: 2,
			twist: .15,
			center: .2,
			proportion: .5,
			softness: 1,
			noiseFrequency: .5,
			noise: 0
		}
	}
];
var Swirl = (0, import_react.memo)(function SwirlImpl({ speed = defaultPreset$13.params.speed, frame = defaultPreset$13.params.frame, colorBack = defaultPreset$13.params.colorBack, colors = defaultPreset$13.params.colors, bandCount = defaultPreset$13.params.bandCount, twist = defaultPreset$13.params.twist, center = defaultPreset$13.params.center, proportion = defaultPreset$13.params.proportion, softness = defaultPreset$13.params.softness, noiseFrequency = defaultPreset$13.params.noiseFrequency, noise = defaultPreset$13.params.noise, fit = defaultPreset$13.params.fit, rotation = defaultPreset$13.params.rotation, scale = defaultPreset$13.params.scale, originX = defaultPreset$13.params.originX, originY = defaultPreset$13.params.originY, offsetX = defaultPreset$13.params.offsetX, offsetY = defaultPreset$13.params.offsetY, worldWidth = defaultPreset$13.params.worldWidth, worldHeight = defaultPreset$13.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_bandCount: bandCount,
		u_twist: twist,
		u_center: center,
		u_proportion: proportion,
		u_softness: softness,
		u_noiseFrequency: noiseFrequency,
		u_noise: noise,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: swirlFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/dithering.js
var defaultPreset$12 = {
	name: "Default",
	params: {
		...defaultPatternSizing,
		speed: 1,
		frame: 0,
		scale: .6,
		colorBack: "#000000",
		colorFront: "#00b2ff",
		shape: "sphere",
		type: "4x4",
		size: 2
	}
};
var sinePreset = {
	name: "Sine Wave",
	params: {
		...defaultPatternSizing,
		speed: 1,
		frame: 0,
		colorBack: "#730d54",
		colorFront: "#00becc",
		shape: "wave",
		type: "4x4",
		size: 11,
		scale: 1.2
	}
};
var bugsPreset = {
	name: "Bugs",
	params: {
		...defaultPatternSizing,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colorFront: "#008000",
		shape: "dots",
		type: "random",
		size: 9
	}
};
var ripplePreset$1 = {
	name: "Ripple",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colorBack: "#603520",
		colorFront: "#c67953",
		shape: "ripple",
		type: "2x2",
		size: 3
	}
};
var swirlPreset = {
	name: "Swirl",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colorBack: "#00000000",
		colorFront: "#47a8e1",
		shape: "swirl",
		type: "8x8",
		size: 2
	}
};
var ditheringPresets = [
	defaultPreset$12,
	{
		name: "Warp",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colorBack: "#301c2a",
			colorFront: "#56ae6c",
			shape: "warp",
			type: "4x4",
			size: 2.5
		}
	},
	sinePreset,
	ripplePreset$1,
	bugsPreset,
	swirlPreset
];
var Dithering = (0, import_react.memo)(function DitheringImpl({ speed = defaultPreset$12.params.speed, frame = defaultPreset$12.params.frame, colorBack = defaultPreset$12.params.colorBack, colorFront = defaultPreset$12.params.colorFront, shape = defaultPreset$12.params.shape, type = defaultPreset$12.params.type, pxSize, size = pxSize === void 0 ? defaultPreset$12.params.size : pxSize, fit = defaultPreset$12.params.fit, scale = defaultPreset$12.params.scale, rotation = defaultPreset$12.params.rotation, originX = defaultPreset$12.params.originX, originY = defaultPreset$12.params.originY, offsetX = defaultPreset$12.params.offsetX, offsetY = defaultPreset$12.params.offsetY, worldWidth = defaultPreset$12.params.worldWidth, worldHeight = defaultPreset$12.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorFront: getShaderColorFromString(colorFront),
		u_shape: DitheringShapes[shape],
		u_type: DitheringTypes[type],
		u_pxSize: size,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: ditheringFragmentShader,
		uniforms
	});
});
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/grain-gradient.js
var defaultPreset$11 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#7300ff",
			"#eba8ff",
			"#00bfff",
			"#2a00ff"
		],
		softness: .5,
		intensity: .5,
		noise: .25,
		shape: "corners"
	}
};
var grainGradientPresets = [
	defaultPreset$11,
	{
		name: "Wave",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorBack: "#000a0f",
			colors: [
				"#c4730b",
				"#bdad5f",
				"#d8ccc7"
			],
			softness: .7,
			intensity: .15,
			noise: .5,
			shape: "wave"
		}
	},
	{
		name: "Dots",
		params: {
			...defaultPatternSizing,
			scale: .6,
			speed: 1,
			frame: 0,
			colorBack: "#0a0000",
			colors: [
				"#6f0000",
				"#0080ff",
				"#f2ebc9",
				"#33cc33"
			],
			softness: 1,
			intensity: 1,
			noise: .7,
			shape: "dots"
		}
	},
	{
		name: "Truchet",
		params: {
			...defaultPatternSizing,
			speed: 1,
			frame: 0,
			colorBack: "#0a0000",
			colors: [
				"#6f2200",
				"#eabb7c",
				"#39b523"
			],
			softness: 0,
			intensity: .2,
			noise: 1,
			shape: "truchet"
		}
	},
	{
		name: "Ripple",
		params: {
			...defaultObjectSizing,
			scale: .5,
			speed: 1,
			frame: 0,
			colorBack: "#140a00",
			colors: [
				"#6f2d00",
				"#88ddae",
				"#2c0b1d"
			],
			softness: .5,
			intensity: .5,
			noise: .5,
			shape: "ripple"
		}
	},
	{
		name: "Blob",
		params: {
			...defaultObjectSizing,
			scale: 1.3,
			speed: 1,
			frame: 0,
			colorBack: "#0f0e18",
			colors: [
				"#3e6172",
				"#a49b74",
				"#568c50"
			],
			softness: 0,
			intensity: .15,
			noise: .5,
			shape: "blob"
		}
	}
];
var GrainGradient = (0, import_react.memo)(function GrainGradientImpl({ speed = defaultPreset$11.params.speed, frame = defaultPreset$11.params.frame, colorBack = defaultPreset$11.params.colorBack, colors = defaultPreset$11.params.colors, softness = defaultPreset$11.params.softness, intensity = defaultPreset$11.params.intensity, noise = defaultPreset$11.params.noise, shape = defaultPreset$11.params.shape, fit = defaultPreset$11.params.fit, scale = defaultPreset$11.params.scale, rotation = defaultPreset$11.params.rotation, originX = defaultPreset$11.params.originX, originY = defaultPreset$11.params.originY, offsetX = defaultPreset$11.params.offsetX, offsetY = defaultPreset$11.params.offsetY, worldWidth = defaultPreset$11.params.worldWidth, worldHeight = defaultPreset$11.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_softness: softness,
		u_intensity: intensity,
		u_noise: noise,
		u_shape: GrainGradientShapes[shape],
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: grainGradientFragmentShader,
		uniforms
	});
});
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/pulsing-border.js
var defaultPreset$10 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: 1,
		frame: 0,
		scale: .6,
		colorBack: "#000000",
		colors: [
			"#0dc1fd",
			"#d915ef",
			"#ff3f2ecc"
		],
		roundness: .25,
		thickness: .1,
		margin: 0,
		marginLeft: 0,
		marginRight: 0,
		marginTop: 0,
		marginBottom: 0,
		aspectRatio: "auto",
		softness: .75,
		intensity: .2,
		bloom: .25,
		spots: 5,
		spotSize: .5,
		pulse: .25,
		smoke: .3,
		smokeSize: .6
	}
};
var pulsingBorderPresets = [
	defaultPreset$10,
	{
		name: "Circle",
		params: {
			...defaultObjectSizing,
			aspectRatio: "square",
			scale: .6,
			speed: 1,
			frame: 0,
			colorBack: "#000000",
			colors: [
				"#0dc1fd",
				"#d915ef",
				"#ff3f2ecc"
			],
			roundness: 1,
			margin: 0,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			thickness: 0,
			softness: .75,
			intensity: .2,
			bloom: .45,
			spots: 3,
			spotSize: .4,
			pulse: .5,
			smoke: 1,
			smokeSize: 0
		}
	},
	{
		name: "Northern lights",
		params: {
			...defaultObjectSizing,
			speed: .18,
			scale: 1.1,
			frame: 0,
			colors: [
				"#4c4794",
				"#774a7d",
				"#12694a",
				"#0aff78",
				"#4733cc"
			],
			colorBack: "#0c182c",
			roundness: 0,
			thickness: 1,
			softness: 1,
			margin: 0,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			aspectRatio: "auto",
			intensity: .1,
			bloom: .2,
			spots: 4,
			spotSize: .25,
			pulse: 0,
			smoke: .32,
			smokeSize: .5
		}
	},
	{
		name: "Solid line",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			colors: ["#81ADEC"],
			colorBack: "#00000000",
			roundness: 0,
			thickness: .05,
			margin: 0,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			aspectRatio: "auto",
			softness: 0,
			intensity: 0,
			bloom: .15,
			spots: 4,
			spotSize: 1,
			pulse: 0,
			smoke: 0,
			smokeSize: 0
		}
	}
];
var PulsingBorder = (0, import_react.memo)(function PulsingBorderImpl({ speed = defaultPreset$10.params.speed, frame = defaultPreset$10.params.frame, colors = defaultPreset$10.params.colors, colorBack = defaultPreset$10.params.colorBack, roundness = defaultPreset$10.params.roundness, thickness = defaultPreset$10.params.thickness, aspectRatio = defaultPreset$10.params.aspectRatio, softness = defaultPreset$10.params.softness, bloom = defaultPreset$10.params.bloom, intensity = defaultPreset$10.params.intensity, spots = defaultPreset$10.params.spots, spotSize = defaultPreset$10.params.spotSize, pulse = defaultPreset$10.params.pulse, smoke = defaultPreset$10.params.smoke, smokeSize = defaultPreset$10.params.smokeSize, margin, marginLeft = margin ?? defaultPreset$10.params.marginLeft, marginRight = margin ?? defaultPreset$10.params.marginRight, marginTop = margin ?? defaultPreset$10.params.marginTop, marginBottom = margin ?? defaultPreset$10.params.marginBottom, fit = defaultPreset$10.params.fit, rotation = defaultPreset$10.params.rotation, scale = defaultPreset$10.params.scale, originX = defaultPreset$10.params.originX, originY = defaultPreset$10.params.originY, offsetX = defaultPreset$10.params.offsetX, offsetY = defaultPreset$10.params.offsetY, worldWidth = defaultPreset$10.params.worldWidth, worldHeight = defaultPreset$10.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_roundness: roundness,
		u_thickness: thickness,
		u_marginLeft: marginLeft,
		u_marginRight: marginRight,
		u_marginTop: marginTop,
		u_marginBottom: marginBottom,
		u_aspectRatio: PulsingBorderAspectRatios[aspectRatio],
		u_softness: softness,
		u_intensity: intensity,
		u_bloom: bloom,
		u_spots: spots,
		u_spotSize: spotSize,
		u_pulse: pulse,
		u_smoke: smoke,
		u_smokeSize: smokeSize,
		u_noiseTexture: getShaderNoiseTexture(),
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: pulsingBorderFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/color-panels.js
var defaultPreset$9 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		speed: .5,
		frame: 0,
		colors: [
			"#ff9d00",
			"#fd4f30",
			"#809bff",
			"#6d2eff",
			"#333aff",
			"#f15cff",
			"#ffd557"
		],
		colorBack: "#000000",
		angle1: 0,
		angle2: 0,
		length: 1.1,
		edges: false,
		blur: 0,
		fadeIn: 1,
		fadeOut: .3,
		gradient: 0,
		density: 3,
		scale: .8
	}
};
var colorPanelsPresets = [
	defaultPreset$9,
	{
		name: "Glass",
		params: {
			...defaultObjectSizing,
			rotation: 112,
			speed: 1,
			frame: 0,
			colors: [
				"#00cfff",
				"#ff2d55",
				"#34c759",
				"#af52de"
			],
			colorBack: "#ffffff00",
			angle1: .3,
			angle2: .3,
			length: 1,
			edges: true,
			blur: .25,
			fadeIn: .85,
			fadeOut: .3,
			gradient: 0,
			density: 1.6
		}
	},
	{
		name: "Gradient",
		params: {
			...defaultObjectSizing,
			speed: .5,
			frame: 0,
			colors: [
				"#f2ff00",
				"#00000000",
				"#00000000",
				"#5a0283",
				"#005eff"
			],
			colorBack: "#8ffff2",
			angle1: .4,
			angle2: .4,
			length: 3,
			edges: false,
			blur: .5,
			fadeIn: 1,
			fadeOut: .39,
			gradient: .78,
			density: 1.65,
			scale: 1.72,
			rotation: 270,
			offsetX: .18
		}
	},
	{
		name: "Opening",
		params: {
			...defaultObjectSizing,
			speed: 2,
			frame: 0,
			colors: ["#00ffff"],
			colorBack: "#570044",
			angle1: -1,
			angle2: -1,
			length: .52,
			edges: false,
			blur: 0,
			fadeIn: 0,
			fadeOut: 1,
			gradient: 0,
			density: 2.21,
			scale: 2.32,
			rotation: 360,
			offsetX: -.3,
			offsetY: .6
		}
	}
];
var ColorPanels = (0, import_react.memo)(function ColorPanelsImpl({ speed = defaultPreset$9.params.speed, frame = defaultPreset$9.params.frame, colors = defaultPreset$9.params.colors, colorBack = defaultPreset$9.params.colorBack, angle1 = defaultPreset$9.params.angle1, angle2 = defaultPreset$9.params.angle2, length = defaultPreset$9.params.length, edges = defaultPreset$9.params.edges, blur = defaultPreset$9.params.blur, fadeIn = defaultPreset$9.params.fadeIn, fadeOut = defaultPreset$9.params.fadeOut, density = defaultPreset$9.params.density, gradient = defaultPreset$9.params.gradient, fit = defaultPreset$9.params.fit, scale = defaultPreset$9.params.scale, rotation = defaultPreset$9.params.rotation, originX = defaultPreset$9.params.originX, originY = defaultPreset$9.params.originY, offsetX = defaultPreset$9.params.offsetX, offsetY = defaultPreset$9.params.offsetY, worldWidth = defaultPreset$9.params.worldWidth, worldHeight = defaultPreset$9.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_colorBack: getShaderColorFromString(colorBack),
		u_angle1: angle1,
		u_angle2: angle2,
		u_length: length,
		u_edges: edges,
		u_blur: blur,
		u_fadeIn: fadeIn,
		u_fadeOut: fadeOut,
		u_density: density,
		u_gradient: gradient,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: colorPanelsFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/static-mesh-gradient.js
var defaultPreset$8 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		rotation: 270,
		speed: 0,
		frame: 0,
		colors: [
			"#ffad0a",
			"#6200ff",
			"#e2a3ff",
			"#ff99fd"
		],
		positions: 2,
		waveX: 1,
		waveXShift: .6,
		waveY: 1,
		waveYShift: .21,
		mixing: .93,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var seaPreset = {
	name: "Sea",
	params: {
		...defaultObjectSizing,
		speed: 0,
		frame: 0,
		colors: [
			"#013b65",
			"#03738c",
			"#a3d3ff",
			"#f2faef"
		],
		positions: 0,
		waveX: .53,
		waveXShift: 0,
		waveY: .95,
		waveYShift: .64,
		mixing: .5,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var staticMeshGradientPresets = [
	defaultPreset$8,
	{
		name: "1960s",
		params: {
			...defaultObjectSizing,
			speed: 0,
			frame: 0,
			colors: [
				"#000000",
				"#082400",
				"#b1aa91",
				"#8e8c15"
			],
			positions: 42,
			waveX: .45,
			waveXShift: 0,
			waveY: 1,
			waveYShift: 0,
			mixing: 0,
			grainMixer: .37,
			grainOverlay: .78
		}
	},
	{
		name: "Sunset",
		params: {
			...defaultObjectSizing,
			speed: 0,
			frame: 0,
			colors: [
				"#264653",
				"#9c2b2b",
				"#f4a261",
				"#ffffff"
			],
			positions: 0,
			waveX: .6,
			waveXShift: .7,
			waveY: .7,
			waveYShift: .7,
			mixing: .5,
			grainMixer: 0,
			grainOverlay: 0
		}
	},
	seaPreset
];
var StaticMeshGradient = (0, import_react.memo)(function StaticMeshGradientImpl({ speed = defaultPreset$8.params.speed, frame = defaultPreset$8.params.frame, colors = defaultPreset$8.params.colors, positions = defaultPreset$8.params.positions, waveX = defaultPreset$8.params.waveX, waveXShift = defaultPreset$8.params.waveXShift, waveY = defaultPreset$8.params.waveY, waveYShift = defaultPreset$8.params.waveYShift, mixing = defaultPreset$8.params.mixing, grainMixer = defaultPreset$8.params.grainMixer, grainOverlay = defaultPreset$8.params.grainOverlay, fit = defaultPreset$8.params.fit, rotation = defaultPreset$8.params.rotation, scale = defaultPreset$8.params.scale, originX = defaultPreset$8.params.originX, originY = defaultPreset$8.params.originY, offsetX = defaultPreset$8.params.offsetX, offsetY = defaultPreset$8.params.offsetY, worldWidth = defaultPreset$8.params.worldWidth, worldHeight = defaultPreset$8.params.worldHeight, ...props }) {
	const uniforms = {
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_positions: positions,
		u_waveX: waveX,
		u_waveXShift: waveXShift,
		u_waveY: waveY,
		u_waveYShift: waveYShift,
		u_mixing: mixing,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: staticMeshGradientFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/static-radial-gradient.js
var defaultPreset$7 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 0,
		frame: 0,
		colorBack: "#000000",
		colors: [
			"#00bbff",
			"#00ffe1",
			"#ffffff"
		],
		radius: .8,
		focalDistance: .99,
		focalAngle: 0,
		falloff: .24,
		mixing: .5,
		distortion: 0,
		distortionShift: 0,
		distortionFreq: 12,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var crossSectionPreset = {
	name: "Cross Section",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 0,
		frame: 0,
		colorBack: "#3d348b",
		colors: [
			"#7678ed",
			"#f7b801",
			"#f18701",
			"#37a066"
		],
		radius: 1,
		focalDistance: 0,
		focalAngle: 0,
		falloff: 0,
		mixing: 0,
		distortion: 1,
		distortionShift: 0,
		distortionFreq: 12,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var radialPreset = {
	name: "Radial",
	params: {
		...defaultObjectSizing,
		scale: 1,
		speed: 0,
		frame: 0,
		colorBack: "#264653",
		colors: [
			"#9c2b2b",
			"#f4a261",
			"#ffffff"
		],
		radius: 1,
		focalDistance: 0,
		focalAngle: 0,
		falloff: 0,
		mixing: 1,
		distortion: 0,
		distortionShift: 0,
		distortionFreq: 12,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var staticRadialGradientPresets = [
	defaultPreset$7,
	{
		name: "Lo-Fi",
		params: {
			...defaultObjectSizing,
			speed: 0,
			frame: 0,
			colorBack: "#2e1f27",
			colors: [
				"#d72638",
				"#3f88c5",
				"#f49d37"
			],
			radius: 1,
			focalDistance: 0,
			focalAngle: 0,
			falloff: .9,
			mixing: .7,
			distortion: 0,
			distortionShift: 0,
			distortionFreq: 12,
			grainMixer: 1,
			grainOverlay: .5
		}
	},
	crossSectionPreset,
	radialPreset
];
var StaticRadialGradient = (0, import_react.memo)(function StaticRadialGradientImpl({ speed = defaultPreset$7.params.speed, frame = defaultPreset$7.params.frame, colorBack = defaultPreset$7.params.colorBack, colors = defaultPreset$7.params.colors, radius = defaultPreset$7.params.radius, focalDistance = defaultPreset$7.params.focalDistance, focalAngle = defaultPreset$7.params.focalAngle, falloff = defaultPreset$7.params.falloff, grainMixer = defaultPreset$7.params.grainMixer, mixing = defaultPreset$7.params.mixing, distortion = defaultPreset$7.params.distortion, distortionShift = defaultPreset$7.params.distortionShift, distortionFreq = defaultPreset$7.params.distortionFreq, grainOverlay = defaultPreset$7.params.grainOverlay, fit = defaultPreset$7.params.fit, rotation = defaultPreset$7.params.rotation, scale = defaultPreset$7.params.scale, originX = defaultPreset$7.params.originX, originY = defaultPreset$7.params.originY, offsetX = defaultPreset$7.params.offsetX, offsetY = defaultPreset$7.params.offsetY, worldWidth = defaultPreset$7.params.worldWidth, worldHeight = defaultPreset$7.params.worldHeight, ...props }) {
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_radius: radius,
		u_focalDistance: focalDistance,
		u_focalAngle: focalAngle,
		u_falloff: falloff,
		u_mixing: mixing,
		u_distortion: distortion,
		u_distortionShift: distortionShift,
		u_distortionFreq: distortionFreq,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: staticRadialGradientFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/paper-texture.js
var defaultPreset$6 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		scale: .6,
		speed: 0,
		frame: 0,
		colorFront: "#9fadbc",
		colorBack: "#ffffff",
		contrast: .3,
		roughness: .4,
		fiber: .3,
		fiberSize: .2,
		crumples: .3,
		crumpleSize: .35,
		folds: .65,
		foldCount: 5,
		fade: 0,
		drops: .2,
		seed: 5.8
	}
};
var abstractPreset$2 = {
	name: "Abstract",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		scale: .6,
		colorFront: "#00eeff",
		colorBack: "#ff0a81",
		contrast: .85,
		roughness: 0,
		fiber: .1,
		fiberSize: .2,
		crumples: 0,
		crumpleSize: .3,
		folds: 1,
		foldCount: 3,
		fade: 0,
		drops: .2,
		seed: 2.2
	}
};
var paperTexturePresets = [
	defaultPreset$6,
	{
		name: "Cardboard",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			scale: .6,
			colorFront: "#c7b89e",
			colorBack: "#999180",
			contrast: .4,
			roughness: 0,
			fiber: .35,
			fiberSize: .14,
			crumples: .7,
			crumpleSize: .1,
			folds: 0,
			foldCount: 1,
			fade: 0,
			drops: .1,
			seed: 1.6
		}
	},
	abstractPreset$2,
	{
		name: "Details",
		params: {
			...defaultObjectSizing,
			speed: 0,
			frame: 0,
			fit: "cover",
			scale: 3,
			colorFront: "#00000000",
			colorBack: "#00000000",
			contrast: 0,
			roughness: 1,
			fiber: .27,
			fiberSize: .22,
			crumples: 1,
			crumpleSize: .5,
			folds: 1,
			foldCount: 15,
			fade: 0,
			drops: 0,
			seed: 6
		}
	}
];
var PaperTexture = (0, import_react.memo)(function PaperTextureImpl({ speed = defaultPreset$6.params.speed, frame = defaultPreset$6.params.frame, colorFront = defaultPreset$6.params.colorFront, colorBack = defaultPreset$6.params.colorBack, image = "", contrast = defaultPreset$6.params.contrast, roughness = defaultPreset$6.params.roughness, fiber = defaultPreset$6.params.fiber, crumples = defaultPreset$6.params.crumples, folds = defaultPreset$6.params.folds, drops = defaultPreset$6.params.drops, seed = defaultPreset$6.params.seed, fiberScale, fiberSize = fiberScale === void 0 ? defaultPreset$6.params.fiberSize : .2 / fiberScale, crumplesScale, crumpleSize = crumplesScale === void 0 ? defaultPreset$6.params.crumpleSize : .2 / crumplesScale, blur, fade = blur === void 0 ? defaultPreset$6.params.fade : blur, foldsNumber, foldCount = foldsNumber === void 0 ? defaultPreset$6.params.foldCount : foldsNumber, fit = defaultPreset$6.params.fit, scale = defaultPreset$6.params.scale, rotation = defaultPreset$6.params.rotation, originX = defaultPreset$6.params.originX, originY = defaultPreset$6.params.originY, offsetX = defaultPreset$6.params.offsetX, offsetY = defaultPreset$6.params.offsetY, worldWidth = defaultPreset$6.params.worldWidth, worldHeight = defaultPreset$6.params.worldHeight, ...props }) {
	const noiseTexture = typeof window !== "undefined" && { u_noiseTexture: getShaderNoiseTexture() };
	const uniforms = {
		u_image: image,
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorBack: getShaderColorFromString(colorBack),
		u_contrast: contrast,
		u_roughness: roughness,
		u_fiber: fiber,
		u_fiberSize: fiberSize,
		u_crumples: crumples,
		u_crumpleSize: crumpleSize,
		u_foldCount: foldCount,
		u_folds: folds,
		u_fade: fade,
		u_drops: drops,
		u_seed: seed,
		...noiseTexture,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: paperTextureFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/fluted-glass.js
var defaultPreset$5 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorBack: "#00000000",
		colorShadow: "#000000",
		colorHighlight: "#ffffff",
		shadows: .25,
		size: .5,
		angle: 0,
		distortionShape: "prism",
		highlights: .1,
		shape: "lines",
		distortion: .5,
		shift: 0,
		blur: 0,
		edges: .25,
		stretch: 0,
		margin: 0,
		marginLeft: 0,
		marginRight: 0,
		marginTop: 0,
		marginBottom: 0,
		grainMixer: 0,
		grainOverlay: 0
	}
};
var wavesPreset = {
	name: "Waves",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		scale: 1.2,
		speed: 0,
		frame: 0,
		colorBack: "#00000000",
		colorShadow: "#000000",
		colorHighlight: "#ffffff",
		shadows: 0,
		size: .9,
		angle: 0,
		distortionShape: "contour",
		highlights: 0,
		shape: "wave",
		distortion: .5,
		shift: 0,
		blur: .1,
		edges: .5,
		stretch: 1,
		margin: 0,
		marginLeft: 0,
		marginRight: 0,
		marginTop: 0,
		marginBottom: 0,
		grainMixer: 0,
		grainOverlay: .05
	}
};
var flutedGlassPresets = [
	defaultPreset$5,
	{
		name: "Abstract",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			scale: 4,
			speed: 0,
			frame: 0,
			colorBack: "#00000000",
			colorShadow: "#000000",
			colorHighlight: "#ffffff",
			shadows: 0,
			size: .7,
			angle: 30,
			distortionShape: "flat",
			highlights: 0,
			shape: "linesIrregular",
			distortion: 1,
			shift: 0,
			blur: 1,
			edges: .5,
			stretch: 1,
			margin: 0,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			grainMixer: .1,
			grainOverlay: .1
		}
	},
	wavesPreset,
	{
		name: "Folds",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#00000000",
			colorShadow: "#000000",
			colorHighlight: "#ffffff",
			shadows: .4,
			size: .4,
			angle: 0,
			distortionShape: "cascade",
			highlights: 0,
			shape: "lines",
			distortion: .75,
			shift: 0,
			blur: .25,
			edges: .5,
			stretch: 0,
			margin: .1,
			marginLeft: .1,
			marginRight: .1,
			marginTop: .1,
			marginBottom: .1,
			grainMixer: 0,
			grainOverlay: 0
		}
	}
];
var FlutedGlass = (0, import_react.memo)(function FlutedGlassImpl({ speed = defaultPreset$5.params.speed, frame = defaultPreset$5.params.frame, colorBack = defaultPreset$5.params.colorBack, colorShadow = defaultPreset$5.params.colorShadow, colorHighlight = defaultPreset$5.params.colorHighlight, image = "", shadows = defaultPreset$5.params.shadows, angle = defaultPreset$5.params.angle, distortion = defaultPreset$5.params.distortion, distortionShape = defaultPreset$5.params.distortionShape, highlights = defaultPreset$5.params.highlights, shape = defaultPreset$5.params.shape, shift = defaultPreset$5.params.shift, blur = defaultPreset$5.params.blur, edges = defaultPreset$5.params.edges, margin, marginLeft = margin ?? defaultPreset$5.params.marginLeft, marginRight = margin ?? defaultPreset$5.params.marginRight, marginTop = margin ?? defaultPreset$5.params.marginTop, marginBottom = margin ?? defaultPreset$5.params.marginBottom, grainMixer = defaultPreset$5.params.grainMixer, grainOverlay = defaultPreset$5.params.grainOverlay, stretch = defaultPreset$5.params.stretch, count, size = count === void 0 ? defaultPreset$5.params.size : Math.pow(1 / (count * 1.6), 1 / 6) / .7 - .5, fit = defaultPreset$5.params.fit, scale = defaultPreset$5.params.scale, rotation = defaultPreset$5.params.rotation, originX = defaultPreset$5.params.originX, originY = defaultPreset$5.params.originY, offsetX = defaultPreset$5.params.offsetX, offsetY = defaultPreset$5.params.offsetY, worldWidth = defaultPreset$5.params.worldWidth, worldHeight = defaultPreset$5.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorShadow: getShaderColorFromString(colorShadow),
		u_colorHighlight: getShaderColorFromString(colorHighlight),
		u_shadows: shadows,
		u_size: size,
		u_angle: angle,
		u_distortion: distortion,
		u_shift: shift,
		u_blur: blur,
		u_edges: edges,
		u_stretch: stretch,
		u_distortionShape: GlassDistortionShapes[distortionShape],
		u_highlights: highlights,
		u_shape: GlassGridShapes[shape],
		u_marginLeft: marginLeft,
		u_marginRight: marginRight,
		u_marginTop: marginTop,
		u_marginBottom: marginBottom,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: flutedGlassFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
});
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/water.js
var defaultPreset$4 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: .8,
		speed: 1,
		frame: 0,
		colorBack: "#909090",
		colorHighlight: "#ffffff",
		highlights: .07,
		layering: .5,
		edges: .8,
		waves: .3,
		caustic: .1,
		size: 1
	}
};
var abstractPreset = {
	name: "Abstract",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		scale: 3,
		speed: 1,
		frame: 0,
		colorBack: "#909090",
		colorHighlight: "#ffffff",
		highlights: 0,
		layering: 0,
		edges: 1,
		waves: 1,
		caustic: .4,
		size: .15
	}
};
var streamingPreset = {
	name: "Streaming",
	params: {
		...defaultObjectSizing,
		fit: "contain",
		scale: .4,
		speed: 2,
		frame: 0,
		colorBack: "#909090",
		colorHighlight: "#ffffff",
		highlights: 0,
		layering: 0,
		edges: 0,
		waves: .5,
		caustic: 0,
		size: .5
	}
};
var waterPresets = [
	defaultPreset$4,
	{
		name: "Slow-mo",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			scale: 1,
			speed: .1,
			frame: 0,
			colorBack: "#909090",
			colorHighlight: "#ffffff",
			highlights: .4,
			layering: 0,
			edges: 0,
			waves: 0,
			caustic: .2,
			size: .7
		}
	},
	abstractPreset,
	streamingPreset
];
var Water = (0, import_react.memo)(function WaterImpl({ speed = defaultPreset$4.params.speed, frame = defaultPreset$4.params.frame, colorBack = defaultPreset$4.params.colorBack, colorHighlight = defaultPreset$4.params.colorHighlight, image = "", highlights = defaultPreset$4.params.highlights, layering = defaultPreset$4.params.layering, waves = defaultPreset$4.params.waves, edges = defaultPreset$4.params.edges, caustic = defaultPreset$4.params.caustic, effectScale, size = effectScale === void 0 ? defaultPreset$4.params.size : 10 / 9 / effectScale - 1 / 9, fit = defaultPreset$4.params.fit, scale = defaultPreset$4.params.scale, rotation = defaultPreset$4.params.rotation, originX = defaultPreset$4.params.originX, originY = defaultPreset$4.params.originY, offsetX = defaultPreset$4.params.offsetX, offsetY = defaultPreset$4.params.offsetY, worldWidth = defaultPreset$4.params.worldWidth, worldHeight = defaultPreset$4.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorHighlight: getShaderColorFromString(colorHighlight),
		u_highlights: highlights,
		u_layering: layering,
		u_waves: waves,
		u_edges: edges,
		u_caustic: caustic,
		u_size: size,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: waterFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/image-dithering.js
var defaultPreset$3 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorFront: "#94ffaf",
		colorBack: "#000c38",
		colorHighlight: "#eaff94",
		type: "8x8",
		size: 2,
		colorSteps: 2,
		originalColors: false,
		inverted: false
	}
};
var retroPreset = {
	name: "Retro",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorFront: "#eeeeee",
		colorBack: "#5452ff",
		colorHighlight: "#eeeeee",
		type: "2x2",
		size: 3,
		colorSteps: 1,
		originalColors: true,
		inverted: false
	}
};
var imageDitheringPresets = [
	defaultPreset$3,
	{
		name: "Noise",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorFront: "#a2997c",
			colorBack: "#000000",
			colorHighlight: "#ededed",
			type: "random",
			size: 1,
			colorSteps: 1,
			originalColors: false,
			inverted: false
		}
	},
	retroPreset,
	{
		name: "Natural",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorFront: "#ffffff",
			colorBack: "#000000",
			colorHighlight: "#ffffff",
			type: "8x8",
			size: 2,
			colorSteps: 5,
			originalColors: true,
			inverted: false
		}
	}
];
var ImageDithering = (0, import_react.memo)(function ImageDitheringImpl({ speed = defaultPreset$3.params.speed, frame = defaultPreset$3.params.frame, colorFront = defaultPreset$3.params.colorFront, colorBack = defaultPreset$3.params.colorBack, colorHighlight = defaultPreset$3.params.colorHighlight, image = "", type = defaultPreset$3.params.type, colorSteps = defaultPreset$3.params.colorSteps, originalColors = defaultPreset$3.params.originalColors, inverted = defaultPreset$3.params.inverted, pxSize, size = pxSize === void 0 ? defaultPreset$3.params.size : pxSize, fit = defaultPreset$3.params.fit, scale = defaultPreset$3.params.scale, rotation = defaultPreset$3.params.rotation, originX = defaultPreset$3.params.originX, originY = defaultPreset$3.params.originY, offsetX = defaultPreset$3.params.offsetX, offsetY = defaultPreset$3.params.offsetY, worldWidth = defaultPreset$3.params.worldWidth, worldHeight = defaultPreset$3.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorHighlight: getShaderColorFromString(colorHighlight),
		u_type: DitheringTypes[type],
		u_pxSize: size,
		u_colorSteps: colorSteps,
		u_originalColors: originalColors,
		u_inverted: inverted,
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: imageDitheringFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/transparent-pixel.js
var transparentPixel = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/suspend.js
var isPromise = (promise) => typeof promise === "object" && typeof promise.then === "function";
var globalCache = [];
function shallowEqualArrays(arrA, arrB) {
	if (arrA === arrB) return true;
	if (!arrA || !arrB) return false;
	const len = arrA.length;
	if (arrB.length !== len) return false;
	for (let i = 0; i < len; i++) if (arrA[i] !== arrB[i]) return false;
	return true;
}
function query(fn, keys = null) {
	if (keys === null) keys = [fn];
	for (const entry2 of globalCache) if (shallowEqualArrays(keys, entry2.keys)) {
		if (Object.prototype.hasOwnProperty.call(entry2, "error")) throw entry2.error;
		if (Object.prototype.hasOwnProperty.call(entry2, "response")) return entry2.response;
		throw entry2.promise;
	}
	const entry = {
		keys,
		promise: (isPromise(fn) ? fn : fn(...keys)).then((response) => {
			entry.response = response;
		}).catch((error) => entry.error = error)
	};
	globalCache.push(entry);
	throw entry.promise;
}
var suspend = (fn, keys) => query(fn, keys);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/heatmap.js
var defaultPreset$2 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: .75,
		speed: 1,
		frame: 0,
		contour: .5,
		angle: 0,
		noise: 0,
		innerGlow: .5,
		outerGlow: .5,
		colorBack: "#000000",
		colors: [
			"#11206a",
			"#1f3ba2",
			"#2f63e7",
			"#6bd7ff",
			"#ffe679",
			"#ff991e",
			"#ff4c00"
		]
	}
};
var heatmapPresets = [defaultPreset$2, {
	name: "Sepia",
	params: {
		...defaultObjectSizing,
		scale: .75,
		speed: .5,
		frame: 0,
		contour: .5,
		angle: 0,
		noise: .75,
		innerGlow: .5,
		outerGlow: .5,
		colorBack: "#000000",
		colors: ["#997F45", "#ffffff"]
	}
}];
var Heatmap = (0, import_react.memo)(function HeatmapImpl({ speed = defaultPreset$2.params.speed, frame = defaultPreset$2.params.frame, image = "", contour = defaultPreset$2.params.contour, angle = defaultPreset$2.params.angle, noise = defaultPreset$2.params.noise, innerGlow = defaultPreset$2.params.innerGlow, outerGlow = defaultPreset$2.params.outerGlow, colorBack = defaultPreset$2.params.colorBack, colors = defaultPreset$2.params.colors, suspendWhenProcessingImage = false, fit = defaultPreset$2.params.fit, offsetX = defaultPreset$2.params.offsetX, offsetY = defaultPreset$2.params.offsetY, originX = defaultPreset$2.params.originX, originY = defaultPreset$2.params.originY, rotation = defaultPreset$2.params.rotation, scale = defaultPreset$2.params.scale, worldHeight = defaultPreset$2.params.worldHeight, worldWidth = defaultPreset$2.params.worldWidth, ...props }) {
	const imageUrl = typeof image === "string" ? image : image.src;
	const [processedStateImage, setProcessedStateImage] = (0, import_react.useState)(transparentPixel);
	let processedImage;
	if (suspendWhenProcessingImage && typeof window !== "undefined") processedImage = suspend(() => toProcessedHeatmap(imageUrl).then((result) => URL.createObjectURL(result.blob)), [imageUrl, "heatmap"]);
	else processedImage = processedStateImage;
	(0, import_react.useLayoutEffect)(() => {
		if (suspendWhenProcessingImage) return;
		if (!imageUrl) {
			setProcessedStateImage(transparentPixel);
			return;
		}
		let url;
		let current = true;
		toProcessedHeatmap(imageUrl).then((result) => {
			if (current) {
				url = URL.createObjectURL(result.blob);
				setProcessedStateImage(url);
			}
		});
		return () => {
			current = false;
		};
	}, [imageUrl, suspendWhenProcessingImage]);
	const uniforms = (0, import_react.useMemo)(() => ({
		u_image: processedImage,
		u_contour: contour,
		u_angle: angle,
		u_noise: noise,
		u_innerGlow: innerGlow,
		u_outerGlow: outerGlow,
		u_colorBack: getShaderColorFromString(colorBack),
		u_colors: colors.map(getShaderColorFromString),
		u_colorsCount: colors.length,
		u_fit: ShaderFitOptions[fit],
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_rotation: rotation,
		u_scale: scale,
		u_worldHeight: worldHeight,
		u_worldWidth: worldWidth
	}), [
		speed,
		frame,
		contour,
		angle,
		noise,
		innerGlow,
		outerGlow,
		colors,
		colorBack,
		processedImage,
		fit,
		offsetX,
		offsetY,
		originX,
		originY,
		rotation,
		scale,
		worldHeight,
		worldWidth
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: heatmapFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/liquid-metal.js
var defaultPreset$1 = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		scale: .6,
		speed: 1,
		frame: 0,
		colorBack: "#AAAAAC",
		colorTint: "#ffffff",
		distortion: .07,
		repetition: 2,
		shiftRed: .3,
		shiftBlue: .3,
		contour: .4,
		softness: .1,
		angle: 70,
		shape: "diamond"
	}
};
var liquidMetalPresets = [
	defaultPreset$1,
	{
		name: "Noir",
		params: {
			...defaultObjectSizing,
			scale: .6,
			speed: 1,
			frame: 0,
			colorBack: "#000000",
			colorTint: "#606060",
			softness: .45,
			repetition: 1.5,
			shiftRed: 0,
			shiftBlue: 0,
			distortion: 0,
			contour: 0,
			angle: 90,
			shape: "diamond"
		}
	},
	{
		name: "Backdrop",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			scale: 1,
			colorBack: "#AAAAAC",
			colorTint: "#ffffff",
			softness: .05,
			repetition: 1.5,
			shiftRed: .3,
			shiftBlue: .3,
			distortion: .1,
			contour: .4,
			shape: "none",
			angle: 90,
			worldWidth: 0,
			worldHeight: 0
		}
	},
	{
		name: "Stripes",
		params: {
			...defaultObjectSizing,
			speed: 1,
			frame: 0,
			scale: .6,
			colorBack: "#000000",
			colorTint: "#2c5d72",
			softness: .8,
			repetition: 6,
			shiftRed: 1,
			shiftBlue: -1,
			distortion: .4,
			contour: .4,
			shape: "circle",
			angle: 0
		}
	}
];
var LiquidMetal = (0, import_react.memo)(function LiquidMetalImpl({ colorBack = defaultPreset$1.params.colorBack, colorTint = defaultPreset$1.params.colorTint, speed = defaultPreset$1.params.speed, frame = defaultPreset$1.params.frame, image = "", contour = defaultPreset$1.params.contour, distortion = defaultPreset$1.params.distortion, softness = defaultPreset$1.params.softness, repetition = defaultPreset$1.params.repetition, shiftRed = defaultPreset$1.params.shiftRed, shiftBlue = defaultPreset$1.params.shiftBlue, angle = defaultPreset$1.params.angle, shape = defaultPreset$1.params.shape, suspendWhenProcessingImage = false, fit = defaultPreset$1.params.fit, scale = defaultPreset$1.params.scale, rotation = defaultPreset$1.params.rotation, originX = defaultPreset$1.params.originX, originY = defaultPreset$1.params.originY, offsetX = defaultPreset$1.params.offsetX, offsetY = defaultPreset$1.params.offsetY, worldWidth = defaultPreset$1.params.worldWidth, worldHeight = defaultPreset$1.params.worldHeight, ...props }) {
	const imageUrl = typeof image === "string" ? image : image.src;
	const [processedStateImage, setProcessedStateImage] = (0, import_react.useState)(transparentPixel);
	let processedImage;
	if (suspendWhenProcessingImage && typeof window !== "undefined" && imageUrl) processedImage = suspend(() => toProcessedLiquidMetal(imageUrl).then((result) => URL.createObjectURL(result.pngBlob)), [imageUrl, "liquid-metal"]);
	else processedImage = processedStateImage;
	(0, import_react.useLayoutEffect)(() => {
		if (suspendWhenProcessingImage) return;
		if (!imageUrl) {
			setProcessedStateImage(transparentPixel);
			return;
		}
		let url;
		let current = true;
		toProcessedLiquidMetal(imageUrl).then((result) => {
			if (current) {
				url = URL.createObjectURL(result.pngBlob);
				setProcessedStateImage(url);
			}
		});
		return () => {
			current = false;
		};
	}, [imageUrl, suspendWhenProcessingImage]);
	const uniforms = {
		u_colorBack: getShaderColorFromString(colorBack),
		u_colorTint: getShaderColorFromString(colorTint),
		u_image: processedImage,
		u_contour: contour,
		u_distortion: distortion,
		u_softness: softness,
		u_repetition: repetition,
		u_shiftRed: shiftRed,
		u_shiftBlue: shiftBlue,
		u_angle: angle,
		u_isImage: Boolean(image),
		u_shape: LiquidMetalShapes[shape],
		u_fit: ShaderFitOptions[fit],
		u_scale: scale,
		u_rotation: rotation,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: liquidMetalFragmentShader,
		mipmaps: ["u_image"],
		uniforms
	});
});
//#endregion
//#region node_modules/@paper-design/shaders-react/dist/shaders/halftone-dots.js
var defaultPreset = {
	name: "Default",
	params: {
		...defaultObjectSizing,
		fit: "cover",
		speed: 0,
		frame: 0,
		colorBack: "#f2f1e8",
		colorFront: "#2b2b2b",
		size: .5,
		radius: 1.25,
		contrast: .4,
		originalColors: false,
		inverted: false,
		grainMixer: .2,
		grainOverlay: .2,
		grainSize: .5,
		grid: "hex",
		type: "gooey"
	}
};
var halftoneDotsPresets = [
	defaultPreset,
	{
		name: "LED screen",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#000000",
			colorFront: "#29ff7b",
			size: .5,
			radius: 1.5,
			contrast: .3,
			originalColors: false,
			inverted: false,
			grainMixer: 0,
			grainOverlay: 0,
			grainSize: .5,
			grid: "square",
			type: "soft"
		}
	},
	{
		name: "Mosaic",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#000000",
			colorFront: "#b2aeae",
			size: .6,
			radius: 2,
			contrast: .01,
			originalColors: true,
			inverted: false,
			grainMixer: 0,
			grainOverlay: 0,
			grainSize: .5,
			grid: "hex",
			type: "classic"
		}
	},
	{
		name: "Round and square",
		params: {
			...defaultObjectSizing,
			fit: "cover",
			speed: 0,
			frame: 0,
			colorBack: "#141414",
			colorFront: "#ff8000",
			size: .8,
			radius: 1,
			contrast: 1,
			originalColors: false,
			inverted: true,
			grainMixer: .05,
			grainOverlay: .3,
			grainSize: .5,
			grid: "square",
			type: "holes"
		}
	}
];
var HalftoneDots = (0, import_react.memo)(function HalftoneDotsImpl({ speed = defaultPreset.params.speed, frame = defaultPreset.params.frame, colorFront = defaultPreset.params.colorFront, colorBack = defaultPreset.params.colorBack, image = "", size = defaultPreset.params.size, radius = defaultPreset.params.radius, contrast = defaultPreset.params.contrast, originalColors = defaultPreset.params.originalColors, inverted = defaultPreset.params.inverted, grainMixer = defaultPreset.params.grainMixer, grainOverlay = defaultPreset.params.grainOverlay, grainSize = defaultPreset.params.grainSize, grid = defaultPreset.params.grid, type = defaultPreset.params.type, fit = defaultPreset.params.fit, scale = defaultPreset.params.scale, rotation = defaultPreset.params.rotation, originX = defaultPreset.params.originX, originY = defaultPreset.params.originY, offsetX = defaultPreset.params.offsetX, offsetY = defaultPreset.params.offsetY, worldWidth = defaultPreset.params.worldWidth, worldHeight = defaultPreset.params.worldHeight, ...props }) {
	const uniforms = {
		u_image: image,
		u_colorFront: getShaderColorFromString(colorFront),
		u_colorBack: getShaderColorFromString(colorBack),
		u_size: size,
		u_radius: radius,
		u_contrast: contrast,
		u_originalColors: originalColors,
		u_inverted: inverted,
		u_grainMixer: grainMixer,
		u_grainOverlay: grainOverlay,
		u_grainSize: grainSize,
		u_grid: HalftoneDotsGrids[grid],
		u_type: HalftoneDotsTypes[type],
		u_fit: ShaderFitOptions[fit],
		u_rotation: rotation,
		u_scale: scale,
		u_offsetX: offsetX,
		u_offsetY: offsetY,
		u_originX: originX,
		u_originY: originY,
		u_worldWidth: worldWidth,
		u_worldHeight: worldHeight
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShaderMount, {
		...props,
		speed,
		frame,
		fragmentShader: halftoneDotsFragmentShader,
		uniforms
	});
}, colorPropsAreEqual);
//#endregion
//#region src/features/GLShader.tsx
/**
* A fragment shader on a canvas, with the same contract the catalog's other
* effects have: `frame` in milliseconds drives it, `colors` tint it, and every
* other numeric prop becomes a uniform of the same name.
*
* This exists because two effects Aether Map wants — a kaleidoscope and a
* tunnel — are not in the upstream library, and wrapping a whole second shader
* framework to get them would cost more than the forty lines of GLSL each one
* actually is.
*/
var VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;
/** Shared preamble: every effect gets the same inputs by the same names. */
var PREAMBLE = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uScale;
uniform float uRotation;
const float TAU = 6.283185307179586;
mat2 spin(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
`;
function rgb(hex) {
	const value = hex.replace("#", "");
	const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value.padEnd(6, "0");
	return [
		0,
		2,
		4
	].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
}
function GLShader({ fragment, uniforms = {}, colors = [], frame = 0, scale = 1, rotation = 0, maxPixelCount = 2073600, minPixelRatio = 1, preserveDrawingBuffer = false, style }) {
	const ref = (0, import_react.useRef)(null);
	const program = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", {
			antialias: false,
			premultipliedAlpha: false,
			preserveDrawingBuffer
		});
		if (!gl) throw new Error("WebGL 2 is unavailable");
		const compile = (type, source) => {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
			return shader;
		};
		const built = gl.createProgram();
		gl.attachShader(built, compile(gl.VERTEX_SHADER, VERTEX));
		gl.attachShader(built, compile(gl.FRAGMENT_SHADER, fragment));
		gl.linkProgram(built);
		if (!gl.getProgramParameter(built, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(built) ?? "link");
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			-1,
			-1,
			3,
			-1,
			-1,
			3
		]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(built, "aPosition");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		program.current = {
			gl,
			program: built
		};
		return () => {
			gl.deleteProgram(built);
			gl.deleteBuffer(buffer);
			program.current = null;
			queueMicrotask(() => {
				if (!program.current) gl.getExtension("WEBGL_lose_context")?.loseContext();
			});
		};
	}, [fragment, preserveDrawingBuffer]);
	(0, import_react.useEffect)(() => {
		const current = program.current, canvas = ref.current;
		if (!current || !canvas) return;
		const { gl, program: built } = current;
		const ratio = Math.max(minPixelRatio, Math.min(devicePixelRatio || 1, 2));
		const wide = Math.max(1, Math.round(canvas.clientWidth * ratio));
		const high = Math.max(1, Math.round(canvas.clientHeight * ratio));
		const shrink = Math.min(1, Math.sqrt(maxPixelCount / Math.max(1, wide * high)));
		canvas.width = Math.max(1, Math.round(wide * shrink));
		canvas.height = Math.max(1, Math.round(high * shrink));
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.useProgram(built);
		const set = (name, value) => gl.uniform1f(gl.getUniformLocation(built, name), value);
		gl.uniform2f(gl.getUniformLocation(built, "uResolution"), canvas.width, canvas.height);
		set("uTime", frame / 1e3);
		set("uScale", scale || 1);
		set("uRotation", rotation);
		const palette = colors.length ? colors : [
			"#000000",
			"#ffffff",
			"#8888ff"
		];
		for (let index = 0; index < 3; index += 1) {
			const [r, g, b] = rgb(palette[index % palette.length]);
			gl.uniform3f(gl.getUniformLocation(built, `uColor${index}`), r, g, b);
		}
		for (const [name, value] of Object.entries(uniforms)) set(`u${name[0].toUpperCase()}${name.slice(1)}`, value);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
		ref,
		style: {
			width: "100%",
			height: "100%",
			display: "block",
			...style
		}
	});
}
//#endregion
//#region src/features/aether-shaders.tsx
/**
* Effects Aether Map writes itself, because the upstream catalog has no
* equivalent. Both are staples of projection work: a kaleidoscope turns any
* motion into symmetry, which reads well on an irregular shape like a bush or a
* porch rail, and a tunnel gives depth to a flat wall.
*/
var KALEIDOSCOPE = `${PREAMBLE}
uniform float uSegments;
uniform float uTwist;
uniform float uBands;
uniform float uSpeed;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  p = spin(uRotation * TAU / 360.0) * p / max(0.05, uScale);
  float t = uTime * uSpeed;
  float radius = length(p);
  float angle = atan(p.y, p.x) + uTwist * radius;
  // Fold the circle into wedges and mirror each one: that fold is the whole
  // effect, everything after it is just something to look at inside the wedge.
  float wedge = TAU / max(2.0, floor(uSegments));
  angle = abs(mod(angle, wedge) - wedge * 0.5);
  vec2 folded = vec2(cos(angle), sin(angle)) * radius;
  float pattern = sin(folded.x * uBands + t) * cos(folded.y * uBands - t * 0.7);
  float glow = smoothstep(0.9, 0.0, radius);
  vec3 tint = mix(uColor0, uColor1, 0.5 + 0.5 * pattern);
  tint = mix(tint, uColor2, smoothstep(0.2, 0.9, fract(radius * 2.0 - t * 0.35)));
  fragColor = vec4(tint * glow, 1.0);
}`;
var TUNNEL = `${PREAMBLE}
uniform float uSides;
uniform float uRings;
uniform float uSpeed;
uniform float uFalloff;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  p = spin(uRotation * TAU / 360.0) * p / max(0.05, uScale);
  float t = uTime * uSpeed;
  float radius = max(length(p), 0.001);
  // 1/r is the perspective: equal steps down the tunnel crowd together as they
  // approach the centre, which is what reads as depth on a flat wall.
  float depth = 1.0 / radius + t;
  float around = atan(p.y, p.x) / TAU + 0.5;
  float rings = abs(fract(depth * max(0.5, uRings)) - 0.5) * 2.0;
  float ribs = abs(fract(around * max(2.0, floor(uSides))) - 0.5) * 2.0;
  vec3 tint = mix(uColor0, uColor1, rings);
  tint = mix(tint, uColor2, smoothstep(0.75, 1.0, ribs));
  // Darken toward the mouth so the centre reads as far away, not as a hole.
  fragColor = vec4(tint * pow(clamp(radius * 1.6, 0.0, 1.0), max(0.0, uFalloff)), 1.0);
}`;
var floats = (props, names) => Object.fromEntries(names.map((name) => [name, typeof props[name] === "number" ? props[name] : 0]));
function Kaleidoscope(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GLShader, {
		fragment: KALEIDOSCOPE,
		preserveDrawingBuffer: props.preserveDrawingBuffer,
		uniforms: floats(props, [
			"segments",
			"twist",
			"bands",
			"speed"
		]),
		colors: props.colors,
		frame: props.frame,
		scale: props.scale,
		rotation: props.rotation,
		minPixelRatio: props.minPixelRatio,
		maxPixelCount: props.maxPixelCount,
		style: props.style
	});
}
var kaleidoscopePresets = [
	{
		name: "Default",
		params: {
			segments: 8,
			twist: 1.2,
			bands: 14,
			speed: .6,
			scale: 1,
			rotation: 0,
			colors: [
				"#120024",
				"#ff4fa3",
				"#7be0ff"
			]
		}
	},
	{
		name: "Cathedral",
		params: {
			segments: 12,
			twist: 0,
			bands: 26,
			speed: .25,
			scale: 1.2,
			rotation: 0,
			colors: [
				"#04121f",
				"#f5c76a",
				"#3f7fd1"
			]
		}
	},
	{
		name: "Spun glass",
		params: {
			segments: 5,
			twist: 3.5,
			bands: 9,
			speed: 1.1,
			scale: .8,
			rotation: 0,
			colors: [
				"#000000",
				"#9dffd0",
				"#ff8de0"
			]
		}
	}
];
function Tunnel(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GLShader, {
		fragment: TUNNEL,
		preserveDrawingBuffer: props.preserveDrawingBuffer,
		uniforms: floats(props, [
			"sides",
			"rings",
			"speed",
			"falloff"
		]),
		colors: props.colors,
		frame: props.frame,
		scale: props.scale,
		rotation: props.rotation,
		minPixelRatio: props.minPixelRatio,
		maxPixelCount: props.maxPixelCount,
		style: props.style
	});
}
var tunnelPresets = [
	{
		name: "Default",
		params: {
			sides: 12,
			rings: 3,
			speed: .8,
			falloff: .8,
			scale: 1,
			rotation: 0,
			colors: [
				"#05010f",
				"#4a2fd0",
				"#00e5ff"
			]
		}
	},
	{
		name: "Vortex",
		params: {
			sides: 24,
			rings: 6,
			speed: 1.6,
			falloff: 1.4,
			scale: 1,
			rotation: 0,
			colors: [
				"#100000",
				"#ff3b1f",
				"#ffd166"
			]
		}
	},
	{
		name: "Deep well",
		params: {
			sides: 6,
			rings: 1.5,
			speed: .35,
			falloff: .4,
			scale: 1.4,
			rotation: 0,
			colors: [
				"#00110c",
				"#0f8f6a",
				"#d4ffe9"
			]
		}
	}
];
//#endregion
//#region src/features/stage-shaders.tsx
/** Original projection generators. Each entry has its own spatial algorithm;
* palettes/presets below are variations, not additional generators. */
var COMMON = `${PREAMBLE}
float hash(float n) { return fract(sin(n*127.1)*43758.5453); }
float segment(vec2 p,vec2 a,vec2 b) { vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0)); }
vec2 position() { return spin(uRotation*TAU/360.0)*(gl_FragCoord.xy-.5*uResolution)/min(uResolution.x,uResolution.y)/max(.05,abs(uScale)); }
float stroke(float d,float width) { return 1.0-smoothstep(width,width+1.5/min(uResolution.x,uResolution.y),d); }
`;
var STAGE_FRAGMENTS = {
	"fireworks": `${COMMON}
uniform float uBursts,uParticles,uGravity,uGlow,uTail;
void main(){
 vec2 p=position();vec3 col=uColor0;float count=clamp(floor(uBursts),1.0,6.0),rays=clamp(floor(uParticles),8.0,64.0);
 for(int i=0;i<6;i++){
  float n=float(i);if(n>=count)break;
  float clock=uTime*.32+n/count,cycle=floor(clock),age=fract(clock),seed=n*19.0+cycle*7.0;
  vec2 center=vec2((hash(seed+4.0)-.5)*.9,(hash(seed+8.0)-.5)*.45+.10-age*age*clamp(uGravity,0.0,1.0));
  vec2 q=p-center;float angle=atan(q.y,q.x),slice=TAU/rays,ray=floor((angle+TAU)/slice+.5);
  float radius=(.08+.32*hash(seed+2.0))*sqrt(age),a=ray*slice;
  float jitter=.75+.25*hash(ray+seed*3.0);radius*=jitter;
  float distance=segment(q,vec2(cos(a),sin(a))*radius*(1.0-clamp(uTail,0.0,.9)),vec2(cos(a),sin(a))*radius);
  float light=(stroke(distance,.0015)+exp(-distance*95.0)*.24)*sin(age*3.14159265)*clamp(uGlow,0.0,4.0);
  col+=mix(uColor1,uColor2,hash(ray+seed))*light;
 }
 fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`,
	"electric-storm": `${COMMON}
uniform float uBolts,uRoughness,uGlow,uWidth;
float bolt(float y,float seed){float cell=floor(y*18.0),f=fract(y*18.0);return mix(hash(cell+seed),hash(cell+seed+1.0),f)-.5;}
void main(){
 vec2 p=position();vec3 col=uColor0;float flash=floor(uTime*6.0),brightness=.25+.75*pow(max(0.0,sin(uTime*18.0)),2.0);
 for(int i=0;i<5;i++){
  float n=float(i);if(n>=clamp(floor(uBolts),1.0,5.0))break;
  float seed=flash*29.0+n*11.0,x=(hash(seed)-.5)*1.1;
  float path=x+bolt(p.y+1.0,seed)*clamp(uRoughness,0.0,1.0)*.4;
  float d=abs(p.x-path),branch=abs(p.x-path-(.2-p.y)*.7);
  if(p.y<.2&&p.y>-.2)d=min(d,branch);
  float light=stroke(d,clamp(uWidth,.0005,.04))+exp(-d*55.0)*.35;
  col+=mix(uColor1,uColor2,stroke(d,.002))*light*brightness*clamp(uGlow,0.0,3.0);
 }
 fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`,
	"radar-sweep": `${COMMON}
uniform float uRings,uBlips,uTrail,uGlow;
void main(){
 vec2 p=position();float r=length(p),a=atan(p.y,p.x),sweep=mod(uTime*.65,TAU);
 float behind=mod(sweep-a+TAU,TAU),trail=clamp(uTrail,.03,2.0);
 float disc=1.0-smoothstep(.46,.47,r),rings=stroke(abs(fract(r*clamp(uRings,1.0,12.0)/.46)-.5),.015);
 float cross=max(stroke(abs(p.x),.0008),stroke(abs(p.y),.0008));
 vec3 col=uColor0+uColor1*disc*(rings*.18+cross*.10+exp(-behind/trail)*.25);
 for(int i=0;i<24;i++){
  float n=float(i);if(n>=clamp(floor(uBlips),0.0,24.0))break;
  float theta=hash(n+7.0)*TAU,rad=.08+.35*hash(n+39.0);
  vec2 center=vec2(cos(theta),sin(theta))*rad;float age=mod(sweep-theta+TAU,TAU);
  float dotLight=exp(-length(p-center)*350.0)*exp(-age/1.4);
  col+=uColor2*dotLight*clamp(uGlow,0.0,4.0);
 }
 col+=uColor2*disc*exp(-behind*120.0)*.45;
 fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`,
	"moire-weave": `${COMMON}
uniform float uSpacing,uTwist,uContrast;
void main(){
 vec2 p=position();float spacing=clamp(uSpacing,8.0,150.0),twist=clamp(uTwist,0.0,3.0);
 vec2 q=spin(.08+sin(uTime*.17)*.23*twist)*p;
 float first=sin(p.x*spacing+sin(p.y*3.0+uTime*.3)*twist);
 float second=sin(q.x*spacing-uTime*.3);
 float beat=clamp(.5+.5*first*second*clamp(uContrast,.1,3.0),0.0,1.0);
 vec3 col=mix(uColor0,uColor1,beat);col=mix(col,uColor2,pow(beat,6.0)*.6);
 fragColor=vec4(col,1.0);
}`,
	"lissajous-ribbons": `${COMMON}
uniform float uFrequencyX,uFrequencyY,uWidth,uGlow;
vec2 curve(float t){return vec2(sin(t*clamp(uFrequencyX,1.0,6.0)+uTime*.27),sin(t*clamp(uFrequencyY,1.0,6.0)))*.38;}
void main(){
 vec2 p=position();float distance=10.0,nearest=0.0;vec2 previous=curve(0.0);
 for(int i=1;i<=96;i++){
  float part=float(i)/96.0;vec2 point=curve(part*TAU);float d=segment(p,previous,point);
  if(d<distance){distance=d;nearest=part;}previous=point;
 }
 float width=clamp(uWidth,.001,.05),light=stroke(distance,width)+exp(-distance*50.0)*clamp(uGlow,0.0,3.0)*.35;
 vec3 tint=mix(uColor1,uColor2,.5+.5*sin(nearest*TAU-uTime));
 fragColor=vec4(clamp(uColor0+tint*light,0.0,1.0),1.0);
}`,
	"pulse-columns": `${COMMON}
uniform float uColumns,uSteps,uGap,uAmplitude,uGlow;
void main(){
 vec2 p=position()+.5;float columns=clamp(floor(uColumns),3.0,64.0),column=floor(p.x*columns),x=fract(p.x*columns);
 float height=(.22+.72*(.5+.5*sin(uTime*1.5+column*.61+sin(column+uTime*.4))))*clamp(uAmplitude,0.0,1.4);
 float gap=clamp(uGap,.01,.8)*.5,inside=step(gap,x)*step(x,1.0-gap),steps=clamp(floor(uSteps),4.0,80.0);
 float bars=step(.06,p.y)*step(p.y,height+.06)*inside*step(.12,fract(p.y*steps));
 vec3 tint=mix(uColor1,uColor2,clamp(p.y,0.0,1.0));
 float halo=exp(-abs(p.y-height-.06)*50.0)*inside*clamp(uGlow,0.0,2.0)*.2;
 fragColor=vec4(clamp(uColor0+tint*(bars+halo),0.0,1.0),1.0);
}`,
	"sand-dunes": `${COMMON}
uniform float uRidges,uWind,uLightAngle,uContrast;
float terrain(vec2 p){float t=uTime*.1*clamp(uWind,0.0,3.0);float bend=sin(p.x*3.0+t)*.45+sin(p.x*7.0-t)*.12;return sin((p.y+bend)*clamp(uRidges,2.0,20.0)-t)*.1+sin(p.y*43.0+p.x*9.0-t*3.0)*.003;}
void main(){
 vec2 p=position();float h=terrain(p),dx=(terrain(p+vec2(.002,0.0))-h)/.002,dy=(terrain(p+vec2(0.0,.002))-h)/.002;
 vec3 normal=normalize(vec3(-dx,-dy,1.0));float a=uLightAngle*TAU/360.0;
 float light=clamp(dot(normal,normalize(vec3(cos(a),sin(a),.65)))*clamp(uContrast,.2,3.0),0.0,1.0);
 vec3 col=mix(uColor0,uColor1,light);col=mix(col,uColor2,pow(light,6.0)*.4);
 fragColor=vec4(col,1.0);
}`,
	"digital-rain": `${COMMON}
uniform float uColumns,uTrail,uGlow;
float glyph(vec2 q,float seed){
 float d=1.0;
 for(int i=0;i<7;i++){
  float n=float(i);if(hash(seed+n*7.0)<.45)continue;
  vec2 a,b;
  if(i<3){float y=.22+float(i)*.28;a=vec2(.25,y);b=vec2(.75,y);}
  else{float x=i<5?.25:.75,y=mod(float(i),2.0)<.5?.22:.50;a=vec2(x,y);b=vec2(x,y+.28);}
  d=min(d,segment(q,a,b));
 }
 return 1.0-smoothstep(.025,.065,d);
}
void main(){
 vec2 p=position()+.5;float cols=clamp(floor(uColumns),6.0,80.0),rows=cols*.75;
 vec2 cell=floor(p*vec2(cols,rows)),q=fract(p*vec2(cols,rows));
 float head=fract(hash(cell.x+13.0)-uTime*.11*(.5+hash(cell.x+9.0)))*rows;
 float distance=mod(cell.y-head+rows,rows),trail=exp(-distance/max(1.0,rows*clamp(uTrail,.05,.8)));
 float shape=glyph(q,cell.x*41.0+cell.y*7.0+floor(uTime*3.0));
 vec3 tint=mix(uColor1,uColor2,exp(-distance*1.5));
 fragColor=vec4(clamp(uColor0+tint*shape*trail*clamp(uGlow,0.0,3.0),0.0,1.0),1.0);
}`
};
var warm = [
	"#100609",
	"#fc7044",
	"#ffe0a0"
];
var STAGE_GENERATORS = STAGE_DEFINITIONS.map((entry) => ({
	...entry,
	fragment: STAGE_FRAGMENTS[entry.id]
}));
var STAGE_SHADERS = STAGE_GENERATORS.map((entry) => ({
	id: entry.id,
	label: entry.label,
	image: false,
	presets: [{
		name: "Default",
		params: {
			...entry.params,
			colors: [...entry.colors],
			speed: .7,
			scale: 1,
			rotation: 0
		}
	}, {
		name: "Amber",
		params: {
			...entry.params,
			colors: warm,
			speed: .4,
			scale: 1,
			rotation: 0
		}
	}],
	component: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GLShader, {
		fragment: entry.fragment,
		uniforms: Object.fromEntries(Object.keys(entry.params).map((key) => [key, Number(props[key] ?? entry.params[key])])),
		colors: props.colors,
		frame: props.frame,
		scale: props.scale,
		rotation: props.rotation,
		preserveDrawingBuffer: props.preserveDrawingBuffer,
		minPixelRatio: props.minPixelRatio,
		maxPixelCount: props.maxPixelCount,
		style: props.style
	})
}));
//#endregion
//#region src/features/gallery-shaders.tsx
/** Original, resolution-independent projection visuals. The show clock drives
* every frame; no downloads, random runtime state or separate preview renderer. */
var FRAGMENT = `${PREAMBLE}
uniform float uMode;
uniform float uSpeed;
uniform float uDensity;
uniform float uGlow;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float line(float d, float w) { return 1.0-smoothstep(w,w+0.004,abs(d)); }
vec3 palette(float v) { return mix(uColor1,uColor2,0.5+0.5*sin(v)); }
void main() {
 vec2 uv=gl_FragCoord.xy/uResolution;
 vec2 p=(gl_FragCoord.xy-0.5*uResolution)/min(uResolution.x,uResolution.y);
 p=spin(uRotation*TAU/360.0)*p/max(0.05,uScale);
 float t=uTime*uSpeed, density=max(1.0,uDensity);
 vec3 col=uColor0;
 if(uMode<0.5) {
  for(int i=0;i<8;i++) {
   float f=float(i), a=f*0.65+t*0.13;
   float d=dot(p,vec2(cos(a),sin(a)))-sin(t*0.45+f)*0.32;
   col+=palette(f+t*0.2)*(line(d,0.003)+exp(-abs(d)*60.0)*uGlow*0.45);
  }
 } else if(uMode<1.5) {
  float horizon=0.08;
  if(p.y<horizon) {
   float z=0.22/max(0.015,horizon-p.y);
   float road=p.x*z;
   float grid=max(line(fract(road*density)-0.5,0.025),line(fract(z*2.0-t)-0.5,0.045));
   col=mix(uColor0,palette(z*0.2),grid*clamp(1.4-z*0.075,0.0,1.0));
  } else {
   float sun=1.0-smoothstep(0.19,0.195,length(p-vec2(0.0,0.22)));
   float stripes=step(0.20,fract(p.y*30.0));
   col=mix(uColor0,mix(uColor1,uColor2,clamp(p.y*2.0,0.0,1.0)),sun*stripes);
  }
 } else if(uMode<2.5) {
  vec2 cell=floor((p+1.0)*density), q=fract((p+1.0)*density);
  float n=hash(cell), phase=sin(t*1.5+n*TAU+cell.x*0.25);
  float mask=step(0.07,q.x)*step(0.07,q.y)*step(q.x,0.93)*step(q.y,0.93);
  col=mix(uColor0,palette(n*TAU+t*0.25)*(0.25+0.75*(0.5+0.5*phase)),mask);
 } else if(uMode<3.5) {
  float d=length(p)+0.055*sin(atan(p.y,p.x)*5.0+t)+0.025*sin(p.x*9.0-t);
  float bands=fract(d*density-t*0.1);
  col+=palette(d*8.0+t*0.3)*line(bands-0.5,0.035)*uGlow;
 } else if(uMode<4.5) {
  for(int i=0;i<3;i++) {
   float layer=float(i)+1.0;
   vec2 grid=p*(density+layer*7.0)+vec2(t*0.13,t*0.07)*layer;
   vec2 cell=floor(grid), q=fract(grid)-0.5;
   float n=hash(cell+layer), star=exp(-length(q-vec2(n-0.5,hash(cell+13.0)-0.5)*0.65)*100.0/layer);
   col+=palette(n*6.0)*star*(0.5+0.5*sin(t+n*TAU))*uGlow;
  }
 } else if(uMode<5.5) {
  for(int i=0;i<5;i++) {
   float f=float(i), h=0.12*sin(p.x*3.0+t*0.3+f)+0.06*sin(p.x*8.0-t*0.2+f);
   float curtain=exp(-abs(p.y-h+f*0.08)*12.0)*(0.55+0.45*sin(p.x*density+t*0.4+f));
   col+=palette(f*0.7+p.x*2.0)*curtain*uGlow*0.35;
  }
 } else if(uMode<6.5) {
  for(int i=0;i<3;i++) {
   float layer=float(i)+1.0;
   vec2 grid=(p+vec2(t*0.025*sin(layer),t*0.08))*density*layer;
   vec2 cell=floor(grid), q=fract(grid)-0.5;
   float n=hash(cell+layer);
   col+=palette(n)* (1.0-smoothstep(0.015,0.055/layer,length(q-vec2(n-0.5,hash(cell+5.0)-0.5)*0.6)))*uGlow;
  }
 } else if(uMode<7.5) {
  vec2 grid=(p+vec2(0.0,t*0.06))*density;
  vec2 cell=floor(grid), q=fract(grid)-0.5;
  q=spin((hash(cell)-0.5)*0.7)*q;
  q.y-=0.08; q.y=-q.y;
  float heart=pow(q.x*q.x+q.y*q.y-0.075,3.0)-q.x*q.x*q.y*q.y*q.y;
  col=mix(uColor0,palette(hash(cell)*TAU),1.0-smoothstep(-0.0001,0.0002,heart));
 } else if(uMode<8.5) {
  vec2 eye=p-vec2(sin(t*0.45)*0.06,cos(t*0.35)*0.03);
  float r=length(eye), a=atan(eye.y,eye.x);
  float orb=1.0-smoothstep(0.345,0.35,r);
  vec3 sclera=vec3(0.88,0.85,0.79)*sqrt(max(0.0,1.0-r*r/0.125));
  float iris=1.0-smoothstep(0.16,0.165,r);
  vec3 irisColor=palette(sin(a*density)+sin(a*density*2.3+r*95.0))* (0.3+0.7*sin(a*33.0+r*160.0)*sin(a*33.0+r*160.0));
  vec3 eyeball=mix(sclera,irisColor,iris);
  eyeball=mix(eyeball,vec3(0.005),1.0-smoothstep(0.058,0.065+0.006*sin(t),r));
  eyeball+=vec3(0.7)*(1.0-smoothstep(0.012,0.033,length(eye-vec2(-0.065,0.08))));
  col=mix(uColor0,eyeball,orb);
 } else if(uMode<9.5) {
  vec2 q=p*1.8;
  float flicker=0.8+0.12*sin(t*7.0)+0.08*sin(t*13.0);
  float eyes=step(abs(abs(q.x)-0.32),0.18)*step(0.1,q.y)*step(q.y,0.38-abs(abs(q.x)-0.32));
  float nose=step(abs(q.x),0.10)*step(-0.06,q.y)*step(q.y,0.16-abs(q.x));
  float mouth=step(abs(q.x),0.6)*step(-0.39+0.20*q.x*q.x,q.y)*step(q.y,-0.16-0.10*cos(q.x*14.0));
  col+=mix(uColor1,uColor2,uv.y)*clamp(eyes+nose+mouth,0.0,1.0)*flicker*uGlow;
 } else {
  float hill=-0.19+0.10*sin(p.x*4.0)+0.035*sin(p.x*11.0);
  col=mix(uColor0,palette(p.y*4.0+t*0.06),smoothstep(-0.4,0.8,p.y)*0.65);
  col+=uColor2*(1.0-smoothstep(0.075,0.08,length(p-vec2(0.25,0.25))));
  col=mix(col,uColor0*0.4,1.0-smoothstep(hill,hill+0.004,p.y));
  float frame=max(line(p.x,0.012),line(p.y,0.012));
  frame=max(frame,step(0.73,abs(p.x))); frame=max(frame,step(0.43,abs(p.y)));
  col=mix(col,vec3(0.012),frame);
 }
 fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`;
function GalleryShader(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GLShader, {
		fragment: FRAGMENT,
		uniforms: Object.fromEntries([
			"mode",
			"speed",
			"density",
			"glow"
		].map((key) => [key, Number(props[key] ?? 1)])),
		colors: props.colors,
		frame: props.frame,
		scale: props.scale,
		rotation: props.rotation,
		preserveDrawingBuffer: props.preserveDrawingBuffer,
		minPixelRatio: props.minPixelRatio,
		maxPixelCount: props.maxPixelCount,
		style: props.style
	});
}
var GALLERY_SHADERS = GALLERY_DEFINITIONS.map((entry, mode) => ({
	...entry,
	component: (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GalleryShader, {
		...props,
		mode
	}),
	image: false
}));
//#endregion
//#region src/features/shader-catalog.ts
function entry(id, label, component, presets) {
	return {
		id,
		label,
		component,
		presets,
		image: [
			"heatmap",
			"water",
			"liquid-metal",
			"halftone-dots",
			"paper-texture",
			"fluted-glass",
			"image-dithering"
		].includes(id)
	};
}
/** Pinned upstream effects plus original generators. Image effects are counted separately. */
var SHADERS = [
	entry("mesh-gradient", "Mesh Gradient", MeshGradient, [...meshGradientPresets, {
		name: "Ink mesh gradient",
		params: {
			...meshGradientPresets[0].params,
			colors: [
				"#10142a",
				"#7c3aed",
				"#3b82f6",
				"#9be7ff"
			],
			distortion: .95,
			swirl: .3,
			speed: .6
		}
	}]),
	entry("static-mesh-gradient", "Static Mesh Gradient", StaticMeshGradient, staticMeshGradientPresets),
	entry("radial-gradient", "Radial Gradient", StaticRadialGradient, staticRadialGradientPresets),
	entry("grain-gradient", "Grain Gradient", GrainGradient, grainGradientPresets),
	entry("heatmap", "Heatmap", Heatmap, heatmapPresets),
	entry("simplex-noise", "Simplex Noise", SimplexNoise, simplexNoisePresets),
	entry("perlin-noise", "Perlin Noise", PerlinNoise, perlinNoisePresets),
	entry("neuro-noise", "Neuro Noise", NeuroNoise, neuroNoisePresets),
	entry("voronoi", "Voronoi", Voronoi, voronoiPresets),
	entry("metaballs", "Metaballs", Metaballs, metaballsPresets),
	entry("water", "Water", Water, waterPresets),
	entry("liquid-metal", "Liquid Metal", LiquidMetal, liquidMetalPresets),
	entry("waves", "Waves", Waves, wavesPresets),
	entry("swirl", "Swirl", Swirl, swirlPresets),
	entry("spiral", "Spiral", Spiral, spiralPresets),
	entry("smoke-ring", "Smoke Ring", SmokeRing, smokeRingPresets),
	entry("warp", "Warp", Warp, [...warpPresets, {
		name: "Shader flow",
		params: {
			...warpPresets[0].params,
			colors: [
				"#2a0a33",
				"#ff5ec7",
				"#8b5cf6",
				"#ffd1e8"
			],
			speed: .5,
			swirl: .9,
			distortion: .35
		}
	}]),
	entry("dot-orbit", "Dot Orbit", DotOrbit, dotOrbitPresets),
	entry("dot-grid", "Dot Grid", DotGrid, dotGridPresets),
	entry("color-panels", "Color Panels", ColorPanels, colorPanelsPresets),
	entry("dithering", "Dithering", Dithering, ditheringPresets),
	entry("halftone-dots", "Halftone Dots", HalftoneDots, halftoneDotsPresets),
	entry("god-rays", "God Rays", GodRays, godRaysPresets),
	entry("pulsing-border", "Pulsing Border", PulsingBorder, pulsingBorderPresets),
	entry("paper-texture", "Paper Texture", PaperTexture, paperTexturePresets),
	entry("fluted-glass", "Fluted Glass", FlutedGlass, flutedGlassPresets),
	entry("image-dithering", "Image Dithering", ImageDithering, imageDitheringPresets),
	entry("kaleidoscope", "Kaleidoscope", Kaleidoscope, kaleidoscopePresets),
	entry("tunnel", "Tunnel", Tunnel, tunnelPresets),
	...GALLERY_SHADERS,
	...STAGE_SHADERS
];
function newShader(preset = "mesh-gradient", variant = 0) {
	const entry = SHADERS.find((s) => s.id === preset) ?? SHADERS[0];
	const { colors, frame: _frame, ...params } = entry.presets[variant]?.params ?? entry.presets[0].params;
	const staticPreset = typeof params.speed !== "number" || params.speed === 0;
	return {
		preset: entry.id,
		colors: Array.isArray(colors) ? [...colors] : [],
		parameters: {
			...Object.fromEntries(Object.entries(params).filter(([, v]) => [
				"number",
				"string",
				"boolean"
			].includes(typeof v))),
			speed: staticPreset ? 1 : params.speed
		},
		time: {
			...DEFAULT_SHADER_TIME,
			loopS: 15
		},
		...staticPreset && typeof params.rotation === "number" ? { modulation: { rotation: {
			source: "time",
			amount: 15,
			periodS: 15,
			waveform: "sine",
			phase: 0
		} } } : {}
	};
}
//#endregion
//#region src/features/shader-looks.ts
function recallShaderLook(shader, slot) {
	const look = shader.looks?.[slot];
	return look ? {
		...structuredClone(look),
		looks: shader.looks
	} : shader;
}
/** Random starts from a valid catalog variation and varies continuous controls only. */
function randomShaderLook(shader, random = Math.random) {
	const entry = SHADERS.find((item) => item.id === shader.preset) ?? SHADERS[0];
	const next = newShader(entry.id, Math.floor(random() * entry.presets.length));
	next.colors = next.colors.map(() => `#${Math.floor(random() * 16777216).toString(16).padStart(6, "0")}`);
	if (typeof next.parameters.scale === "number") next.parameters.scale = .5 + random() * 1.5;
	if (typeof next.parameters.rotation === "number") next.parameters.rotation = random() * 360;
	if (typeof next.parameters.speed === "number") next.parameters.speed = .25 + random() * 1.75;
	return {
		...next,
		time: shader.time,
		modulation: shader.modulation,
		animation: shader.animation,
		looks: shader.looks
	};
}
//#endregion
//#region src/visual-effects.ts
/** One catalog for authoring, saved files, agents and source-space rendering. */
var VISUAL_EFFECTS = [
	{
		value: "slide",
		label: "Slide",
		min: -100,
		max: 100,
		initial: 25,
		step: 1,
		amountLabel: "Speed",
		help: "Scroll horizontally, wrapping at the edges. Negative values reverse direction."
	},
	{
		value: "rotate",
		label: "Rotate",
		min: -100,
		max: 100,
		initial: 25,
		step: 1,
		amountLabel: "Speed",
		help: "Rotate continuously with visual time. Negative values reverse direction."
	},
	{
		value: "zoom",
		label: "Zoom",
		min: -100,
		max: 100,
		initial: 25,
		step: 1,
		amountLabel: "Amount",
		help: "Enlarge or reduce the content around its center."
	},
	{
		value: "kaleido",
		label: "Kaleido",
		min: 2,
		max: 16,
		initial: 6,
		step: 1,
		amountLabel: "Segments",
		help: "Reflect the visual into radial kaleidoscope segments."
	},
	{
		value: "tile",
		label: "Tile",
		min: 1,
		max: 8,
		initial: 3,
		step: 1,
		amountLabel: "Repeats",
		help: "Repeat the complete visual in a square grid."
	},
	{
		value: "blur",
		label: "Blur",
		min: -100,
		max: 100,
		initial: 25,
		step: 1,
		amountLabel: "Amount",
		help: "Soften the picture before it is mapped onto your surfaces."
	},
	{
		value: "grayscale",
		label: "Black & white",
		min: -100,
		max: 100,
		initial: 100,
		step: 1,
		amountLabel: "Amount",
		help: "Remove color while retaining brightness and transparency."
	},
	{
		value: "hue",
		label: "Color cycle",
		min: -100,
		max: 100,
		initial: 25,
		step: 1,
		amountLabel: "Speed",
		help: "Cycle the hue over time without changing the visual source."
	},
	{
		value: "crt",
		label: "CRT",
		min: 0,
		max: 100,
		initial: 50,
		step: 1,
		amountLabel: "Strength",
		help: "Add curved-screen distortion and dark scanlines."
	},
	{
		value: "vintage",
		label: "Vintage",
		min: 0,
		max: 100,
		initial: 50,
		step: 1,
		amountLabel: "Strength",
		help: "Add faded warm color, film grain and a dark vignette."
	},
	{
		value: "fisheye",
		label: "Fisheye",
		min: -100,
		max: 100,
		initial: 50,
		step: 1,
		amountLabel: "Distortion",
		help: "Bend the picture around its center. Negative values invert the lens."
	}
];
var effectDefinition = (kind) => VISUAL_EFFECTS.find((e) => e.value === kind);
var isEffectKind = (kind) => VISUAL_EFFECTS.some((e) => e.value === kind);
function effectAmount(kind, value) {
	const spec = effectDefinition(kind);
	const bounded = Math.max(spec.min, Math.min(spec.max, Number.isFinite(value) ? value : spec.initial));
	return kind === "tile" || kind === "kaleido" ? Math.round(bounded) : bounded;
}
//#endregion
//#region src/visual-looks.ts
var VISUAL_LOOK_SLOTS = [
	"A",
	"B",
	"C"
];
function visualLookVersion(show) {
	return show.version < 11 && show.visuals?.some((v) => VISUAL_LOOK_SLOTS.some((slot) => v.looks?.[slot])) ? {
		...show,
		version: 11
	} : show;
}
function picture(show, visual) {
	if (visual.mask || visual.timelineRefID || show.tracks?.find((t) => t.id === visual.trackID)?.kind === "audio") throw Error("Choose a picture visual for appearance presets.");
}
function editable$1(show, visual) {
	if (visualIsLocked(show, visual)) throw Error("The visual or its track is locked.");
	picture(show, visual);
}
function usable(show, source) {
	if (source.mediaId && !show.media.some((m) => m.id === source.mediaId)) throw Error("This preset’s media is unavailable. Restore that media before recalling the preset.");
	if (source.mediaId && show.media.find((m) => m.id === source.mediaId)?.kind === "audio") throw Error("A picture preset cannot use an audio-only source.");
}
/** Capture authored bases and motion, never the evaluated frame or a pool pointer. */
function captureVisualLook(show, visual) {
	if ((visual.effects?.length ?? 0) > 12) throw Error("Use at most 12 effects before storing a visual preset.");
	const source = structuredClone(visualSource(show, visual));
	usable(show, source);
	if (source.shader) {
		const { looks: _looks, ...shader } = source.shader;
		source.shader = shader;
	}
	return structuredClone({
		source,
		opacity: visual.opacity,
		mapping: visual.mapping,
		placement: visual.placement,
		motion: visual.motion,
		effects: visual.effects ?? []
	});
}
/** Older shader slots keep their original, shader-only recall semantics. */
function visualLook(show, visual, slot) {
	if (visual.looks?.[slot]) return visual.looks[slot];
	const source = visualSource(show, visual);
	if (!source.shader?.looks?.[slot]) return;
	const legacy = manualSourceEdit(source, {
		...source,
		shader: recallShaderLook(source.shader, slot)
	});
	const { looks: _looks, ...shader } = legacy.shader;
	return {
		...captureVisualLook(show, visual),
		shaderOnly: true,
		source: structuredClone({
			...legacy,
			shader
		})
	};
}
function hasVisualLook(show, visual, slot) {
	return !!(visual.looks?.[slot] || visualSource(show, visual).shader?.looks?.[slot]);
}
function retainedLooks(show, visual) {
	return Object.fromEntries(VISUAL_LOOK_SLOTS.flatMap((slot) => {
		const look = visualLook(show, visual, slot);
		return look ? [[slot, structuredClone(look)]] : [];
	}));
}
function storeVisualLook(show, visual, slot) {
	editable$1(show, visual);
	return {
		...visual,
		looks: {
			...retainedLooks(show, visual),
			[slot]: captureVisualLook(show, visual)
		}
	};
}
function recallVisualLook(show, visual, slot, from = visual) {
	editable$1(show, visual);
	picture(show, from);
	const look = visualLook(show, from, slot);
	if (!look) throw Error(`Preset ${slot} has not been stored.`);
	usable(show, look.source);
	const copy = structuredClone(look), current = visualSource(show, visual), legacyBank = current.shader?.looks, looks = retainedLooks(show, visual);
	if (copy.shaderOnly) {
		const source = current.shader ? manualSourceEdit(current, {
			...current,
			shader: {
				...copy.source.shader,
				...legacyBank ? { looks: structuredClone(legacyBank) } : {}
			}
		}) : copy.source;
		return {
			...visual,
			looks,
			source
		};
	}
	if (copy.source.shader) {
		const { looks: _looks, ...shader } = copy.source.shader;
		copy.source.shader = {
			...shader,
			...legacyBank ? { looks: structuredClone(legacyBank) } : {}
		};
	}
	return {
		...visual,
		looks,
		source: copy.source,
		opacity: copy.opacity,
		mapping: copy.mapping,
		placement: copy.placement,
		motion: copy.motion,
		effects: copy.effects
	};
}
function clearVisualLook(show, visual, slot) {
	editable$1(show, visual);
	const looks = retainedLooks(show, visual);
	delete looks[slot];
	let source = visualSource(show, visual);
	if (source.shader?.looks?.[slot]) {
		const bank = { ...source.shader.looks };
		delete bank[slot];
		source = {
			...source,
			shader: {
				...source.shader,
				looks: Object.keys(bank).length ? bank : void 0
			}
		};
	}
	return {
		...visual,
		looks: Object.keys(looks).length ? looks : void 0,
		...source !== visualSource(show, visual) ? { source } : {}
	};
}
/** Seeded randomization changes appearance, never media, device connections or scheduling. */
function randomVisualLook(show, visual, seed) {
	editable$1(show, visual);
	if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw Error("Random preset seed must be an integer from 0 to 4294967295.");
	let state = seed >>> 0;
	const random = () => {
		state = Math.imul(state, 1664525) + 1013904223 >>> 0;
		return state / 4294967296;
	};
	const before = visualSource(show, visual);
	let source = before;
	if (before.shader) {
		const shader = randomShaderLook(before.shader, random), animation = { ...shader.animation }, modulation = { ...shader.modulation };
		for (const key of /* @__PURE__ */ new Set([...Object.keys(before.shader.parameters), ...Object.keys(shader.parameters)])) if (before.shader.parameters[key] !== shader.parameters[key]) {
			delete animation[key];
			delete modulation[key];
		}
		source = {
			...source,
			shader: {
				...shader,
				animation: Object.keys(animation).length ? animation : void 0,
				modulation: Object.keys(modulation).length ? modulation : void 0
			}
		};
	} else {
		const values = Object.fromEntries(sourceParameters(source).filter((p) => p.binding && p.binding !== "chroma" && p.binding !== "textBackground" && !p.key.endsWith(":alphaPercent")).map((p) => [p.key, p.key.endsWith(":hueDeg") ? random() * 360 : p.key.endsWith(":saturationPercent") ? 55 + random() * 40 : 75 + random() * 25]));
		source = setSourceMotionBases(source, values);
		if (source.drawing) source = {
			...source,
			drawing: {
				...source.drawing,
				strokes: source.drawing.strokes.map((stroke) => ({
					...stroke,
					color: `hsl(${Math.floor(random() * 360)}, 80%, 65%)`
				}))
			}
		};
	}
	source = manualSourceEdit(before, source);
	const effects = visual.effects?.length ? visual.effects.map((e, i) => {
		const spec = effectDefinition(e.kind);
		return {
			...e,
			enabled: e.enabled || i === 0,
			amount: effectAmount(e.kind, spec.min + (spec.max - spec.min) * random()),
			animation: void 0,
			modulation: void 0
		};
	}) : source === before ? [{
		id: `${visual.id}-look-${seed}`,
		kind: "vintage",
		enabled: true,
		amount: 25 + random() * 45
	}] : void 0;
	return {
		...visual,
		source,
		effects
	};
}
//#endregion
//#region src/media/chroma-key.ts
var DEFAULT_CHROMA_KEY = {
	enabled: true,
	color: "#00ff00",
	similarity: .2,
	softness: .12,
	spill: .5
};
function readChromaKey(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
	const raw = value;
	const unit = (key) => typeof raw[key] === "number" && Number.isFinite(raw[key]) ? Math.max(0, Math.min(1, raw[key])) : DEFAULT_CHROMA_KEY[key];
	return {
		enabled: raw.enabled === true,
		color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_CHROMA_KEY.color,
		similarity: unit("similarity"),
		softness: unit("softness"),
		spill: unit("spill")
	};
}
//#endregion
//#region src/audio-output.ts
function readAudioOutput(raw) {
	const value = raw && typeof raw === "object" ? raw : {};
	return {
		volume: typeof value.volume === "number" && Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : 1,
		muted: value.muted === true,
		dimmed: value.dimmed === true
	};
}
/** DIM lowers the soundtrack by 20 dB without changing the stored fader. */
function masterAudioGain(raw) {
	const output = readAudioOutput(raw);
	return output.muted ? 0 : output.volume * (output.dimmed ? .1 : 1);
}
//#endregion
//#region src/live/timeline-audio-engine.ts
function readTrackEQ(value) {
	const v = value && typeof value === "object" ? value : {};
	const gain = (n) => typeof n === "number" && Number.isFinite(n) ? Math.min(12, Math.max(-12, n)) : 0;
	return {
		enabled: v.enabled === true,
		lowDb: gain(v.lowDb),
		midDb: gain(v.midDb),
		highDb: gain(v.highDb)
	};
}
//#endregion
//#region src/mask/bend.ts
function readBend(value) {
	if (!value || typeof value !== "object") return;
	const v = value;
	if (v.axis !== "horizontal" && v.axis !== "vertical" || typeof v.angleDeg !== "number" || !Number.isFinite(v.angleDeg)) return;
	return {
		axis: v.axis,
		angleDeg: Math.max(-170, Math.min(170, v.angleDeg))
	};
}
//#endregion
//#region src/mask/alpha.ts
function readAlphaMask(value) {
	if (!value || typeof value !== "object") return;
	const v = value;
	if (typeof v.png !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.png) || v.png.length > 8e6) return;
	return {
		png: v.png,
		...typeof v.text === "string" ? { text: v.text.slice(0, 500) } : {},
		...typeof v.name === "string" ? { name: v.name.slice(0, 200) } : {}
	};
}
//#endregion
//#region src/scene-hotkeys.ts
/** Function keys only, so typing into a web window cannot change scenes. */
var HOTKEYS = [
	"F1",
	"F2",
	"F3",
	"F4",
	"F5",
	"F6",
	"F7",
	"F8",
	"F9",
	"F10",
	"F11",
	"F12"
];
var isHotkey = (value) => HOTKEYS.includes(value);
//#endregion
//#region src/features/shape-groups.ts
var at = (x, y) => [x, y];
var quad = (a, b, c, d) => [
	a,
	b,
	c,
	d
];
function face(output, index, name, folder, groupShape, corners) {
	const surface = newSurface(output, index);
	return {
		...surface,
		id: nextId("s"),
		name,
		folder,
		groupShape,
		corners,
		source: {
			...surface.source,
			rect: [
				0,
				0,
				output.width,
				output.height
			]
		}
	};
}
/**
* A cube as you actually see one: three faces meeting at the near vertical
* edge — top, left and right. Laid out isometrically so the starting shape
* already reads as a solid rather than as three rectangles you have to
* recognise.
*/
function cubeSurfaces(output, index, name = "Cube") {
	const w = output.width, h = output.height;
	const side = Math.min(w, h) * .34;
	const cx = w / 2, cy = h / 2;
	const hx = side;
	const top = at(cx, cy - side * .75);
	const left = at(cx - hx, cy - side * .25);
	const right = at(cx + hx, cy - side * .25);
	const front = at(cx, cy + side * .25);
	const bottomLeft = at(cx - hx, cy + side * .75);
	const bottomRight = at(cx + hx, cy + side * .75);
	const lower = at(cx, cy + side * 1.25);
	return [
		face(output, index, `${name} top`, name, "cube", quad(top, right, front, left)),
		face(output, index + 1, `${name} left`, name, "cube", quad(left, front, lower, bottomLeft)),
		face(output, index + 2, `${name} right`, name, "cube", quad(front, right, bottomRight, lower))
	];
}
/**
* A box you look into: a back panel with four walls sloping out to the opening.
* The shape an alcove, a window reveal or a shadow box actually presents, and
* the one the reference's icon draws — an outer rectangle, an inner rectangle
* and the corners joined.
*/
function boxSurfaces(output, index, name = "Box") {
	const w = output.width, h = output.height;
	const outer = Math.min(w, h) * .6;
	const inset = outer * .3;
	const cx = w / 2, cy = h / 2;
	const o = outer / 2, i = o - inset;
	const outerTopLeft = at(cx - o, cy - o), outerTopRight = at(cx + o, cy - o);
	const outerLowRight = at(cx + o, cy + o), outerLowLeft = at(cx - o, cy + o);
	const innerTopLeft = at(cx - i, cy - i), innerTopRight = at(cx + i, cy - i);
	const innerLowRight = at(cx + i, cy + i), innerLowLeft = at(cx - i, cy + i);
	return [
		face(output, index, `${name} back`, name, "box", quad(innerTopLeft, innerTopRight, innerLowRight, innerLowLeft)),
		face(output, index + 1, `${name} top`, name, "box", quad(outerTopLeft, outerTopRight, innerTopRight, innerTopLeft)),
		face(output, index + 2, `${name} right`, name, "box", quad(innerTopRight, outerTopRight, outerLowRight, innerLowRight)),
		face(output, index + 3, `${name} bottom`, name, "box", quad(innerLowLeft, innerLowRight, outerLowRight, outerLowLeft)),
		face(output, index + 4, `${name} left`, name, "box", quad(outerTopLeft, innerTopLeft, innerLowLeft, outerLowLeft))
	];
}
function compoundSurfaces(shape, output, index, name) {
	return shape === "cube" ? cubeSurfaces(output, index, name) : boxSurfaces(output, index, name);
}
/** Shows saved before groupShape existed can be recognized by the exact face
* set created by the original Cube/Box commands. Explicit null means the
* artist later regrouped the face and must stay an ordinary folder. */
function restoreLegacyCompoundShapes(surfaces) {
	const folders = /* @__PURE__ */ new Map();
	for (const surface of surfaces) {
		if (!surface.folder) continue;
		folders.set(surface.folder, [...folders.get(surface.folder) ?? [], surface]);
	}
	const recovered = /* @__PURE__ */ new Map();
	for (const [folder, members] of folders) {
		if (members.some((member) => member.groupShape !== void 0)) continue;
		const names = new Set(members.map((member) => member.name));
		const roles = (suffixes) => members.length === suffixes.length && suffixes.every((suffix) => names.has(`${folder} ${suffix}`));
		if (roles([
			"top",
			"left",
			"right"
		])) recovered.set(folder, "cube");
		else if (roles([
			"back",
			"top",
			"right",
			"bottom",
			"left"
		])) recovered.set(folder, "box");
	}
	return surfaces.map((surface) => surface.folder && recovered.has(surface.folder) ? {
		...surface,
		groupShape: recovered.get(surface.folder)
	} : surface);
}
//#endregion
//#region src/mask/geometry.ts
/** Older Polygon-tool surfaces saved only their six-point outline. */
function isLegacyRegularHexagon(points) {
	if (points.length !== 6) return false;
	const cx = points.reduce((sum, point) => sum + point[0], 0) / 6;
	const cy = points.reduce((sum, point) => sum + point[1], 0) / 6;
	const radii = points.map(([x, y]) => Math.hypot(x - cx, y - cy));
	const radius = radii.reduce((sum, value) => sum + value, 0) / 6;
	if (radius < 3 || radii.some((value) => Math.abs(value - radius) > 1.5)) return false;
	const angles = points.map(([x, y]) => Math.atan2(y - cy, x - cx));
	return angles.every((angle, index) => {
		const sweep = (angles[(index + 1) % 6] - angle + Math.PI * 2) % (Math.PI * 2);
		return Math.abs(sweep - Math.PI / 3) < Math.max(.05, 1.5 / radius);
	});
}
//#endregion
//#region src/show-file.ts
/**
* `.aethermap` is JSON. The same schema is what ships to an output device as
* `layout.json`, so there is one parser and one round-trip test rather than a
* second format that can disagree with this one.
*/
function serializeShow(show) {
	return new TextEncoder().encode(JSON.stringify(surfaceMotionVersion(visualLookVersion(sourceMotionVersion(visualMotionVersion(show)))), null, 2));
}
/** A compound clip's board: both sides positive, whole pixels. */
function readBoard(value) {
	if (!isRecord(value) || !(Number(value.widthPx) > 0) || !(Number(value.heightPx) > 0)) return void 0;
	return {
		widthPx: Math.round(Number(value.widthPx)),
		heightPx: Math.round(Number(value.heightPx))
	};
}
function parseShow(bytes) {
	const text = typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
	let raw;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("This file is not an Aether Map show.");
	}
	if (!isRecord(raw)) throw new Error("This file is not an Aether Map show.");
	if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3 && raw.version !== 4 && raw.version !== 5 && raw.version !== 6 && raw.version !== 7 && raw.version !== 8 && raw.version !== 9 && raw.version !== 10 && raw.version !== 11 && raw.version !== 12 && raw.version !== 13) throw new Error(`Unsupported show version ${String(raw.version)}.`);
	const legacyOutputs = raw.version === 1 || raw.version === 2;
	const output = isRecord(raw.output) ? raw.output : {};
	surfaceOrdinal = 0;
	const scenes = readScenes(raw).map((scene) => scene.artboard ? scene : {
		...scene,
		artboard: {
			widthPx: positive(output.width, DEFAULT_OUTPUT.width),
			heightPx: positive(output.height, DEFAULT_OUTPUT.height)
		}
	});
	const requested = String(raw.activeSceneId ?? "");
	const activeSceneId = scenes.some((scene) => scene.id === requested) ? requested : scenes[0].id;
	const parsed = {
		...raw.audioOutput ? { audioOutput: readAudioOutput(raw.audioOutput) } : {},
		...raw.timelineMode === "advanced" || raw.timelineMode === "standard" ? { timelineMode: raw.timelineMode } : {},
		...typeof raw.activeTimelineID === "string" ? { activeTimelineID: raw.activeTimelineID } : {},
		...Array.isArray(raw.timelines) ? { timelines: raw.timelines.filter(isRecord).map((t) => ({
			id: String(t.id),
			name: String(t.name ?? "Timeline"),
			...typeof t.surfaceID === "string" ? { surfaceID: t.surfaceID } : {},
			sceneID: String(t.sceneID),
			durationS: positive(t.durationS, 60),
			...readBoard(t.board) ? { board: readBoard(t.board) } : {},
			...typeof t.folder === "string" && t.folder.trim() ? { folder: t.folder.trim() } : {},
			...t.scene === true ? { scene: true } : {}
		})) } : {},
		...typeof raw.activeClipID === "string" ? { activeClipID: raw.activeClipID } : {},
		version: raw.version === 13 ? 13 : raw.version === 12 ? 12 : raw.version === 11 ? 11 : raw.version === 10 ? 10 : raw.version === 9 ? 9 : raw.version === 8 ? 8 : raw.version === 7 ? 7 : raw.version === 6 ? 6 : raw.version === 5 ? 5 : raw.version === 4 ? 4 : 3,
		...Array.isArray(raw.pool) ? { pool: raw.pool.filter(isRecord).filter((a) => typeof a.id === "string" && isRecord(a.source)).map((a) => ({
			id: String(a.id),
			name: String(a.name ?? "Asset"),
			...typeof a.folder === "string" ? { folder: a.folder } : {},
			source: readSource(a.source)
		})) } : {},
		...Array.isArray(raw.poolBins) ? { poolBins: [...new Set(raw.poolBins.filter((b) => typeof b === "string" && !!b.trim()).map((b) => b.trim()))] } : {},
		...Array.isArray(raw.tracks) ? { tracks: raw.tracks.filter(isRecord).filter((t) => typeof t.id === "string").map((t) => ({
			id: String(t.id),
			...typeof t.timelineID === "string" ? { timelineID: t.timelineID } : {},
			...t.assign === true ? { assign: true } : {},
			name: String(t.name ?? "V1"),
			kind: t.kind === "audio" ? "audio" : "video",
			volume: typeof t.volume === "number" ? clamp01$1(t.volume) : 1,
			solo: t.solo === true,
			...t.eq ? { eq: readTrackEQ(t.eq) } : {},
			targets: readTargets(t.targets),
			enabled: t.enabled !== false,
			locked: t.locked === true
		})) } : {},
		...Array.isArray(raw.visuals) ? { visuals: raw.visuals.map(readVisual).filter((v) => v !== null) } : {},
		output: {
			width: positive(output.width, DEFAULT_OUTPUT.width),
			height: positive(output.height, DEFAULT_OUTPUT.height),
			...output.crop ? { crop: readOutputCrop(output.crop) } : {},
			...output.blackout !== void 0 ? { blackout: output.blackout === true } : {},
			...output.testPattern !== void 0 ? { testPattern: output.testPattern === true } : {}
		},
		...Array.isArray(raw.unassignedFolders) ? { unassignedFolders: readFolders(raw.unassignedFolders) } : {},
		outputs: readOutputs(raw, output, scenes, activeSceneId, legacyOutputs),
		...raw.showTimeline ? { showTimeline: readShowTimeline(raw.showTimeline) } : {},
		...readShows(raw.shows)?.length ? { shows: readShows(raw.shows) } : {},
		...typeof raw.activeShowID === "string" ? { activeShowID: raw.activeShowID } : {},
		...typeof raw.playerShowID === "string" ? { playerShowID: raw.playerShowID } : {},
		...readMix(raw, scenes),
		...raw.lfos ? { lfos: readLfos(raw.lfos) } : {},
		surfaceLook: readSurfaceLook(raw, output),
		media: Array.isArray(raw.media) ? raw.media.filter(isRecord).map(readMedia) : [],
		unassignedSurfaces: (raw.version === 3 || raw.version === 4 || raw.version === 5 || raw.version === 6 || raw.version === 7 || raw.version === 8 || raw.version === 9 || raw.version === 10 || raw.version === 11 || raw.version === 12 || raw.version === 13) && Array.isArray(raw.unassignedSurfaces) ? groupSurfaces(raw.unassignedSurfaces.filter(isRecord).map(readSurface)) : [],
		scenes,
		activeSceneId,
		playback: { mode: readMode(raw.playback) }
	};
	if (parsed.version >= 5) {
		const ids = new Set(parsed.pool?.map((a) => a.id));
		if (ids.size !== (parsed.pool?.length ?? 0)) throw new Error("This show contains duplicate media pool identities.");
		for (const clip of parsed.visuals ?? []) if (clip.assetID && !ids.has(clip.assetID)) throw new Error(`Missing media pool asset for ${clip.name}.`);
	}
	validateTimelines(parsed);
	return parsed;
}
/**
* Version 1 held a single flat surface list. It becomes one scene, so a show
* saved before scenes existed opens unchanged rather than empty.
*/
function readScenes(raw) {
	if (Array.isArray(raw.scenes) && raw.scenes.length > 0) return raw.scenes.filter(isRecord).map(readScene);
	return [{
		id: "scene-1",
		name: "Canvas 1",
		durationS: isRecord(raw.playback) ? positive(raw.playback.durationS, 60) : 60,
		surfaces: Array.isArray(raw.surfaces) ? restoreLegacyCompoundShapes(raw.surfaces.filter(isRecord).map(readSurface)) : []
	}];
}
function readFolders(raw) {
	return Array.isArray(raw) ? [...new Set(raw.filter((name) => typeof name === "string").map((name) => name.trim()).filter(Boolean))] : [];
}
function readScene(raw) {
	const background = isRecord(raw.setupBackground) ? raw.setupBackground : null;
	return {
		id: String(raw.id ?? "scene"),
		name: String(raw.name ?? "Scene"),
		...raw.hidden === true ? { hidden: true } : {},
		...raw.suppressed === true ? { suppressed: true } : {},
		...isHotkey(raw.hotkey) ? { hotkey: raw.hotkey } : {},
		...isRecord(raw.artboard) ? { artboard: {
			widthPx: Math.max(1, Math.min(32768, Math.round(positive(raw.artboard.widthPx, DEFAULT_OUTPUT.width)))),
			heightPx: Math.max(1, Math.min(32768, Math.round(positive(raw.artboard.heightPx, DEFAULT_OUTPUT.height))))
		} } : {},
		durationS: positive(raw.durationS, 60),
		...Array.isArray(raw.folders) ? { folders: readFolders(raw.folders) } : {},
		...background && typeof background.mediaId === "string" && background.mediaId ? { setupBackground: {
			mediaId: background.mediaId,
			...Array.isArray(background.corners) && background.corners.length === 4 ? { corners: readQuad(background.corners) } : {},
			...typeof background.locked === "boolean" ? { locked: background.locked } : {},
			...typeof background.lockAspectRatio === "boolean" ? { lockAspectRatio: background.lockAspectRatio } : {},
			visible: background.visible !== false,
			opacity: typeof background.opacity === "number" && Number.isFinite(background.opacity) ? clamp01$1(background.opacity) : .6
		} } : {},
		surfaces: groupSurfaces(Array.isArray(raw.surfaces) ? restoreLegacyCompoundShapes(raw.surfaces.filter(isRecord).map(readSurface)) : [])
	};
}
/**
* A show written before outputs were a list had exactly one, and its region
* lived on `output.crop`. That becomes the first output here, so an older file
* opens with the projector it was authored for rather than an empty rail. An
* explicitly empty list is intentional and must survive saving/reopening.
*/
function readOutputs(raw, output, scenes, activeSceneId, legacy) {
	const list = Array.isArray(raw.outputs) ? raw.outputs.filter(isRecord).map((entry, index) => readOutput(entry, index, scenes, activeSceneId, legacy)) : [];
	if (Array.isArray(raw.outputs)) return list;
	return [{
		id: "output-1",
		name: "Output 1",
		kind: "monitor",
		sceneId: activeSceneId,
		...output.crop ? { crop: readOutputCrop(output.crop) } : {}
	}];
}
function readOutput(raw, index, scenes, activeSceneId, legacy) {
	const kind = raw.kind === "cast" || raw.kind === "airplay" || raw.kind === "edge" ? raw.kind : "monitor";
	const sceneId = (typeof raw.sceneId === "string" && scenes.some((scene) => scene.id === raw.sceneId) ? raw.sceneId : void 0) ?? (legacy || raw.sceneId !== void 0 ? activeSceneId : void 0);
	return {
		id: String(raw.id ?? `output-${index + 1}`),
		name: String(raw.name ?? `Output ${index + 1}`),
		kind,
		...typeof raw.deviceId === "string" && raw.deviceId ? { deviceId: raw.deviceId } : {},
		...sceneId ? { sceneId } : {},
		...isRecord(raw.crop) ? { crop: readOutputCrop(raw.crop) } : {},
		...raw.view === "workspace" || raw.view === "mapping" || raw.view === "visualization" ? { view: raw.view } : {},
		...isRecord(raw.mappingLook) ? { mappingLook: readSurfaceLook({ surfaceLook: { external: raw.mappingLook } }, {}).external } : {},
		...readSchedule(raw.schedule)
	};
}
/**
* An output's showtime, validated rather than trusted: a projector that a bad
* file talked into a nonsense window would be dark on the night, with nobody
* there to notice. Anything that does not read as a window is no window, and
* no window means always on — the behaviour of every show written before
* schedules existed.
*/
function readSchedule(raw) {
	if (!isRecord(raw)) return {};
	const minutes = (value) => {
		if (typeof value !== "number" || !Number.isFinite(value)) return null;
		const whole = Math.round(value);
		return whole >= 0 && whole < 1440 ? whole : null;
	};
	const fromMinutes = minutes(raw.fromMinutes);
	const toMinutes = minutes(raw.toMinutes);
	if (fromMinutes === null || toMinutes === null || fromMinutes === toMinutes) return {};
	const days = Array.isArray(raw.days) ? [...new Set(raw.days.filter((day) => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b) : [];
	return { schedule: {
		fromMinutes,
		toMinutes,
		...days.length && days.length < 7 ? { days } : {}
	} };
}
/**
* A B scene that no longer exists collapses the mix rather than blanking half
* the show; an out-of-range blend is clamped, never trusted.
*/
function readMix(raw, scenes) {
	const mix = isRecord(raw.mix) ? raw.mix : null;
	const sceneId = mix && typeof mix.sceneId === "string" ? mix.sceneId : null;
	if (!sceneId || !scenes.some((scene) => scene.id === sceneId)) return {};
	return { mix: {
		sceneId,
		blend: Math.min(1, Math.max(0, finite(mix?.blend)))
	} };
}
/**
* How planes are drawn, per side. A show written when this was a single
* `output.surfacePattern` carries that choice into both sides, so reopening one
* looks the way it was left rather than snapping to a default.
*/
function readSurfaceLook(raw, output) {
	const legacy = output.surfacePattern === "checker" || output.surfacePattern === "grid" ? output.surfacePattern : null;
	const stored = isRecord(raw.surfaceLook) ? raw.surfaceLook : {};
	const side = (name) => {
		const base = DEFAULT_SURFACE_LOOK[name];
		const r = isRecord(stored[name]) ? stored[name] : {};
		return {
			pattern: r.pattern === "fill" || r.pattern === "grid" || r.pattern === "checker" ? r.pattern : legacy ?? base.pattern,
			primary: typeof r.primary === "string" ? r.primary : base.primary,
			secondary: typeof r.secondary === "string" ? r.secondary : base.secondary,
			border: typeof r.border === "string" ? r.border : base.border,
			sections: Math.round(Math.min(64, Math.max(1, positive(r.sections, base.sections)))),
			opacity: Math.min(1, Math.max(0, typeof r.opacity === "number" && Number.isFinite(r.opacity) ? r.opacity : base.opacity)),
			pinSizePx: Math.min(64, Math.max(0, typeof r.pinSizePx === "number" && Number.isFinite(r.pinSizePx) ? r.pinSizePx : base.pinSizePx))
		};
	};
	return {
		device: side("device"),
		external: side("external")
	};
}
function readMode(value) {
	return isRecord(value) && (value.mode === "once" || value.mode === "loop") ? value.mode : "continuous";
}
function readText(value) {
	if (!isRecord(value)) return void 0;
	const align = value.align;
	return {
		text: String(value.text ?? ""),
		sizePx: positive(value.sizePx, DEFAULT_TEXT.sizePx),
		color: String(value.color ?? DEFAULT_TEXT.color),
		background: String(value.background ?? DEFAULT_TEXT.background),
		align: align === "left" || align === "right" || align === "justify" ? align : "center",
		...typeof value.fontFamily === "string" ? { fontFamily: value.fontFamily } : {},
		...typeof value.fontName === "string" ? { fontName: value.fontName } : {},
		...typeof value.fontWeight === "number" ? { fontWeight: Math.min(900, Math.max(100, finite(value.fontWeight))) } : {},
		...typeof value.italic === "boolean" ? { italic: value.italic } : {},
		...typeof value.lineHeight === "number" ? { lineHeight: positive(value.lineHeight, 1.2) } : {},
		...typeof value.letterSpacingPx === "number" ? { letterSpacingPx: finite(value.letterSpacingPx) } : {},
		...typeof value.fontData === "string" && /^data:(font\/|application\/(octet-stream|font))/.test(value.fontData) && value.fontData.length < 3e6 ? { fontData: value.fontData } : {}
	};
}
var CUE_ACTIONS = [
	"show",
	"hide",
	"opacity"
];
function readCue(value, index) {
	const raw = isRecord(value) ? value : {};
	const action = CUE_ACTIONS.find((known) => known === raw.action) ?? "show";
	return {
		id: String(raw.id ?? `cue-${index}`),
		timeS: Math.max(finite(raw.timeS), 0),
		action,
		...action === "opacity" ? { value: clamp01$1(typeof raw.value === "number" ? raw.value : 1) } : {}
	};
}
function readMedia(raw) {
	return {
		id: String(raw.id ?? ""),
		file: String(raw.file ?? ""),
		name: String(raw.name ?? "Untitled"),
		kind: raw.kind === "audio" ? "audio" : raw.kind === "video" ? "video" : "image",
		bytes: positive(raw.bytes, 0),
		width: positive(raw.width, DEFAULT_OUTPUT.width),
		height: positive(raw.height, DEFAULT_OUTPUT.height),
		...typeof raw.duration === "number" ? { duration: raw.duration } : {},
		...isRecord(raw.credit) ? { credit: {
			provider: String(raw.credit.provider ?? ""),
			creator: String(raw.credit.creator ?? ""),
			license: String(raw.credit.license ?? ""),
			sourceUrl: String(raw.credit.sourceUrl ?? ""),
			text: String(raw.credit.text ?? "")
		} } : {}
	};
}
function readClip(value, index) {
	if (!isRecord(value) || !isRecord(value.source) && typeof value.assetID !== "string" && typeof value.timelineRefID !== "string" && (typeof value.mediaId !== "string" || !value.mediaId)) return null;
	const durationS = positive(value.durationS, 0);
	if (durationS <= 0) return null;
	return {
		id: String(value.id ?? `clip-${index}`),
		...isRecord(value.source) ? { source: readSource(value.source) } : typeof value.mediaId === "string" ? { mediaId: value.mediaId } : {},
		...typeof value.name === "string" ? { name: value.name } : {},
		...typeof value.enabled === "boolean" ? { enabled: value.enabled } : {},
		...typeof value.locked === "boolean" ? { locked: value.locked } : {},
		startS: Math.max(finite(value.startS), 0),
		durationS,
		inS: Math.max(finite(value.inS), 0),
		loop: value.loop !== false
	};
}
var surfaceOrdinal = 0;
function readSource(source) {
	return {
		mediaId: typeof source.mediaId === "string" ? source.mediaId : null,
		rect: readRect(source.rect),
		...[
			"contain",
			"cover",
			"stretch"
		].includes(String(source.fit)) ? { fit: source.fit } : {},
		...readText(source.text) ? { text: readText(source.text) } : {},
		...typeof source.fill === "string" && source.fill ? { fill: source.fill } : {},
		...isVectorGradient(source.fillGradient) ? { fillGradient: source.fillGradient } : {},
		...typeof source.fillOpacity === "number" && Number.isFinite(source.fillOpacity) ? { fillOpacity: Math.max(0, Math.min(1, source.fillOpacity)) } : {},
		...readChromaKey(source.chromaKey) ? { chromaKey: readChromaKey(source.chromaKey) } : {},
		...readGeneratedSources(source),
		...readSourceMotion(source.motion) ? { motion: readSourceMotion(source.motion) } : {}
	};
}
function readSurface(raw) {
	const source = isRecord(raw.source) ? raw.source : {};
	const ordinal = surfaceOrdinal++;
	const masks = readMasks(raw);
	const polygonSides = typeof raw.polygonSides === "number" && Number.isFinite(raw.polygonSides) ? Math.max(3, Math.min(64, Math.floor(raw.polygonSides))) : masks.length === 1 && isLegacyRegularHexagon(masks[0]) ? 6 : void 0;
	return {
		id: String(raw.id ?? ""),
		name: String(raw.name ?? "Surface"),
		enabled: raw.enabled !== false,
		...readFeatureFields(raw),
		...raw.sceneCanvas === true ? { sceneCanvas: true } : {},
		...polygonSides ? { polygonSides } : {},
		...typeof raw.lockAspectRatio === "boolean" ? { lockAspectRatio: raw.lockAspectRatio } : {},
		...typeof raw.sequence === "boolean" ? { sequence: raw.sequence } : {},
		...typeof raw.folder === "string" && raw.folder.trim() ? { folder: raw.folder.trim() } : {},
		...typeof raw.role === "string" && raw.role.trim() ? { role: raw.role.trim().slice(0, 80) } : {},
		...typeof raw.compositionAspectRatio === "number" && Number.isFinite(raw.compositionAspectRatio) && raw.compositionAspectRatio >= .05 && raw.compositionAspectRatio <= 20 ? { compositionAspectRatio: raw.compositionAspectRatio } : {},
		...raw.groupShape === "cube" || raw.groupShape === "box" ? { groupShape: raw.groupShape } : {},
		...raw.groupShape === null ? { groupShape: null } : {},
		color: typeof raw.color === "string" && raw.color ? raw.color : layerColor(ordinal),
		corners: readQuad(raw.corners),
		...Array.isArray(raw.cornerWelds) && raw.cornerWelds.length === 4 ? { cornerWelds: raw.cornerWelds.map((v) => typeof v === "string" && v.length <= 128 ? v : null) } : {},
		source: readSource(source),
		masks,
		...raw.maskFillRule === "evenodd" || raw.maskFillRule === "nonzero" ? { maskFillRule: raw.maskFillRule } : {},
		...readBend(raw.bend) ? { bend: readBend(raw.bend) } : {},
		...readAlphaMask(raw.alphaMask) ? { alphaMask: readAlphaMask(raw.alphaMask) } : {},
		...Array.isArray(raw.maskNodeModes) ? { maskNodeModes: readMaskNodeModes(raw.maskNodeModes, masks) } : {},
		...Array.isArray(raw.maskCurves) ? { maskCurves: readMaskCurves(raw.maskCurves, masks) } : {},
		opacity: typeof raw.opacity === "number" ? clamp01$1(raw.opacity) : 1,
		...typeof raw.mappingOpacity === "number" && Number.isFinite(raw.mappingOpacity) ? { mappingOpacity: clamp01$1(raw.mappingOpacity) } : {},
		cues: Array.isArray(raw.cues) ? raw.cues.map(readCue) : [],
		clips: Array.isArray(raw.clips) ? raw.clips.map(readClip).filter((clip) => clip !== null) : []
	};
}
/** `masks` is the current shape; a single `mask` is what version 1 wrote. */
function readMasks(raw) {
	return (Array.isArray(raw.masks) ? raw.masks : Array.isArray(raw.mask) ? [raw.mask] : []).filter((shape) => Array.isArray(shape) && shape.length >= 3).map((shape) => shape.map(readPoint));
}
function readQuad(value) {
	if (!Array.isArray(value) || value.length !== 4) throw new Error("A surface needs exactly four corners.");
	return value.map(readPoint);
}
function readPoint(value) {
	if (!Array.isArray(value) || value.length !== 2) throw new Error("A point needs an x and a y.");
	return [finite(value[0]), finite(value[1])];
}
function readRect(value) {
	if (!Array.isArray(value) || value.length !== 4) return [
		0,
		0,
		DEFAULT_OUTPUT.width,
		DEFAULT_OUTPUT.height
	];
	return [
		finite(value[0]),
		finite(value[1]),
		finite(value[2]),
		finite(value[3])
	];
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finite(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function positive(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
function clamp01$1(value) {
	return Math.min(1, Math.max(0, value));
}
function readVisualEffects(value) {
	return Array.isArray(value) ? value.filter(isRecord).filter((e) => isEffectKind(e.kind)).map((e, i) => ({
		id: String(e.id ?? `effect-${i}`),
		kind: e.kind,
		enabled: e.enabled !== false,
		amount: effectAmount(e.kind, finite(e.amount)),
		...e.modulation ? { modulation: readModulation({ amount: e.modulation }).amount } : {},
		...e.animation ? { animation: readParameterKeys(e.animation, effectDefinition(e.kind).min, effectDefinition(e.kind).max) } : {}
	})) : [];
}
function readVisualLooks(value) {
	if (!isRecord(value)) return;
	const looks = {};
	for (const slot of VISUAL_LOOK_SLOTS) {
		const raw = value[slot];
		if (!isRecord(raw) || !isRecord(raw.source)) continue;
		const source = readSource(raw.source);
		if (source.shader) delete source.shader.looks;
		if (raw.shaderOnly === true && !source.shader) continue;
		looks[slot] = {
			source,
			...raw.shaderOnly === true ? { shaderOnly: true } : {},
			opacity: typeof raw.opacity === "number" && Number.isFinite(raw.opacity) ? clamp01$1(raw.opacity) : 1,
			mapping: raw.mapping === "span" ? "span" : "repeat",
			...isRecord(raw.placement) ? { placement: readVisualPlacement(raw.placement) } : {},
			...raw.motion ? { motion: readVisualMotion(raw.motion) } : {},
			effects: readVisualEffects(raw.effects).slice(0, 12)
		};
	}
	return Object.keys(looks).length ? looks : void 0;
}
function readVisual(value, index) {
	const clip = readClip(value, index);
	if (!clip || !isRecord(value) || !clip.source && typeof value.assetID !== "string" && typeof value.timelineRefID !== "string") return null;
	const targets = Array.isArray(value.targets) ? value.targets.filter(isRecord).filter((t) => typeof t.sceneID === "string").map((t) => ({
		sceneID: String(t.sceneID),
		...typeof t.surfaceID === "string" ? { surfaceID: t.surfaceID } : {}
	})) : [];
	const effects = readVisualEffects(value.effects);
	const looks = readVisualLooks(value.looks);
	return {
		...clip,
		...looks ? { looks } : {},
		...value.motion ? { motion: readVisualMotion(value.motion, typeof value.timelineRefID === "string") } : {},
		...typeof value.timelineRefID === "string" ? { timelineRefID: value.timelineRefID } : {},
		...value.clipFit === "cover" || value.clipFit === "stretch" ? { clipFit: value.clipFit } : {},
		...typeof value.transitionS === "number" && value.transitionS > 0 ? { transitionS: Math.min(10, value.transitionS) } : {},
		...typeof value.assetID === "string" ? { assetID: value.assetID } : {},
		...typeof value.trackID === "string" ? { trackID: value.trackID } : {},
		name: String(value.name ?? "Visual"),
		targets: targets.filter((t, i) => targets.findIndex((a) => a.sceneID === t.sceneID && a.surfaceID === t.surfaceID) === i),
		mapping: value.mapping === "span" ? "span" : "repeat",
		color: String(value.color ?? "#547aff"),
		opacity: typeof value.opacity === "number" ? clamp01$1(value.opacity) : 1,
		...isRecord(value.placement) ? { placement: readVisualPlacement(value.placement) } : {},
		...value.continuous === true ? { continuous: true } : {},
		...typeof value.legacyTrack === "string" ? { legacyTrack: value.legacyTrack } : {},
		...value.mask === true ? { mask: true } : {},
		...effects.length ? { effects } : {},
		...typeof value.folder === "string" && value.folder.trim() ? { folder: value.folder.trim().slice(0, 80) } : {}
	};
}
function readTargets(value) {
	return Array.isArray(value) ? value.filter(isRecord).filter((t) => typeof t.sceneID === "string").map((t) => ({
		sceneID: String(t.sceneID),
		...typeof t.surfaceID === "string" ? { surfaceID: t.surfaceID } : {}
	})) : [];
}
//#endregion
//#region src/visual-document.ts
/** Idempotent legacy import; no content or timing is inferred from the playhead. */
function normalizeVisuals(show) {
	let visuals = [...show.visuals ?? []];
	let changed = show.visuals === void 0 || show.version < 4;
	const extract = (surface, sceneID) => {
		const clips = surface.clips.length ? surface.clips : !surface.sequence && sourceHasContent(surface.source) ? [{
			...contentClip(surface.source, show.media, 0, sourceID(surface.id)),
			continuous: true
		}] : [];
		if (!clips.length) return surface;
		changed = true;
		for (const clip of clips) {
			const source = clipSource(surface, clip, show.media);
			if (visuals.some((v) => v.id === clip.id)) continue;
			visuals.push({
				...clip,
				id: clip.id,
				name: clip.name ?? sourceName(source, show.media),
				source,
				targets: [{
					sceneID,
					surfaceID: surface.id
				}],
				mapping: "repeat",
				color: surface.color,
				opacity: 1,
				..."continuous" in clip ? { continuous: true } : { legacyTrack: surface.id },
				...surface.kind === "mask" ? { mask: true } : {}
			});
		}
		return {
			...surface,
			clips: [],
			sequence: false,
			source: {
				mediaId: null,
				rect: surface.source.rect
			}
		};
	};
	const scenes = show.scenes.map((scene) => ({
		...scene,
		surfaces: scene.surfaces.map((s) => extract(s, scene.id))
	}));
	const unassignedSurfaces = show.unassignedSurfaces.map((s) => extract(s, ""));
	const owners = new Map([...scenes.flatMap((scene) => scene.surfaces.map((s) => [s.id, scene.id])), ...unassignedSurfaces.map((s) => [s.id, ""])]);
	visuals = visuals.map((v) => {
		const targets = v.targets.flatMap((t) => t.surfaceID ? owners.has(t.surfaceID) ? [{
			...t,
			sceneID: owners.get(t.surfaceID)
		}] : [] : scenes.some((s) => s.id === t.sceneID) ? [t] : []);
		if (JSON.stringify(targets) === JSON.stringify(v.targets)) return v;
		changed = true;
		return {
			...v,
			targets
		};
	});
	return changed ? {
		...show,
		version: show.version >= 5 ? show.version : 4,
		visuals,
		scenes,
		unassignedSurfaces
	} : show;
}
//#endregion
//#region src/surface-timelines.ts
/** Keeps surface timelines that saved shows already have consistent with their
* surfaces (a moved surface's sequence follows it; a deleted one's stays
* reusable). New surfaces get none. Run after pool migration. */
function normalizeSurfaceTimelines(show) {
	let tracks = [...show.tracks ?? []], visuals = [...show.visuals ?? []];
	let timelines = [...show.timelines ?? []];
	let changed = false;
	timelines = timelines.map((t) => {
		if (!t.surfaceID) return t;
		const owner = show.scenes.find((s) => s.surfaces.some((v) => v.id === t.surfaceID));
		if (owner?.id === t.sceneID) return t;
		changed = true;
		const mainTracks = new Set(tracks.filter((track) => !track.timelineID && track.targets.length === 1 && track.targets[0].surfaceID === t.surfaceID && visuals.some((v) => v.trackID === track.id && v.timelineRefID === t.id)).map((track) => track.id));
		if (owner) {
			tracks = tracks.map((track) => track.timelineID === t.id || mainTracks.has(track.id) ? {
				...track,
				targets: track.targets.map((a) => ({
					...a,
					sceneID: owner.id
				}))
			} : track);
			visuals = visuals.map((v) => mainTracks.has(v.trackID ?? "") && v.timelineRefID === t.id ? {
				...v,
				targets: [{ sceneID: owner.id }]
			} : v);
			return {
				...t,
				sceneID: owner.id
			};
		}
		visuals = visuals.filter((v) => !(mainTracks.has(v.trackID ?? "") && v.timelineRefID === t.id));
		tracks = tracks.filter((track) => !mainTracks.has(track.id) || visuals.some((v) => v.trackID === track.id));
		const { surfaceID: _surfaceID, ...rest } = t;
		return rest;
	});
	const filtered = tracks;
	for (const scene of show.scenes) if (!filtered.some((t) => !t.timelineID && t.kind !== "audio" && t.targets.some((a) => a.sceneID === scene.id))) {
		filtered.push({
			id: `track-default-${scene.id}-video`,
			name: "V1",
			kind: "video",
			targets: [{ sceneID: scene.id }],
			enabled: true,
			locked: false
		});
		changed = true;
	}
	return changed ? {
		...show,
		version: show.version >= 7 ? show.version : 7,
		tracks: filtered,
		timelines,
		visuals
	} : show;
}
//#endregion
//#region src/compound-clips.ts
/** Opening an older project: a timeline whose visuals all fill the whole
* canvas becomes a clip on a board of that canvas's size. That is the same
* picture it already drew, so nothing looks different. Timelines that aim at
* particular surfaces (or are empty) are marked scenes. Each is decided once. */
function migrateTimelinesToClips(show) {
	let timelines = show.timelines ?? [], changed = false;
	const tracks = new Map((show.tracks ?? []).map((t) => [t.id, t]));
	for (let again = true; again;) {
		again = false;
		timelines = timelines.map((t) => {
			const scene = show.scenes.find((s) => s.id === t.sceneID);
			if (isClip(t) || t.scene || t.surfaceID || !scene) return t;
			const visuals = (show.visuals ?? []).filter((v) => tracks.get(v.trackID ?? "")?.timelineID === t.id);
			if (!visuals.length || visuals.some((v) => v.targets.some((a) => a.surfaceID) || v.timelineRefID && !isClip(timelines.find((c) => c.id === v.timelineRefID)))) return t;
			again = changed = true;
			return {
				...t,
				board: {
					widthPx: scene.artboard?.widthPx ?? show.output.width,
					heightPx: scene.artboard?.heightPx ?? show.output.height
				}
			};
		});
	}
	const undecided = timelines.some((t) => !isClip(t) && !t.scene);
	if (undecided) timelines = timelines.map((t) => isClip(t) || t.scene ? t : {
		...t,
		scene: true
	});
	return changed ? {
		...show,
		version: 13,
		timelines
	} : undecided ? {
		...show,
		timelines
	} : show;
}
//#endregion
//#region src/normalize-document.ts
/** One document upgrade path for editor opening, edits and saved-file agents. */
function normalizeDocument(show) {
	return migrateTimelinesToClips(normalizeShowTimeline(surfaceMotionVersion(visualLookVersion(sourceMotionVersion(visualMotionVersion(normalizeSurfaceTimelines(normalizeMediaPool(normalizeVisuals(show)))))))));
}
//#endregion
//#region service/aether_map_service/automation-commands.json
var automation_commands_default = /*#__PURE__*/ JSON.parse("[{\"id\":\"map.show.inspect\",\"title\":\"Inspect Map show\",\"description\":\"Read saved scenes, surfaces, timelines, tracks, reusable assets and clip assignments. Does not inspect unsaved editor state.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128}},\"required\":[\"app\",\"id\"],\"additionalProperties\":false},\"writes\":false,\"annotations\":{\"readOnlyHint\":true,\"destructiveHint\":false,\"idempotentHint\":true,\"openWorldHint\":false},\"action\":\"inspect\"},{\"id\":\"map.show.evaluate\",\"title\":\"Evaluate Map scene\",\"description\":\"Evaluate a saved scene's Main composition at a time in seconds using the player evaluator. Returns geometry and audio state, not a pixel image or live camera data. Does not play or deploy anything.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"time_s\":{\"type\":\"number\",\"minimum\":0,\"maximum\":604800}},\"required\":[\"app\",\"id\",\"scene_id\",\"time_s\"],\"additionalProperties\":false},\"writes\":false,\"annotations\":{\"readOnlyHint\":true,\"destructiveHint\":false,\"idempotentHint\":true,\"openWorldHint\":false},\"action\":\"evaluate\"},{\"id\":\"map.clip.move\",\"title\":\"Move Map clip\",\"description\":\"Move a saved clip to an existing compatible track and start time. Keeps surface assignments and source identity. Respects locks and nesting rules. Requires latest revision and records recoverable file history; open editors must reload.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"clip_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":256},\"track_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"start_s\":{\"type\":\"number\",\"minimum\":0,\"maximum\":604800},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1}},\"required\":[\"app\",\"id\",\"clip_id\",\"track_id\",\"start_s\",\"expected_revision\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"move\"},{\"id\":\"map.clip.edit\",\"title\":\"Edit Map clip\",\"description\":\"Duplicate, delete, split or trim a saved clip using Map's timeline commands. Split/trim require time_s in timeline seconds. Respects locks; requires latest revision and records recoverable file history. Open editors must reload.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"clip_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":256},\"action\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":200,\"enum\":[\"duplicate\",\"delete\",\"split\",\"trim-start\",\"trim-end\"]},\"time_s\":{\"type\":\"number\",\"minimum\":0,\"maximum\":604800},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1}},\"required\":[\"app\",\"id\",\"clip_id\",\"action\",\"expected_revision\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.scene.create\",\"title\":\"Create Map scene\",\"description\":\"Add a named scene with explicit pixel artboard dimensions to an existing saved show. Preserves editor focus and output bindings. Maximum 256 scenes. Requires latest revision and records recoverable file history; open editors must reload. Does not deploy or play outputs.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"name\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":200},\"width_px\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":16384},\"height_px\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":16384}},\"required\":[\"app\",\"id\",\"expected_revision\",\"name\",\"width_px\",\"height_px\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"create\"},{\"id\":\"map.scene.hotkey\",\"title\":\"Set Map scene hotkey\",\"description\":\"Assign F1–F12 so pressing it on a player's keyboard switches that projector to this scene, or none to clear. The key moves from any other scene that had it. Requires latest revision and records recoverable file history; open editors must reload. Does not deploy or play outputs.\",\"action\":\"edit\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"hotkey\":{\"type\":\"string\",\"enum\":[\"F1\",\"F2\",\"F3\",\"F4\",\"F5\",\"F6\",\"F7\",\"F8\",\"F9\",\"F10\",\"F11\",\"F12\",\"none\"]}},\"required\":[\"app\",\"id\",\"expected_revision\",\"scene_id\",\"hotkey\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false}},{\"id\":\"map.surface.create\",\"title\":\"Create Map surface\",\"description\":\"Add a named rectangle (default), three-face cube or five-face box to a scene. Compound names must be unique folders. Returns created.surface_id and surface_ids; preserves focus and output bindings. Maximum 1024 surfaces per scene. Requires latest revision and records recoverable history; open editors must reload. Does not play outputs.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"name\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":200},\"shape\":{\"type\":\"string\",\"enum\":[\"rectangle\",\"cube\",\"box\"]}},\"required\":[\"app\",\"id\",\"expected_revision\",\"scene_id\",\"name\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"create\"},{\"id\":\"map.surface.bounds\",\"title\":\"Set Map surface bounds\",\"description\":\"Set the visible axis-aligned bounding box at mapping time zero in scene pixels. Preserves warped shape, masks, curves and animation keys; respects aspect-ratio locks. Welded corners update atomically; locked neighbours refuse the edit. Returns changed_surface_ids. Requires latest revision/content-edit permission; open editors must reload. Does not play outputs.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"surface_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"x_px\":{\"type\":\"number\",\"minimum\":-1000000,\"maximum\":1000000},\"y_px\":{\"type\":\"number\",\"minimum\":-1000000,\"maximum\":1000000},\"width_px\":{\"type\":\"number\",\"minimum\":1,\"maximum\":32768},\"height_px\":{\"type\":\"number\",\"minimum\":1,\"maximum\":32768}},\"required\":[\"app\",\"id\",\"expected_revision\",\"scene_id\",\"surface_id\",\"x_px\",\"y_px\",\"width_px\",\"height_px\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.surface.rotate\",\"title\":\"Rotate Map surface\",\"description\":\"Rotate by delta_degrees around the visible bounding-box center at mapping time zero. Preserves masks, curves and animation keys. Welded corners update atomically; locked neighbours refuse the edit. Returns changed_surface_ids. Requires latest revision/content-edit permission; open editors must reload. Does not play outputs.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"surface_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"delta_degrees\":{\"type\":\"number\",\"minimum\":-360,\"maximum\":360}},\"required\":[\"app\",\"id\",\"expected_revision\",\"scene_id\",\"surface_id\",\"delta_degrees\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.cube.pose\",\"title\":\"Pose Map cube\",\"description\":\"Turn a complete three-face cube in 3D using relative x_degrees/y_degrees/z_degrees, or mode inside-out for the opposite room corner. surface_id identifies any cube face in scene_id. Geometry at time zero remains canonical; preserves face IDs, content, masks and animation keys. Rejects locked, separated, degenerate, folded or hidden faces. Angles are applied X then Y then Z. Inside-out takes no angles. Requires latest revision; open editors must reload.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"surface_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"mode\":{\"type\":\"string\",\"enum\":[\"rotate\",\"inside-out\"]},\"x_degrees\":{\"type\":\"number\",\"minimum\":-180,\"maximum\":180},\"y_degrees\":{\"type\":\"number\",\"minimum\":-180,\"maximum\":180},\"z_degrees\":{\"type\":\"number\",\"minimum\":-180,\"maximum\":180}},\"required\":[\"app\",\"id\",\"expected_revision\",\"scene_id\",\"surface_id\",\"mode\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.asset.place\",\"title\":\"Place Map asset\",\"description\":\"Place an existing saved media-pool asset on a track at start_s using editor timing and targets. Returns created.clip_id. Refuses locked or incompatible tracks and clips ending beyond seven days. Requires latest revision and content-edit permission. Does not upload media, change live editors or play outputs.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"asset_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"track_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"start_s\":{\"type\":\"number\",\"minimum\":0,\"maximum\":604800}},\"required\":[\"app\",\"id\",\"expected_revision\",\"asset_id\",\"track_id\",\"start_s\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.agent.docs\",\"title\":\"Map agent knowledge\",\"description\":\"Discover executable command schemas, gallery sources and a working program recipe. Use topic tools, gallery, sources or recipes; query filters tools/gallery; name returns an exact command. Read-only.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"topic\":{\"type\":\"string\",\"enum\":[\"tools\",\"gallery\",\"sources\",\"recipes\"]},\"query\":{\"type\":\"string\",\"maxLength\":200},\"name\":{\"type\":\"string\",\"maxLength\":200},\"offset\":{\"type\":\"integer\",\"minimum\":0,\"maximum\":10000}},\"required\":[\"app\",\"id\"],\"additionalProperties\":false},\"writes\":false,\"annotations\":{\"readOnlyHint\":true,\"destructiveHint\":false,\"idempotentHint\":true,\"openWorldHint\":false},\"action\":\"inspect\"},{\"id\":\"map.visual.create\",\"title\":\"Create Map visual\",\"description\":\"Create a reusable source and continuous visual on its own track, using the same simple editor operation. source_json is a JSON object: gallery {kind,id}, color {kind,color}, text {kind,text,color?,size?}, or existing media {kind,media_id}. Defaults to all mapped surfaces of scene_id. Inspect created clip/asset/track IDs. No media upload or device playback.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"name\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":200},\"source_json\":{\"type\":\"string\",\"minLength\":2,\"maxLength\":65536}},\"required\":[\"app\",\"id\",\"expected_revision\",\"scene_id\",\"name\",\"source_json\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.surface.animate\",\"title\":\"Animate Map surface\",\"description\":\"Edit surface bases, animation and modulation with changes_json. Supports opacity, xPx, yPx, scaleX, scaleY, rotationDeg, radiusPx and bendAngleDeg, plus bend_axis horizontal/vertical. Maps merge; null clears a channel or assignment map. Keys use surface timeline seconds; LFO and scene clock use Main scene time. Inspect surface_parameter_specs for bounds. Locked surfaces refuse. No camera, audio, MIDI or output activation.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"changes_json\":{\"type\":\"string\",\"minLength\":2,\"maxLength\":65536},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"surface_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128}},\"required\":[\"app\",\"id\",\"expected_revision\",\"scene_id\",\"surface_id\",\"changes_json\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.visual.edit\",\"title\":\"Configure Map visual\",\"description\":\"Edit a visual using changes_json. Supports name, opacity, enabled, mapping repeat/span, continuous, loop, start_s, duration_s, source (same specification as create), targets [{scene_id,surface_id?}], placement {xPercent,yPercent,widthPercent,heightPercent,rotationDeg}, effects [{kind,amount,enabled?}], shader {colors?,speed?,scale?,density?,glow?}. Also supports source_parameters, source_motion and motion; discover bounds with inspection. preset {action:store|recall|clear,slot:A|B|C,from_clip_id?} captures full appearance, or {action:random,seed:integer}. Locked clips/tracks refuse; timing and targets remain unchanged unless specified. No device playback.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"clip_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"changes_json\":{\"type\":\"string\",\"minLength\":2,\"maxLength\":65536}},\"required\":[\"app\",\"id\",\"expected_revision\",\"clip_id\",\"changes_json\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.show.runprogram\",\"title\":\"Build Map program\",\"description\":\"Run a version 1 JSON program containing 1–32 steps atomically. Each step has id, command, arguments. References {$ref:\\\"earlier.scene_id\\\"} resolve created scene/surface/clip/asset/track IDs. Optional assertions [{scene_id,time_s,layer_count}] must match actual Main composition before one commit. Failure saves nothing. Discover recipes and tools first. No arbitrary code or device playback.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"program_json\":{\"type\":\"string\",\"minLength\":2,\"maxLength\":65536}},\"required\":[\"app\",\"id\",\"expected_revision\",\"program_json\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"edit\"},{\"id\":\"map.show.verify\",\"title\":\"Verify Map composition\",\"description\":\"Round-trip the show through the canonical parser and evaluate Main at time_s in scene_id. Reports active layer counts, source kinds, opacity, target geometry and missing references. Returns structural/composition evidence, not rendered pixels or media availability. No document changes.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"time_s\":{\"type\":\"number\",\"minimum\":0,\"maximum\":604800}},\"required\":[\"app\",\"id\",\"scene_id\",\"time_s\"],\"additionalProperties\":false},\"writes\":false,\"annotations\":{\"readOnlyHint\":true,\"destructiveHint\":false,\"idempotentHint\":true,\"openWorldHint\":false},\"action\":\"inspect\"},{\"id\":\"map.show.clip.add\",\"title\":\"Add Map scene clip\",\"description\":\"Place a scene on a canvas track of the show timeline. scene_id is a timeline id from inspect, or 'main' for the canvas's own Main. Scenes reuse across canvases by surface role. Requires latest revision and records recoverable file history; open editors must reload. Does not play or deploy.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"canvas_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"scene_id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"start_s\":{\"type\":\"number\",\"minimum\":0,\"maximum\":604800},\"duration_s\":{\"type\":\"number\",\"minimum\":0.1,\"maximum\":604800},\"loop\":{\"type\":\"string\",\"enum\":[\"yes\",\"no\"]}},\"required\":[\"app\",\"id\",\"expected_revision\",\"canvas_id\",\"scene_id\",\"start_s\",\"duration_s\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"create\"},{\"id\":\"map.show.cue.add\",\"title\":\"Add Map show cue\",\"description\":\"Add a show-control cue: trigger 'timeline' (fires at at_s), 'go' (operator GO, in order) or 'midi' (fires when MIDI CC control rises above zero); action play, pause, stop, jump (to to_s), blackout-on or blackout-off. Requires latest revision and records recoverable file history; open editors must reload. Optional times makes a jump cue a loop that repeats at most that many times per run; condition_control/condition_above make the cue fire only while that MIDI control is above the value.\",\"inputSchema\":{\"type\":\"object\",\"properties\":{\"app\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":40,\"enum\":[\"map\"]},\"id\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":128},\"expected_revision\":{\"type\":\"integer\",\"minimum\":1},\"name\":{\"type\":\"string\",\"minLength\":1,\"maxLength\":200},\"trigger\":{\"type\":\"string\",\"enum\":[\"timeline\",\"go\",\"midi\"]},\"cue_action\":{\"type\":\"string\",\"enum\":[\"play\",\"pause\",\"stop\",\"jump\",\"blackout-on\",\"blackout-off\"]},\"at_s\":{\"type\":\"number\",\"minimum\":0,\"maximum\":604800},\"to_s\":{\"type\":\"number\",\"minimum\":0,\"maximum\":604800},\"control\":{\"type\":\"integer\",\"minimum\":0,\"maximum\":127},\"times\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":10000},\"condition_control\":{\"type\":\"integer\",\"minimum\":0,\"maximum\":127},\"condition_above\":{\"type\":\"integer\",\"minimum\":0,\"maximum\":127}},\"required\":[\"app\",\"id\",\"expected_revision\",\"name\",\"trigger\",\"cue_action\"],\"additionalProperties\":false},\"writes\":true,\"annotations\":{\"readOnlyHint\":false,\"destructiveHint\":true,\"idempotentHint\":false,\"openWorldHint\":false},\"action\":\"create\"}]");
//#endregion
//#region src/ai/catalog.ts
var fileArguments = /* @__PURE__ */ new Set([
	"app",
	"id",
	"expected_revision"
]);
var mapCommands = automation_commands_default.map((item) => ({
	...item,
	inputSchema: {
		...item.inputSchema,
		properties: Object.fromEntries(Object.entries(item.inputSchema.properties).filter(([key]) => !fileArguments.has(key))),
		required: item.inputSchema.required.filter((key) => !fileArguments.has(key))
	}
}));
/** Every runtime validates the same catalog; provider schemas are not authority. */
function validateCommand(command, args) {
	const descriptor = mapCommands.find((item) => item.id === command);
	if (!descriptor) throw Error("Unknown Map command.");
	const values = object(args);
	for (const [key, value] of Object.entries(values)) {
		if (fileArguments.has(key)) continue;
		const field = descriptor.inputSchema.properties[key];
		if (!field) throw Error(`Unknown argument: ${key}.`);
		if (field.type === "string") {
			if (typeof value !== "string" || value.length < (field.minLength ?? 0) || value.length > (field.maxLength ?? 1e4)) throw Error(`Invalid ${key}.`);
		} else if (typeof value !== "number" || !Number.isFinite(value) || field.type === "integer" && !Number.isInteger(value) || value < (field.minimum ?? -Infinity) || value > (field.maximum ?? Infinity)) throw Error(`Invalid ${key}.`);
		if (field.enum && !field.enum.includes(value)) throw Error(`Invalid ${key}.`);
	}
	for (const key of descriptor.inputSchema.required) if (!Object.hasOwn(values, key)) throw Error(`Missing argument: ${key}.`);
}
function object(value, keys) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Expected an object.");
	if (keys && Object.keys(value).some((key) => !keys.includes(key))) throw Error("Unknown object field.");
	return value;
}
function jsonObject(value) {
	if (typeof value !== "string" || new TextEncoder().encode(value).length > 65536) throw Error("Use JSON of at most 64 KiB.");
	return object(JSON.parse(value));
}
function number(value, label, min, max) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw Error(`Invalid ${label}: use ${min} to ${max}.`);
	return value;
}
function name(value) {
	if (typeof value !== "string" || !value.trim() || value.length > 200 || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw Error("Name must contain 1–200 printable characters.");
	return value.trim();
}
//#endregion
//#region src/ai/parameter-motion.ts
/** Commands reject malformed motion; file recovery is deliberately more forgiving. */
function parameterKeys(value, min = -1e6, max = 1e6, discrete = false) {
	if (value === null) return void 0;
	if (!Array.isArray(value) || value.length > 1e3) throw Error(`Use at most ${MAX_PARAMETER_KEYS} parameter keyframes.`);
	const keys = value.map((raw, i) => {
		const k = object(raw, [
			"id",
			"timeS",
			"value",
			"interpolation"
		]);
		if (k.id !== void 0 && (typeof k.id !== "string" || !k.id.length || k.id.length > 200)) throw Error("Invalid keyframe ID.");
		const interpolation = k.interpolation ?? (discrete ? "hold" : "linear");
		if (discrete && (interpolation !== "hold" || !Number.isInteger(k.value))) throw Error("Choice keyframes require integer values and hold interpolation.");
		if (![
			"linear",
			"smooth",
			"hold"
		].includes(String(interpolation))) throw Error("Use linear, smooth or hold interpolation.");
		return {
			id: k.id ?? `parameter-key-${i}`,
			timeS: number(k.timeS, "keyframe time", 0, MAX_PARAMETER_TIME_S),
			value: number(k.value, "keyframe value", min, max),
			interpolation
		};
	}).sort((a, b) => a.timeS - b.timeS);
	if (new Set(keys.map((k) => k.id)).size !== keys.length || keys.some((k, i) => i > 0 && Math.abs(k.timeS - keys[i - 1].timeS) <= 1e-4)) throw Error("Use unique keyframe IDs and times.");
	return keys.length ? keys : void 0;
}
function parameterModulation(value, min = -1e6, max = 1e6) {
	if (value === null) return void 0;
	const raw = object(value, [
		"source",
		"bodySignal",
		"lfoIndex",
		"range",
		"invert",
		"band",
		"audioSignal",
		"clock",
		"control",
		"amount",
		"periodS",
		"waveform",
		"phase"
	]);
	const result = { ...DEFAULT_MODULATION };
	for (const [key, choices] of Object.entries({
		source: [
			"time",
			"audio",
			"midi",
			"lfo",
			"body"
		],
		bodySignal: BODY_SIGNALS.map((s) => s.value),
		band: [
			"low",
			"mid",
			"high",
			"level"
		],
		audioSignal: ["beat"],
		clock: ["scene"],
		waveform: [
			"sine",
			"triangle",
			"square",
			"ramp"
		]
	})) if (raw[key] !== void 0) {
		if (!choices.includes(String(raw[key]))) throw Error(`Invalid modulation ${key}.`);
		Object.assign(result, { [key]: raw[key] });
	}
	for (const [key, lo, hi] of [
		[
			"amount",
			-1e6,
			1e6
		],
		[
			"periodS",
			.02,
			3600
		],
		[
			"phase",
			-1e6,
			1e6
		],
		[
			"control",
			0,
			127
		],
		[
			"lfoIndex",
			0,
			3
		]
	]) if (raw[key] !== void 0) {
		const n = number(raw[key], `modulation ${key}`, lo, hi);
		if ((key === "control" || key === "lfoIndex") && !Number.isInteger(n)) throw Error(`Modulation ${key} must be an integer.`);
		result[key] = n;
	}
	if (raw.invert !== void 0) {
		if (typeof raw.invert !== "boolean") throw Error("Modulation invert must be boolean.");
		result.invert = raw.invert;
	}
	if (raw.range !== void 0) {
		const range = object(raw.range, ["min", "max"]);
		result.range = {
			min: number(range.min, "range minimum", min, max),
			max: number(range.max, "range maximum", min, max)
		};
		if (result.range.min > result.range.max) throw Error("Range minimum must not exceed maximum; use invert to reverse.");
	}
	return result;
}
//#endregion
//#region src/features/surface-automation.ts
/** Canonical, atomic surface edits for the inspector and saved/live commands. */
function editSurfaceAutomation(surface, changes) {
	if (surface.locked) throw Error("This surface is locked.");
	const raw = object(changes, [
		"bases",
		"animation",
		"modulation",
		"bend_axis"
	]);
	let next = { ...surface };
	if (raw.bend_axis !== void 0) {
		if (raw.bend_axis !== "horizontal" && raw.bend_axis !== "vertical") throw Error("Use horizontal or vertical bend axis.");
		next.bend = {
			axis: raw.bend_axis,
			angleDeg: surface.bend?.angleDeg ?? 0
		};
	}
	const properties = SURFACE_PARAMETERS.map((p) => p.key);
	if (raw.bases !== void 0) for (const [key, rawValue] of Object.entries(object(raw.bases, properties))) {
		const spec = SURFACE_PARAMETERS.find((p) => p.key === key);
		const value = number(rawValue, spec.label, spec.min, spec.max);
		if (key === "opacity" || key === "radiusPx") next = {
			...next,
			[key]: value
		};
		else if (key === "bendAngleDeg") next.bend = {
			axis: next.bend?.axis ?? "horizontal",
			angleDeg: value
		};
		else next.transform = {
			...DEFAULT_TRANSFORM,
			...next.transform,
			[key]: value
		};
	}
	for (const field of ["animation", "modulation"]) {
		if (raw[field] === void 0) continue;
		if (raw[field] === null) {
			next[field] = void 0;
			continue;
		}
		for (const [key, value] of Object.entries(object(raw[field], properties))) {
			const spec = SURFACE_PARAMETERS.find((p) => p.key === key);
			if (field === "animation") {
				const assignments = { ...next.animation }, keys = parameterKeys(value, spec.min, spec.max);
				if (keys) assignments[spec.key] = keys;
				else delete assignments[spec.key];
				next.animation = Object.keys(assignments).length ? assignments : void 0;
			} else {
				const assignments = { ...next.modulation }, m = parameterModulation(value, spec.min, spec.max);
				if (m) assignments[spec.key] = m;
				else delete assignments[spec.key];
				next.modulation = Object.keys(assignments).length ? assignments : void 0;
			}
		}
	}
	return next;
}
//#endregion
//#region src/layer-transform.ts
function boundsOf(points) {
	const x = Math.min(...points.map((p) => p[0])), y = Math.min(...points.map((p) => p[1]));
	return {
		x,
		y,
		width: Math.max(...points.map((p) => p[0])) - x,
		height: Math.max(...points.map((p) => p[1])) - y
	};
}
var mapGeometry = (g, fn) => ({
	corners: g.corners.map(fn),
	masks: g.masks.map((s) => s.map(fn)),
	...g.maskCurves ? { maskCurves: mapMaskCurves(g.maskCurves, fn) } : {}
});
/** Undo the evaluated transform using the NEW centroid, preserving all animation keys. */
function geometryFromVisible(surface, geometry, timeS, context) {
	const t = featureTransformAt(surface, timeS, context);
	if (Math.abs(t.scaleX * t.scaleY) < 1e-8) return {
		corners: surface.corners,
		masks: surface.masks,
		maskCurves: surface.maskCurves
	};
	const pivot = [geometry.corners.reduce((sum, p) => sum + p[0], 0) / 4 - t.xPx, geometry.corners.reduce((sum, p) => sum + p[1], 0) / 4 - t.yPx];
	const r = t.rotationDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
	return mapGeometry(geometry, (p) => {
		const x = p[0] - pivot[0] - t.xPx, y = p[1] - pivot[1] - t.yPx;
		return [pivot[0] + (c * x + s * y) / t.scaleX, pivot[1] + (-s * x + c * y) / t.scaleY];
	});
}
function setLayerBounds(surface, next, timeS, context) {
	const visible = animateSurface(surface, timeS, context), b = boundsOf(visible.corners);
	if (b.width < 1e-8 || b.height < 1e-8) return surface;
	return geometryFromVisible(surface, mapGeometry(visible, (p) => [next.x + (p[0] - b.x) * next.width / b.width, next.y + (p[1] - b.y) * next.height / b.height]), timeS, context);
}
function rotateLayer(surface, degrees, timeS, context) {
	const visible = animateSurface(surface, timeS, context), b = boundsOf(visible.corners);
	const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = degrees * Math.PI / 180;
	return geometryFromVisible(surface, mapGeometry(visible, ([x, y]) => [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)]), timeS, context);
}
//#endregion
//#region src/homography.ts
/**
* Solve the homography carrying the four `src` corners onto the four `dst`
* corners. Eight unknowns, eight equations, Gaussian elimination with partial
* pivoting.
*/
function solveHomography(src, dst) {
	const a = [];
	for (let i = 0; i < 4; i += 1) {
		const [x, y] = src[i];
		const [u, v] = dst[i];
		a.push([
			x,
			y,
			1,
			0,
			0,
			0,
			-u * x,
			-u * y,
			u
		]);
		a.push([
			0,
			0,
			0,
			x,
			y,
			1,
			-v * x,
			-v * y,
			v
		]);
	}
	for (let col = 0; col < 8; col += 1) {
		let pivot = col;
		for (let row = col + 1; row < 8; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
		if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("Cannot solve a degenerate quad: at least three corners are collinear or coincident.");
		[a[col], a[pivot]] = [a[pivot], a[col]];
		const lead = a[col][col];
		for (let k = col; k < 9; k += 1) a[col][k] /= lead;
		for (let row = 0; row < 8; row += 1) {
			if (row === col) continue;
			const factor = a[row][col];
			if (factor === 0) continue;
			for (let k = col; k < 9; k += 1) a[row][k] -= factor * a[col][k];
		}
	}
	const h = a.map((row) => row[8]);
	h.push(1);
	if (h.some((value) => !Number.isFinite(value))) throw new Error("Cannot solve a degenerate quad: the solution diverged.");
	return h;
}
/** Apply a homography to a single point. */
function project(h, p) {
	const [x, y] = p;
	const w = h[6] * x + h[7] * y + 1;
	return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}
//#endregion
//#region src/mask/clip.ts
/**
* How a surface is clipped.
*
* No mask shapes: the surface's own quad. One shape: a CSS `clip-path`
* polygon, cheap and hardware-composited. Several: CSS cannot union polygons,
* but an SVG `<clipPath>` with several `<polygon>`s can, so the wrapper
* references one. `userSpaceOnUse` makes its coordinates output pixels — the
* same space as the corners — because the wrapper spans the whole raster.
*/
function clipShapes(surface) {
	const shapes = surface.masks.map((_, i) => sampleMask(surface, i)).filter((shape) => shape.length >= 3);
	return shapes.length > 0 ? shapes : [surface.corners];
}
//#endregion
//#region src/group-interaction.ts
/** Apply one whole-group edit; a locked or changed member blocks a partial move. */
function applyGroupGeometry(list, folder, changes) {
	const members = list.filter((surface) => surface.folder === folder);
	const geometry = new Map(changes.map((change) => [change.id, change.geometry]));
	if (!members.length || members.some((surface) => surface.locked || !geometry.has(surface.id)) || members.length !== geometry.size) return list;
	return list.map((surface) => surface.folder === folder ? {
		...surface,
		...geometry.get(surface.id)
	} : surface);
}
//#endregion
//#region src/corner-welds.ts
var same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5;
/** Document transaction boundary. Welding is authored geometry, not a renderer
* effect. Scene transfers/deletions drop orphaned links; duplicated IDs in a
* different scene never connect. Locked peers reject the geometry transaction. */
function maintainCornerWelds(before, next) {
	if (before === next) return next;
	if (!allSurfaces(next).some((s) => s.cornerWelds?.some(Boolean))) return next;
	const old = new Map(allSurfaces(before).map((s) => [s.id, s]));
	let blocked = false;
	const update = (list) => {
		const links = /* @__PURE__ */ new Map();
		for (const s of list) s.cornerWelds?.forEach((id, index) => {
			if (id) links.set(id, [...links.get(id) ?? [], {
				surface: s,
				index
			}]);
		});
		const replacements = /* @__PURE__ */ new Map();
		for (const [id, entries] of links) {
			if (entries.length < 2) continue;
			const proposals = [];
			for (const { surface: s, index } of entries) {
				const prior = old.get(s.id), point = animateSurface(s, 0).corners[index];
				if (prior && !same(animateSurface(prior, 0).corners[index], point)) proposals.push(point);
			}
			const desired = proposals[0] ?? animateSurface(entries[0].surface, 0).corners[entries[0].index];
			if (proposals.some((p) => !same(p, desired))) {
				blocked = true;
				continue;
			}
			if (entries.some(({ surface: s, index }) => s.locked && !same(animateSurface(s, 0).corners[index], desired))) {
				blocked = true;
				continue;
			}
			replacements.set(id, desired);
		}
		return list.map((s) => {
			if (!s.cornerWelds?.some(Boolean)) return s;
			const ids = s.cornerWelds.map((id) => id && (links.get(id)?.length ?? 0) >= 2 ? id : null);
			const visible = animateSurface(s, 0), corners = visible.corners.map((p) => [...p]);
			let moved = false;
			ids.forEach((id, i) => {
				const p = id && replacements.get(id);
				if (p && !same(p, corners[i])) {
					corners[i] = p;
					moved = true;
				}
			});
			const changedLinks = ids.some((v, i) => v !== s.cornerWelds[i]);
			return moved || changedLinks ? {
				...s,
				...moved ? geometryFromVisible(s, {
					corners,
					masks: visible.masks,
					maskCurves: visible.maskCurves
				}, 0) : {},
				cornerWelds: ids
			} : s;
		});
	};
	const scenes = next.scenes.map((scene) => ({
		...scene,
		surfaces: update(scene.surfaces)
	}));
	const unassignedSurfaces = update(next.unassignedSurfaces);
	return blocked ? before : {
		...next,
		scenes,
		unassignedSurfaces
	};
}
//#endregion
//#region src/cube-pose.ts
var FACE_VERTICES = [
	[
		3,
		2,
		0,
		1
	],
	[
		1,
		0,
		4,
		5
	],
	[
		0,
		2,
		6,
		4
	]
];
var vertex = (id) => [
	(id & 1 ? 1 : 0) - .5,
	(id & 2 ? 1 : 0) - .5,
	(id & 4 ? 1 : 0) - .5
];
var distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
var close = (a, b) => distance(a, b) < 1e-4;
/** Recover a cube's three face roles from their shared-junction incidence. */
function cubeFaces(members) {
	if (members.length !== 3 || members.some((s) => s.groupShape !== "cube")) return null;
	for (const top of members) for (const left of members) for (const right of members) {
		if ((/* @__PURE__ */ new Set([
			top.id,
			left.id,
			right.id
		])).size !== 3) continue;
		const q = [
			top,
			left,
			right
		].map((s) => animateSurface(s, 0).corners);
		if (close(q[0][2], q[1][1]) && close(q[0][2], q[2][0]) && close(q[0][3], q[1][0]) && close(q[0][1], q[2][1]) && close(q[1][2], q[2][3])) return [
			top,
			left,
			right
		];
	}
	return null;
}
/** Householder QR solves the overdetermined camera without squaring its condition. */
function leastSquares(rows, values) {
	const a = rows.map((row, i) => [...row, values[i]]), n = rows[0].length;
	for (let k = 0; k < n; k++) {
		const norm = Math.hypot(...a.slice(k).map((row) => row[k]));
		if (norm < 1e-9) throw Error("Cube pose needs three noncollapsed faces.");
		const v = a.slice(k).map((row) => row[k]);
		v[0] += v[0] >= 0 ? norm : -norm;
		const length = Math.hypot(...v);
		for (let i = 0; i < v.length; i++) v[i] /= length;
		for (let j = k; j <= n; j++) {
			const dot = v.reduce((sum, value, i) => sum + value * a[k + i][j], 0);
			for (let i = 0; i < v.length; i++) a[k + i][j] -= 2 * v[i] * dot;
		}
	}
	const x = Array(n).fill(0);
	for (let i = n - 1; i >= 0; i--) {
		if (Math.abs(a[i][i]) < 1e-9) throw Error("Cube pose is ambiguous at this angle.");
		x[i] = (a[i][n] - x.reduce((sum, value, j) => j > i ? sum + a[i][j] * value : sum, 0)) / a[i][i];
	}
	return x;
}
function camera(points) {
	const b = boundsOf(points), scale = Math.max(b.width, b.height), center = [b.x + b.width / 2, b.y + b.height / 2];
	if (scale < 1e-4) throw Error("Cube pose needs a visible cube.");
	const rows = [], values = [];
	points.forEach((point, id) => {
		const [x, y, z] = vertex(id), u = (point[0] - center[0]) / scale, v = (point[1] - center[1]) / scale;
		rows.push([
			x,
			y,
			z,
			1,
			0,
			0,
			0,
			0,
			-u * x,
			-u * y,
			-u * z
		], [
			0,
			0,
			0,
			0,
			x,
			y,
			z,
			1,
			-v * x,
			-v * y,
			-v * z
		]);
		values.push(u, v);
	});
	const p = leastSquares(rows, values);
	return (v) => {
		const w = 1 + p[8] * v[0] + p[9] * v[1] + p[10] * v[2];
		if (w < .02) throw Error("This pose crosses the projection horizon. Use a smaller turn.");
		const point = [center[0] + scale * (p[0] * v[0] + p[1] * v[1] + p[2] * v[2] + p[3]) / w, center[1] + scale * (p[4] * v[0] + p[5] * v[1] + p[6] * v[2] + p[7]) / w];
		if (point.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e6)) throw Error("Cube pose exceeds the mapping area.");
		return point;
	};
}
function rotate(v, delta) {
	let [x, y, z] = v;
	for (const [axis, degrees] of [
		delta.xDegrees,
		delta.yDegrees,
		delta.zDegrees
	].entries()) {
		if (degrees === void 0) continue;
		if (!Number.isFinite(degrees) || Math.abs(degrees) > 180) throw Error("Pose angles must be between −180 and 180 degrees.");
		const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
		if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
		if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
		if (axis === 2) [x, y] = [x * c - y * s, x * s + y * c];
	}
	return delta.insideOut ? [
		-x,
		-y,
		-z
	] : [
		x,
		y,
		z
	];
}
function faceSign(q) {
	const turns = q.map((p, i) => {
		const a = q[(i + 1) % 4], b = q[(i + 2) % 4];
		return (a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0]);
	});
	const maxEdge = Math.max(...q.map((p, i) => distance(p, q[(i + 1) % 4])));
	if (turns.some((v) => Math.abs(v) < Math.max(1e-6, maxEdge * maxEdge * 1e-6)) || turns.some((v) => Math.sign(v) !== Math.sign(turns[0]))) throw Error("This pose folds a face. Use a smaller turn.");
	return Math.sign(turns[0]);
}
/** An incremental 3D pose, baked into the canonical mapping geometry. */
function cubePoseGeometry(members, delta) {
	const faces = cubeFaces(members);
	if (!faces) throw Error("Select a complete cube with three joined faces.");
	if (faces.some((s) => s.locked)) throw Error("Unlock every cube face before changing its pose.");
	const visible = faces.map((s) => animateSurface(s, 0)), points = Array(7);
	visible.forEach((face, i) => FACE_VERTICES[i].forEach((id, j) => {
		points[id] ??= face.corners[j];
	}));
	const project3 = camera(points);
	const moved = points.map((point, id) => {
		const p = vertex(id), before = project3(p), after = project3(rotate(p, delta));
		return [point[0] + after[0] - before[0], point[1] + after[1] - before[1]];
	});
	return faces.map((surface, i) => {
		const prior = visible[i], corners = FACE_VERTICES[i].map((id) => moved[id]);
		if (faceSign(prior.corners) !== faceSign(corners)) throw Error("This pose hides one of the three faces. Use a smaller turn.");
		const h = solveHomography(prior.corners, corners), map = (p) => {
			const next = project(h, p);
			if (next.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e6)) throw Error("Pose would move a mask outside the mapping area.");
			return next;
		};
		return {
			id: surface.id,
			geometry: geometryFromVisible(surface, {
				corners,
				masks: prior.masks.map((mask) => mask.map(map)),
				...prior.maskCurves ? { maskCurves: mapMaskCurves(prior.maskCurves, map) } : {}
			}, 0)
		};
	});
}
/** Same atomic transaction used by inspector gestures and agents. */
function applyCubeGeometry(show, memberID, changes) {
	const list = surfaceCollection(show, memberID)?.scene?.surfaces ?? show.unassignedSurfaces;
	const member = list.find((s) => s.id === memberID);
	if (!member?.folder) throw Error("Cube face not found.");
	const members = list.filter((s) => s.folder === member.folder);
	if (!cubeFaces(members) || members.some((s) => s.locked)) throw Error("Cube membership or locks changed.");
	const nextList = applyGroupGeometry(list, member.folder, changes);
	if (nextList === list) throw Error("Cube membership changed.");
	const welded = maintainCornerWelds(show, withSurfaceCollection(show, memberID, () => nextList));
	if (welded === show) throw Error("A locked or conflicting welded neighbour prevents this pose.");
	const prior = new Map(allSurfaces(show).map((s) => [s.id, s]));
	for (const surface of allSurfaces(welded)) {
		if (surface === prior.get(surface.id)) continue;
		if ([
			...surface.corners,
			...surface.masks.flat(),
			...(surface.maskCurves ?? []).flatMap((profile) => profile.flatMap((curve) => curve ? [curve.c1, curve.c2] : []))
		].some((p) => p.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e6))) throw Error("Pose exceeds the saved geometry range.");
	}
	return welded;
}
function poseCube(show, memberID, delta) {
	const list = surfaceCollection(show, memberID)?.scene?.surfaces ?? show.unassignedSurfaces;
	const member = list.find((s) => s.id === memberID);
	if (!member?.folder) throw Error("Cube face not found.");
	return applyCubeGeometry(show, memberID, cubePoseGeometry(list.filter((s) => s.folder === member.folder), delta));
}
//#endregion
//#region src/features/effect-motion.ts
/** Authored values stay unchanged. Curves precede live/clock modulation. */
function effectValueAt(effect, timeS, showTimeS = timeS, levels, controls, lfos = DEFAULT_LFOS) {
	const base = keyframeValue(effect.animation ?? [], timeS, effect.amount), modulation = effect.modulation;
	const value = modulation ? modulatedValue(base, modulation, modulation.source === "lfo" || modulation.clock === "scene" ? showTimeS : timeS, levels, controls, lfos) : base;
	return effectAmount(effect.kind, value);
}
//#endregion
//#region src/automation/placement.ts
function placeAsset(show, args) {
	if (typeof args.start_s !== "number" || !Number.isFinite(args.start_s) || args.start_s < 0 || args.start_s > 604800) throw new Error("Start time must be between zero and 604800 seconds.");
	if ((show.visuals?.length ?? 0) >= 1e4) throw new Error("Placement exceeds the 10000-clip automation limit.");
	const asset = show.pool?.find((a) => a.id === args.asset_id);
	const track = show.tracks?.find((t) => t.id === args.track_id);
	if (!asset || !track) throw new Error("Asset or track not found. Inspect the show first.");
	if (asset.source.mediaId && !show.media.some((m) => m.id === asset.source.mediaId)) throw new Error("Asset media is missing.");
	const next = placePoolAsset(show, asset.id, track.id, args.start_s);
	if (next === show) throw new Error("Placement refused: check track locks and media type.");
	const clip = next.visuals.at(-1);
	if (!Number.isFinite(clip.durationS) || clip.durationS <= 0 || clip.startS + clip.durationS > 604800) throw new Error("Clip end must be within 604800 seconds.");
	return {
		show: next,
		created: { clip_id: clip.id }
	};
}
//#endregion
//#region src/automation/geometry.ts
var LIMIT = 1e6;
function numberIn(value, min, max) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`Geometry values must be finite and between ${min} and ${max}.`);
	return value;
}
function editGeometry(command, show, args) {
	const scene = show.scenes.find((item) => item.id === args.scene_id);
	const surface = scene?.surfaces.find((item) => item.id === args.surface_id);
	if (!scene || !surface) throw new Error("Surface not found in the specified scene. Inspect the show first.");
	if (surface.locked) throw new Error("The surface is locked.");
	const before = boundsOf(animateSurface(surface, 0).corners);
	const transform = featureTransformAt(surface, 0);
	if (before.width < 1e-8 || before.height < 1e-8 || Math.abs(transform.scaleX * transform.scaleY) < 1e-8) throw new Error("Cannot transform degenerate surface geometry.");
	let geometry;
	if (command === "map.surface.bounds") {
		const next = {
			x: numberIn(args.x_px, -1e6, LIMIT),
			y: numberIn(args.y_px, -1e6, LIMIT),
			width: numberIn(args.width_px, 1, 32768),
			height: numberIn(args.height_px, 1, 32768)
		};
		if (surface.lockAspectRatio && Math.abs(next.width / next.height - before.width / before.height) > 1e-6) throw new Error("The surface aspect ratio is locked. Supply proportional dimensions.");
		geometry = setLayerBounds(surface, next, 0);
	} else if (command === "map.surface.rotate") {
		const degrees = numberIn(args.delta_degrees, -360, 360);
		if (degrees % 360 === 0) throw new Error("Geometry is unchanged. No revision was saved.");
		geometry = rotateLayer(surface, degrees, 0);
	} else throw new Error("Unknown geometry command.");
	const next = maintainCornerWelds(show, {
		...show,
		scenes: show.scenes.map((item) => item.id === scene.id ? {
			...item,
			surfaces: item.surfaces.map((layer) => layer.id === surface.id ? {
				...layer,
				...geometry
			} : layer)
		} : item)
	});
	if (next === show) throw new Error("Geometry edit refused by welded-corner constraints or a locked neighbour.");
	const changed = next.scenes.find((item) => item.id === scene.id).surfaces;
	const changedIDs = changed.filter((layer, index) => JSON.stringify([
		layer.corners,
		layer.masks,
		layer.maskCurves
	]) !== JSON.stringify([
		scene.surfaces[index].corners,
		scene.surfaces[index].masks,
		scene.surfaces[index].maskCurves
	])).map((layer) => layer.id);
	for (const layer of changed.filter((item) => changedIDs.includes(item.id))) {
		const points = [
			...layer.corners,
			...layer.masks.flat(),
			...(layer.maskCurves ?? []).flatMap((profile) => profile.flatMap((curve) => curve ? [curve.c1, curve.c2] : []))
		];
		for (const point of points) for (const coordinate of point) numberIn(coordinate, -1e6, LIMIT);
	}
	if (!changedIDs.length) throw new Error("Geometry is unchanged. No revision was saved.");
	return {
		show: next,
		changedIDs
	};
}
//#endregion
//#region src/features/new-feature.ts
function newFeature(kind, output, index) {
	const surface = newSurface(output, index);
	surface.kind = kind;
	surface.name = `${kind[0].toUpperCase() + kind.slice(1)} ${index + 1}`;
	if (kind === "mask") surface.source.fill = "#000000";
	if (kind === "text") surface.source.text = { ...DEFAULT_TEXT };
	if (kind === "shader") surface.source.shader = newShader();
	if (kind === "webcam") surface.source.webcam = { ...DEFAULT_CAMERA };
	if (kind === "tracker") surface.source.tracker = { ...DEFAULT_TRACKER };
	if (kind === "stream") {
		surface.source.cast = true;
		surface.name = `Cast ${index + 1}`;
	}
	if (kind === "web") surface.source.web = { url: "" };
	return surface;
}
//#endregion
//#region src/scene-size.ts
/** Artboard coordinates are independent of the physical output device. */
function sceneSize(show, scene = activeScene(show)) {
	return scene?.artboard ? {
		width: scene.artboard.widthPx,
		height: scene.artboard.heightPx
	} : {
		width: show.output.width,
		height: show.output.height
	};
}
({ ...DEFAULT_OUTPUT });
//#endregion
//#region src/automation/authoring.ts
/** Bounded saved-show creation using the editor's constructors. No IO or playback. */
function nameOf(value) {
	if (typeof value !== "string" || !value.trim() || value.length > 200 || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error("Name must contain 1–200 characters without control characters.");
	return value.trim();
}
function dimension(value) {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 16384) throw new Error("Artboard dimensions must be whole pixels between 1 and 16384.");
	return value;
}
function createInShow(command, show, args) {
	const name = nameOf(args.name);
	if (command === "map.scene.create") {
		if (show.scenes.length >= 256) throw new Error("Scene creation exceeds the 256-scene automation limit.");
		const scene = newScene(name, {
			widthPx: dimension(args.width_px),
			heightPx: dimension(args.height_px)
		});
		return {
			show: {
				...show,
				scenes: [...show.scenes, scene]
			},
			created: { scene_id: scene.id }
		};
	}
	if (command !== "map.surface.create") throw new Error("Unknown creation command.");
	const scene = show.scenes.find((item) => item.id === args.scene_id);
	if (!scene) throw new Error("Scene not found. Inspect the show first.");
	const shape = args.shape ?? "rectangle";
	if (![
		"rectangle",
		"cube",
		"box"
	].includes(shape)) throw Error("Unsupported mapping shape.");
	if (shape !== "rectangle" && scene.surfaces.some((s) => s.folder === name)) throw Error("A surface folder with that name already exists. Choose a unique name.");
	const count = shape === "cube" ? 3 : shape === "box" ? 5 : 1;
	if (scene.surfaces.length + count > 1024) throw new Error("Surface creation exceeds the 1024-surface per-scene automation limit.");
	const surfaces = shape === "rectangle" ? [{
		...newFeature("surface", sceneSize(show, scene), scene.surfaces.length),
		name
	}] : compoundSurfaces(shape, sceneSize(show, scene), scene.surfaces.length, name);
	return {
		show: {
			...show,
			scenes: show.scenes.map((item) => item.id === scene.id ? {
				...item,
				surfaces: [...item.surfaces, ...surfaces]
			} : item)
		},
		created: {
			scene_id: scene.id,
			surface_id: surfaces[0].id,
			surface_ids: surfaces.map((s) => s.id)
		}
	};
}
//#endregion
//#region src/automation/show-commands.ts
/** Show-timeline automation: the same edits the Show workspace makes. No IO. */
var timelineOf = (show) => activeShow(show) ?? defaultShowTimeline(show);
var withTimeline = (show, timeline) => withActiveShow(normalizeShowTimeline(show), (program) => ({
	...program,
	...timeline
}));
function describeShowTimeline(show) {
	const timeline = timelineOf(show);
	return {
		active_show_id: activeShow(show)?.id,
		player_show_id: show.playerShowID ?? show.shows?.[0]?.id,
		shows: (show.shows ?? []).map((p) => ({
			id: p.id,
			name: p.name
		})),
		duration_s: timeline.durationS,
		tracks: timeline.tracks.map((t) => ({
			canvas_id: t.canvasID,
			clips: t.clips.map((c) => ({
				id: c.id,
				scene_id: c.sceneID,
				start_s: c.startS,
				duration_s: c.durationS,
				in_s: c.inS,
				loop: !!c.loop
			}))
		})),
		cues: timeline.cues.map((c) => ({
			id: c.id,
			name: c.name,
			trigger: c.trigger,
			action: c.action,
			at_s: c.atS,
			to_s: c.toS,
			control: c.control,
			times: c.times,
			condition: c.when
		}))
	};
}
function addShowClip(show, args) {
	const timeline = timelineOf(show), canvasID = String(args.canvas_id), sceneID = String(args.scene_id);
	if (!timeline.tracks.some((t) => t.canvasID === canvasID)) throw Error("Canvas not found. Inspect the show first.");
	if (sceneID !== "main" && !show.timelines?.some((t) => t.id === sceneID)) throw Error("Scene not found. Use a timeline id from inspect, or main.");
	const clip = {
		...newSceneClip(sceneID, Number(args.start_s), Number(args.duration_s)),
		loop: args.loop !== "no"
	};
	return withTimeline(show, {
		...timeline,
		tracks: timeline.tracks.map((t) => t.canvasID === canvasID ? {
			...t,
			clips: [...t.clips, clip]
		} : t),
		durationS: Math.max(timeline.durationS, clip.startS + clip.durationS)
	});
}
function addShowCue(show, args) {
	const timeline = timelineOf(show), trigger = args.trigger, action = args.cue_action;
	if (trigger === "timeline" && typeof args.at_s !== "number") throw Error("A timeline cue needs at_s.");
	if (trigger === "midi" && typeof args.control !== "number") throw Error("A MIDI cue needs control (CC number).");
	if (action === "jump" && typeof args.to_s !== "number") throw Error("A jump cue needs to_s.");
	const cue = {
		id: nextId("cue"),
		name: String(args.name).trim(),
		trigger,
		action,
		...typeof args.at_s === "number" ? { atS: args.at_s } : {},
		...typeof args.to_s === "number" ? { toS: args.to_s } : {},
		...typeof args.control === "number" ? { control: args.control } : {},
		...typeof args.times === "number" ? { times: args.times } : {},
		...typeof args.condition_control === "number" ? { when: {
			control: args.condition_control,
			above: typeof args.condition_above === "number" ? args.condition_above : 0
		} } : {}
	};
	return withTimeline(show, {
		...timeline,
		cues: [...timeline.cues, cue]
	});
}
//#endregion
//#region src/timeline-edit.ts
function clipEditable(show, id) {
	const clip = show.visuals?.find((v) => v.id === id);
	return !!clip && !clip.locked && !show.tracks?.find((t) => t.id === clip.trackID)?.locked;
}
/** Track changes affect compositing, never surface assignments or source identity. */
function moveTimelineClip(show, id, trackID, startS) {
	const clip = show.visuals?.find((v) => v.id === id), track = show.tracks?.find((t) => t.id === trackID);
	if (clip?.timelineRefID && track && !canNestTimeline(show, clip.timelineRefID, track.timelineID ?? "main")) return show;
	if (!clip || !clipEditable(show, id) || !track || track.locked || !trackAcceptsSource(show, track, visualSource(show, clip))) return show;
	return {
		...show,
		visuals: show.visuals?.map((v) => v.id === id ? {
			...v,
			trackID,
			startS: Math.max(0, startS),
			continuous: false,
			...trackID !== v.trackID ? { legacyTrack: void 0 } : {}
		} : v)
	};
}
function editTimelineClip(show, id, action, timeS = 0) {
	const clip = show.visuals?.find((v) => v.id === id);
	if (!clip || show.tracks?.find((t) => t.id === clip.trackID)?.locked || action !== "lock" && !clipEditable(show, id)) return show;
	const visuals = [...show.visuals ?? []], index = visuals.indexOf(clip);
	if (action === "delete") visuals.splice(index, 1);
	else if (action === "duplicate") visuals.splice(index + 1, 0, {
		...structuredClone(clip),
		id: nextId("clip"),
		startS: clip.startS + clip.durationS,
		continuous: false,
		legacyTrack: void 0
	});
	else if (action === "split") {
		const offset = timeS - clip.startS;
		if (clip.continuous || offset < .5 || clip.durationS - offset < .5) return show;
		visuals.splice(index, 1, {
			...clip,
			durationS: offset
		}, {
			...structuredClone(clip),
			id: nextId("clip"),
			startS: timeS,
			durationS: clip.durationS - offset,
			inS: clip.inS + offset
		});
	} else if (action === "trim-start" || action === "trim-end") {
		if (clip.continuous || timeS < clip.startS || timeS > clip.startS + clip.durationS) return show;
		visuals[index] = {
			...clip,
			...action === "trim-start" ? trimStart(clip, timeS) : trimEnd(clip, timeS, Infinity)
		};
	} else {
		const patch = action === "enabled" ? { enabled: clip.enabled === false } : action === "lock" ? { locked: !clip.locked } : {
			startS: 0,
			continuous: false
		};
		visuals[index] = {
			...clip,
			...patch
		};
	}
	return {
		...show,
		visuals
	};
}
//#endregion
//#region src/playback.ts
/**
* The surface as it stands at `timeS`: every cue at or before it applied, and
* if the layer has a sequence, the clip under the playhead as its source — or
* nothing at all where no clip covers it.
*/
function evaluateSurface(surface, timeS, media = [], context = {}) {
	let enabled = surface.enabled;
	let opacity = surface.opacity;
	let source = surface.source;
	let mediaTimeS = timeS;
	let hasContent = true;
	if (surface.clips.length > 0 || surface.sequence) {
		const clip = clipAt(surface.clips, timeS);
		if (!clip) hasContent = false;
		else {
			source = clipSource(surface, clip, media);
			mediaTimeS = mediaTime(clip, media.find((m) => m.id === source.mediaId), timeS);
		}
	}
	const due = surface.cues.filter((cue) => cue.timeS <= timeS).sort((a, b) => a.timeS - b.timeS);
	for (const cue of due) if (cue.action === "show") enabled = true;
	else if (cue.action === "hide") enabled = false;
	else if (cue.action === "opacity") opacity = clamp01(typeof cue.value === "number" ? cue.value : opacity);
	return {
		...animateSurface({
			...surface,
			enabled: enabled && hasContent,
			opacity,
			source
		}, timeS, context),
		mediaTimeS
	};
}
function clamp01(value) {
	return Math.min(1, Math.max(0, value));
}
/** Shared projection for the authoring canvas and every physical output. */
function sceneVisuals$1(input, scene, timeS, placeholders = false, onlySurfaceID, inputs = {}, calibration = false) {
	return renderTimeline(input, scene, timeS, currentTimelineID(input), placeholders, onlySurfaceID, inputs, calibration);
}
/** Where a clip's board sits in `frame` before any placement: cover keeps the
* board's proportions and overflows the frame; stretch fills it exactly. */
function boardBounds(board, frame, fit) {
	const [fx, fy, fw, fh] = frame, s = Math.max(fw / board.widthPx, fh / board.heightPx);
	return fit === "cover" ? [
		fx + (fw - board.widthPx * s) / 2,
		fy + (fh - board.heightPx * s) / 2,
		board.widthPx * s,
		board.heightPx * s
	] : frame;
}
/** Maps a clip's board into `frame` (whose corners are `corners`), moved and
* sized by the use's placement as any visual is in its frame. */
function boardInto(board, frame, corners, fit, placement) {
	const toFrame = solveHomography(quadCorners([
		0,
		0,
		board.widthPx,
		board.heightPx
	]), contentPlacementCorners(placement, frame, boardBounds(board, frame, fit)));
	const toCorners = solveHomography(quadCorners(frame), corners);
	return (p) => project(toCorners, project(toFrame, p));
}
function renderTimeline(input, scene, timeS, timelineID, placeholders = false, onlySurfaceID, inputs = {}, calibration = false, asBoard = false) {
	const show = normalizeVisuals(input);
	const root = show.timelines?.find((t) => t.id === timelineID);
	const rootStep = !asBoard && isClip(root) ? [{
		board: root.board,
		fit: "stretch"
	}] : [];
	const geometry = show.scenes.find((s) => s.id === scene.id) ?? scene;
	const context = {
		...inputs,
		lfos: show.lfos,
		sceneTimeS: timeS,
		...calibration ? { modulation: false } : {}
	};
	const occupied = /* @__PURE__ */ new Set();
	const w = scene.artboard?.widthPx ?? show.output.width, h = scene.artboard?.heightPx ?? show.output.height;
	const hosted = (pictures, hosts) => hosts.flatMap((id) => {
		const found = geometry.surfaces.find((s) => s.id === id);
		if (!found || !found.enabled || onlySurfaceID && onlySurfaceID !== id) return [];
		const host = evaluateSurface(found, calibration ? 0 : timeS, show.media, context);
		const toHost = solveHomography(quadCorners([
			0,
			0,
			w,
			h
		]), host.corners), map = (p) => project(toHost, p);
		const outline = host.masks.length || host.shape === "ellipse" || host.radiusPx ? targetShapes(host) : [];
		return pictures.map((p) => ({
			...p,
			id: `${p.id}@${id}`,
			corners: p.corners.map(map),
			masks: p.masks.length || p.shape === "ellipse" || p.radiusPx ? targetShapes(p).map((m) => m.map(map)) : outline,
			shape: void 0,
			radiusPx: void 0,
			maskCurves: void 0,
			bend: void 0,
			opacity: p.opacity * host.opacity
		}));
	});
	const into = (pictures, step, frame, corners, outline, suffix = "", opacity = 1) => {
		const map = boardInto(step.board, frame, corners, step.fit, step.placement);
		return pictures.map((p) => ({
			...p,
			id: `${p.id}${suffix}`,
			corners: p.corners.map(map),
			masks: p.masks.length || p.shape === "ellipse" || p.radiusPx ? targetShapes(p).map((m) => m.map(map)) : outline,
			shape: void 0,
			radiusPx: void 0,
			maskCurves: void 0,
			bend: void 0,
			opacity: p.opacity * opacity
		}));
	};
	const outward = (pictures, clips) => {
		let out = pictures;
		for (const [i, step] of clips.entries()) {
			const outer = clips[i + 1]?.board;
			if (outer) {
				const frame = [
					0,
					0,
					outer.widthPx,
					outer.heightPx
				];
				out = into(out, step, frame, quadCorners(frame), []);
				continue;
			}
			if (step.hosts) {
				out = step.hosts.flatMap((id) => {
					const found = geometry.surfaces.find((s) => s.id === id);
					if (!found || !found.enabled || onlySurfaceID && onlySurfaceID !== id) return [];
					const host = evaluateSurface(found, calibration ? 0 : timeS, show.media, context);
					const outline = step.fit === "cover" || step.placement || host.masks.length || host.shape === "ellipse" || host.radiusPx ? targetShapes(host) : [];
					return into(out, step, host.source.rect, host.corners, outline, `@${id}`, host.opacity);
				});
				continue;
			}
			const frame = [
				0,
				0,
				w,
				h
			];
			out = into(out, step, frame, quadCorners(frame), step.fit === "cover" || step.placement ? [quadCorners(frame)] : []);
		}
		return out;
	};
	const rendered = scheduledVisuals(show, timeS, timelineID, inputs).flatMap(({ visual, track, timeS, hosts, board, clips }) => {
		const out = place(visual, track, timeS, board);
		return board ? outward(out, [...clips ?? [], ...rootStep]) : hosts ? hosted(out, hosts) : out;
	});
	function place(visual, track, timeS, board) {
		if (track?.kind === "audio" || track?.enabled === false) return [];
		const source = visualSource(show, visual);
		if (show.media.some((m) => m.id === source.mediaId && m.kind === "audio")) return [];
		if (visual.enabled === false || !visual.continuous && (timeS < visual.startS || timeS >= visual.startS + visual.durationS)) return [];
		if (visual.legacyTrack) {
			if (occupied.has(visual.legacyTrack)) return [];
			occupied.add(visual.legacyTrack);
		}
		const whole = (width, height, id) => ({
			...newSurface({
				width,
				height
			}, 0),
			id,
			corners: quadCorners([
				0,
				0,
				width,
				height
			]),
			source: {
				mediaId: null,
				rect: [
					0,
					0,
					width,
					height
				]
			},
			mediaTimeS: timeS
		});
		const targets = board ? [whole(board.widthPx, board.heightPx, "board")] : visual.targets.filter((t) => t.sceneID === scene.id).flatMap((t) => {
			if (t.surfaceID) {
				const surface = geometry.surfaces.find((s) => s.id === t.surfaceID);
				return surface ? [evaluateSurface(surface, calibration ? 0 : timeS, show.media, context)] : [];
			}
			return [whole(w, h, scene.id)];
		});
		if (!targets.length) return [];
		const points = targets.flatMap((t) => t.corners);
		const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
		const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
		const window = [
			[left, top],
			[right, top],
			[right, bottom],
			[left, bottom]
		];
		const media = show.media.find((m) => m.id === source.mediaId);
		const clock = visual.continuous ? timeS : mediaTime(visual, media, timeS);
		const pictures = targets.filter((t) => t.enabled && t.opacity > 0 && (!onlySurfaceID || t.id === onlySurfaceID)).map((target) => ({
			...target,
			id: `${visual.id}:${target.id}`,
			name: visual.name,
			...visual.placement ? {
				visualPlacement: visual.placement,
				contentFrame: visual.mapping === "span" ? [
					0,
					0,
					right - left,
					bottom - top
				] : target.source.rect
			} : {},
			source: {
				...source,
				fit: source.fit ?? "cover",
				effects: visual.effects
			},
			clips: [],
			sequence: false,
			opacity: target.opacity * visual.opacity,
			mediaTimeS: clock,
			mediaLoop: Boolean(visual.continuous),
			...visual.mapping === "span" ? {
				...target.alphaMask ? { alphaProjection: {
					corners: target.corners,
					rect: target.source.rect
				} } : {},
				corners: window,
				masks: targetShapes(target),
				shape: void 0,
				radiusPx: void 0,
				maskCurves: void 0,
				bend: void 0
			} : {}
		}));
		if (visual.mapping !== "span") return pictures;
		const merged = [];
		for (const picture of pictures) {
			const prior = !picture.alphaMask && !picture.maskFillRule && merged.find((p) => !p.alphaMask && !p.maskFillRule && p.opacity === picture.opacity);
			if (prior) prior.masks = [...prior.masks, ...picture.masks];
			else merged.push(picture);
		}
		return merged;
	}
	const targets = timelineVisuals(show, timelineID).flatMap((v) => v.targets).filter((t) => t.sceneID === scene.id);
	return [...placeholders && !targets.some((t) => !t.surfaceID) ? geometry.surfaces.filter((s) => !targets.some((t) => t.surfaceID === s.id)).map((s) => evaluateSurface(s, calibration ? 0 : timeS, show.media, context)) : [], ...rendered];
}
function targetShapes(surface) {
	if (surface.masks.length || surface.shape !== "ellipse" && !surface.radiusPx) return clipShapes(surface);
	const [x, y, w, h] = surface.source.rect;
	const transform = solveHomography(quadCorners(surface.source.rect), surface.corners);
	if (surface.shape === "ellipse") return [Array.from({ length: 96 }, (_, i) => {
		const theta = i / 96 * Math.PI * 2;
		return project(transform, [x + w / 2 + Math.cos(theta) * w / 2, y + h / 2 + Math.sin(theta) * h / 2]);
	})];
	const r = Math.min(surface.radiusPx ?? 0, w / 2, h / 2);
	return [[
		[x + w - r, y + r],
		[x + w - r, y + h - r],
		[x + r, y + h - r],
		[x + r, y + r]
	].flatMap(([cx, cy], corner) => Array.from({ length: 17 }, (_, i) => {
		const theta = (corner - 1 + i / 16) * Math.PI / 2;
		return project(transform, [cx + Math.cos(theta) * r, cy + Math.sin(theta) * r]);
	}))];
}
//#endregion
//#region src/timeline-audio.ts
/** Shared by live playback and offline soundtrack scheduling. */
function timelineTrackGain(show, track, gain = 1) {
	return masterAudioGain(show.audioOutput) * gain * Math.min(1, Math.max(0, track.volume ?? 1)) * Math.max(0, ...sceneLayers(show).filter((l) => track.targets.some((t) => t.sceneID === l.scene.id)).map((l) => l.opacity));
}
/** One voice per clip, independent of the count of surface targets. */
function timelineAudio(show, timeS) {
	return scheduledVisuals(show, timeS).flatMap(({ visual: clip, track, timeS, gain }) => {
		if (!track || track.kind !== "audio" || clip.enabled === false || timeS < clip.startS || timeS >= clip.startS + clip.durationS) return [];
		const media = show.media.find((m) => m.id === visualSource(show, clip).mediaId);
		if (!media || media.kind === "image") return [];
		const volume = timelineTrackGain(show, track, gain);
		return [{
			id: clip.id,
			trackID: track.id,
			eq: track.eq,
			mediaID: media.id,
			timeS: mediaTime(clip, media, timeS),
			volume,
			loop: false
		}];
	});
}
//#endregion
//#region src/features/bundled-loops.ts
var BUNDLED_LOOPS = [
	{
		"id": "prismatic-flow",
		"name": "Prismatic Flow",
		"description": "Soft violet and turquoise ribbons flow in a seamless loop.",
		"file": "prismatic-flow.mp4",
		"poster": "prismatic-flow.jpg",
		"width": 1280,
		"height": 720,
		"duration": 8,
		"fps": 24,
		"bytes": 902140,
		"sha256": "28ce4b1ea2cbc7495d4e5bcf164e1a18dfe25ca101527cfecec5c2a7ff151e04"
	},
	{
		"id": "orbital-lights",
		"name": "Orbital Lights",
		"description": "Luminous points orbit and breathe against a dark field.",
		"file": "orbital-lights.mp4",
		"poster": "orbital-lights.jpg",
		"width": 1280,
		"height": 720,
		"duration": 8,
		"fps": 24,
		"bytes": 396291,
		"sha256": "a07362976bf1f6bed358835d47f9bd63234bf80e91534fed354ee0e6fd4066e9"
	},
	{
		"id": "liquid-caustics",
		"name": "Liquid Caustics",
		"description": "Blue rippling highlights resembling light under water.",
		"file": "liquid-caustics.mp4",
		"poster": "liquid-caustics.jpg",
		"width": 1280,
		"height": 720,
		"duration": 8,
		"fps": 24,
		"bytes": 1503008,
		"sha256": "3b3bdd98b56c780b6c973ff9e43d6cd515f6e561018d3c87065e1fd9076eb78d"
	},
	{
		"id": "golden-confetti",
		"name": "Golden Confetti",
		"description": "Warm tumbling confetti for celebrations and layered scenes.",
		"file": "golden-confetti.mp4",
		"poster": "golden-confetti.jpg",
		"width": 1280,
		"height": 720,
		"duration": 8,
		"fps": 24,
		"bytes": 424608,
		"sha256": "2ce7102214e42b7780262868bac6bdd509ebffe365b57650a854ba4534f49aa2"
	},
	{
		"id": "ribbon-vortex",
		"name": "Ribbon Vortex",
		"description": "Five magenta ribbons spiral around a dark center.",
		"file": "ribbon-vortex.mp4",
		"poster": "ribbon-vortex.jpg",
		"width": 1280,
		"height": 720,
		"duration": 8,
		"fps": 24,
		"bytes": 403419,
		"sha256": "c9ddf4c8bc249f7ce1f5305fdcf37414440cf6db310596acb06f3ed4a6f255f2"
	},
	{
		"id": "neon-horizon",
		"name": "Neon Horizon",
		"description": "A luminous moving perspective grid beneath a warm horizon.",
		"file": "neon-horizon.mp4",
		"poster": "neon-horizon.jpg",
		"width": 1280,
		"height": 720,
		"duration": 8,
		"fps": 24,
		"bytes": 281915,
		"sha256": "cd1d0158abd4f0f453e12e2e873dddc03eef09ef4e9d4186545ec8ac589ea72a"
	}
];
BUNDLED_LOOPS.map((video) => ({
	id: `loop:${video.id}`,
	name: video.name,
	category: "Video loops",
	description: video.description,
	video
}));
//#endregion
//#region src/features/scene-presets.ts
var beats = (control) => ({
	source: "audio",
	band: "low",
	periodS: 4,
	waveform: "sine",
	phase: 0,
	...control
});
/** One surface filling the scene, carrying a configured shader. */
function shaderScene(name, output, shader, surfaceName) {
	const scene = newScene(name, {
		widthPx: output.width,
		heightPx: output.height
	});
	const surface = newSurface(output, 0);
	surface.name = surfaceName;
	surface.kind = "shader";
	surface.source = {
		...surface.source,
		shader,
		rect: [
			0,
			0,
			output.width,
			output.height
		]
	};
	surface.corners = [
		[0, 0],
		[output.width, 0],
		[output.width, output.height],
		[0, output.height]
	];
	scene.surfaces = [surface];
	return scene;
}
var tuned = (preset, colors, parameters = {}, modulation) => {
	const base = newShader(preset);
	return {
		...base,
		colors: colors.length ? colors : base.colors,
		parameters: {
			...base.parameters,
			...parameters
		},
		...modulation ? { modulation } : {}
	};
};
var SCENE_PRESETS = [
	{
		id: "haunted-fog",
		name: "Haunted fog",
		occasion: "Halloween",
		caption: "Slow green murk that breathes with the bass. Good on a porch or a garage door.",
		build: (output) => shaderScene("Haunted fog", output, tuned("smoke-ring", [
			"#04140a",
			"#2f8f4f",
			"#8ef0a8"
		], { speed: .35 }, { scale: beats({ amount: .35 }) }), "Fog")
	},
	{
		id: "pumpkin-flicker",
		name: "Pumpkin flicker",
		occasion: "Halloween",
		caption: "Firelight orange, flickering. Fills a dark corner with no mapping at all.",
		build: (output) => shaderScene("Pumpkin flicker", output, tuned("grain-gradient", [
			"#1a0a00",
			"#ff7418",
			"#ffc05c"
		], { speed: .9 }, { grainMixer: beats({
			amount: .4,
			band: "mid"
		}) }), "Firelight")
	},
	{
		id: "blood-drip",
		name: "Blood drip",
		occasion: "Halloween",
		caption: "Dark red running slowly downward. Best on a flat wall or a window.",
		build: (output) => shaderScene("Blood drip", output, tuned("liquid-metal", [
			"#120002",
			"#8b0008",
			"#ff2b3c"
		], { speed: .25 }), "Drip")
	},
	{
		id: "winter-drift",
		name: "Winter drift",
		occasion: "Christmas",
		caption: "Cold blues drifting across. Turns a wall into weather.",
		build: (output) => shaderScene("Winter drift", output, tuned("water", [
			"#02101f",
			"#2f6fb0",
			"#bfe6ff"
		], { speed: .4 }), "Drift")
	},
	{
		id: "festive-lights",
		name: "Festive lights",
		occasion: "Christmas",
		caption: "Points of warm colour, pulsing to the music.",
		build: (output) => shaderScene("Festive lights", output, tuned("dot-orbit", [
			"#0b0b12",
			"#ff4d4d",
			"#4dff88",
			"#ffd24d"
		], { speed: .6 }, { scale: beats({ amount: .5 }) }), "Lights")
	},
	{
		id: "spectral-swirl",
		name: "Spectral swirl",
		occasion: "Halloween",
		caption: "Slow violet rotation. Reads well on an irregular shape like a bush or a tree.",
		build: (output) => shaderScene("Spectral swirl", output, tuned("swirl", [
			"#07030f",
			"#5b2f9f",
			"#c79bff"
		], { speed: .3 }, { rotation: {
			source: "time",
			amount: 180,
			periodS: 40,
			waveform: "ramp",
			phase: 0
		} }), "Swirl")
	},
	{
		id: "witching-kaleidoscope",
		name: "Witching hour",
		occasion: "Halloween",
		caption: "Green and violet symmetry that opens on the bass. Reads on anything irregular.",
		build: (output) => shaderScene("Witching hour", output, tuned("kaleidoscope", [
			"#050010",
			"#4dff9b",
			"#b46bff"
		], {
			segments: 8,
			twist: 1.6,
			bands: 16,
			speed: .5
		}, { segments: beats({
			amount: 4,
			band: "low"
		}) }), "Symmetry")
	},
	{
		id: "cobweb-tunnel",
		name: "Down the well",
		occasion: "Halloween",
		caption: "A receding tunnel. Turns a flat garage door into a hole in the world.",
		build: (output) => shaderScene("Down the well", output, tuned("tunnel", [
			"#02040a",
			"#2b4a7a",
			"#9fd8ff"
		], {
			sides: 10,
			rings: 2.5,
			speed: .7,
			falloff: 1.1
		}), "Tunnel")
	},
	{
		id: "frost-kaleidoscope",
		name: "Frost star",
		occasion: "Christmas",
		caption: "A six-pointed snowflake, turning slowly. Good on a door or a window.",
		build: (output) => shaderScene("Frost star", output, tuned("kaleidoscope", [
			"#00060f",
			"#bfe9ff",
			"#ffffff"
		], {
			segments: 6,
			twist: .2,
			bands: 22,
			speed: .22
		}, { rotation: {
			source: "time",
			amount: 360,
			periodS: 90,
			waveform: "ramp",
			phase: 0
		} }), "Snowflake")
	},
	{
		id: "candy-stripe",
		name: "Candy stripe",
		occasion: "Christmas",
		caption: "Red and white bands rolling downward, like a stick of rock.",
		build: (output) => shaderScene("Candy stripe", output, tuned("tunnel", [
			"#ffffff",
			"#d81f2a",
			"#ffd9dc"
		], {
			sides: 16,
			rings: 5,
			speed: .5,
			falloff: .2
		}), "Stripes")
	},
	{
		id: "hearth-glow",
		name: "Hearth glow",
		occasion: "Ambient",
		caption: "Warm, slow and almost still. For a window you want lit, not performing.",
		build: (output) => shaderScene("Hearth glow", output, tuned("mesh-gradient", [
			"#1a0700",
			"#8a3b12",
			"#ffb35c"
		], { speed: .12 }), "Glow")
	},
	{
		id: "deep-water",
		name: "Deep water",
		occasion: "Ambient",
		caption: "Caustics moving across a wall. Sits under anything else you project.",
		build: (output) => shaderScene("Deep water", output, tuned("water", [
			"#000a12",
			"#0b4a6b",
			"#6fd8ff"
		], { speed: .3 }), "Caustics")
	},
	{
		id: "strobe-floor",
		name: "Dance floor",
		occasion: "Party",
		caption: "Hard colour panels snapping on the beat. Loud, and meant to be.",
		build: (output) => shaderScene("Dance floor", output, tuned("color-panels", [
			"#05000a",
			"#ff2e88",
			"#2effd5",
			"#ffe74c"
		], { speed: 1.4 }, { scale: beats({
			amount: .6,
			band: "low",
			waveform: "square"
		}) }), "Panels")
	},
	{
		id: "mirror-ball",
		name: "Mirror ball",
		occasion: "Party",
		caption: "Spinning symmetry that widens with the music. Fill a whole room with it.",
		build: (output) => shaderScene("Mirror ball", output, tuned("kaleidoscope", [
			"#00030a",
			"#ffffff",
			"#7cc8ff"
		], {
			segments: 14,
			twist: .6,
			bands: 30,
			speed: 1.2
		}, { twist: beats({
			amount: 2,
			band: "mid"
		}) }), "Facets")
	}
];
//#endregion
//#region src/features/visual-gallery.ts
var families = {
	...Object.fromEntries(STAGE_GENERATORS.map((s) => [s.id, [s.category, s.description]])),
	"mesh-gradient": ["Abstract", "Soft fields of color flowing across the scene."],
	"static-mesh-gradient": ["Abstract", "A softly rotating blend of colors."],
	"radial-gradient": ["Abstract", "Layered radial color with a gentle rotation."],
	"grain-gradient": ["Abstract", "Textured color fields with adjustable grain."],
	"simplex-noise": ["Abstract", "Organic noise with flowing, adjustable detail."],
	"perlin-noise": ["Abstract", "Cloud-like layers of animated noise."],
	"neuro-noise": ["Psychedelic", "An animated network of organic cells."],
	"voronoi": ["Geometric", "Moving cells and geometric boundaries."],
	"metaballs": ["Blobs", "Liquid shapes that merge and separate."],
	"waves": ["Contours", "Flowing bands with adjustable wave spacing."],
	"swirl": ["Psychedelic", "Swirling color fields with adjustable intensity."],
	"spiral": ["Tunnel", "A rotating spiral for depth and motion."],
	"smoke-ring": ["Blobs", "A soft ring of billowing color."],
	"warp": ["Psychedelic", "Warped patterns and flowing color."],
	"dot-orbit": ["Geometric", "Orbiting points of color."],
	"dot-grid": ["Geometric", "A regular field of dots with editable spacing."],
	"color-panels": ["Pixel", "Animated color panels."],
	"dithering": ["Pixel", "Pixel patterns with adjustable dithering."],
	"god-rays": ["Ambient", "Rays of colored light."],
	"pulsing-border": ["Neon", "A glowing animated frame."],
	"kaleidoscope": ["Geometric", "Mirrored radial symmetry with adjustable segments."],
	"tunnel": ["Tunnel", "A perspective tunnel with moving rings."],
	"neon-beams": ["Neon", "Crossing light beams with soft neon glow."],
	"synthwave": ["Synthwave", "A moving perspective grid below a striped sunset."],
	"pixel-mosaic": ["Pixel", "A field of individually pulsing colored tiles."],
	"contour-lines": ["Contours", "Glowing contour rings with an organic ripple."],
	"starfield": ["Ambient", "Layered stars drifting and twinkling in the dark."],
	"aurora": ["Ambient", "Slow, flowing curtains of northern light."],
	"snowfall": ["Holiday", "Layers of falling snow at different depths."],
	"heart-confetti": ["Holiday", "Drifting hearts with an editable color palette."],
	"watchful-eye": ["Eyes", "A shaded eye with a moving gaze and detailed iris."],
	"jack-lantern": ["Halloween", "A carved pumpkin face with flickering light."],
	"moonlit-window": ["Window", "A framed view of rolling hills and a glowing moon."]
};
function galleryShader(id, index) {
	const shader = newShader(id, index);
	if (id === "metaballs" && index === 1) shader.parameters.colorBack = "#f2ede5";
	return shader;
}
/** Each tile is an actual configured source, not artwork standing in for one. */
var shaderVisuals = SHADERS.filter((entry) => !entry.image).flatMap((entry) => entry.presets.map((preset, index) => ({
	id: `${entry.id}:${index}`,
	name: preset.name === "Default" ? entry.label : `${preset.name} · ${entry.label}`,
	category: families[entry.id]?.[0] ?? "Abstract",
	description: families[entry.id]?.[1] ?? entry.label,
	shader: galleryShader(entry.id, index)
})));
var sceneVisuals = SCENE_PRESETS.map((preset) => {
	let shader = preset.build({
		width: 640,
		height: 360
	}).surfaces[0].source.shader;
	let description = preset.caption;
	if (preset.id === "blood-drip") {
		shader = newShader("metaballs");
		shader.colors = [
			"#5c0012",
			"#a50924",
			"#e03945"
		];
		shader.parameters = {
			...shader.parameters,
			colorBack: "#120002",
			speed: .25,
			count: 8,
			size: .48
		};
		description = "Slow, dark red droplets that merge and separate.";
	} else if (preset.id === "winter-drift") {
		shader = newShader("snowfall");
		shader.parameters.speed = .4;
		description = "Layers of cool snow drifting across a dark winter sky.";
	} else if (preset.id === "deep-water") {
		shader = newShader("aurora");
		shader.colors = [
			"#000a12",
			"#0b4a6b",
			"#6fd8ff"
		];
		shader.parameters.speed = .3;
		description = "Slow blue currents of light flowing across the scene.";
	}
	return {
		id: `scene:${preset.id}`,
		name: preset.name,
		category: preset.occasion === "Christmas" ? "Holiday" : preset.occasion === "Party" ? "Geometric" : preset.occasion,
		description,
		shader
	};
});
var GALLERY_VISUALS = [...shaderVisuals, ...sceneVisuals];
var GALLERY_CATEGORIES = [
	"Abstract",
	"Tunnel",
	"Blobs",
	"Neon",
	"Synthwave",
	"Geometric",
	"Pixel",
	"Psychedelic",
	"Contours",
	"Ambient",
	"Eyes",
	"Halloween",
	"Holiday",
	"Window"
];
//#endregion
//#region src/ai/program.ts
var editable = new Set(mapCommands.filter((c) => c.writes && c.id !== "map.show.runprogram").map((c) => c.id));
/** Orchestration only: the same product commands prepare an isolated candidate.
* No editor/host write occurs until every command and assertion succeeds. */
function runProgram(show, encoded, run) {
	const program = object(jsonObject(encoded), [
		"version",
		"steps",
		"assertions"
	]);
	if (program.version !== 1 || !Array.isArray(program.steps) || !program.steps.length || program.steps.length > 32) throw Error("Use version 1 with 1–32 steps.");
	if (program.assertions !== void 0 && (!Array.isArray(program.assertions) || program.assertions.length > 16)) throw Error("Use at most 16 assertions.");
	const references = Object.create(null);
	const ids = /* @__PURE__ */ new Set();
	function resolve(value, depth = 0) {
		if (depth > 12) throw Error("Program arguments are nested too deeply.");
		if (Array.isArray(value)) return value.map((item) => resolve(item, depth + 1));
		if (!value || typeof value !== "object") return value;
		const record = object(value);
		if ("$ref" in record) {
			object(record, ["$ref"]);
			const match = typeof record.$ref === "string" && /^([a-zA-Z][a-zA-Z0-9_-]{0,39})\.(scene_id|surface_id|clip_id|asset_id|track_id)$/.exec(record.$ref);
			if (!match || !Object.hasOwn(references, match[1]) || !Object.hasOwn(references[match[1]], match[2])) throw Error("Reference must name an earlier created ID.");
			return references[match[1]][match[2]];
		}
		return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, resolve(item, depth + 1)]));
	}
	let candidate = structuredClone(show);
	for (const value of program.steps) {
		const step = object(value, [
			"id",
			"command",
			"arguments"
		]);
		if (typeof step.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(step.id) || ids.has(step.id)) throw Error("Use unique step IDs, starting with a letter, at most 40 characters.");
		ids.add(step.id);
		if (typeof step.command !== "string" || !editable.has(step.command)) throw Error("Choose an editing command from agent docs; nested programs are not allowed.");
		const args = object(resolve(step.arguments));
		if ([
			"app",
			"id",
			"expected_revision"
		].some((key) => Object.hasOwn(args, key))) throw Error("Program steps cannot choose file authority.");
		for (const key of ["source_json", "changes_json"]) if (args[key] && typeof args[key] === "object") args[key] = JSON.stringify(args[key]);
		try {
			const result = run(step.command, candidate, args);
			if (!result.document) throw Error("Step did not produce an edit.");
			candidate = result.document;
			references[step.id] = result.result.created ? object(result.result.created) : {};
		} catch (error) {
			throw Error(`Step ${step.id}: ${error.message}`);
		}
	}
	const assertions = (program.assertions ?? []).map((value) => {
		const check = object(resolve(value), [
			"scene_id",
			"time_s",
			"layer_count"
		]);
		if (typeof check.layer_count !== "number" || !Number.isInteger(check.layer_count) || check.layer_count < 0 || check.layer_count > 1e4) throw Error("Assertion layer_count must be an integer from 0 to 10000.");
		const verification = run("map.show.verify", candidate, {
			scene_id: check.scene_id,
			time_s: check.time_s
		}).result;
		if (verification.layer_count !== check.layer_count || !verification.valid) throw Error(`Composition assertion failed: expected ${check.layer_count} layers, got ${verification.layer_count}.`);
		return {
			...check,
			passed: true
		};
	});
	return {
		document: candidate,
		result: {
			steps: program.steps.length,
			references,
			assertions
		}
	};
}
var mappedVisualRecipe = {
	version: 1,
	steps: [
		{
			id: "scene",
			command: "map.scene.create",
			arguments: {
				name: "Agent light show",
				width_px: 1280,
				height_px: 720
			}
		},
		{
			id: "wall",
			command: "map.surface.create",
			arguments: {
				scene_id: { $ref: "scene.scene_id" },
				name: "Front wall"
			}
		},
		{
			id: "bounds",
			command: "map.surface.bounds",
			arguments: {
				scene_id: { $ref: "scene.scene_id" },
				surface_id: { $ref: "wall.surface_id" },
				x_px: 80,
				y_px: 60,
				width_px: 1120,
				height_px: 600
			}
		},
		{
			id: "visual",
			command: "map.visual.create",
			arguments: {
				scene_id: { $ref: "scene.scene_id" },
				name: "Neon wash",
				source_json: {
					kind: "gallery",
					id: "neon-beams:0"
				}
			}
		}
	],
	assertions: [{
		scene_id: { $ref: "scene.scene_id" },
		time_s: 5,
		layer_count: 1
	}]
};
//#endregion
//#region src/ai/knowledge.ts
function mapKnowledge(args) {
	const offset = args.offset ?? 0;
	const query = String(args.query ?? "").toLowerCase();
	const page = (items) => ({
		total: items.length,
		items: items.slice(offset, offset + 5),
		next_offset: offset + 5 < items.length ? offset + 5 : null
	});
	const base = {
		module: "AetherMap.AI",
		changed: false,
		units: "Scene pixels, seconds, opacity 0–1, rotation degrees.",
		mapping: {
			creation: "map.surface.create shape rectangle (default), cube (3 faces), box (5 faces); compound names must be unique folders.",
			cube_pose: "map.cube.pose uses any member surface_id, scene_id and mode rotate or inside-out. Rotation angles x_degrees/y_degrees/z_degrees are relative and applied X then Y then Z. Inside-out takes no angles. Requires three joined, unlocked faces. Saved corners are authoritative; pose angles are not persisted. Very large turns that hide or fold a face are refused."
		},
		workflow: [
			"Discover commands and gallery IDs.",
			"Inspect current identities.",
			"Execute individual edits or one atomic program.",
			"Verify composition at intended times; use mapping/source preview in the live editor.",
			"Save or undo using ordinary document history."
		]
	};
	switch (args.topic ?? "tools") {
		case "tools": return {
			...base,
			...page(mapCommands.filter((c) => (!args.name || c.id === args.name) && `${c.id} ${c.description}`.toLowerCase().includes(query)))
		};
		case "gallery": return {
			...base,
			categories: [...GALLERY_CATEGORIES, "Video loops"],
			bundled_video_loops: BUNDLED_LOOPS.filter((v) => `${v.id} ${v.name} ${v.description} video loops`.toLowerCase().includes(query)).map(({ id, name, description, width, height, duration, fps }) => ({
				id,
				name,
				description,
				width,
				height,
				duration_s: duration,
				fps
			})),
			video_loop_workflow: "Import through Visual gallery → Video loops in the editor. Then inspect the imported media ID and place it with source kind media. Loop IDs are not procedural gallery source IDs.",
			...page(GALLERY_VISUALS.filter((v) => `${v.id} ${v.name} ${v.category} ${v.description}`.toLowerCase().includes(query)).map(({ shader, ...v }) => ({
				...v,
				shader: {
					preset: shader.preset,
					colors: shader.colors,
					parameters: shader.parameters
				}
			})))
		};
		case "recipes": return {
			...base,
			recipe: mappedVisualRecipe,
			execution: {
				command: "map.show.runprogram",
				argument: "program_json: JSON.stringify(recipe)"
			},
			reference_syntax: "{$ref:\"earlierStep.created_field\"}",
			atomic: true
		};
		case "sources": return {
			...base,
			sources: [
				{
					kind: "gallery",
					id: "Use an ID returned by gallery discovery"
				},
				{
					kind: "color",
					color: "#RRGGBB"
				},
				{
					kind: "text",
					text: "Message",
					color: "#RRGGBB (optional)",
					size: "1–1000 (optional)"
				},
				{
					kind: "media",
					media_id: "Existing imported image/video ID"
				},
				{
					kind: "cast",
					note: "Shows whatever is cast to the player (Players → Cast into show)."
				},
				{
					kind: "web",
					url: "https://… opened in its own window over the surface on a player"
				}
			],
			effects: {
				kinds: VISUAL_EFFECTS.map((e) => ({
					kind: e.value,
					label: e.label,
					amount: {
						min: e.min,
						max: e.max,
						default: e.initial,
						label: e.amountLabel
					},
					description: e.help
				})),
				enabled: "boolean, defaults true",
				animation: "Optional [{id?,timeS,value,interpolation?:linear|smooth|hold}]. Source clock, 0–604800 seconds, unique times; value must be within effect bounds. null clears.",
				modulation: "Optional assignment described by parameter_motion. null clears."
			},
			visual_presets: {
				command: "map.visual.edit preset:{action:store|recall|clear,slot:A|B|C}; recall optionally accepts from_clip_id. Random uses preset:{action:random,seed:0..4294967295 integer}. Preset action runs after other edits in the same atomic command.",
				capture: "Concrete source and its motion, effects/amount motion, opacity, placement/visual motion and Repeat/Span mapping. Timing, targets, track, identity and layer order remain unchanged.",
				storage: "General slots require format11. Legacy shader slots retain shader-only behavior. Media in stored slots remains referenced. Snapshots are independent and do not contain other slot banks.",
				random: "Seeded valid shader variation/colors and changed continuous controls; non-shader colors and existing effect amounts, or a vintage effect for unchanged media/camera sources. No device activation; changed motion assignments clear, timing and saved slots remain."
			},
			parameter_motion: {
				surface: {
					command: "map.surface.animate with scene_id, surface_id, changes_json:{bases?,animation?,modulation?,bend_axis?}. All maps merge; null clears a channel or assignment map. Keys use local surface timeline time; shared LFO and clock:scene use Main scene time. Calibration freezes geometry and ignores live modulation. Manual control clears only its selected channel.",
					parameters: SURFACE_PARAMETERS,
					format: "Modulation and radius/bend keys require format12. Existing surface keys remain compatible. Bend affects Repeat mapping; Span preserves its shared picture. Radius affects rectangular outlines. No device activation."
				},
				source_parameters: {
					command: "map.visual.edit source_parameters sets numeric bases and preserves assignments. source_motion.animation/modulation maps merge; null clears a channel, a map or all source motion. Only parameters used by the current source are accepted. Inspect source_parameter_specs for available keys, bounds and named options; replace the source to change its kind.",
					parameters: SOURCE_MOTION_PARAMETERS,
					colors: "color:<binding>:hueDeg|saturationPercent|brightnessPercent|alphaPercent. Bindings cover fill, text, textBackground, tracker, chroma (HSV only), gradient:0..15, shader:palette:0..9, shader:parameter:<name>. RGB-only original generators omit palette alpha; use visual opacity. Colors use source-time keys (shader channels honor its reverse/loop/offset/freeze clock); source color fields remain the only base.",
					choices: "choice:<name> uses integer option indices, hold keyframes (default), nearest-index modulation and named options from inspection. Only active source options are accepted; base changes preserve assignments.",
					format: "Numeric source motion requires format9; color/choice motion requires format10. Media crops are jointly bounded to the image/video dimensions; nested clips use their own source clock, shared LFOs use scene time. No device activation."
				},
				visual: {
					command: "map.visual.edit motion.animation and motion.modulation are maps. Entries merge; null clears a channel, a map or all motion. Base opacity/placement edits preserve motion; clear the channel for manual control.",
					parameters: VISUAL_MOTION_PARAMETERS.map(({ key, min, max, unit }) => ({
						key,
						min,
						max,
						unit
					})),
					compound: "Timeline instances support opacityPercent only; audio and mask clips reject picture motion.",
					format: "Shows with visual motion require format 8. Ordinary older shows keep their version."
				},
				shader: "map.visual.edit shader.animation and shader.modulation are maps keyed by an existing numeric parameter. Entries merge; null clears one parameter, or null for the whole map clears all.",
				order: "Source-time keyframes set the base; modulation follows. Absolute ranges replace the base; legacy amount adds to it.",
				source: "time|lfo|audio|midi|body",
				bodySignal: BODY_SIGNALS.map((s) => ({
					id: s.value,
					label: s.label,
					description: s.help
				})),
				body_tracking: "Explicit operator Start body tracking in modulation controls; saved assignments do not start camera. Missing/occluded signals are zero.",
				range: "Optional {min,max}; invert:true flips it.",
				periodS: ".02–3600 seconds",
				phase: "Cycle offset",
				waveform: "sine|triangle|square|ramp",
				lfoIndex: "0–3 shared oscillators on scene time",
				clock: "Optional scene; otherwise local source time for time cycles",
				band: "low|mid|high|level",
				audioSignal: "Optional beat",
				control: "MIDI CC 0–127; existing assignments also drive optional Launch Control XL MK1/MK2 lights. Operator starts MIDI and enables feedback in MIDI controllers; agent edits never acquire devices. Green is assigned, amber is the selected visual, brightness is raw input level. No SysEx or hardware-template edits.",
				limits: "1000 keys per parameter, 256 parameters, finite bounded numbers; invalid writes are atomic failures."
			},
			limits: [
				"Media must already be imported; agents cannot fetch URLs or access the camera.",
				"Verification evaluates actual composition but does not claim rendered pixels or asset download availability.",
				"Programs do not run arbitrary scripts or start device output."
			]
		};
		default: throw Error("Unknown documentation topic.");
	}
}
//#endregion
//#region src/ai/proof.ts
function verifyShow(show, evaluated) {
	parseShow(serializeShow(show));
	const issues = [];
	for (const clip of show.visuals ?? []) {
		if (clip.assetID && !show.pool?.some((a) => a.id === clip.assetID)) issues.push({
			clip_id: clip.id,
			problem: "Missing asset"
		});
		if (clip.trackID && !show.tracks?.some((t) => t.id === clip.trackID)) issues.push({
			clip_id: clip.id,
			problem: "Missing track"
		});
		if (clip.timelineRefID && !show.timelines?.some((t) => t.id === clip.timelineRefID)) issues.push({
			clip_id: clip.id,
			problem: "Missing nested timeline"
		});
		const source = visualSource(show, clip);
		if (source.mediaId && !show.media.some((m) => m.id === source.mediaId)) issues.push({
			clip_id: clip.id,
			problem: "Missing media metadata"
		});
		for (const target of clip.targets) {
			const scene = show.scenes.find((s) => s.id === target.sceneID);
			if (!scene || target.surfaceID && !scene.surfaces.some((s) => s.id === target.surfaceID)) issues.push({
				clip_id: clip.id,
				problem: "Missing target"
			});
		}
	}
	const layers = evaluated.layers;
	return {
		changed: false,
		valid: issues.length === 0,
		round_trip: true,
		scene_id: evaluated.scene_id,
		time_s: evaluated.time_s,
		evaluation: "canonical Main composition",
		pixel_preview: false,
		layer_count: layers.length,
		visible_layer_count: layers.filter((layer) => layer.opacity > 0).length,
		blackout: !!show.output.blackout,
		issues: issues.slice(0, 25),
		issue_count: issues.length,
		layers: layers.slice(0, 15).map(({ masks, ...layer }) => ({
			...layer,
			mask_count: masks.length
		})),
		returned_layers: Math.min(15, layers.length),
		complete_layers: layers.length <= 15
	};
}
//#endregion
//#region src/ai/visuals.ts
function color(value) {
	if (typeof value !== "string" || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) throw Error("Use a hex color: #RRGGBB or #RRGGBBAA.");
	return value;
}
function visualSourceSpec(show, value) {
	const spec = object(value);
	const source = {
		mediaId: null,
		rect: [
			0,
			0,
			1920,
			1080
		]
	};
	switch (spec.kind) {
		case "gallery": {
			object(spec, ["kind", "id"]);
			const preset = GALLERY_VISUALS.find((item) => item.id === spec.id);
			if (!preset) throw Error("Unknown gallery ID. Discover the gallery first.");
			return {
				...source,
				shader: structuredClone(preset.shader)
			};
		}
		case "color":
			object(spec, ["kind", "color"]);
			return {
				...source,
				fill: color(spec.color)
			};
		case "text":
			object(spec, [
				"kind",
				"text",
				"color",
				"size"
			]);
			if (typeof spec.text !== "string" || !spec.text.trim() || spec.text.length > 2e3) throw Error("Text must contain 1–2000 characters.");
			return {
				...source,
				text: {
					...DEFAULT_TEXT,
					text: spec.text,
					...spec.color !== void 0 ? { color: color(spec.color) } : {},
					...spec.size !== void 0 ? { sizePx: number(spec.size, "text size", 1, 1e3) } : {}
				}
			};
		case "media": {
			object(spec, ["kind", "media_id"]);
			const media = show.media.find((item) => item.id === spec.media_id);
			if (!media || media.kind === "audio") throw Error("Choose an existing image or video media ID. Import the file first.");
			return {
				...source,
				mediaId: media.id,
				rect: [
					0,
					0,
					media.width,
					media.height
				]
			};
		}
		case "cast":
			object(spec, ["kind"]);
			return {
				...source,
				cast: true
			};
		case "web":
			object(spec, ["kind", "url"]);
			if (typeof spec.url !== "string" || !/^https:\/\/\S{1,2040}$/.test(spec.url)) throw Error("Web address must be an https:// URL without spaces.");
			return {
				...source,
				web: { url: spec.url }
			};
		default: throw Error("Source kind must be gallery, color, text, media, cast or web.");
	}
}
function createAgentVisual(show, args) {
	if (!show.scenes.some((scene) => scene.id === args.scene_id)) throw Error("Scene not found.");
	if ((show.visuals?.length ?? 0) >= 4096) throw Error("Visual creation exceeds the 4096-visual limit.");
	const next = addSimpleVisual({
		...show,
		activeSceneId: args.scene_id,
		activeTimelineID: MAIN_TIMELINE
	}, visualSourceSpec(show, jsonObject(args.source_json)), name(args.name));
	const visual = next.visuals.at(-1);
	return {
		show: {
			...next,
			activeSceneId: show.activeSceneId,
			activeTimelineID: show.activeTimelineID
		},
		created: {
			clip_id: visual.id,
			asset_id: visual.assetID,
			track_id: visual.trackID
		}
	};
}
function editAgentVisual(show, args) {
	const visual = show.visuals?.find((item) => item.id === args.clip_id);
	if (!visual) throw Error("Visual not found.");
	if (visualIsLocked(show, visual)) throw Error("The visual or its track is locked.");
	if (visual.mask || show.tracks?.find((t) => t.id === visual.trackID)?.kind === "audio") throw Error("Choose a visual or timeline clip, not a mask or audio clip.");
	const changes = object(jsonObject(args.changes_json), visual.timelineRefID ? [
		"name",
		"opacity",
		"enabled",
		"loop",
		"start_s",
		"duration_s",
		"motion"
	] : [
		"name",
		"opacity",
		"enabled",
		"mapping",
		"continuous",
		"loop",
		"start_s",
		"duration_s",
		"source",
		"targets",
		"placement",
		"effects",
		"shader",
		"motion",
		"source_parameters",
		"source_motion",
		"preset"
	]);
	if (!Object.keys(changes).length) throw Error("Supply at least one visual change.");
	let next = show;
	if (changes.source !== void 0) next = replaceSimpleVisual(show, visual.id, visualSourceSpec(show, changes.source), visual.name);
	let edited = { ...next.visuals.find((v) => v.id === visual.id) };
	if (changes.name !== void 0) edited.name = name(changes.name);
	if (changes.opacity !== void 0) edited.opacity = number(changes.opacity, "opacity", 0, 1);
	for (const key of [
		"enabled",
		"continuous",
		"loop"
	]) if (changes[key] !== void 0) {
		if (typeof changes[key] !== "boolean") throw Error(`${key} must be true or false.`);
		edited[key] = changes[key];
	}
	if (changes.mapping !== void 0) {
		if (!["repeat", "span"].includes(changes.mapping)) throw Error("Mapping must be repeat or span.");
		edited.mapping = changes.mapping;
	}
	if (changes.start_s !== void 0) edited.startS = number(changes.start_s, "start_s", 0, 604800);
	if (changes.duration_s !== void 0) edited.durationS = number(changes.duration_s, "duration_s", .001, 604800);
	if (edited.startS + edited.durationS > 604800) throw Error("A clip must end within seven days.");
	if (changes.targets !== void 0) {
		if (!Array.isArray(changes.targets) || changes.targets.length > 256) throw Error("Use at most 256 targets.");
		edited.targets = changes.targets.map((value) => {
			const target = object(value, ["scene_id", "surface_id"]);
			const scene = show.scenes.find((s) => s.id === target.scene_id);
			if (!scene) throw Error("Target scene not found.");
			if (target.surface_id !== void 0 && !scene.surfaces.some((s) => s.id === target.surface_id && s.kind !== "mask" && !s.sceneCanvas)) throw Error("Target surface not found or is not a mapping surface.");
			return {
				sceneID: scene.id,
				...target.surface_id !== void 0 ? { surfaceID: target.surface_id } : {}
			};
		});
		if (new Set(edited.targets.map((t) => JSON.stringify(t))).size !== edited.targets.length) throw Error("Duplicate targets are not allowed.");
		edited.legacyTrack = void 0;
	}
	if (changes.placement !== void 0) {
		const values = object(changes.placement, Object.keys(DEFAULT_PLACEMENT));
		const placement = {
			...DEFAULT_PLACEMENT,
			...edited.placement
		};
		for (const key of Object.keys(values)) {
			const size = key === "widthPercent" || key === "heightPercent", rotation = key === "rotationDeg";
			placement[key] = number(values[key], key, size ? .1 : rotation ? -3600 : -1e3, size ? 2e3 : rotation ? 3600 : 1e3);
		}
		edited.placement = placement;
	}
	if (changes.motion !== void 0) {
		if (changes.motion === null) edited.motion = void 0;
		else {
			const raw = object(changes.motion, ["animation", "modulation"]);
			const specs = VISUAL_MOTION_PARAMETERS.filter((p) => !visual.timelineRefID || p.key === "opacityPercent");
			const motion = { ...edited.motion };
			for (const field of ["animation", "modulation"]) if (raw[field] !== void 0) {
				if (raw[field] === null) {
					delete motion[field];
					continue;
				}
				const values = object(raw[field], specs.map((p) => p.key));
				for (const [key, value] of Object.entries(values)) {
					const spec = specs.find((p) => p.key === key);
					if (field === "animation") {
						const assignments = { ...motion.animation }, keys = parameterKeys(value, spec.min, spec.max);
						if (keys) assignments[spec.key] = keys;
						else delete assignments[spec.key];
						motion.animation = assignments;
					} else {
						const assignments = { ...motion.modulation }, assignment = parameterModulation(value, spec.min, spec.max);
						if (assignment) assignments[spec.key] = assignment;
						else delete assignments[spec.key];
						motion.modulation = assignments;
					}
				}
			}
			edited.motion = readVisualMotion(motion, !!visual.timelineRefID);
		}
	}
	if (changes.source_parameters !== void 0 || changes.source_motion !== void 0) {
		let source = visualSource(next, edited);
		const media = show.media.find((m) => m.id === source.mediaId), specs = sourceParameters(source, media);
		if (changes.source_parameters !== void 0) {
			const values = object(changes.source_parameters, specs.map((p) => p.key));
			const bases = Object.fromEntries(Object.entries(values).map(([key, value]) => {
				const spec = specs.find((p) => p.key === key);
				const n = number(value, key, spec.min, spec.max);
				if (spec.options && !Number.isInteger(n)) throw Error("Choice values must be integer indices.");
				return [key, n];
			}));
			source = setSourceMotionBases(source, bases, media);
		}
		if (changes.source_motion !== void 0) {
			if (changes.source_motion === null) source = {
				...source,
				motion: void 0
			};
			else {
				const raw = object(changes.source_motion, ["animation", "modulation"]), motion = { ...source.motion };
				for (const field of ["animation", "modulation"]) if (raw[field] !== void 0) {
					if (raw[field] === null) {
						delete motion[field];
						continue;
					}
					const values = object(raw[field], specs.map((p) => p.key));
					for (const [key, value] of Object.entries(values)) {
						const spec = specs.find((p) => p.key === key);
						if (field === "animation") {
							const assignments = { ...motion.animation }, keys = parameterKeys(value, spec.min, spec.max, !!spec.options);
							if (keys) assignments[spec.key] = keys;
							else delete assignments[spec.key];
							motion.animation = assignments;
						} else {
							const assignments = { ...motion.modulation }, m = parameterModulation(value, spec.min, spec.max);
							if (m) assignments[spec.key] = m;
							else delete assignments[spec.key];
							motion.modulation = assignments;
						}
					}
				}
				if ((/* @__PURE__ */ new Set([...Object.keys(motion.animation ?? {}), ...Object.keys(motion.modulation ?? {})])).size > 256) throw Error(`Use at most 256 source motion channels; clear an unused channel first.`);
				source = {
					...source,
					motion: readSourceMotion(motion)
				};
			}
		}
		edited = {
			...edited,
			source
		};
	}
	if (changes.effects !== void 0) {
		if (!Array.isArray(changes.effects) || changes.effects.length > 12) throw Error("Use at most 12 effects.");
		edited.effects = changes.effects.map((value) => {
			const e = object(value, [
				"kind",
				"amount",
				"enabled",
				"modulation",
				"animation"
			]);
			if (!isEffectKind(e.kind)) throw Error("Unknown effect kind.");
			if (e.enabled !== void 0 && typeof e.enabled !== "boolean") throw Error("Effect enabled must be boolean.");
			return {
				id: crypto.randomUUID(),
				kind: e.kind,
				amount: effectAmount(e.kind, number(e.amount, "effect amount", effectDefinition(e.kind).min, effectDefinition(e.kind).max)),
				enabled: e.enabled !== false,
				...e.modulation !== void 0 ? { modulation: parameterModulation(e.modulation, effectDefinition(e.kind).min, effectDefinition(e.kind).max) } : {},
				...e.animation !== void 0 ? { animation: parameterKeys(e.animation, effectDefinition(e.kind).min, effectDefinition(e.kind).max) } : {}
			};
		});
	}
	if (changes.shader !== void 0) {
		const source = structuredClone(visualSource(next, edited));
		if (!source.shader) throw Error("This visual is not a shader.");
		const values = object(changes.shader, [
			"colors",
			"speed",
			"scale",
			"density",
			"glow",
			"animation",
			"modulation"
		]);
		if (values.colors !== void 0) {
			if (!Array.isArray(values.colors) || !values.colors.length || values.colors.length > 8) throw Error("Use 1–8 shader colors.");
			source.shader.colors = values.colors.map(color);
		}
		for (const key of [
			"speed",
			"scale",
			"density",
			"glow"
		]) if (values[key] !== void 0) {
			if (typeof source.shader.parameters[key] !== "number") throw Error(`This shader does not offer ${key}.`);
			source.shader.parameters[key] = number(values[key], key, key === "speed" ? -10 : 0, key === "scale" ? 20 : 10);
		}
		const numeric = Object.keys(source.shader.parameters).filter((key) => typeof source.shader.parameters[key] === "number" && ![
			"__proto__",
			"constructor",
			"prototype"
		].includes(key));
		for (const field of ["animation", "modulation"]) if (values[field] !== void 0) {
			if (values[field] === null) {
				delete source.shader[field];
				continue;
			}
			const motion = object(values[field], numeric);
			if (Object.keys(motion).length > 256) throw Error("Use at most 256 parameter assignments.");
			for (const [key, value] of Object.entries(motion)) if (field === "animation") {
				const next = parameterKeys(value), assignments = { ...source.shader.animation };
				if (next) assignments[key] = next;
				else delete assignments[key];
				source.shader.animation = assignments;
			} else {
				const next = parameterModulation(value), assignments = { ...source.shader.modulation };
				if (next) assignments[key] = next;
				else delete assignments[key];
				source.shader.modulation = assignments;
			}
		}
		edited = {
			...edited,
			source
		};
	}
	if (changes.preset !== void 0) {
		const preset = object(changes.preset, [
			"action",
			"slot",
			"from_clip_id",
			"seed"
		]);
		if (![
			"store",
			"recall",
			"clear",
			"random"
		].includes(String(preset.action))) throw Error("Preset action must be store, recall, clear or random.");
		if (preset.action === "random") {
			if (preset.slot !== void 0 || preset.from_clip_id !== void 0) throw Error("Random uses a seed, not a slot or source clip.");
			edited = randomVisualLook(next, edited, number(preset.seed, "random seed", 0, 4294967295));
		} else {
			const slot = VISUAL_LOOK_SLOTS.find((s) => s === preset.slot);
			if (!slot || preset.seed !== void 0) throw Error("Choose preset A, B or C.");
			if (preset.action !== "recall" && preset.from_clip_id !== void 0) throw Error("A source clip is only used when recalling a preset.");
			const from = preset.from_clip_id === void 0 ? edited : next.visuals?.find((v) => v.id === preset.from_clip_id);
			if (!from) throw Error("Preset source visual not found.");
			edited = preset.action === "store" ? storeVisualLook(next, edited, slot) : preset.action === "clear" ? clearVisualLook(next, edited, slot) : recallVisualLook(next, edited, slot, from);
		}
	}
	return visualLookVersion(sourceMotionVersion(visualMotionVersion({
		...next,
		visuals: next.visuals.map((v) => v.id === edited.id ? edited : v)
	})));
}
//#endregion
//#region src/automation/commands.ts
/** Saved-document automation. UI and agents use the same parser, edits and evaluator. */
function sourceSummary(source, media) {
	return {
		kind: source.text ? "text" : source.shader ? "shader" : source.webcam ? "webcam" : source.tracker ? "tracker" : source.drawing ? "drawing" : source.mediaId ? "media" : "fill",
		media_id: source.mediaId,
		fill: source.fill,
		source_parameters: Object.fromEntries(sourceParameters(source, media).map((p) => [p.key, p.base])),
		source_parameter_specs: sourceParameters(source, media).map(({ key, label, min, max, step, unit, options }) => ({
			key,
			label,
			min,
			max,
			step,
			unit,
			...options ? {
				options,
				interpolation: "hold"
			} : {}
		})),
		source_motion: source.motion,
		...source.shader ? { shader: structuredClone(source.shader) } : {},
		...source.text ? {
			text: source.text.text.slice(0, 500),
			text_size_px: source.text.sizePx
		} : {}
	};
}
function surfaceAutomationSummary(surface) {
	return {
		surface_parameters: Object.fromEntries(SURFACE_PARAMETERS.map((p) => [p.key, surfaceParameterBase(surface, p.key)])),
		surface_parameter_specs: SURFACE_PARAMETERS,
		animation: surface.animation,
		modulation: surface.modulation,
		bend_axis: surface.bend?.axis ?? "horizontal"
	};
}
function describe(show) {
	return {
		version: show.version,
		active_scene_id: show.activeSceneId,
		scenes: show.scenes.map((s) => ({
			id: s.id,
			name: s.name,
			duration_s: s.durationS,
			suppressed: !!s.suppressed,
			artboard: s.artboard,
			hotkey: s.hotkey ?? null,
			surfaces: s.surfaces.map((p) => ({
				id: p.id,
				name: p.name,
				enabled: p.enabled,
				locked: !!p.locked,
				corners: p.corners,
				folder: p.folder,
				group_shape: p.groupShape,
				...surfaceAutomationSummary(p)
			}))
		})),
		timelines: show.timelines ?? [],
		tracks: show.tracks ?? [],
		show: describeShowTimeline(show),
		assets: (show.pool ?? []).map((a) => ({
			id: a.id,
			name: a.name,
			...sourceSummary(a.source, show.media.find((m) => m.id === a.source.mediaId))
		})),
		clips: (show.visuals ?? []).map((v) => ({
			id: v.id,
			name: v.name,
			track_id: v.trackID,
			asset_id: v.assetID,
			timeline_id: v.timelineRefID,
			targets: v.targets,
			start_s: v.startS,
			duration_s: v.durationS,
			in_s: v.inS,
			loop: v.loop,
			continuous: !!v.continuous,
			enabled: v.enabled !== false,
			locked: !!v.locked,
			opacity: v.opacity,
			mapping: v.mapping,
			presets: VISUAL_LOOK_SLOTS.filter((slot) => hasVisualLook(show, v, slot)).map((slot) => ({
				slot,
				kind: v.looks?.[slot] && !v.looks[slot].shaderOnly ? "visual" : "legacy_shader",
				media_id: v.looks?.[slot]?.source.mediaId ?? null
			})),
			effects: v.effects,
			placement: v.placement,
			motion: v.motion,
			...sourceSummary(visualSource(show, v), show.media.find((m) => m.id === visualSource(show, v).mediaId))
		}))
	};
}
function finiteTime(value) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 604800) throw new Error("Time must be between zero and 604800 seconds.");
}
function runCommand(command, content, args) {
	const { document, result } = runDocumentCommand(command, normalizeDocument(parseShow(content)), args);
	return {
		result,
		...document ? { content: new TextDecoder().decode(serializeShow(document)) } : {}
	};
}
/** One mutation/evaluation path for saved workers and the live editor. No IO or history. */
function runDocumentCommand(command, show, args) {
	validateCommand(command, args);
	if (command === "map.agent.docs") return { result: mapKnowledge(args) };
	if (command === "map.show.runprogram") return runProgram(show, args.program_json, runDocumentCommand);
	if (command === "map.show.verify") return { result: verifyShow(show, runDocumentCommand("map.show.evaluate", show, args).result) };
	if (command === "map.visual.create" || command === "map.visual.edit") {
		const created = command === "map.visual.create" ? createAgentVisual(show, args) : void 0;
		const next = normalizeDocument(created?.show ?? editAgentVisual(show, args));
		parseShow(serializeShow(next));
		return {
			document: next,
			result: {
				...created ? { created: created.created } : { clip_id: args.clip_id },
				...describe(next)
			}
		};
	}
	if (command === "map.surface.animate") {
		const scene = show.scenes.find((s) => s.id === args.scene_id);
		const surface = scene?.surfaces.find((s) => s.id === args.surface_id);
		if (!surface) throw Error("Surface not found. Inspect the show first.");
		const edited = editSurfaceAutomation(surface, jsonObject(args.changes_json));
		const next = normalizeDocument({
			...show,
			scenes: show.scenes.map((s) => s === scene ? {
				...s,
				surfaces: s.surfaces.map((p) => p === surface ? edited : p)
			} : s)
		});
		parseShow(serializeShow(next));
		return {
			document: next,
			result: {
				surface_id: surface.id,
				...surfaceAutomationSummary(edited)
			}
		};
	}
	if (command === "map.show.inspect") return { result: describe(show) };
	if (command === "map.show.clip.add" || command === "map.show.cue.add") {
		const next = normalizeDocument(command === "map.show.clip.add" ? addShowClip(show, args) : addShowCue(show, args));
		parseShow(serializeShow(next));
		const timeline = activeShow(next);
		return {
			document: next,
			result: {
				created: command === "map.show.clip.add" ? { clip_id: timeline.tracks.flatMap((t) => t.clips).at(-1).id } : { cue_id: timeline.cues.at(-1).id },
				show: describeShowTimeline(next)
			}
		};
	}
	if (command === "map.show.evaluate") {
		finiteTime(args.time_s);
		if (!show.scenes.some((s) => s.id === args.scene_id)) throw new Error("Scene not found.");
		const output = {
			...show,
			activeSceneId: args.scene_id,
			activeTimelineID: MAIN_TIMELINE,
			mix: void 0
		};
		const layers = sceneLayers(output).flatMap(({ scene, opacity }) => sceneVisuals$1(output, scene, args.time_s).map((s) => ({
			id: s.id,
			name: s.name,
			opacity: opacity * s.opacity,
			corners: s.corners,
			masks: s.masks,
			radius_px: s.radiusPx,
			bend: s.bend,
			media_time_s: s.mediaTimeS,
			placement: s.visualPlacement,
			...sourceSummary(s.source, show.media.find((m) => m.id === s.source.mediaId)),
			...s.source.shader ? { evaluated_shader: shaderAt(s.source.shader, shaderTimeS(s.source.shader.time, s.mediaTimeS), void 0, void 0, show.lfos, args.time_s).parameters } : {},
			effects: (s.source.effects ?? []).filter((e) => e.enabled).map((e) => ({
				id: e.id,
				kind: e.kind,
				amount: effectValueAt(e, s.mediaTimeS, args.time_s, void 0, void 0, show.lfos)
			}))
		})));
		return { result: {
			scene_id: args.scene_id,
			time_s: args.time_s,
			evaluation: "scene-composition",
			pixel_preview: false,
			live_inputs: "Audio, MIDI and body tracking are zero in saved evaluation.",
			blackout: !!show.output.blackout,
			layers,
			audio: timelineAudio(output, args.time_s)
		} };
	}
	if (command === "map.scene.create" || command === "map.surface.create" || command === "map.asset.place") {
		const created = command === "map.asset.place" ? placeAsset(show, args) : createInShow(command, show, args);
		const next = normalizeDocument(created.show);
		parseShow(new TextDecoder().decode(serializeShow(next)));
		return {
			result: {
				...describe(next),
				created: created.created
			},
			document: next
		};
	}
	if (command === "map.scene.hotkey") {
		if (!show.scenes.some((s) => s.id === args.scene_id)) throw Error("Scene not found. Inspect the show first.");
		if (args.hotkey !== "none" && !isHotkey(args.hotkey)) throw Error("Hotkey must be F1–F12 or none.");
		const next = normalizeDocument({
			...show,
			scenes: show.scenes.map(({ hotkey, ...s }) => s.id === args.scene_id ? args.hotkey === "none" ? s : {
				...s,
				hotkey: args.hotkey
			} : hotkey && hotkey !== args.hotkey ? {
				...s,
				hotkey
			} : s)
		});
		parseShow(serializeShow(next));
		return {
			result: describe(next),
			document: next
		};
	}
	if (command === "map.cube.pose") {
		if (!show.scenes.find((s) => s.id === args.scene_id)?.surfaces.some((s) => s.id === args.surface_id)) throw Error("Cube face not found in the specified scene.");
		const angles = [
			args.x_degrees,
			args.y_degrees,
			args.z_degrees
		];
		if (args.mode === "inside-out" && angles.some((v) => v !== void 0)) throw Error("Inside-out takes no rotation angles.");
		if (args.mode === "rotate" && !angles.some((v) => v)) throw Error("Supply at least one nonzero angle in degrees.");
		const next = normalizeDocument(poseCube(show, args.surface_id, {
			insideOut: args.mode === "inside-out",
			xDegrees: args.x_degrees,
			yDegrees: args.y_degrees,
			zDegrees: args.z_degrees
		}));
		parseShow(serializeShow(next));
		const changedIDs = next.scenes.flatMap((s) => s.surfaces.filter((surface) => {
			const before = show.scenes.find((old) => old.id === s.id)?.surfaces.find((old) => old.id === surface.id);
			return JSON.stringify(surface) !== JSON.stringify(before);
		}).map((s) => s.id));
		return {
			result: {
				...describe(next),
				changed_surface_ids: changedIDs
			},
			document: next
		};
	}
	if (command === "map.surface.bounds" || command === "map.surface.rotate") {
		const changed = editGeometry(command, show, args);
		const next = normalizeDocument(changed.show);
		parseShow(new TextDecoder().decode(serializeShow(next)));
		return {
			result: {
				...describe(next),
				changed_surface_ids: changed.changedIDs
			},
			document: next
		};
	}
	if (!["map.clip.move", "map.clip.edit"].includes(command)) throw new Error("Unknown Map command.");
	const clip = show.visuals?.find((v) => v.id === args.clip_id);
	if (!clip) throw new Error("Clip not found. Inspect the show first.");
	if (!clipEditable(show, clip.id)) throw new Error("The clip or its track is locked.");
	let next;
	if (command === "map.clip.move") {
		finiteTime(args.start_s);
		if (!show.tracks?.some((t) => t.id === args.track_id)) throw new Error("Track not found.");
		const track = show.tracks.find((t) => t.id === args.track_id);
		const sceneID = track.targets[0]?.sceneID ?? show.activeSceneId;
		const context = {
			...show,
			activeSceneId: sceneID
		};
		const moved = moveTimelineClip(context, clip.id, track.id, args.start_s);
		if (moved === context) throw new Error("Move refused: check track locks, media type and timeline nesting.");
		next = {
			...moved,
			activeSceneId: show.activeSceneId
		};
	} else {
		const action = args.action;
		if (!action || ![
			"duplicate",
			"split",
			"delete",
			"trim-start",
			"trim-end"
		].includes(action)) throw new Error("Unsupported clip action.");
		if ([
			"split",
			"trim-start",
			"trim-end"
		].includes(action)) finiteTime(args.time_s);
		next = editTimelineClip(show, clip.id, action, args.time_s ?? 0);
		if (next === show) throw new Error("Edit refused: check clip boundaries and continuous playback.");
	}
	next = normalizeDocument(next);
	parseShow(new TextDecoder().decode(serializeShow(next)));
	return {
		result: describe(next),
		document: next
	};
}
//#endregion
//#region src/ai/cli.ts
/** Local-file CLI / MCP adapter. File authority is fixed by the launch command. */
var options = argv.slice(3);
var mode = argv[2];
var option = (name) => {
	const at = options.indexOf(name);
	return at < 0 ? void 0 : options[at + 1];
};
var filename = option("--file");
var writable = options.includes("--write");
var path = filename ? resolve(filename) : null;
var hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function read() {
	if (!path) throw Error("Launch with --file /absolute/show.aethermap.");
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4194304) throw Error("Choose a regular show file no larger than 4 MiB.");
	return readFileSync(path, "utf8");
}
function execute(command, input) {
	const { expected_sha256, ...productArgs } = object(input);
	if ([
		"app",
		"id",
		"expected_revision"
	].some((key) => Object.hasOwn(productArgs, key))) throw Error("Local commands cannot choose Studio file authority.");
	const descriptor = mapCommands.find((c) => c.id === command);
	if (!descriptor) throw Error("Unknown command.");
	const content = read(), before = hash(content);
	if (descriptor.writes && (!writable || expected_sha256 !== before)) throw Error("Editing requires --write and the current expected_sha256 returned by inspection.");
	const result = runCommand(command, content, productArgs);
	if (result.content !== void 0) {
		if (hash(read()) !== before) throw Error("The file changed while preparing this command. Inspect again.");
		const bytes = result.content;
		if (Buffer.byteLength(bytes) > 4194304) throw Error("Result exceeds 4 MiB.");
		const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
		try {
			writeFileSync(temp, bytes, {
				flag: "wx",
				mode: 384
			});
			renameSync(temp, path);
		} finally {
			try {
				unlinkSync(temp);
			} catch {}
		}
	}
	return {
		changed: result.content !== void 0,
		file_sha256: hash(result.content ?? content),
		result: result.result
	};
}
var localTools = mapCommands.filter((c) => writable || !c.writes).map((c) => ({
	name: c.id.replaceAll(".", "_"),
	description: c.description,
	inputSchema: {
		...c.inputSchema,
		properties: {
			...c.inputSchema.properties,
			...c.writes ? { expected_sha256: {
				type: "string",
				minLength: 64,
				maxLength: 64,
				description: "Current file hash from inspection; refuses stale edits."
			} } : {}
		},
		required: [...c.inputSchema.required, ...c.writes ? ["expected_sha256"] : []]
	}
}));
function mcp() {
	read();
	const receipts = /* @__PURE__ */ new Map();
	createInterface({
		input: stdin,
		crlfDelay: Infinity
	}).on("line", (line) => {
		let id = null;
		try {
			if (Buffer.byteLength(line) > 262144) throw Error("MCP request exceeds 256 KiB.");
			const request = object(JSON.parse(line));
			if (!Object.hasOwn(request, "id")) return;
			id = request.id;
			const key = JSON.stringify(id), previous = receipts.get(key);
			if (previous) {
				if (previous.request !== line) throw Error("Request ID reused with different arguments.");
				stdout.write(JSON.stringify(previous.response) + "\n");
				return;
			}
			let result;
			switch (request.method) {
				case "initialize":
					result = {
						protocolVersion: "2024-11-05",
						capabilities: { tools: {} },
						serverInfo: {
							name: "aether-map",
							version: "1.0.0"
						}
					};
					break;
				case "ping":
					result = {};
					break;
				case "tools/list":
					result = { tools: localTools };
					break;
				case "tools/call": {
					const params = object(request.params), tool = localTools.find((t) => t.name === params.name);
					if (!tool) throw Error("Tool unavailable in this connection.");
					try {
						result = { content: [{
							type: "text",
							text: JSON.stringify(execute(tool.name.replaceAll("_", "."), params.arguments ?? {}))
						}] };
					} catch (error) {
						result = {
							isError: true,
							content: [{
								type: "text",
								text: error.message
							}]
						};
					}
					break;
				}
				default: throw Error("Unsupported MCP method.");
			}
			const response = {
				jsonrpc: "2.0",
				id,
				result
			};
			receipts.set(key, {
				request: line,
				response
			});
			if (receipts.size > 100) receipts.delete(receipts.keys().next().value);
			stdout.write(JSON.stringify(response) + "\n");
		} catch (error) {
			stdout.write(JSON.stringify({
				jsonrpc: "2.0",
				id,
				error: {
					code: -32602,
					message: error.message
				}
			}) + "\n");
		}
	});
}
try {
	if (mode === "mcp") mcp();
	else if (mode === "catalog") stdout.write(JSON.stringify({ tools: localTools }) + "\n");
	else if (mode === "init") {
		if (!path) throw Error("Use --file for the new show. Existing files are never overwritten.");
		const bytes = serializeShow(normalizeDocument(emptyShow()));
		writeFileSync(path, bytes, {
			flag: "wx",
			mode: 384
		});
		stdout.write(JSON.stringify({
			created: true,
			file_sha256: hash(bytes)
		}) + "\n");
	} else if (mode === "inspect") stdout.write(JSON.stringify(execute("map.show.inspect", {})) + "\n");
	else if (mode === "run") {
		const args = JSON.parse(readFileSync(stdin.fd, "utf8"));
		stdout.write(JSON.stringify(execute(option("--command") ?? "", {
			...object(args),
			...option("--expected-sha256") ? { expected_sha256: option("--expected-sha256") } : {}
		})) + "\n");
	} else throw Error("Use init, inspect, catalog, run --command map.…, or mcp; --file selects the show; --write permits guarded edits.");
} catch (error) {
	stdout.write(JSON.stringify({ error: error.message }) + "\n");
	process.exitCode = 1;
}
//#endregion
export {};
