// QuoteCraft service worker: тільки push-сповіщення (без кешування сторінок).
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("push",e=>{
  let d={};try{d=e.data?e.data.json():{}}catch{d={body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||"QuoteCraft",{body:d.body||"",tag:d.tag||undefined,data:{url:d.url||"/"},icon:"/icon-192.png",badge:"/icon-192.png"}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||"/";
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list){if("focus" in c){c.navigate?c.navigate(url).catch(()=>{}):0;return c.focus()}}
    return self.clients.openWindow(url);
  }));
});
