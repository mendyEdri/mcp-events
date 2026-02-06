// Injected into MAIN world to intercept Notification API
(function() {
  if (window.__mcpeNotificationIntercepted) return;
  window.__mcpeNotificationIntercepted = true;

  const OriginalNotification = window.Notification;
  if (!OriginalNotification) return;

  function sendToExtension(data) {
    window.dispatchEvent(new CustomEvent('__mcpe_notification__', {
      detail: JSON.stringify(data)
    }));
  }

  window.Notification = function(title, options = {}) {
    console.log('[MCPE] Notification intercepted:', title);

    sendToExtension({
      title: title,
      body: options.body || '',
      icon: options.icon || '',
      tag: options.tag || '',
      hostname: window.location.hostname,
      url: window.location.href,
      timestamp: Date.now()
    });

    return new OriginalNotification(title, options);
  };

  Object.defineProperty(window.Notification, 'permission', {
    get: () => OriginalNotification.permission,
    enumerable: true
  });

  window.Notification.maxActions = OriginalNotification.maxActions;
  window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
  Object.setPrototypeOf(window.Notification.prototype, OriginalNotification.prototype);

  console.log('[MCPE] Notification interceptor active on', window.location.hostname);
})();
