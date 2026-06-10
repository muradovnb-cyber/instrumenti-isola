import React, { useEffect, useState } from 'react';

const DISMISS_KEY = 'pwa-install-dismissed-until';
const SNOOZE_DAYS = 7;

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) && !window.MSStream;
  const isAndroid = /Android/i.test(ua);
  const isMac = /Macintosh/i.test(ua) && !isIOS;
  const isWindows = /Windows/i.test(ua);
  return { isIOS, isAndroid, isMac, isWindows };
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [showIOSSheet, setShowIOSSheet] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    if (isStandalone()) return;

    const snoozedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (snoozedUntil > Date.now()) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari не выбрасывает beforeinstallprompt — показываем подсказку сами
    if (platform.isIOS) {
      const t = setTimeout(() => setShow(true), 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [platform.isIOS]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
  };

  const handleInstall = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      setShow(false);
      if (outcome !== 'accepted') dismiss();
      return;
    }
    if (platform.isIOS) setShowIOSSheet(true);
  };

  if (!show && !showIOSSheet) return null;

  return (
    <>
      {show && (
        <div className="pwa-install-banner" role="dialog" aria-label="Установить приложение">
          <div className="icon">📲</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="title">Установить «ISOLA Инструменты»</div>
            <div className="desc">
              {platform.isIOS
                ? 'Запускайте с главного экрана как обычное приложение'
                : 'Быстрый запуск, работа в полноэкранном режиме'}
            </div>
          </div>
          <div className="actions">
            <button className="dismiss-btn" onClick={dismiss}>Позже</button>
            <button className="install-btn" onClick={handleInstall}>
              {platform.isIOS ? 'Как?' : 'Установить'}
            </button>
          </div>
        </div>
      )}

      {showIOSSheet && (
        <div className="pwa-install-sheet" onClick={() => setShowIOSSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Установка на iPhone / iPad</h2>
            <p>В Safari выполните 3 простых шага:</p>
            <ol>
              <li>Нажмите кнопку <strong>«Поделиться»</strong> внизу экрана (квадрат со стрелкой вверх ⬆️)</li>
              <li>Прокрутите вниз и выберите <strong>«На экран Домой»</strong></li>
              <li>Нажмите <strong>«Добавить»</strong> в правом верхнем углу</li>
            </ol>
            <button className="close" onClick={() => { setShowIOSSheet(false); dismiss(); }}>
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}
