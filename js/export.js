// Zenith SX v29.0 — Cross-Platform Export Engine (Capacitor Android + Web Share + Desktop)
(function (global) {
  'use strict';

  function toBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  async function downloadFile(filename, content, mimeType) {
    const safeMime = mimeType || 'text/plain;charset=utf-8';
    const textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    // 1. Native Android / iOS Capacitor Runtime (Filesystem + Share)
    const cap = global.Capacitor;
    if (cap && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
      try {
        const { Filesystem, Share } = cap.Plugins;
        const result = await Filesystem.writeFile({
          path: filename,
          data: toBase64Utf8(textContent),
          directory: 'CACHE'
        });
        await Share.share({
          title: filename,
          text: 'Zenith SX Export: ' + filename,
          url: result.uri,
          dialogTitle: 'Save or Share ' + filename
        });
        return { ok: true, mode: 'capacitor' };
      } catch (err) {
        console.warn('Capacitor export failed, falling back:', err);
      }
    }

    // 2. Android Chrome / PWA Web Share API (supports File objects natively!)
    const blob = new Blob([textContent], { type: safeMime });
    if (navigator.canShare && typeof File !== 'undefined') {
      try {
        const fileObj = new File([blob], filename, { type: safeMime.split(';')[0] });
        if (navigator.canShare({ files: [fileObj] })) {
          await navigator.share({
            title: filename,
            files: [fileObj]
          });
          return { ok: true, mode: 'web-share' };
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return { ok: false, cancelled: true };
      }
    }

    // 3. Standard Desktop / Browser Blob Download
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return { ok: true, mode: 'blob' };
    } catch (err) {
      console.error('Export failed:', err);
      return { ok: false, error: err };
    }
  }

  async function printOrShareReport(htmlContent, title) {
    const safeTitle = (title || 'Zenith_SX_Report').replace(/[^a-zA-Z0-9_-]/g, '_');
    // Inside Android WebView / Capacitor, window.print() is unsupported -> export shareable HTML report
    const isAndroidWebView = /Android/i.test(navigator.userAgent) && (!!global.Capacitor || /wv\)/i.test(navigator.userAgent));
    if (isAndroidWebView) {
      return downloadFile(safeTitle + '.html', htmlContent, 'text/html;charset=utf-8');
    }

    try {
      const win = global.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(htmlContent);
        win.document.close();
        win.focus();
        setTimeout(() => { try { win.print(); } catch (e) {} }, 350);
        return { ok: true, mode: 'print-window' };
      }
    } catch (e) {}

    // Fallback to downloadable HTML report if popup blocked
    return downloadFile(safeTitle + '.html', htmlContent, 'text/html;charset=utf-8');
  }

  global.ZenithExport = {
    downloadFile,
    printOrShareReport
  };
})(window);
