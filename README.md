# Multitienda - Node.js Backend

Backend convertido de Laravel 5.8 a Node.js (Express + Sequelize).
Usa la **misma base de datos MySQL** del proyecto original sin cambios en el schema.

## Requisitos
- Node.js >= 16
- MySQL (misma DB del proyecto Laravel)

## Instalación

```bash
cd F:/multitienda-node
npm install
```

## Configuración

Editar `.env`:
```
DB_DATABASE=nombre_de_tu_base_de_datos
DB_USERNAME=usuario_mysql
DB_PASSWORD=contraseña_mysql
JWT_SECRET=FUoOd2DmVTePhcKt3JMBFICPCoaUIF27
```

## Copiar el frontend

Copiar los archivos del frontend React compilado del proyecto original:
```
xcopy F:\multitienda\public F:\multitienda-node\public /E /I
xcopy F:\multitienda\static F:\multitienda-node\public\static /E /I
copy F:\multitienda\index.html F:\multitienda-node\public\index.html
```

## Ejecutar

```bash
# Producción
npm start

# Desarrollo (con auto-reload)
npm run dev
```

El servidor arranca en `http://localhost:3000`

## Estructura

```
src/
├── config/database.js      # Conexión Sequelize/MySQL
├── middleware/auth.js       # JWT middleware
├── models/index.js          # Todos los modelos Sequelize
├── controllers/
│   ├── userController.js    # Login, register, perfil
│   ├── restaurantController.js  # Restaurantes, items, búsqueda
│   ├── orderController.js   # Pedidos, cancelación
│   ├── storeOwnerController.js  # App tienda
│   └── miscControllers.js   # Settings, SMS, notificaciones, delivery, etc.
├── routes/api.js            # Todas las rutas API
└── helpers/utils.js         # Utilidades (distancia, ratings, etc.)
```

## Rutas API

Todas las rutas son idénticas a las del proyecto Laravel original (`/api/*`).
El frontend React existente funciona sin modificaciones.

## Despliegue en servidor

### Con PM2
```bash
npm install -g pm2
pm2 start server.js --name multitienda
pm2 save
pm2 startup
```

### Con Nginx (proxy reverso)
```nginx
server {
    listen 80;
    server_name tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /storage {
        alias /ruta/a/multitienda-node/storage;
    }
}
```
