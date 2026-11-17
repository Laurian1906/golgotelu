# Deployare pe Vercel

Golgotelu rulează pe Vercel ca aplicație serverless: FastAPI pentru API, React pentru UI. Datele stau în
Postgres (Neon din Vercel Marketplace), iar fișierele (prezentări, materiale) în OneDrive-ul bisericii.

## Cerințe preliminare

1. **Cont de biserică Microsoft** — un cont personal Microsoft (Outlook/Hotmail) dedicat bisericii, cu OneDrive.
2. **Înregistrare în Entra** (Azure AD) — aplicație de tip „personal Microsoft accounts":
   - Redirect URI: `https://<your-app>.vercel.app/api/auth/callback`
   - Scopuri delegate: `Files.ReadWrite`, `offline_access`, `User.Read`
3. **Postgres pe Neon** — din Vercel Marketplace sau direct de la Neon.
4. **Gemini API Key** — de la Google AI Studio (gratuit, cu limită zilnică).

## Variabile de mediu

Toate se setează ca Secrets în Vercel Dashboard → Settings → Environment Variables:

| Variabilă | Descriere |
|-----------|-----------|
| `DATABASE_URL` | Connection string Postgres de la Neon |
| `GEMINI_API_KEY` | Cheia de la Google AI Studio |
| `CEREBRAS_API_KEY` | (opțional) Fallback când Gemini e indisponibil |
| `OPENROUTER_API_KEY` | (opțional) Alt fallback |
| `MS_CLIENT_ID` | Application (client) ID din Entra |
| `MS_CLIENT_SECRET` | Client secret din Entra |
| `MS_REDIRECT_URI` | `https://<your-app>.vercel.app/api/auth/callback` |
| `ALLOWED_EMAILS` | Emailuri care pot face login (separate cu virgulă) |
| `SESSION_SECRET` | Secret pentru cookies de sesiune (32+ caractere random) |
| `TOKEN_ENCRYPTION_KEY` | Fernet key pentru tokenuri (vezi mai jos) |
| `CRON_SECRET` | Vercel îl setează automat pentru cron jobs |
| `GEMINI_DAILY_BUDGET` | (opțional) Limita zilnică de cereri Gemini |
| `AGENT_RESERVE` | (opțional) Cereri rezervate pentru agent |

### Generare TOKEN_ENCRYPTION_KEY

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Generare SESSION_SECRET

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Structura fișierelor

```
golgotelu/
├── api/
│   └── index.py          # Vercel serverless entrypoint
├── app/                   # Backend Python (FastAPI)
├── ui/                    # Frontend React
├── vercel.json           # Configurare Vercel
└── requirements.txt      # Dependențe Python
```

## Deploy

1. Conectează repository-ul la Vercel (sau folosește `vercel` CLI).
2. Setează variabilele de mediu.
3. Vercel va rula automat build-ul și deployul.

```bash
# CLI (opțional)
npm i -g vercel
vercel login
vercel --prod
```

## Migrare date din SQLite

După primul deploy, rulează scriptul de migrare pentru a copia datele din SQLite local în Postgres:

```bash
python scripts/a5_migrate_to_cloud.py
```

Scriptul este idempotent: verifică numărul de rânduri și nu duplică date.

## Cron Job

Vercel rulează `/api/cron/autopilot` zilnic la ora 6:00 UTC (configurat în `vercel.json`). Pe Hobby plan,
cron jobs rulează o dată pe zi, cu o abatere de până la 1 oră față de ora configurată.

Cron-ul trimite `Authorization: Bearer $CRON_SECRET` — endpoint-ul verifică acest header.

## Rate Limiting

Endpoint-urile costisitoare au limită simplă per-IP (în memorie, per-instanță):
- `/api/board/pick`: 5 cereri / 60 secunde
- `/api/chat`: 10 cereri / 60 secunde
- `/api/replace`: 10 cereri / 60 secunde

## Security Headers

Toate răspunsurile includ (configurate în `vercel.json`):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (API) / `SAMEORIGIN` (UI)
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (doar UI)

## Limite Vercel Hobby

- `maxDuration`: 300 secunde (5 minute) — suficient pentru Gemini
- Bundle: max 500 MB
- Fără SQLite — datele stau în Postgres
- Fără fișiere persistente — materiale generate stau în `/tmp` (șterse între cereri)

## OneDrive vs Folder local

În cloud:
- Prezentările stau în OneDrive-ul bisericii (`Golgotelu/Prezentări/`)
- Materialele publicate ajung în `Golgotelu/Slujbe/<Ziua - ZZ.LL.AAAA>/`
- Indexul bibliotecii e sincronizat în DB (`library_index` table)
- Fișierele temporare ajung în `/tmp` (șterși după cerere)

## Rollback

Vercel păstrează deployment-urile anterioare. Din Dashboard → Deployments, poți face rollback la orice
versiune anterioară cu un click.

## Troubleshooting

- **500 pe /api/health** — verifică `DATABASE_URL` și că migrarea a rulat
- **401 la login** — verifică `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI`
- **403 după login** — emailul nu e în `ALLOWED_EMAILS`
- **429 Too Many Requests** — rate limit; așteaptă 60 secunde
- **Timeout pe /api/board/pick** — Gemini lent; încearcă din nou

## Desktop + Cloud

Aplicația Electron poate folosi backend-ul din cloud în loc de cel local:
- Setează `GOLGOTELU_URL=https://<your-app>.vercel.app` în mediu
- Fereastra încarcă aplicația de pe Vercel
- Serverul local nu pornește
- Autopilot-ul din Windows Task Scheduler se dezactivează (cron-ul din Vercel preia)
