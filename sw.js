// 网页版的 Service Worker，只用来弹系统通知（决定 #104、#120）。页面照旧每分钟查一次未读数，发现新消息后
// 把要弹的通知发到这里（src/features/notify/web.ts）；正在看网页时也弹（用户 09-25 定）。比页面自己 new Notification 好在：
// - 网页关掉以后通知还留在系统的通知中心里，点了能重新打开网页、到对应的内容；
// - 手机上的浏览器（安卓 Chrome 等）只能这样弹。
// 不拦截请求、不做缓存（没有 fetch 监听），对网页的加载没有影响。

const ICON = '/notify-icon.png';

self.addEventListener('install', () => {
  // 新版本装好就接管，不等开着的页面都关掉
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** 咕游社的所有窗口（标签页），最近用过的在前 */
function windows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'gyc-notify' || !Array.isArray(msg.items)) return;
  event.waitUntil(show(msg.items));
});

async function show(items) {
  for (const item of items) {
    try {
      await self.registration.showNotification(item.title, {
        body: item.body,
        tag: item.tag,
        renotify: !!item.renotify,
        silent: !!item.silent,
        timestamp: item.timestamp,
        icon: ICON,
        data: { path: item.path, notification: item.notification },
      });
    } catch {
      // 通知权限被收回了等：这条不弹
    }
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(open(event.notification.data || {}));
});

async function open(data) {
  const path = samePath(data.path);
  const list = await windows();
  const client = list.find((c) => c.focused) || list[0];
  if (client) {
    // 网页开着：切到那个标签页，由页面自己跳过去（同在消息页点这条通知）
    try {
      await client.focus();
    } catch {
      // 有的浏览器不让切，照样跳
    }
    client.postMessage({ type: 'gyc-open', path, notification: data.notification });
    return;
  }
  // 网页关了：重新打开到那个页面；通知列表里的那条带上 #read-ID，页面打开后把它标为已读
  const hash = data.notification ? `#read-${data.notification.id}` : '';
  await self.clients.openWindow(path + hash);
}

/** 只打开咕游社自己的页面（反斜杠、// 开头之类会被当成别的网站） */
function samePath(path) {
  if (typeof path !== 'string') return '/';
  try {
    const url = new URL(path, self.location.origin);
    if (url.origin === self.location.origin) return url.pathname + url.search;
  } catch {
    // 当成首页
  }
  return '/';
}
