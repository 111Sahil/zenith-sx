// Zenith SX v29.0 — Privacy-First Market Data Transport
(function (global) {
  'use strict';

  const CUSTOM_PROXY_KEY = 'zenith_sx_custom_market_proxy_v1';
  const ALLOW_PUBLIC_CORS_KEY = 'zenith_sx_allow_public_cors_v1';

  function getCustomProxyUrl() {
    try { return (localStorage.getItem(CUSTOM_PROXY_KEY) || '').trim(); } catch (e) { return ''; }
  }

  function setCustomProxyUrl(url) {
    try { localStorage.setItem(CUSTOM_PROXY_KEY, (url || '').trim()); } catch (e) {}
  }

  function isPublicCorsAllowed() {
    try { return localStorage.getItem(ALLOW_PUBLIC_CORS_KEY) === 'true'; } catch (e) { return false; }
  }

  function setPublicCorsAllowed(allowed) {
    try { localStorage.setItem(ALLOW_PUBLIC_CORS_KEY, allowed ? 'true' : 'false'); } catch (e) {}
  }

  async function fetchMarketUrl(targetUrl, timeoutMs) {
    const ms = timeoutMs || 5500;

    // 1. Native Capacitor HTTP (zero CORS proxy needed on Android!)
    const capHttp = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.CapacitorHttp;
    if (capHttp && typeof capHttp.get === 'function') {
      try {
        const res = await capHttp.get({
          url: targetUrl,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          connectTimeout: ms,
          readTimeout: ms
        });
        if (res && res.status >= 200 && res.status < 300) {
          return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        }
      } catch (e) {}
    }

    // 2. User's own private Cloudflare Worker / self-hosted proxy (configured in Settings)
    const customProxy = getCustomProxyUrl();
    if (customProxy) {
      const sep = customProxy.includes('?') ? '&' : '?';
      const url = customProxy.includes('{url}')
        ? customProxy.replace('{url}', encodeURIComponent(targetUrl))
        : `${customProxy}${sep}url=${encodeURIComponent(targetUrl)}`;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), ms);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) return await res.text();
      } catch (e) {
        clearTimeout(tid);
      }
    }

    // 3. Opt-in public CORS proxy fallback (OFF by default for privacy)
    if (isPublicCorsAllowed()) {
      const fallbackProxies = [
        u => 'https://corsproxy.io/?' + encodeURIComponent(u),
        u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)
      ];
      for (const mk of fallbackProxies) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), ms);
        try {
          const res = await fetch(mk(targetUrl), { signal: ctrl.signal });
          clearTimeout(tid);
          if (res.ok) return await res.text();
        } catch (e) {
          clearTimeout(tid);
        }
      }
    }

    return null;
  }

  global.ZenithMarketTransport = {
    getCustomProxyUrl,
    setCustomProxyUrl,
    isPublicCorsAllowed,
    setPublicCorsAllowed,
    fetchMarketUrl
  };
})(window);
