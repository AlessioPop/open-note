/* Open Note — platform/platform.js
   the seam between the app and whatever is hosting it */

/* ================= the platform seam =================
   Nothing above this file knows whether it is running in a browser tab, in the
   Electron window, or one day in a WKWebView or an Android WebView. Everything
   that differs between those goes through the four calls below, and each host
   fills them in by assigning to PLAT — `platform/web.js` does it for the two
   hosts that exist today, and a native shell would add its own file beside it
   and be the last one loaded.

   Four things, and only four, actually differ:

     saveFile(name, blob)   handing the user a file. A browser downloads it; a
                            phone has no downloads folder and must go through
                            the share sheet, which is a native call.
     print()                window.print() on a desktop; iOS needs
                            UIPrintInteractionController from the native side.
     onSuspend(fn)          "you are about to lose the page — write now".
                            beforeunload never fires on iOS; pagehide and a
                            hidden visibilitychange do.
     info()                 what the app is allowed to assume: touch, whether
                            files can be downloaded at all, the host's name.

   Two things that are NOT in here, because they need no seam:

   - Storage. IndexedDB works in every WebView the app will ever run in, and
     core/store.js already falls back to memory when it does not.
   - Picking a file. <input type="file"> opens the photo library, the files app
     and a desktop file dialog alike.

   One thing that is not code at all but is load-bearing everywhere: THE APP
   MUST BE SERVED FROM ITS OWN ORIGIN. Every `file://` page on a machine shares
   one origin and therefore one IndexedDB, and Firefox refuses IndexedDB on
   `file://` outright. Electron serves `opennote://app`; on iOS that is a
   WKURLSchemeHandler, on Android a WebViewAssetLoader. The scheme and host are
   the identity the user's notes are filed under — changing either orphans them,
   so all three shells must agree on `opennote://app`. */

const PLAT = {
  name: 'web',
  saveFile: null,          // (name, blob) => Promise<void>
  print: null,             // () => void
  onSuspend: null,         // (fn) => void
  touch: false,            // a finger rather than a pointer
  canDownload: true        // false where a blob has to go through a share sheet
};

const plSaveFile = (name, blob) => PLAT.saveFile(name, blob);
const plPrint = () => PLAT.print();
const plOnSuspend = fn => PLAT.onSuspend(fn);
