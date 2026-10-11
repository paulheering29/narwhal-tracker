const of = globalThis.fetch; let n = 0;
globalThis.fetch = async (u, o) => { const r = await of(u, o); n += 1; console.log(n, o?.method ?? 'GET', String(u).slice(-70), r.status); if (r.status >= 400) { const t = await r.clone().text(); console.log(t.replace(/\s+/g, ' ').slice(0, 500)); console.log('BODY', String(o?.body).slice(0, 300)); console.log(JSON.stringify(o?.headers).slice(0,400)); } return r; };
await import('/private/tmp/claude-501/-Users-paul-Desktop-System-Review/f8a2a5ab-5d85-4291-a341-ba55fd5da45b/scratchpad/vt/e2e-vt.mjs');
