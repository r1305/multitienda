package com.quicklysolutions.multitienda.cliente

import androidx.compose.runtime.Composable
import io.ktor.client.HttpClient

interface KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String?)
}

sealed interface LocationResult {
    data class Found(val lat: Double, val lng: Double) : LocationResult
    data object PermissionDenied : LocationResult
    data object ServicesOff : LocationResult
    data object Unavailable : LocationResult
}

/** Todo lo que depende de la plataforma. Android: AndroidPlatform. iOS (pendiente): implementar esta interfaz con NSUserDefaults, Darwin y CoreLocation. */
interface PlatformServices {
    val store: KeyValueStore
    val apiBaseUrl: String
    fun createHttpClient(): HttpClient
    suspend fun currentLocation(): LocationResult
}

@Composable
expect fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit)
