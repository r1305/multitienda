# Multitienda Delivery (repartidor) — Kotlin Multiplatform

App nativa del repartidor (Compose Multiplatform). Replica `public/app/js/delivery.js` de la web `/multitienda`.
Hoy solo Android; el código de negocio y la UI están en `commonMain`.

## Estructura
```
composeApp/src/commonMain   API (Ktor), modelos, reglas (OrderFlow), ViewModel, pantallas
composeApp/src/androidMain  AndroidPlatform (almacenamiento cifrado, ubicación, mapas externos), TrackingService (GPS), MainActivity
composeApp/src/commonTest   tests (OrderFlow, parseo, DeliveryApi con MockEngine)
```

## Configuración
- URL del API: `AppConfig.API_BASE` en `commonMain/.../config/AppConfig.kt` (única constante).
- SDK: `local.properties` con `sdk.dir=...` (no se versiona). JDK 17+ (probado con JBR 21; con JDK 25/26 Gradle 8.14 no arranca).

## Comandos
```
set JAVA_HOME=%USERPROFILE%\.jdks\jbr-21.0.11
gradlew.bat :composeApp:assembleDebug
gradlew.bat :composeApp:testDebugUnitTest
```
APK: `composeApp/build/outputs/apk/debug/composeApp-debug.apk`.

## Añadir iOS
1. En `composeApp/build.gradle.kts` añadir `iosArm64()`/`iosSimulatorArm64()` con framework estático y `ktor-client-darwin` en `iosMain`.
2. Implementar `PlatformServices` en `iosMain` (Keychain, CoreLocation, apertura de Maps/Waze) y un `MainViewController` que llame a `App(container, backHandler)`.

## Pendiente conocido
- Push (FCM): `DeliveryApi.saveFcmToken` / `saveNotificationToken` están listos; falta añadir Firebase (requiere el `google-services.json` del proyecto, que no se versiona).
- El mapa es externo (Google Maps / Waze por coordenadas), no hay SDK de mapas.
