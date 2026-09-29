import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, Eye, EyeOff, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { GpuToggle } from '../components/digiclip/controls';
import Tip from '../components/digiclip/Tooltip';
import { cn } from '../lib/utils';
import { flashMessage, installMcp, refreshMcp, rotateMcpToken, saveSettings, useStore } from '../lib/socket';
import { t as tr, useT } from '../lib/i18n';

/** What each tool lets an AI app do, in the UI's words (the engine's own
 *  descriptions are written for the model). */
export const TOOL_INFO = {
    get_status: ['Status', 'Engine health and what is running'],
    list_jobs: ['List jobs', 'Every project, newest first'],
    get_job: ['Job details', 'Clips, scores and file paths'],
    start_job: ['Make clips', 'From a file or a link, with any preset or option'],
    wait_for_job: ['Wait for a job', 'Follows a job until it is done'],
    cancel_job: ['Cancel a job', 'Stops a running job'],
    retry_job: ['Retry a job', 'Runs a job again'],
    remove_job: ['Remove a job', 'Deletes a project and its clips'],
    get_transcript: ['Transcript', 'What was said, with timestamps'],
    edit_clip: ['Edit a clip', 'New range, title, caption style or word fixes'],
    add_clip: ['Add a clip', 'A new clip over any stretch'],
    get_clip_kit: ['Posting kit', 'Caption text and hashtags'],
    get_clip_preview: ['Clip preview', 'Looks at the poster frame'],
    get_settings: ['Settings', 'Reads settings and presets (never your keys)'],
    update_settings: ['Change settings', 'Defaults, presets, watch folder, keys (write-only)'],
    list_models: ['Models', 'Speech models and the judge'],
    download_model: ['Download a model', 'Fetches a model'],
    delete_model: ['Delete a model', 'Frees the disk space'],
    list_openrouter_models: ['OpenRouter models', 'Models for clip scoring'],
    export_diagnostics: ['Export diagnostics', 'Writes a report for a bug'],
    show_in_app: ['Show in DigiClip', 'Brings a project up in this window'],
};

export function toolTitle(name) {
    const info = TOOL_INFO[name];
    return info ? tr(info[0]) : name;
}

const CLIENTS = [
    { id: 'claude_desktop', name: 'Claude Desktop' },
    { id: 'claude_code', name: 'Claude Code' },
    { id: 'cursor', name: 'Cursor' },
];

function copy(text, what) {
    const done = () => flashMessage(tr('Copied {what}', { what }));
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text) && done());
    } else if (fallbackCopy(text)) {
        done();
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
    }
    ta.remove();
    return ok;
}

function Section({ title, aside, children, className }) {
    return (
        <section className={cn('space-y-2.5', className)}>
            <p className="flex items-center gap-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                {title}
                {aside}
            </p>
            {children}
        </section>
    );
}

function CopyButton({ text, what, label }) {
    const t = useT();
    return (
        <Tip label={t('Copy {what}', { what })} side="top">
            <button
                type="button"
                aria-label={t('Copy {what}', { what })}
                disabled={!text}
                onClick={() => copy(text, what)}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
                <Copy className="size-3.5" aria-hidden />
                {label}
            </button>
        </Tip>
    );
}

function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return tr('just now');
    if (s < 60) return tr('{s}s ago', { s });
    if (s < 3600) return tr('{m}m ago', { m: Math.floor(s / 60) });
    return tr('{h}h ago', { h: Math.floor(s / 3600) });
}

function ClientRow({ client, state, bridge, busy, onRun }) {
    const t = useT();
    const found = !!state?.found;
    const added = !!state?.added;
    const current = !!state?.current;
    const status = !found
        ? t('Not found on this computer')
        : added && current ? t('Added')
            : added ? t('Added, points at an old copy')
                : t('Not added');
    const cmd = bridge ? `claude mcp add digiclip --scope user -- "${bridge}" --mcp` : '';
    return (
        <li className="flex items-center gap-3 py-2">
            <span className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold',
                added && current ? 'border-[var(--viral)]/40 text-[var(--viral)]' : 'text-muted-foreground',
            )}
            >
                {added && current ? <Check className="size-3.5" aria-hidden /> : client.name[0]}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{client.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{status}</p>
            </div>
            {client.id === 'claude_code' && !found ? (
                <CopyButton text={cmd} what={t('the command')} label={t('Copy command')} />
            ) : (
                <span className="flex shrink-0 items-center gap-1">
                    {added && (
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onRun(client, true)}>
                            {t('Remove')}
                        </Button>
                    )}
                    {(!added || !current) && (
                        <Button type="button" size="sm" variant={found ? 'default' : 'secondary'} disabled={busy || !found || !bridge} onClick={() => onRun(client, false)}>
                            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                            {added ? t('Update') : t('Add')}
                        </Button>
                    )}
                </span>
            )}
        </li>
    );
}

function ActivityRow({ a, now }) {
    const t = useT();
    const icon = a.state === 'running'
        ? <Loader2 className="size-3.5 animate-spin text-orange-500" aria-label={t('running')} />
        : a.state === 'ok'
            ? <CheckCircle2 className="size-3.5 text-[var(--viral)]" aria-label={t('ok')} />
            : <XCircle className="size-3.5 text-destructive" aria-label={t('failed')} />;
    return (
        <li className="rise flex items-center gap-2.5 py-1.5">
            <span className="shrink-0">{icon}</span>
            <p className="min-w-0 flex-1 truncate text-[12px]">
                <span className="font-medium">{a.client}</span>
                <span className="text-muted-foreground"> · {toolTitle(a.tool)}</span>
                {a.detail && <span className="font-mono text-[11px] text-muted-foreground"> · {a.detail}</span>}
            </p>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                {a.state === 'running' ? t('now') : ago(now - a.at_ms)}
            </span>
        </li>
    );
}

export default function Mcp() {
    const mcp = useStore((s) => s.mcp);
    const conn = useStore((s) => s.conn);
    const t = useT();
    const [hot, setHot] = useState(false);
    const [busy, setBusy] = useState(null);
    const [showToken, setShowToken] = useState(false);
    const [port, setPort] = useState('');
    const [now, setNow] = useState(Date.now());

    // Fresh view of the AI apps' config files whenever the page opens.
    useEffect(() => {
        if (conn === 'live') refreshMcp();
    }, [conn]);
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') refreshMcp();
        };
        document.addEventListener('visibilitychange', onVisible);
        const clock = setInterval(() => setNow(Date.now()), 10000);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            clearInterval(clock);
        };
    }, []);
    useEffect(() => {
        if (mcp?.port) setPort(String(mcp.port));
    }, [mcp?.port]);
    useEffect(() => setNow(Date.now()), [mcp?.activity?.[0]?.seq, mcp?.activity?.[0]?.state]);

    const on = !!mcp?.on;
    const running = !!mcp?.running;
    const status = !mcp ? null : !on ? 'off' : running ? 'on' : 'error';

    function toggle(v) {
        saveSettings({ mcp_on: v }).catch((e) => flashMessage(String(e?.message ?? e)));
    }
    function applyPort() {
        const n = Number(port);
        if (!Number.isInteger(n) || n < 1024 || n > 65535) {
            flashMessage(t('Pick a port between 1024 and 65535.'));
            return;
        }
        saveSettings({ mcp_port: n }).catch((e) => flashMessage(String(e?.message ?? e)));
    }
    function run(client, remove) {
        setBusy(client.id);
        installMcp(client.id, remove)
            .then(() => {
                if (remove) flashMessage(t('Removed DigiClip from {app}.', { app: client.name }));
                else if (client.id === 'claude_code') flashMessage(t('Added. New Claude Code sessions can use DigiClip.'));
                else flashMessage(t('Added. Restart {app} to load DigiClip.', { app: client.name }));
            })
            .catch((e) => flashMessage(t("Couldn't change {app}: {error}", { app: client.name, error: e?.message ?? e })))
            .finally(() => setBusy(null));
    }
    function newToken() {
        rotateMcpToken()
            .then(() => flashMessage(t('New token. Apps set up over HTTP need it; the others keep working.')))
            .catch((e) => flashMessage(String(e?.message ?? e)));
    }

    const activity = mcp?.activity ?? [];
    const stdio = mcp?.configs?.stdio ? JSON.stringify(mcp.configs.stdio, null, 2) : '';
    const http = mcp?.configs?.http ? JSON.stringify(mcp.configs.http, null, 2) : '';
    const tools = mcp?.tools ?? [];

    return (
        <div className="flex h-full min-h-[480px] flex-col gap-[5px]">
            <Card
                className={cn('relative shrink-0 transition-colors', hot && 'border-t-white/25 border-x-white/[0.13]')}
                onMouseEnter={() => setHot(true)}
                onMouseLeave={() => setHot(false)}
            >
                <span aria-hidden className="absolute top-full left-6 h-[5px] w-px bg-border" />
                <CardHeader className="h-10 justify-center px-4 py-0">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <CardTitle className="text-[13px]">{t('AI apps')}</CardTitle>
                        {status && (
                            <Badge
                                variant={status === 'on' ? 'success' : 'secondary'}
                                className={cn('gap-1.5', status === 'error' && 'text-red-500')}
                                title={mcp?.error ?? undefined}
                            >
                                {status === 'on' && <span className="size-1.5 animate-pulse rounded-full bg-black/70" aria-hidden />}
                                {status === 'on'
                                    ? t('MCP on :{port}', { port: mcp.port })
                                    : status === 'off' ? t('MCP off') : t('Port {port} is taken', { port: mcp.port })}
                            </Badge>
                        )}
                        <span className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
                            {on ? t('On') : t('Off')}
                            <GpuToggle checked={on} disabled={!mcp} onChange={toggle} label={t('Let AI apps use DigiClip')} />
                        </span>
                    </div>
                </CardHeader>
            </Card>
            <Card
                className={cn('stagger-1 flex min-h-0 flex-1 flex-col overflow-hidden transition-colors', hot && 'border-t-white/25 border-x-white/[0.13]')}
                onMouseEnter={() => setHot(true)}
                onMouseLeave={() => setHot(false)}
            >
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-4">
                    <div className="mx-auto my-auto grid w-full max-w-5xl gap-6 lg:grid-cols-2">
                        <div className="space-y-5">
                            <div className="stagger-2 flex gap-3 rounded-md border p-3">
                                <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--viral)]" aria-hidden />
                                <div className="space-y-1">
                                    <p className="text-[13px] font-medium">{t('Let Claude make your clips')}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('DigiClip speaks MCP, so AI apps get the same controls as this window: start jobs from files or links, wait for them, read transcripts, edit and add clips, change settings. Everything shows up here live, and it all stays on this computer.')}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('Try: “Make 3 clips from D:\\Videos\\talk.mp4 about pricing, then retitle the best one.”')}
                                    </p>
                                </div>
                            </div>

                            <Section title={t('Connect an app')} className="stagger-2">
                                <ul className="flex flex-col divide-y divide-border">
                                    {CLIENTS.map((c) => (
                                        <ClientRow
                                            key={c.id}
                                            client={c}
                                            state={mcp?.installed?.[c.id]}
                                            bridge={mcp?.bridge}
                                            busy={busy === c.id}
                                            onRun={run}
                                        />
                                    ))}
                                </ul>
                                {!on && <p className="text-[11px] text-orange-500">{t('MCP is off: connected apps get a “turned off” answer until you switch it back on.')}</p>}
                            </Section>

                            <Section title={t('Any other app')} className="stagger-3">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <p className="min-w-0 flex-1 text-[12px]">
                                            {t('Command (stdio)')}
                                            <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground" title={mcp?.bridge ?? ''}>
                                                {mcp?.bridge ? `"${mcp.bridge}" --mcp` : t('setting up…')}
                                            </span>
                                        </p>
                                        <CopyButton text={stdio} what={t('the JSON config')} label="JSON" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="min-w-0 flex-1 text-[12px]">
                                            {t('HTTP')}
                                            <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">{mcp?.url ?? '…'}</span>
                                        </p>
                                        <CopyButton text={mcp?.url ?? ''} what={t('the address')} label="URL" />
                                        <CopyButton text={http} what={t('the JSON config')} label="JSON" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="min-w-0 flex-1 text-[12px]">
                                            {t('Token')}
                                            <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                                                {mcp?.token ? (showToken ? mcp.token : '•'.repeat(24)) : '…'}
                                            </span>
                                        </p>
                                        <Tip label={showToken ? t('Hide') : t('Show')} side="top">
                                            <button
                                                type="button"
                                                aria-label={showToken ? t('Hide') : t('Show')}
                                                onClick={() => setShowToken((v) => !v)}
                                                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                {showToken ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                                            </button>
                                        </Tip>
                                        <CopyButton text={mcp?.token ?? ''} what={t('the token')} label="" />
                                        <Tip label={t('Make a new token')} side="top">
                                            <button
                                                type="button"
                                                aria-label={t('Make a new token')}
                                                onClick={newToken}
                                                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                                            >
                                                <RefreshCw className="size-3.5" aria-hidden />
                                            </button>
                                        </Tip>
                                    </div>
                                    <form
                                        className="flex items-center gap-2"
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            applyPort();
                                        }}
                                    >
                                        <label htmlFor="mcp-port" className="min-w-0 flex-1 text-[12px]">
                                            {t('Port')}
                                            <span className="block text-[11px] text-muted-foreground">{t('Only this computer can connect.')}</span>
                                        </label>
                                        <input
                                            id="mcp-port"
                                            inputMode="numeric"
                                            value={port}
                                            onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                                            className="h-8 w-24 rounded-md border border-x-white/10 border-t-white/20 border-b-black/60 bg-[color-mix(in_srgb,var(--card)_78%,black)] px-2 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        />
                                        <Button type="submit" size="sm" variant="secondary" disabled={!mcp || String(mcp.port) === port}>
                                            {t('Apply')}
                                        </Button>
                                    </form>
                                </div>
                            </Section>
                        </div>

                        <div className="space-y-5">
                            <Section
                                title={t('Activity')}
                                className="stagger-2"
                                aside={activity.some((a) => a.state === 'running') && <span className="size-1.5 animate-pulse rounded-full bg-orange-500" aria-hidden />}
                            >
                                {activity.length === 0 ? (
                                    <p className="rounded-md border border-dashed p-4 text-center text-[12px] text-muted-foreground">
                                        {mcp?.clients?.length
                                            ? t('{app} is connected. Calls show up here as they happen.', { app: mcp.clients[0].name })
                                            : t('No AI app has called yet. Connect one on the left, then ask it for clips.')}
                                    </p>
                                ) : (
                                    <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto pr-1">
                                        {activity.map((a) => <ActivityRow key={a.seq} a={a} now={now} />)}
                                    </ul>
                                )}
                            </Section>

                            <Section
                                title={t('What AI apps can do')}
                                className="stagger-3"
                                aside={<span className="text-muted-foreground/70">{tools.length}</span>}
                            >
                                <div className="flex flex-wrap gap-1.5">
                                    {tools.map((tool) => (
                                        <Tip key={tool.name} label={TOOL_INFO[tool.name] ? t(TOOL_INFO[tool.name][1]) : tool.description} side="top" wrap>
                                            <Badge variant="secondary" className="font-normal">{toolTitle(tool.name)}</Badge>
                                        </Tip>
                                    ))}
                                </div>
                            </Section>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
