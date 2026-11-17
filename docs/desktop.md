# Aplicația de desktop (Electron)

Golgotelu se instalează ca o aplicație Windows obișnuită: iconiță în Start și pe desktop, fereastră proprie,
fără browser și fără terminal. În spate rulează exact serverul Python din `app/web.py`, împachetat împreună cu
interfața — deci tot ce funcționează în browser funcționează și aici.

```
Golgotelu.exe (Electron)
   ├─ pornește  resources\server\golgotelu-server.exe   (FastAPI + uvicorn + UI-ul construit)
   ├─ așteaptă  GET /api/health
   └─ deschide fereastra pe http://127.0.0.1:<port liber>
```

Serverul ascultă doar pe `127.0.0.1`, pe un port liber ales la fiecare pornire, și este oprit când închizi
aplicația (inclusiv procesele lui). O a doua lansare aduce în față fereastra existentă, nu pornește un al
doilea server.

## Instalare

Rulează `release\Golgotelu-Setup-<versiune>.exe`. Instalarea se face **per utilizator** (în `%LOCALAPPDATA%\Programs\Golgotelu\`),
fără a cere permisiuni de administrator. Instalatorul creează scurtături în Start și pe desktop;
dezinstalarea se face din Settings → Apps sau cu `Uninstall Golgotelu.exe`.

> **Notă:** `nsis.perMachine: false` în `package.json` — instalare per utilizator, fără UAC. Dacă se dorește
> instalare pentru toți utilizatorii (`C:\Program Files\`), se poate schimba în `true`, dar va cere UAC.

La prima pornire, aplicația copiază în folderul ei de date fișierele de pornire (`seed`): `.env` (cheile API)
și baza de date cu biblioteca, istoricul și profilurile. Ce există deja **nu** este suprascris, deci o
reinstalare sau un update nu îți ating datele.

## Unde stau datele

| Ce | Unde |
|---|---|
| Folderul cu date (butonul din meniu) | `%APPDATA%\Golgotelu\app\` |
| Configurare (`.env`: chei API, modele) | `%APPDATA%\Golgotelu\app\.env` |
| Baza de date | `%APPDATA%\Golgotelu\app\data\golgotelu.db` |
| Setări din aplicație | `%APPDATA%\Golgotelu\app\data\settings.json` |
| Materiale generate | `%APPDATA%\Golgotelu\app\out\` |
| Jurnalul serverului | `%APPDATA%\Golgotelu\app\logs\server.log` |

Restul folderului `%APPDATA%\Golgotelu\` este profilul Chromium (cache, `localStorage`); nu conține datele
tale și nu trebuie atins.

Din meniul **Golgotelu** ajungi direct la folderul cu date, la jurnal și la `.env`. Meniul mai are
„Repornește serverul" (Ctrl+Shift+R), util după ce schimbi ceva în `.env`.

Când rulezi din sursă (`npm run dev`), datele rămân în folderul proiectului, ca la `Golgotelu.bat`, ca să
lucrezi pe aceeași bază.

## Regulile agentului (skill-ul echipei)

Aplicația lasă bisericii un loc unde să-i scrie agentului regulile ei, fără cod și fără să atingă prompturile:
un fișier Markdown numit `AGENTS.md`, în folderul partajat din OneDrive (cel folosit și de „Pune pe OneDrive").
Se scrie din **Setări → Regulile echipei pentru agent** (sau în orice editor, prin „Deschide folderul"); fiind
în OneDrive, ajunge la fel pe toate PC-urile.

- Regulile intră la fiecare apel care alege sau explică o cântare: alegerea de duminică, „Altă cântare",
  înlocuirea și discuția cu agentul. Sunt enunțate ca angajamente ale bisericii, dar nu pot schimba structura
  slujbei sau doctrina, care rămân în instrucțiunile de bază.
- Fișierul lipsește sau e gol → agentul folosește exact instrucțiunile lui, ca înainte.
- Limite: 20.000 de caractere în fișier, primele 6.000 ajung într-o cerere (restul contextului e pentru cântări
  și versuri). Salvare se face atomic, ca OneDrive să nu sincronizeze un fișier pe jumătate scris.
- Dacă folderul nu e sincronizat pe PC-ul respectiv, aplicația spune asta în Setări (și la salvare) în loc să
  scrie în altă parte.

## Construire

Din rădăcina proiectului:

```bat
npm install                 :: o singură dată (Electron + electron-builder)
npm run dist                :: UI + server + installer, în release\
```

`npm run dist` face trei lucruri, în ordine:

1. `npm run ui` — `npm --prefix ui run build` (interfața, în `ui/dist`);
2. `npm run server` — `scripts/build_server.py`: PyInstaller împachetează API-ul + UI-ul în
   `dist/server/golgotelu-server.exe` și pregătește `dist/seed` (`.env` + baza de date);
3. `electron-builder` — adună totul în `release\Golgotelu-Setup-<versiune>.exe` (și în `release\win-unpacked\`
   pentru testare fără instalare).

Părți utile separat: `npm run ui`, `npm run server`, `npm run icon` (regeneră `desktop/icons/icon.ico`),
`npm run dist:dir` (doar folderul deblocat, fără installer).

## Dezvoltare și verificare

```bat
npm run dev        :: fereastra Electron peste .venv\Scripts\python -m app.web (fără browser)
npm run smoke      :: pornește tot lanțul, verifică faptul că UI-ul chiar se randează, iese cu 0/1
```

Testele de interfață rulează în Playwright, pe trei dimensiuni (desktop, tabletă, telefon):

```bat
cd ui
npx playwright test                              :: 51 de verificări (fluxuri, tipografie, a11y, responsive)
npx playwright test -c playwright.electron.config.ts   :: fereastra Electron reală
```

Ambele suite sunt **read-only**: nu salvează liste, nu cheltuie cotă de model și nu pornesc o discuție cu
agentul, deci pot rula oricând, pe datele reale. Serverul și Vite pornesc automat (sau sunt refolosite dacă
rulează deja).

## Depanare

- **„Aplicația nu a pornit"** — fereastra de eroare arată motivul, cu butoane pentru jurnal, folderul de date
  și „Încearcă din nou". Cauze frecvente: `.env` fără cheie API, altă copie încă pornită, antivirusul a blocat
  serverul.
- **SmartScreen** — installerul nu este semnat cu certificat, așa că Windows poate cere confirmare
  („More info" → „Run anyway"). Semnarea se adaugă în `package.json` → `build.win` când există certificat.
- **Portul** — nu se fixează: fiecare pornire alege un port liber, deci nu se ceartă cu `Golgotelu.bat` sau cu
  alte aplicații.
- **Actualizări** — deocamdată manual: rulezi installerul nou peste cel vechi; datele din `%APPDATA%` rămân.
  Auto-update-ul cere un server de release-uri și semnare, deci nu e inclus.
- **Windows x64** este singura țintă construită. Pentru altceva: `electron-builder --win --x64 --arm64`.

## Mod cloud

Aplicația Electron poate folosi backend-ul din cloud (Vercel) în loc de serverul local:

```bat
set GOLGOTELU_URL=https://your-app.vercel.app
npm run dev
```

În modul cloud:
- Fereastra încarcă aplicația de pe Vercel
- Serverul local **nu** pornește
- Meniul „Repornește serverul" și „Deschide folderul cu date" nu apar
- Autopilot-ul din Windows Task Scheduler ar trebui dezactivat (cron-ul Vercel preia)

## Securitate Electron

Aplicația respectă [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security):

- **`sandbox: true`** pe toate ferestrele — procesul de rendering e izolat
- **`contextIsolation: true`** — preload-ul nu expune Node.js în pagină
- **`nodeIntegration: false`** — pagina nu are acces la Node.js APIs
- **`session.setPermissionRequestHandler`** — refuză toate permisiunile (camera, microfon, locație, etc.)
- **IPC validation** — toate IPC handler-ele verifică `event.senderFrame.url` (doar originea serverului)
- **Navigation guards** — navigarea în afara originii aplicației e blocată și deschisă în browser
- **New window handler** — link-urile externe se deschid în browser, nu în ferestre noi
