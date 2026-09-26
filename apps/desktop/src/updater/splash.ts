import { BrowserWindow } from "electron";
import type { UpdateHooks } from "./types.js";

/** The small "Checking for updates… / Downloading…" window shown at startup and during manual updates. */
export interface Splash extends UpdateHooks {
  close(): void;
}

export function createSplash(): Splash {
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#151517;color:#f0f0f1;font:13px system-ui,sans-serif;-webkit-app-region:drag;user-select:none;overflow:hidden}
    h1{margin:0 0 14px;font-size:20px;font-weight:600}
    #s{color:#86868c;margin-bottom:14px;min-height:16px}
    .bar{width:220px;height:4px;background:#26262a;border-radius:2px;overflow:hidden}
    #b{height:100%;width:0;background:#3b82f6;border-radius:2px;transition:width .2s}
    #b.ind{width:40%;animation:slide 1.1s ease-in-out infinite}
    @keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}}
  </style><h1>Stemify</h1><div id="s">Starting…</div><div class="bar"><div id="b" class="ind"></div></div>
  <script>
    function setStatus(t){document.getElementById('s').textContent=t}
    function setProgress(f){var b=document.getElementById('b');if(f===null){b.className='ind';b.style.width=''}else{b.className='';b.style.width=Math.round(f*100)+'%'}}
  </script>`;
  const win = new BrowserWindow({
    width: 340,
    height: 190,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#151517",
    title: "Stemify",
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  const exec = (code: string) => {
    if (!win.isDestroyed()) void win.webContents.executeJavaScript(code).catch(() => {});
  };
  return {
    status: (text) => exec(`setStatus(${JSON.stringify(text)})`),
    progress: (f) => exec(`setProgress(${f === null ? "null" : f})`),
    close: () => {
      if (!win.isDestroyed()) win.close();
    },
  };
}
