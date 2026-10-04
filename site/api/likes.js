/* Likes for the DigiClip homepage. One Vercel function, one Redis set.

     GET    /api/likes  ->  { count, liked }
     POST   /api/likes  ->  like the project (counts once per visitor)
     DELETE /api/likes  ->  take the like back

   The count is the size of a Redis set whose members are salted hashes
   of visitor addresses, so liking twice from the same place changes
   nothing and no address is ever stored. Storage is Upstash Redis over
   its REST API (the Vercel Marketplace integration sets the env vars),
   which keeps this file free of dependencies. */
import crypto from 'node:crypto';

const KEY = 'digiclip:likes';

function store() {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

/** Runs Redis commands in one round trip and returns their results. */
async function pipeline(kv, commands) {
    const res = await fetch(`${kv.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kv.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`store answered ${res.status}`);
    const rows = await res.json();
    const failed = rows.find((r) => r.error);
    if (failed) throw new Error(failed.error);
    return rows.map((r) => r.result);
}

/** A stable, anonymous id for whoever is asking. IPv6 is cut to its /64,
 *  since one device rotates through many addresses inside it. */
function visitor(req, salt) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    let ip = String(req.headers['x-real-ip'] || forwarded || (req.socket && req.socket.remoteAddress) || '');
    if (ip.includes(':') && !ip.includes('.')) ip = ip.split(':').slice(0, 4).join(':');
    return crypto.createHash('sha256').update(`${salt}|${ip}`).digest('hex').slice(0, 32);
}

/** Likes only count when they come from the page itself. */
function fromThisSite(req) {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return false;
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
}

export default async function handler(req, res) {
    const send = (status, body) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(body));
    };

    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST, DELETE');
        return send(405, { error: 'Use GET, POST or DELETE.' });
    }
    const kv = store();
    if (!kv) return send(503, { error: 'Likes storage is not connected yet.' });
    if (req.method !== 'GET' && !fromThisSite(req)) {
        return send(403, { error: 'Likes can only be left from the DigiClip site.' });
    }

    const id = visitor(req, process.env.LIKES_SALT || kv.token);
    try {
        if (req.method === 'GET') {
            const [count, liked] = await pipeline(kv, [['SCARD', KEY], ['SISMEMBER', KEY, id]]);
            return send(200, { count, liked: liked === 1 });
        }
        const liking = req.method === 'POST';
        const [, count] = await pipeline(kv, [[liking ? 'SADD' : 'SREM', KEY, id], ['SCARD', KEY]]);
        return send(200, { count, liked: liking });
    } catch {
        return send(502, { error: "Couldn't reach the likes store. Try again in a moment." });
    }
}
