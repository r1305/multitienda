package com.quicklysolutions.multitienda.delivery.platform

import com.quicklysolutions.multitienda.delivery.model.GeoPoint
import kotlinx.coroutines.flow.StateFlow

interface KeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)
}

enum class MapApp { GOOGLE_MAPS, WAZE }

/** Lo que cada plataforma (Android hoy, iOS después) debe aportar al código común. */
interface PlatformServices {
    /** Almacenamiento propio de la app del repartidor (nunca el del cliente). */
    val store: KeyValueStore

    val locationGranted: StateFlow<Boolean>

    fun requestPermissions()

    /** Posición actual, o null si no hay permiso / señal. */
    suspend fun currentLocation(): GeoPoint?

    /** Inicia el envío periódico de GPS mientras haya pedidos activos (Android: servicio en primer plano). */
    fun startTracking()

    fun stopTracking()

    /** Abre navegación externa hacia las coordenadas. */
    fun openMap(app: MapApp, lat: Double, lng: Double)
}
