/* Open Note — platform/web.js
   the seam, filled in for a browser tab and for the Electron window */

/* A browser and Electron want exactly the same four things, so they share one
   file. A native shell would add platform/ios.js or platform/android.js beside
   this one, load it after, and overwrite whichever of the four it has to. */

PLAT.name = navigator.userAgent.includes('Electron') ? 'electron' : 'web';
PLAT.touch = matchMedia('(pointer:coarse)').matches;

/* An <a download> is how a page hands over a file everywhere that has a
   downloads folder. The object URL is revoked on the next frame rather than at
   once: some browsers have not started reading the blob by the time click()
   returns, and a revoked URL then downloads nothing. */
PLAT.saveFile = (name, blob) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  requestAnimationFrame(() => URL.revokeObjectURL(a.href));
  return Promise.resolve();
};

PLAT.print = () => window.print();

/* Three doors, because no one of them fires everywhere. beforeunload is the
   desktop's; pagehide is the one a mobile WebView actually sends; a hidden
   visibilitychange is the only warning a backgrounded app gets before it is
   killed outright. All three are best-effort — none of them can await — which
   is why the Electron shell also holds the window closed for flush() rather
   than trusting any of them. */
PLAT.onSuspend = fn => {
  window.addEventListener('beforeunload', fn);
  window.addEventListener('pagehide', fn);
  document.addEventListener('visibilitychange', () => { if(document.hidden) fn(); });
};
