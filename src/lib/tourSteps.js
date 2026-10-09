// The first-run tour, as data: what each step says and what it points at.
// Pure: `t` is the translator, so the tests can see every sentence.
//
//   target  the `data-tour` value of the element to highlight, or null for a
//           centred card that points at nothing
//   body    sentences; `{name}` and `{where}` are filled from `slots` (shown
//           in bold by the tour)
//   action  an extra button next to Next: { label, page } opens that page
//
// Targets live on the real elements: `add` and `videos` on Home, `rail-*` on
// the side rail's buttons.

/** @param {(text: string, vars?: object) => string} t
 *  @param {{hasVideos?: boolean, name?: string|null}} [state] */
export function tourSteps(t, { hasVideos = false, name = null } = {}) {
    return [
        {
            key: 'welcome',
            title: t('Welcome'),
            target: null,
            body: [name ? t('Hey {name} — welcome to DigiClip.') : t('Welcome to DigiClip.'), t('Turn long videos into TikTok-ready vertical clips: offline transcription, AI clip picking, captioned 9:16 renders. This tour takes 30 seconds.')],
            slots: name ? { name } : {},
        },
        {
            key: 'add',
            title: t('Add a video'),
            target: 'add',
            body: [t('Drop a video file or paste a link. DigiClip finds the best moments and cuts them into captioned vertical clips.')],
            slots: {},
        },
        {
            key: 'videos',
            title: t('Your videos'),
            // With no video yet there is nothing on screen to point at.
            target: hasVideos ? 'videos' : null,
            body: [hasVideos
                ? t('Every video you add is listed with its clips. Play a clip, change it, or save the file.')
                : t('Your videos will be listed on Home, each with its clips. You can play a clip, change it, or save the file.')],
            slots: {},
        },
        {
            key: 'studio',
            title: t('Studio'),
            target: 'rail-studio',
            body: [t('Design how your clips look: captions, headline, progress bar, logo, camera, layout, effects and fonts. Save the design as a Look to use it on any video.')],
            slots: {},
            action: { label: t('Open Studio'), page: 'studio' },
        },
        {
            key: 'ai',
            title: t('Smart clip picking'),
            target: 'rail-settings',
            body: [
                t('For AI-picked highlights, pick a provider (OpenAI, Anthropic, Gemini, OpenRouter, Ollama…) and paste its key in {where}. Ollama or LM Studio on this PC need no key.'),
                t('No key? Clips fall back to heuristics. Transcription itself is always offline.'),
            ],
            slots: { where: t('Settings → Clip AI') },
            action: { label: t('Open Settings'), page: 'settings' },
        },
        {
            key: 'health',
            title: t('Health'),
            target: 'rail-health',
            body: [t('If anything DigiClip needs is missing or slow, Health says what it is and what to do.')],
            slots: {},
        },
    ];
}
