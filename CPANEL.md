# cPanel — Multitienda (5 apps en la misma cuenta)

Si tienes **varias apps Node** en un solo cPanel, cada una suma procesos `lsnode`. Para no saturar el plan:

| App | Carpeta | Startup recomendado |
|-----|---------|---------------------|
| Multitienda | `multitienda-node` | `passenger_app.js` |
| Allison | `allison` | `passenger_app.js` |
| Find Your Pet | `find_your_pet` | `passenger_app.js` |
| Cotizaciones | `cotizaciones labsuperfood` | `passenger_app.js` |
| VHM | `vhm` | `app.js` |

## Reglas

1. **Una** entrada en *Setup Node.js App* **por dominio** (no duplicar la misma app).
2. **No** ejecutar `npm run start:pm2` con `ecosystem.config.js` en cPanel (usa `ecosystem.cpanel.config.js` solo en VPS).
3. `.env`: `SESSION_STORE=memory`, `ENABLE_NOTIFICATION_WORKER=true` (sin Redis).
4. Tras cambiar código: **Stop** todas las apps Node → esperar 1 min → **Start** solo las que necesitas.

## Multitienda

```bash
cp .env.example .env
npm run install:cpanel
```

- En `.env`: `APP_BASE_PATH=/multitienda` (rutas bajo `/multitienda/*`: cliente, admin, delivery, store-owner, API).
- Con el **gateway unificado** (`F:/apps`), solo una app Node; multitienda se monta en `/multitienda`.
- `deploy/.htaccess.example` → `PassengerStartupFile passenger_app.js`
- Firebase: `firebase-admin` + `FIREBASE_CREDENTIALS`

## PM2 en VPS (no cPanel)

```bash
npm run start:pm2          # cluster + worker
pm2 start ecosystem.cpanel.config.js   # solo si insistes en PM2 con 1 instancia
```
