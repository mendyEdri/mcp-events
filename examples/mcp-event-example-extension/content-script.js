/**
 * Content Script - Injects Notification interceptor on approved sites
 */

const hostname = window.location.hostname;

// Check if this site is approved before injecting
chrome.storage.local.get(['approvedSites'], (result) => {
  const approvedSites = result.approvedSites || [];

  // Check if current hostname is in approved list
  const isApproved = approvedSites.some(site => {
    if (site === hostname) return true;
    if (site.startsWith('*.') && hostname.endsWith(site.slice(1))) return true;
    return false;
  });

  if (isApproved) {
    console.log('[MCPE] Site approved, installing notification interceptor:', hostname);
    injectInterceptor();
  } else {
    console.log('[MCPE] Site not approved:', hostname);
  }
});

function injectInterceptor() {
  // Inject external script into MAIN world (avoids CSP issues with inline scripts)
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // Listen for notifications from injected script
  window.addEventListener('__mcpe_notification__', (event) => {
    try {
      const data = JSON.parse(event.detail);
      console.log('[MCPE Content Script] Notification received:', data.title);

      chrome.runtime.sendMessage({
        type: 'addNotification',
        notification: {
          title: data.title,
          body: data.body,
          icon: data.icon,
          source: 'page:' + data.hostname,
          url: data.url,
          data: { tag: data.tag, timestamp: data.timestamp }
        }
      }).catch(() => {});
    } catch (e) {
      console.error('[MCPE Content Script] Error:', e);
    }
  });
}
