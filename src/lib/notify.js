// Notificações do sistema. No Android o construtor `Notification` costuma
// falhar em PWAs; o caminho confiável é mostrar pelo service worker.
const canNotify = () =>
  typeof window !== 'undefined' &&
  typeof Notification !== 'undefined' &&
  Notification.permission === 'granted';

export async function showDeviceNotification(title, options = {}) {
  if (!canNotify()) return false;
  const payload = {
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    vibrate: [90, 45, 120],
    renotify: true,
    ...options,
  };
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration?.showNotification) {
        await registration.showNotification(title, payload);
        return true;
      }
    }
  } catch {
    /* tenta o construtor clássico abaixo */
  }
  try {
    new Notification(title, payload);
    return true;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}
