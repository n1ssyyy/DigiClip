// The looks that ship with the app. A starter is design only: the options a
// preset would hold for the style, the overlays and the Look sections, and
// nothing about the cut (how clips are picked, their count and length,
// tighten, focus, caption language), nothing about where the video is posted
// (the shape) and no file or typed text (logo, music, headline text).
// Applying one leaves those as the person has them (`applyStarter` in
// lookLibrary.js).
//
// Written in the engine's option form, like a preset, so the same code reads
// both. Every number sits inside its field's range and every colour is
// upper-case `#RRGGBB`, so the store's own cleaning leaves a starter as it is
// (tested). Names and one-line descriptions go through `t()` where shown; a
// description is a handful of words that says what you see, short enough for
// one line of the picker's menu in every language (tested).

/** The flat options a starter may set; everything else is the person's. */
export const DESIGN_KEYS = ['style', 'caption_anim', 'headline', 'progress_bar', 'layout', 'punch', 'look'];

export const STARTERS = [
    {
        id: 'classic',
        name: 'Classic',
        blurb: 'Yellow karaoke words, nothing else',
        options: { style: 'karaoke', punch: true },
    },
    {
        id: 'punch',
        name: 'Punch',
        blurb: 'One big yellow word at a time',
        options: {
            style: 'hormozi',
            punch: true,
            look: {
                captions: {
                    size: 1.6,
                    y: 0.62,
                    box: { opacity: 0 },
                    stroke: { width: 6 },
                    words: { mode: 'single', active: { color: '#FFE600', scale: 1.08 } },
                    enter: { kind: 'pop', ms: 120 },
                },
                camera: { feel: 'lively', punch: 1.25 },
                effects: { grade: 'punchy', vignette: 0.2 },
            },
        },
    },
    {
        id: 'quiet',
        name: 'Quiet',
        blurb: 'Small white words, soft fade',
        options: {
            style: 'minimal',
            punch: false,
            look: {
                captions: {
                    size: 0.9,
                    spacing: 0.02,
                    shadow: { y: 3, blur: 8, opacity: 0.55 },
                    enter: { kind: 'fade', ms: 260, ease: 'out' },
                    exit: { kind: 'fade', ms: 200 },
                },
                camera: { feel: 'steady' },
                effects: { vignette: 0.15 },
            },
        },
    },
    {
        id: 'neon',
        name: 'Neon',
        blurb: 'Glowing cyan words, dark frame',
        options: {
            style: 'neon',
            punch: true,
            progress_bar: '#00FFFF',
            look: {
                captions: {
                    spacing: 0.03,
                    words: {
                        active: { glow: { color: '#00FFFF', size: 22, strength: 0.9 } },
                        keyword: { glow: { color: '#FF00FF', size: 20, strength: 0.9 } },
                    },
                },
                bar: {
                    height: 0.8,
                    track: '#0A0F1F',
                    track_opacity: 0.5,
                    radius: 1,
                    glow: { color: '#00FFFF', size: 14, strength: 0.9 },
                },
                effects: { grade: 'cool', vignette: 0.45 },
            },
        },
    },
    {
        id: 'marker',
        name: 'Marker',
        blurb: 'Lime highlighter, headline card',
        options: {
            style: 'highlight',
            punch: true,
            headline: '',
            progress_bar: '#A3E635',
            look: {
                captions: { words: { mode: 'build' } },
                headline: {
                    case: 'upper',
                    ink: '#FFFFFF',
                    size: 0.85,
                    width: 0.84,
                    accent: '#A3E635',
                    card: { color: '#000000', opacity: 0.75, pad: 22, radius: 0.3 },
                    enter: { kind: 'slide_down', ms: 300 },
                },
                bar: { height: 1, radius: 0.5 },
            },
        },
    },
    {
        id: 'podcast',
        name: 'Podcast',
        blurb: 'Two speakers stacked, warm colour',
        options: {
            style: 'tiktok',
            punch: false,
            layout: 'auto',
            progress_bar: '#FFFFFF',
            look: {
                captions: { size: 0.95 },
                camera: { feel: 'steady' },
                bar: { height: 0.7, track: '#FFFFFF', track_opacity: 0.18, radius: 1 },
                effects: { grade: 'warm', vignette: 0.12 },
            },
        },
    },
];

/** English names, for the checks that need them without translating. */
export const STARTER_NAMES = STARTERS.map((s) => s.name);
