const CACHE = "talcoexchange-v15";
const SHELL = ["./", "index.html", "manifest.webmanifest", "favicon.ico", "favicon-32.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (/^https:\/\/(www\.gstatic\.com\/firebasejs\/|res\.cloudinary\.com\/)/.test(req.url)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close(); const open = e.notification.data && e.notification.data.open;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => {
    const c = l[0]; if (c) { c.focus(); if (open) c.postMessage({ open }); return; }
    return self.clients.openWindow("./");
  }));
});
const API_KEY = "AIzaSyALu9n3ksX-0mN4u8reRBpFkWAUsVsGswA", DB = "https://itn-3-1b09f-default-rtdb.europe-west1.firebasedatabase.app";
async function authInfo() {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("firebaseLocalStorageDb"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = await new Promise((res, rej) => { const q = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const e = all.find(x => /^firebase:authUser:/.test(x.fbase_key)); return e && e.value;
}
async function idToken(u) {
  const t = u.stsTokenManager; if (t.accessToken && t.expirationTime - Date.now() > 60000) return t.accessToken;
  const r = await fetch("https://securetoken.googleapis.com/v1/token?key=" + API_KEY, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(t.refreshToken) });
  return (await r.json()).id_token;
}
async function latest() {
  const u = await authInfo(); if (!u) return null; const tok = await idToken(u);
  const ic = await (await fetch(`${DB}/incoming/${u.uid}.json?auth=${tok}`)).json();
  if (ic && ic.from && Date.now() - ic.ts < 60000) {
    const nm = await (await fetch(`${DB}/users/${ic.from}/name.json?auth=${tok}`)).json();
    return { from: ic.from, title: nm || "TalcoExchange", body: ic.kind === "video" ? "📹 Appel vidéo entrant" : "📞 Appel vocal entrant", call: true, ts: ic.ts };
  }
  const chats = await (await fetch(`${DB}/userChats/${u.uid}.json?auth=${tok}`)).json(); if (!chats) return null;
  let best = null; for (const k in chats) { const c = chats[k]; if (c.from !== u.uid && (!best || c.ts > best.c.ts)) best = { k, c }; }
  if (!best) return null;
  const name = await (await fetch(`${DB}/users/${best.k}/name.json?auth=${tok}`)).json();
  return { from: best.k, title: name || "TalcoExchange", body: best.c.last || "Nouveau message", ts: best.c.ts };
}
const shown = new Set();
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window" });
    if (wins.some(c => c.visibilityState === "visible")) return;
    let n = null; try { n = await latest(); } catch (x) {}
    n = n || { title: "TalcoExchange", body: "Nouveau message", from: "" };
    const key = (n.from || "new") + ":" + (n.ts || "");
    if (n.ts && shown.has(key)) return; shown.add(key);
    await self.registration.showNotification(n.title, { body: n.body, icon: "icon-192.png", badge: "favicon-32.png", tag: "tx-" + (n.from || "new") + "-" + (n.ts || Date.now()), timestamp: n.ts || Date.now(), requireInteraction: !!n.call, vibrate: n.call ? [300, 150, 300, 150, 300] : undefined, data: { open: n.from } });
    try { const l = await self.registration.getNotifications(); if (self.navigator.setAppBadge) await self.navigator.setAppBadge(l.length); } catch (x) {}
  })());
});
