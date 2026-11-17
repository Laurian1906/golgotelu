// Golgotelu desktop shell.
//
// The app is a local Python API (app/web.py) serving the built React UI. This process owns its lifecycle:
// pick a free port, start the server (packaged .exe in a release, the project's .venv in development), wait
// until /api/health answers, then show the window. The server is killed with the app, so opening Golgotelu
// twice never leaves a stray process behind.
//
// Data lives in the Windows user data folder (%APPDATA%/Golgotelu): .env, data/ and out/ — writable without
// admin rights and kept across updates. On first run the bundled seed (database, .env) is copied there.
//
// Cloud mode: if GOLGOTELU_URL is set, the window loads the app from Vercel and the local server doesn't start.
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell, session } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const path = require('node:path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const IS_PACKAGED = app.isPackaged
const IS_SMOKE = process.argv.includes('--smoke')
// Cloud mode: load from Vercel instead of local server.
const CLOUD_URL = process.env.GOLGOTELU_URL || null
const IS_CLOUD = !!CLOUD_URL
// userData also holds Chromium's caches; the app's own files (and the folder the user opens from the menu)
// live in a subfolder, so "Deschide folderul cu date" shows .env, data/, out/ and logs/ — nothing else.
const PROFILE = app.getPath('userData')
const HOME = path.join(PROFILE, 'app')
const LOG_DIR = path.join(HOME, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'server.log')
const STATE_FILE = path.join(HOME, 'window.json')

let server = null
let serverUrl = null
let mainWindow = null
let splashWindow = null
let quitting = false
let starting = null

app.setName('Golgotelu')
if (process.platform === 'win32') app.setAppUserModelId('ro.golgota.golgotelu')

const single = app.requestSingleInstanceLock()
if (!single) app.quit()

// ── helpers ────────────────────────────────────────────────────────────────────────────────────────
function log(line) {
  const text = `[${new Date().toISOString()}] ${line}`
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, `${text}\n`, 'utf8')
  } catch { /* logging must never break the app */ }
  if (!app.isPackaged) console.log(text)
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function writeJson(file, value) {
  try { fs.writeFileSync(file, JSON.stringify(value), 'utf8') } catch { /* not fatal */ }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function health(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: timeoutMs }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try { resolve(res.statusCode === 200 ? JSON.parse(body) : null) } catch { resolve(null) }
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

function cloudHealth(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const healthUrl = new URL('/api/health', url)
    const client = healthUrl.protocol === 'https:' ? https : http
    const req = client.get(healthUrl.href, { timeout: timeoutMs }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try { resolve(res.statusCode === 200 ? JSON.parse(body) : null) } catch { resolve(null) }
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function status(text) {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.webContents.send('start:text', text)
}

// ── security: permission handlers ──────────────────────────────────────────────────────────────────
function setupSecurityHandlers() {
  // Deny all permission requests (camera, microphone, geolocation, notifications, etc.).
  // The app doesn't need any of these.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    log(`Permission denied: ${permission}`)
    callback(false)
  })

  // Also deny permission checks.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return false
  })

  // Prevent navigation to unexpected URLs.
  app.on('web-contents-created', (event, contents) => {
    // Validate IPC sender origin for all IPC handlers.
    contents.on('ipc-message', (event, channel, ...args) => {
      const senderUrl = event.senderFrame?.url || ''
      const allowedOrigins = serverUrl
        ? [serverUrl, `http://127.0.0.1:${new URL(serverUrl).port}`]
        : (CLOUD_URL ? [CLOUD_URL] : [])

      // Allow file:// for splash/error screens.
      if (senderUrl.startsWith('file://')) return

      const isAllowed = allowedOrigins.some(origin => senderUrl.startsWith(origin))
      if (!isAllowed && senderUrl) {
        log(`IPC blocked from unauthorized origin: ${senderUrl}`)
        event.preventDefault()
      }
    })

    // Block new window creation except for external links (which go to shell.openExternal).
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })
  })
}

// ── first run: copy the seed (database, .env) into the user data folder ─────────────────────────────
function seedHome() {
  if (!IS_PACKAGED) return
  fs.mkdirSync(HOME, { recursive: true }) // copyFileSync does not create the destination folder
  const marker = path.join(HOME, '.seeded')
  if (fs.existsSync(marker)) return
  const seed = path.join(process.resourcesPath, 'seed')
  if (!fs.existsSync(seed)) { log('no seed folder'); return }
  let failed = 0
  for (const name of fs.readdirSync(seed)) {
    try {
      const from = path.join(seed, name)
      const to = path.join(HOME, name)
      if (fs.existsSync(to)) continue // never overwrite what the user already has
      if (fs.statSync(from).isDirectory()) fs.cpSync(from, to, { recursive: true })
      else fs.copyFileSync(from, to)
    } catch (err) {
      failed += 1
      log(`seed ${name} failed: ${err.message}`)
    }
  }
  // No marker after a failure: the next start retries the missing files.
  if (failed === 0) {
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8')
    log(`seeded ${HOME} from ${seed}`)
  }
}

// ── backend ────────────────────────────────────────────────────────────────────────────────────────
function serverCommand() {
  if (IS_PACKAGED) {
    const exe = path.join(process.resourcesPath, 'server', 'golgotelu-server.exe')
    if (!fs.existsSync(exe)) throw new Error(`Serverul nu a fost găsit: ${exe}`)
    return { command: exe, args: [], cwd: path.dirname(exe) }
  }
  const python = process.env.GOLGOTELU_PYTHON || path.join(PROJECT_ROOT, '.venv', 'Scripts', 'python.exe')
  return { command: python, args: ['-m', 'app.web'], cwd: PROJECT_ROOT }
}

async function stopServer() {
  if (!server) return
  const child = server
  server = null
  log(`stopping server (pid ${child.pid})`)
  try {
    if (process.platform === 'win32') {
      // Kill the whole tree: uvicorn may have spawned workers.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      child.kill('SIGTERM')
    }
  } catch (err) {
    log(`stop failed: ${err.message}`)
  }
  await sleep(400)
}

async function startServer() {
  await stopServer()
  seedHome()

  const port = await freePort()
  const { command, args, cwd } = serverCommand()
  const env = {
    ...process.env,
    GOLGOTELU_HOME: IS_PACKAGED ? HOME : PROJECT_ROOT,
    GOLGOTELU_NO_BROWSER: '1',
    GOLGOTELU_PORT: String(port),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    PYTHONUTF8: '1',
  }
  log(`starting server: ${command} ${args.join(' ')} (port ${port})`)
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const out = fs.createWriteStream(LOG_FILE, { flags: 'a' })

  server = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let exited = null
  server.stdout.on('data', (d) => out.write(d))
  server.stderr.on('data', (d) => out.write(d))
  server.on('error', (err) => { exited = err.message; log(`server error: ${err.message}`) })
  server.on('exit', (code, signal) => {
    exited = `Serverul s-a oprit (cod ${code}${signal ? `, ${signal}` : ''}).`
    log(`server exited: code=${code} signal=${signal}`)
    if (!quitting) reportFailure(exited)
  })

  const deadline = Date.now() + 120_000
  let ready = null
  while (Date.now() < deadline) {
    if (exited) break
    ready = await health(port)
    if (ready && ready.ok) break
    await sleep(250)
  }
  if (!ready || !ready.ok) {
    throw new Error(exited || 'Serverul local nu a răspuns în timp util.')
  }
  serverUrl = `http://127.0.0.1:${port}`
  log(`server ready: ${serverUrl} (v${ready.version})`)
  return serverUrl
}

async function connectToCloud() {
  status('Conectare la server…')
  log(`cloud mode: connecting to ${CLOUD_URL}`)

  const deadline = Date.now() + 15_000
  let ready = null
  while (Date.now() < deadline) {
    ready = await cloudHealth(CLOUD_URL)
    if (ready && ready.ok) break
    await sleep(500)
  }
  if (!ready || !ready.ok) {
    throw new Error(`Serverul cloud nu răspunde: ${CLOUD_URL}`)
  }
  serverUrl = CLOUD_URL
  log(`cloud ready: ${serverUrl} (v${ready.version})`)
  return serverUrl
}

// ── windows ───────────────────────────────────────────────────────────────────────────────────────
const splashHtml = path.join(__dirname, 'splash.html')
const errorHtml = path.join(__dirname, 'error.html')

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 250,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#0e1014',
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  splashWindow.loadFile(splashHtml)
  splashWindow.once('ready-to-show', () => { if (!IS_SMOKE) splashWindow.show() })
}

function overlayColors() {
  return nativeTheme.shouldUseDarkColors
    ? { color: '#18191b', symbolColor: '#edeef0' }
    : { color: '#ffffff', symbolColor: '#1c2024' }
}

function createMainWindow(url) {
  const saved = readJson(STATE_FILE, {})
  const bounds = {
    width: Math.max(960, saved.width || 1440),
    height: Math.max(640, saved.height || 920),
    ...(Number.isInteger(saved.x) && Number.isInteger(saved.y) ? { x: saved.x, y: saved.y } : {}),
  }
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111113' : '#f9f9fb',
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...overlayColors(), height: 56 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // Security: disable features the app doesn't need.
      webgl: false,
      enableWebSQL: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
    splashWindow = null
    if (!IS_SMOKE) mainWindow.show()
  })

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
    const b = mainWindow.getNormalBounds()
    writeJson(STATE_FILE, b)
  }
  mainWindow.on('resized', saveBounds)
  mainWindow.on('moved', saveBounds)

  // External links open in the user's browser; the app never leaves its own origin.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    // Allow navigation within the app's origin.
    const allowedOrigin = serverUrl ? new URL(serverUrl).origin : null
    if (allowedOrigin && targetUrl.startsWith(allowedOrigin)) return
    // Allow OAuth redirects to Microsoft login.
    if (targetUrl.startsWith('https://login.microsoftonline.com/')) return
    // Block everything else; open external links in browser.
    event.preventDefault()
    if (/^https?:/i.test(targetUrl)) shell.openExternal(targetUrl)
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`did-fail-load ${code} ${desc} ${url}`)
    if (!quitting && code !== -3) showError(`Pagina nu s-a putut încărca (${desc}).`)
  })

  mainWindow.loadURL(url)
  mainWindow.on('closed', () => { mainWindow = null })

  if (IS_SMOKE) smokeCheck()
}

function showError(message) {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
  splashWindow = null
  const query = { message: String(message).slice(0, 500), log: LOG_FILE }
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({
      width: 720,
      height: 460,
      show: !IS_SMOKE,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    mainWindow.on('closed', () => { mainWindow = null })
  } else {
    mainWindow.show()
  }
  mainWindow.loadFile(errorHtml, { query })
}

function reportFailure(message) {
  if (IS_SMOKE) { console.log(`SMOKE FAIL ${message}`); app.exit(1); return }
  showError(message)
}

// ── start-up flow ────────────────────────────────────────────────────────────────────────────────
async function boot() {
  if (isBuilding()) return
  isBuilding(true)
  try {
    createSplash()
    let url
    if (IS_CLOUD) {
      url = await connectToCloud()
    } else {
      status('Pornesc serverul local…')
      url = await startServer()
    }
    status('Pregătesc cântările…')
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy()
    createMainWindow(url)
  } catch (err) {
    log(`boot failed: ${err.message}`)
    reportFailure(err.message)
  } finally {
    isBuilding(false)
  }
}

let building = false
function isBuilding(value) {
  if (value === undefined) return building
  building = value
}

// ── smoke check: proves the window really renders the app (used by CI and by me after a build) ──────
async function smokeCheck() {
  try {
    await new Promise((r) => mainWindow.webContents.once('did-finish-load', r))
    await sleep(2500)
    const result = await mainWindow.webContents.executeJavaScript(`(() => {
      const bar = document.querySelector('.appbar')
      return {
        title: document.title,
        tiles: document.querySelectorAll('.tile, .ghost-slide').length,
        appbar: !!bar,
        // The bar is flex only when index.css loaded: proves the bundled assets are served, not just HTML.
        styled: bar ? getComputedStyle(bar).display === 'flex' : false,
        fonts: document.fonts ? document.fonts.size : 0,
        shell: getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() !== '',
        electron: document.documentElement.dataset.shell === 'electron',
        subtitle: document.querySelector('.board__head h1')?.textContent || null,
      }
    })()`)
    console.log(`SMOKE ${JSON.stringify(result)}`)
    const ok = result.appbar && result.styled && result.shell && result.tiles > 0
    console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL ui-incomplete')
    app.exit(ok ? 0 : 1)
  } catch (err) {
    console.log(`SMOKE FAIL ${err.message}`)
    app.exit(1)
  }
}

// ── menu ─────────────────────────────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Golgotelu',
      submenu: [
        { label: 'Despre Golgotelu', click: () => showAbout() },
        { type: 'separator' },
        ...(IS_CLOUD ? [] : [
          { label: 'Deschide folderul cu date', click: () => shell.openPath(HOME) },
          { label: 'Deschide jurnalul serverului', click: () => shell.openPath(LOG_FILE) },
          { type: 'separator' },
          { label: 'Repornește serverul', accelerator: 'CmdOrCtrl+Shift+R', click: () => { void boot() } },
          { type: 'separator' },
        ]),
        { role: 'quit', label: 'Ieși' },
      ],
    },
    {
      label: 'Editare',
      submenu: [
        { role: 'undo', label: 'Anulează' }, { role: 'redo', label: 'Refă' }, { type: 'separator' },
        { role: 'cut', label: 'Taie' }, { role: 'copy', label: 'Copiază' },
        { role: 'paste', label: 'Lipește' }, { role: 'selectAll', label: 'Selectează tot' },
      ],
    },
    {
      label: 'Vizualizare',
      submenu: [
        { role: 'reload', label: 'Reîncarcă' },
        { role: 'togglefullscreen', label: 'Ecran complet' },
        { role: 'zoomIn', label: 'Mărește' }, { role: 'zoomOut', label: 'Micșorează' },
        { role: 'resetZoom', label: 'Mărime normală' },
        ...(IS_PACKAGED ? [] : [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Unelte dezvoltator' }]),
      ],
    },
    {
      label: 'Ajutor',
      submenu: [
        ...(IS_CLOUD ? [] : [
          { label: 'Deschide pagina aplicației', click: () => { if (serverUrl) shell.openExternal(serverUrl) } },
          { label: 'Fișierul de configurare (.env)', click: () => shell.openPath(path.join(IS_PACKAGED ? HOME : PROJECT_ROOT, '.env')) },
        ]),
        ...(IS_CLOUD ? [
          { label: 'Deschide aplicația în browser', click: () => { if (serverUrl) shell.openExternal(serverUrl) } },
        ] : []),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function showAbout() {
  const modeText = IS_CLOUD ? `Cloud: ${CLOUD_URL}` : `Server: ${serverUrl || 'oprit'}`
  dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'info',
    title: 'Despre Golgotelu',
    message: `Golgotelu ${app.getVersion()}`,
    detail: [
      'Alege cântările de duminică și pregătește prezentările.',
      '',
      ...(IS_CLOUD ? [] : [`Date: ${HOME}`]),
      modeText,
      `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
    ].join('\n'),
  })
}

// ── IPC for the UI and the error screen ─────────────────────────────────────────────────────────
// Security: validate sender origin for IPC handlers.
function validateIpcSender(event) {
  const senderUrl = event.senderFrame?.url || ''
  // Allow file:// for splash/error screens.
  if (senderUrl.startsWith('file://')) return true
  // Allow the server origin.
  if (serverUrl && senderUrl.startsWith(serverUrl)) return true
  // Allow cloud origin.
  if (CLOUD_URL && senderUrl.startsWith(CLOUD_URL)) return true
  log(`IPC rejected from: ${senderUrl}`)
  return false
}

ipcMain.handle('server:restart', async (event) => {
  if (!validateIpcSender(event)) return { ok: false, error: 'Unauthorized' }
  if (IS_CLOUD) return { ok: false, error: 'Cloud mode: no local server' }
  try { await boot(); return { ok: true, url: serverUrl } }
  catch (err) { return { ok: false, error: err.message } }
})
ipcMain.handle('app:logs', (event) => {
  if (!validateIpcSender(event)) return
  shell.openPath(LOG_FILE)
})
ipcMain.handle('app:data', (event) => {
  if (!validateIpcSender(event)) return
  shell.openPath(HOME)
})
ipcMain.handle('app:version', (event) => {
  if (!validateIpcSender(event)) return null
  return { app: app.getVersion(), electron: process.versions.electron, server: serverUrl, cloud: IS_CLOUD }
})

// ── lifecycle ───────────────────────────────────────────────────────────────────────────────────
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  setupSecurityHandlers()
  buildMenu()
  void boot()
})

nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitleBarOverlay?.({ ...overlayColors(), height: 56 })
  }
})

app.on('before-quit', async (event) => {
  if (quitting) return
  quitting = true
  event.preventDefault()
  if (!IS_CLOUD) await stopServer()
  app.exit(0)
})

app.on('window-all-closed', () => { app.quit() })

process.on('uncaughtException', (err) => {
  log(`uncaught: ${err.stack || err.message}`)
  reportFailure(err.message)
})
