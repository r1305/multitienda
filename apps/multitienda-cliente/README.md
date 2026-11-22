# Multitienda Cliente (Kotlin Multiplatform + Compose Multiplatform)

App nativa del cliente de la web `/multitienda`. Android hoy; la logica vive en `commonMain`.

## Compilar
- JDK 21 (Gradle 8.14.3 no soporta JDK 25/26): `JAVA_HOME=<jdk21>`; Android SDK 35 (`ANDROID_HOME` o `sdk.dir` en `local.properties`).
- Copia `local.properties.example` a `local.properties` (no versionado) y ajusta `api.baseUrl`
  (`https://<dominio>/<base>/api`; emulador contra servidor local: `http://10.0.2.2:3001/api`).
  Si la URL no responde, la app prueba rutas habituales del mismo origen (como la web).
- `./gradlew :composeApp:assembleDebug` y `./gradlew :composeApp:testDebugUnitTest`.

## Estructura
- `commonMain`: `data` (modelos, Ktor, un metodo por endpoint), `domain` (carrito, precios, cupones, estados; con tests), `ui` (Compose).
- `androidMain`: `AndroidPlatform` (SharedPreferences, OkHttp, GPS), `MainActivity`.
- iOS (pendiente): anadir `iosArm64()`/`iosSimulatorArm64()`, `ktor-client-darwin` en `iosMain` y un `actual` de `PlatformBackHandler` + una implementacion de `PlatformServices`.

## Pendiente
- Push FCM: `MultitiendaApi.saveFcmToken` existe, pero falta Firebase (requiere `google-services.json` del proyecto).
- Mapa embebido: el seguimiento muestra distancia y abre el mapa del sistema (`geo:`); no hay SDK de mapas.
