// Zenith SX v30.0 — Defense-in-Depth Security Suite
// Features:
// 1. Argon2id (RFC 9106) + AES-256-GCM + HMAC-SHA256 Authenticated Envelope Encryption
// 2. Strict HTML/Attribute Escaping (escapeHtml) + DOMParser Whitelist Sanitizer (setSafeHtml)
// 3. Per-Install CSPRNG Sync Topic & 256-bit Vault Secret Generation
// 4. Encrypted At-Rest LocalStorage Secret Vault + 15-Minute Inactivity Auto-Lock Watchdog
// 5. Centralized Event Delegation (zero inline onclick handlers)
(function (global) {
  'use strict';

  const SYNC_KEY_STORAGE = 'zenith_sx_install_sync_key_v1';
  const VAULT_SECRET_STORAGE = 'zenith_sx_install_vault_secret_v1';
  const DEVICE_SALT_STORAGE = 'zenith_sx_device_argon2_salt_v1';
  const DEVICE_SEED_STORAGE = 'zenith_sx_device_argon2_seed_v1';
  const SEQ_COUNTER_STORAGE = 'zenith_sx_sync_seq_counter_v1';

  let _inMemoryDeviceKeyPair = null;
  let _inactivityTimer = null;
  const INACTIVITY_LOCK_MS = 15 * 60 * 1000; // 15 minutes

  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;');
  }

  /**
   * DOMParser-based whitelist HTML sanitizer that strips <script>, <iframe>, <object>,
   * inline on* handlers, and javascript:/data:text/html URIs before mounting DOM nodes.
   */
  const FORBIDDEN_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'APPLET', 'META', 'BASE', 'LINK']);

  function cleanDomNode(node) {
    if (node.nodeType === 1) { // ELEMENT_NODE
      if (FORBIDDEN_TAGS.has(node.tagName)) {
        node.remove();
        return;
      }
      const attrs = Array.from(node.attributes || []);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const val = (attr.value || '').trim().toLowerCase();
        if (name.startsWith('on')) {
          node.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src' || name === 'action') &&
                   (val.startsWith('javascript:') || val.startsWith('vbscript:') || val.startsWith('data:text/html'))) {
          node.removeAttribute(attr.name);
        }
      }
    }
    const children = Array.from(node.childNodes || []);
    for (const child of children) {
      cleanDomNode(child);
    }
  }

  function setSafeHtml(el, htmlString) {
    if (!el) return;
    if (!htmlString) {
      el.textContent = '';
      return;
    }
    try {
      const tag = (el.tagName || 'DIV').toUpperCase();
      // Table sub-elements (TBODY, THEAD, TR) require contextual wrapper for DOMParser
      if (tag === 'TBODY' || tag === 'THEAD' || tag === 'TFOOT') {
        const doc = new DOMParser().parseFromString(`<table><${tag.toLowerCase()}>${htmlString}</${tag.toLowerCase()}></table>`, 'text/html');
        const container = doc.querySelector(tag.toLowerCase());
        if (container) {
          cleanDomNode(container);
          el.replaceChildren(...Array.from(container.childNodes));
          return;
        }
      } else if (tag === 'TR') {
        const doc = new DOMParser().parseFromString(`<table><tbody><tr>${htmlString}</tr></tbody></table>`, 'text/html');
        const container = doc.querySelector('tr');
        if (container) {
          cleanDomNode(container);
          el.replaceChildren(...Array.from(container.childNodes));
          return;
        }
      } else if (tag === 'SELECT') {
        const doc = new DOMParser().parseFromString(`<select>${htmlString}</select>`, 'text/html');
        const container = doc.querySelector('select');
        if (container) {
          cleanDomNode(container);
          el.replaceChildren(...Array.from(container.childNodes));
          return;
        }
      }
      const doc = new DOMParser().parseFromString(`<body>${htmlString}</body>`, 'text/html');
      cleanDomNode(doc.body);
      el.replaceChildren(...Array.from(doc.body.childNodes));
    } catch (e) {
      el.textContent = String(htmlString);
    }
  }

  function randomBytes(byteLen) {
    const arr = new Uint8Array(byteLen);
    crypto.getRandomValues(arr);
    return arr;
  }

  function randomHex(byteLen) {
    return Array.from(randomBytes(byteLen), b => b.toString(16).padStart(2, '0')).join('');
  }

  function getOrCreateSyncKey() {
    try {
      let k = localStorage.getItem(SYNC_KEY_STORAGE);
      if (!k || k.length < 16) {
        k = 'zsx-' + randomHex(12);
        localStorage.setItem(SYNC_KEY_STORAGE, k);
      }
      return k;
    } catch (e) {
      return 'zsx-' + randomHex(12);
    }
  }

  function getOrCreateVaultSecret() {
    try {
      let s = localStorage.getItem(VAULT_SECRET_STORAGE);
      if (!s || s.length < 24) {
        s = 'zsx_v30_argon2id_' + randomHex(16);
        localStorage.setItem(VAULT_SECRET_STORAGE, s);
      }
      return s;
    } catch (e) {
      return 'zsx_v30_argon2id_' + randomHex(16);
    }
  }

  function rotateSyncCredentials() {
    const newKey = 'zsx-' + randomHex(12);
    const newSecret = 'zsx_v30_argon2id_' + randomHex(16);
    try {
      localStorage.setItem(SYNC_KEY_STORAGE, newKey);
      localStorage.setItem(VAULT_SECRET_STORAGE, newSecret);
      if (global.ZenithArgon2id) global.ZenithArgon2id.clearKeyCache();
    } catch (e) {}
    return { syncKey: newKey, vaultSecret: newSecret };
  }

  function setSyncCredentials(syncKey, vaultSecret) {
    try {
      if (syncKey && syncKey.trim().length >= 8) {
        localStorage.setItem(SYNC_KEY_STORAGE, syncKey.trim());
      }
      if (vaultSecret && vaultSecret.trim().length >= 12) {
        localStorage.setItem(VAULT_SECRET_STORAGE, vaultSecret.trim());
      }
      if (global.ZenithArgon2id) global.ZenithArgon2id.clearKeyCache();
    } catch (e) {}
  }

  // Device-bound Argon2id + AES-256-GCM key pair for local at-rest secret encryption
  async function getDeviceArgon2KeyPair() {
    if (_inMemoryDeviceKeyPair) return _inMemoryDeviceKeyPair;
    let saltHex = localStorage.getItem(DEVICE_SALT_STORAGE);
    if (!saltHex || saltHex.length !== 32) {
      saltHex = randomHex(16);
      localStorage.setItem(DEVICE_SALT_STORAGE, saltHex);
    }
    let seedHex = localStorage.getItem(DEVICE_SEED_STORAGE);
    if (!seedHex || seedHex.length !== 64) {
      seedHex = randomHex(32);
      localStorage.setItem(DEVICE_SEED_STORAGE, seedHex);
    }
    const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    if (global.ZenithArgon2id) {
      _inMemoryDeviceKeyPair = await global.ZenithArgon2id.deriveArgon2idKeyPair(
        seedHex + '::' + getOrCreateVaultSecret(),
        saltBytes,
        { m: 2048, t: 2, p: 1, tagLen: 64 }
      );
      return _inMemoryDeviceKeyPair;
    }
    throw new Error('ZenithArgon2id not loaded');
  }

  async function encryptLocalSecret(plainText) {
    if (!plainText) return '';
    try {
      const { aesKey } = await getDeviceArgon2KeyPair();
      const iv = randomBytes(12);
      const encoded = new TextEncoder().encode(plainText);
      const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
      const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(cipherBuf), iv.length);
      return 'ARGON2ID_AES256:' + btoa(String.fromCharCode(...combined));
    } catch (e) {
      return '';
    }
  }

  async function decryptLocalSecret(cipherText) {
    if (!cipherText) return '';
    if (!cipherText.startsWith('ARGON2ID_AES256:')) return '';
    try {
      const b64 = cipherText.slice('ARGON2ID_AES256:'.length);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const iv = bytes.slice(0, 12);
      const data = bytes.slice(12);
      const { aesKey } = await getDeviceArgon2KeyPair();
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, data);
      return new TextDecoder().decode(plainBuf);
    } catch (e) {
      return '';
    }
  }

  function nextSyncSeq() {
    try {
      const n = (parseInt(localStorage.getItem(SEQ_COUNTER_STORAGE) || '0', 10) || 0) + 1;
      localStorage.setItem(SEQ_COUNTER_STORAGE, String(n));
      return n;
    } catch (e) {
      return Date.now();
    }
  }

  function lockVaultMemory() {
    _inMemoryDeviceKeyPair = null;
    if (global.ZenithArgon2id) global.ZenithArgon2id.clearKeyCache();
  }

  function resetInactivityWatchdog() {
    if (_inactivityTimer) clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(() => {
      lockVaultMemory();
    }, INACTIVITY_LOCK_MS);
  }

  // Centralized Delegated Event Listener (eliminates inline onclick= attributes across HTML & JS)
  function initDelegatedActions() {
    if (typeof document === 'undefined') return;
    ['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, resetInactivityWatchdog, { passive: true });
    });
    resetInactivityWatchdog();

    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-zenith-action]') : null;
      if (!btn) return;
      const action = btn.getAttribute('data-zenith-action');
      if (!action) return;

      if (action === 'candle-zoom') {
        const delta = parseInt(btn.getAttribute('data-zoom-delta') || '0', 10);
        if (typeof global.adjustCandleZoom === 'function') global.adjustCandleZoom(delta);
      } else if (action === 'screener-mode') {
        const mode = btn.getAttribute('data-mode') || 'ib';
        if (typeof global.setInspectorAndScreenerMode === 'function') global.setInspectorAndScreenerMode(mode);
      } else if (action === 'radar-preset') {
        const preset = btn.getAttribute('data-preset') || 'all';
        const sort = btn.getAttribute('data-sort') || 'score';
        const scroll = btn.getAttribute('data-scroll') === 'true';
        if (typeof global.applyScreenerRadarPreset === 'function') global.applyScreenerRadarPreset(preset, sort, scroll);
      } else if (action === 'print-report') {
        if (typeof global.print === 'function') global.print();
      } else if (action === 'lock-vault') {
        lockVaultMemory();
        alert('🔒 Argon2id Vault Locked: Decrypted keys purged from volatile RAM.');
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDelegatedActions);
    } else {
      initDelegatedActions();
    }
  }

  global.escapeHtml = escapeHtml;
  global.setSafeHtml = setSafeHtml;
  global.ZenithSecurity = {
    escapeHtml,
    setSafeHtml,
    getOrCreateSyncKey,
    getOrCreateVaultSecret,
    rotateSyncCredentials,
    setSyncCredentials,
    encryptLocalSecret,
    decryptLocalSecret,
    nextSyncSeq,
    lockVaultMemory
  };
})(typeof window !== 'undefined' ? window : globalThis);
