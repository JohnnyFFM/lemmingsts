// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const origin = 'https://example.test/';
const oldHtml = '<script type="module" src="/assets/old.js"></script>';
const newHtml = '<script type="module" src="/assets/new.js"></script><link href="/assets/new.css">';

function worker({ rejectWrites = false, rejectOpen = false } = {}) {
    const entries = new Map<string, Response>([[origin, new Response(oldHtml)], [`${origin}assets/old.js`, new Response('old')]]);
    const network = new Map<string, Response>();
    let offline = false;
    const fetch = async (request: string | { url: string }) => {
        const key = typeof request === 'string' ? request : request.url;
        if (offline) throw new Error('offline');
        return (network.get(key) ?? new Response('missing', { status: 404 })).clone();
    };
    const cache = {
        match: async (key: string | { url: string }) => entries.get(typeof key === 'string' ? key : key.url)?.clone(),
        put: async (key: string | { url: string }, response: Response) => {
            if (rejectWrites) throw new Error('storage full');
            entries.set(typeof key === 'string' ? key : key.url, response.clone());
        },
        addAll: async (keys: string[]) => {
            const responses = await Promise.all(keys.map(fetch));
            if (responses.some(response => !response.ok)) throw new Error('asset unavailable');
            keys.forEach((key, index) => entries.set(key, responses[index].clone()));
        },
    };
    const listeners: Record<string, (event: any) => void> = {};
    const self = { location: { href: `${origin}sw.js` }, clients: { claim: async () => {} },
        addEventListener: (name: string, listener: (event: any) => void) => { listeners[name] = listener; } };
    const caches = { open: async () => {
        if (rejectOpen) throw new Error('cache storage unavailable');
        return cache;
    }, keys: async () => [], delete: async () => true };
    runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch, URL, Error, Set });
    const request = async (url: string, mode = 'navigate') => {
        let result!: Promise<Response>;
        listeners.fetch({ request: { url, mode, method: 'GET' }, respondWith: (promise: Promise<Response>) => { result = promise; } });
        return result;
    };
    const install = async () => {
        let result!: Promise<void>;
        listeners.install({ waitUntil: (promise: Promise<void>) => { result = promise; } });
        return result;
    };
    return { entries, network, request, install, goOffline: () => { offline = true; } };
}

describe('offline shell updates', () => {
    it('does not intercept any privately bundled game-data request', async () => {
        const app = worker();
        expect(await app.request(`${origin}data/local-game/manifest.json`, 'cors')).toBeUndefined();
        expect(await app.request(`${origin}data/local-game/main.dat`, 'cors')).toBeUndefined();
        expect(await app.request(`${origin}data/local-windows-audio/manifest.json`, 'cors')).toBeUndefined();
        expect(await app.request(`${origin}data/local-windows-audio/letsgo.wav`, 'cors')).toBeUndefined();
        expect(await app.request(`${origin}data/local-windows-graphics/lemmbig.spr`, 'cors')).toBeUndefined();
    });
    it('keeps the previous complete shell when an update asset fails, then works offline', async () => {
        const app = worker();
        app.network.set(origin, new Response(newHtml));
        app.network.set(`${origin}assets/new.js`, new Response('new', { headers: { 'Content-Type': 'text/javascript' } }));
        expect(await (await app.request(origin)).text()).toBe(oldHtml);
        expect(await app.entries.get(origin)!.clone().text()).toBe(oldHtml);
        app.goOffline();
        expect(await (await app.request(origin)).text()).toBe(oldHtml);
        expect(await (await app.request(`${origin}assets/old.js`, 'cors')).text()).toBe('old');
    });

    it('publishes the new shell only after its assets are cached and keeps old tab assets', async () => {
        const app = worker();
        app.network.set(origin, new Response(newHtml));
        app.network.set(`${origin}assets/new.js`, new Response('new', { headers: { 'Content-Type': 'text/javascript' } }));
        app.network.set(`${origin}assets/new.css`, new Response('style', { headers: { 'Content-Type': 'text/css' } }));
        expect(await (await app.request(origin)).text()).toBe(newHtml);
        app.goOffline();
        expect(await (await app.request(origin)).text()).toBe(newHtml);
        expect(await (await app.request(`${origin}assets/new.js`, 'cors')).text()).toBe('new');
        expect(await (await app.request(`${origin}assets/new.css`, 'cors')).text()).toBe('style');
        expect(await (await app.request(`${origin}assets/old.js`, 'cors')).text()).toBe('old');
    });

    it('does not overwrite the existing shell if a service worker installation cannot cache its assets', async () => {
        const app = worker();
        const configUrl = `${origin}data/config.json`;
        app.entries.set(configUrl, new Response('working config'));
        app.network.set(origin, new Response(newHtml));
        for (const path of ['data/config.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png']) {
            app.network.set(`${origin}${path}`, new Response('ok'));
        }
        app.network.set(`${origin}assets/new.js`, new Response('ok', { headers: { 'Content-Type': 'text/javascript' } }));
        await expect(app.install()).rejects.toThrow('asset unavailable or invalid');
        expect(await app.entries.get(origin)!.clone().text()).toBe(oldHtml);
        expect(await app.entries.get(configUrl)!.clone().text()).toBe('working config');
    });

    it.each(['data/config.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'])('rejects installer HTML fallback for %s without changing the working offline files', async missingPath => {
        const app = worker();
        app.network.set(origin, new Response(newHtml));
        const paths = ['data/config.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
        for (const path of paths) {
            app.entries.set(`${origin}${path}`, new Response(`working ${path}`));
            app.network.set(`${origin}${path}`, new Response('new resource'));
        }
        app.network.set(`${origin}${missingPath}`, new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
        app.network.set(`${origin}assets/new.js`, new Response('new', { headers: { 'Content-Type': 'text/javascript' } }));
        app.network.set(`${origin}assets/new.css`, new Response('style', { headers: { 'Content-Type': 'text/css' } }));
        await expect(app.install()).rejects.toThrow('asset unavailable or invalid');
        expect(await app.entries.get(origin)!.clone().text()).toBe(oldHtml);
        for (const path of paths) expect(await app.entries.get(`${origin}${path}`)!.clone().text()).toBe(`working ${path}`);
        expect(app.entries.has(`${origin}assets/new.js`)).toBe(false);
    });

    it('installs a complete shell with its supporting files for offline use', async () => {
        const app = worker();
        app.network.set(origin, new Response(newHtml));
        app.network.set(`${origin}assets/new.js`, new Response('new', { headers: { 'Content-Type': 'text/javascript' } }));
        app.network.set(`${origin}assets/new.css`, new Response('style', { headers: { 'Content-Type': 'text/css' } }));
        const paths = ['data/config.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
        for (const path of paths) app.network.set(`${origin}${path}`, new Response(`new ${path}`));
        await app.install();
        app.goOffline();
        expect(await (await app.request(origin)).text()).toBe(newHtml);
        for (const path of paths) expect(await (await app.request(`${origin}${path}`, 'cors')).text()).toBe(`new ${path}`);
    });

    it('keeps the working shell when a new resource body fails after valid headers', async () => {
        const app = worker();
        app.network.set(origin, new Response(newHtml));
        app.network.set(`${origin}assets/new.js`, new Response(new ReadableStream({
            start(controller) { controller.enqueue(new TextEncoder().encode('partial script')); controller.error(new Error('download interrupted')); },
        }), { headers: { 'Content-Type': 'text/javascript' } }));
        app.network.set(`${origin}assets/new.css`, new Response('style', { headers: { 'Content-Type': 'text/css' } }));
        expect(await (await app.request(origin)).text()).toBe(oldHtml);
        expect(app.entries.has(`${origin}assets/new.js`)).toBe(false);
        expect(app.entries.has(`${origin}assets/new.css`)).toBe(false);
    });

    it('rejects an HTTP 200 HTML fallback served for a missing hashed asset', async () => {
        const app = worker();
        app.network.set(origin, new Response(newHtml));
        app.network.set(`${origin}assets/new.js`, new Response('new', { headers: { 'Content-Type': 'text/javascript' } }));
        app.network.set(`${origin}assets/new.css`, new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
        expect(await (await app.request(origin)).text()).toBe(oldHtml);
        app.goOffline();
        expect(await (await app.request(origin)).text()).toBe(oldHtml);
    });

    it.each(['js', 'css', 'png', 'webmanifest', 'json'])('preserves cached %s resources when the host returns an HTML fallback', async extension => {
        const app = worker();
        const url = extension === 'json' ? `${origin}data/config.json` : `${origin}assets/old.${extension}`;
        app.entries.set(url, new Response('working cached resource'));
        app.network.set(url, new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
        expect(await (await app.request(url, 'cors')).text()).toBe('working cached resource');
        app.goOffline();
        expect(await (await app.request(url, 'cors')).text()).toBe('working cached resource');
    });

    it('does not poison an empty cache with a missing script HTML fallback', async () => {
        const app = worker();
        const url = `${origin}assets/missing.js`;
        app.network.set(url, new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
        await app.request(url, 'cors');
        expect(app.entries.has(url)).toBe(false);
    });

    it('continues online if the browser refuses new cache writes and has no fallback', async () => {
        const app = worker({ rejectWrites: true });
        app.entries.clear();
        app.network.set(origin, new Response(newHtml));
        app.network.set(`${origin}assets/new.js`, new Response('new', { headers: { 'Content-Type': 'text/javascript' } }));
        app.network.set(`${origin}assets/new.css`, new Response('style', { headers: { 'Content-Type': 'text/css' } }));
        expect(await (await app.request(origin)).text()).toBe(newHtml);
        expect(await (await app.request(`${origin}assets/new.js`, 'cors')).text()).toBe('new');
    });

    it('continues online if the browser disables cache storage', async () => {
        const app = worker({ rejectOpen: true });
        app.network.set(origin, new Response(newHtml));
        expect(await (await app.request(origin)).text()).toBe(newHtml);
    });
});
