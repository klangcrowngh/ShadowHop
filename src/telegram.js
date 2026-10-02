// Обёртка над Telegram WebApp API. Вне Telegram всё тихо деградирует:
// хаптика отключена, рекорд хранится в localStorage.
const W = window.Telegram?.WebApp;
export const inTelegram = !!(W && W.initData);
const atLeast = (v) => inTelegram && W.isVersionAtLeast?.(v);

export function init() {
  if (!inTelegram) return;
  try {
    W.ready();
    W.expand();
    if (atLeast('7.7')) W.disableVerticalSwipes(); // иначе свайп вниз закрывает мини-апп
    if (atLeast('6.1')) {
      W.setHeaderColor('#000000');
      W.setBackgroundColor('#000000');
    }
    // Во весь экран на телефонах (Bot API 8.0): шапки Telegram нет, остаются только
    // плавающие кнопки — отступы под них задают --tg-*-safe-area-inset-* в style.css
    if (atLeast('8.0') && (W.platform === 'android' || W.platform === 'ios')) {
      W.requestFullscreen();
      W.lockOrientation?.();  // игра под портрет — не переворачивать при наклоне
    }
    // размер области меняется при входе в полноэкранный режим — пересчитать холст
    const refit = () => window.dispatchEvent(new Event('resize'));
    W.onEvent('viewportChanged', refit);
    W.onEvent('fullscreenChanged', refit);
    W.onEvent('safeAreaChanged', refit);
    W.onEvent('contentSafeAreaChanged', refit);
  } catch (e) { console.warn(e); }
}

// Мини-апп свернули / открыли снова (Bot API 8.0)
export function onActive(cb) {
  if (!atLeast('8.0')) return;
  W.onEvent('deactivated', () => cb(false));
  W.onEvent('activated', () => cb(true));
}

export function haptic(kind) {
  if (!atLeast('6.1')) return;
  try {
    if (kind === 'hop') W.HapticFeedback.impactOccurred('light');
    else if (kind === 'bump') W.HapticFeedback.impactOccurred('rigid');
    else if (kind === 'death') W.HapticFeedback.notificationOccurred('error');
  } catch { /* ignore */ }
}

export function loadBest() {
  if (atLeast('6.9')) {
    return new Promise((resolve) => {
      W.CloudStorage.getItem('best', (err, v) => resolve(err ? 0 : Number(v) || 0));
    });
  }
  try { return Promise.resolve(Number(localStorage.getItem('shadowhop.best')) || 0); }
  catch { return Promise.resolve(0); }
}

export function saveBest(n) {
  if (atLeast('6.9')) { W.CloudStorage.setItem('best', String(n)); return; }
  try { localStorage.setItem('shadowhop.best', String(n)); } catch { /* ignore */ }
}
