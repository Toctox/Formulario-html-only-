const CACHE='jobpilot-2026.09.18.2';
const APP_SHELL=[
  './?app=2026.09.18.2',
  'index.html',
  'styles.css?v=2026.09.18.2',
  'app.js?v=2026.09.18.2',
  'config.js?v=2026.09.18.2',
  'manifest.webmanifest?v=2026.09.18.2',
  'icon.svg'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(r=>{
      const copy=r.clone(); caches.open(CACHE).then(c=>c.put('./?app=2026.09.18.2',copy)); return r;
    }).catch(()=>caches.match('./?app=2026.09.18.2')));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-store'}).then(r=>{
    const copy=r.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return r;
  }).catch(()=>caches.match(event.request)));
});