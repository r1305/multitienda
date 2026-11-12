package com.quicklysolutions.multitienda.cliente

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.os.CancellationSignal
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

private class PrefsStore(context: Context) : KeyValueStore {
    private val prefs = context.getSharedPreferences("multitienda_cliente", Context.MODE_PRIVATE)
    override fun getString(key: String): String? = prefs.getString(key, null)
    override fun putString(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }
}

/** Debe construirse en onCreate (registra el lanzador de permisos antes de STARTED). */
class AndroidPlatform(private val activity: ComponentActivity) : PlatformServices {
    override val store: KeyValueStore = PrefsStore(activity.applicationContext)
    override val apiBaseUrl: String = BuildConfig.API_BASE_URL

    private var pendingPermission: CompletableDeferred<Boolean>? = null
    private val permissionLauncher = activity.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        pendingPermission?.complete(result.values.any { it })
        pendingPermission = null
    }

    override fun createHttpClient(): HttpClient = HttpClient(OkHttp) {
        install(HttpTimeout) {
            connectTimeoutMillis = 10_000
            requestTimeoutMillis = 20_000
            socketTimeoutMillis = 20_000
        }
    }

    private fun hasLocationPermission(): Boolean =
        listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).any {
            ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
        }

    @SuppressLint("MissingPermission")
    override suspend fun currentLocation(): LocationResult {
        if (!hasLocationPermission()) {
            val ask = CompletableDeferred<Boolean>().also { pendingPermission = it }
            permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            if (!ask.await()) return LocationResult.PermissionDenied
        }
        val lm = activity.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter {
            runCatching { lm.isProviderEnabled(it) }.getOrDefault(false)
        }
        if (providers.isEmpty()) return LocationResult.ServicesOff
        for (provider in providers) {
            val fix = withTimeoutOrNull(10_000) {
                suspendCancellableCoroutine<Location?> { cont ->
                    val signal = CancellationSignal()
                    cont.invokeOnCancellation { signal.cancel() }
                    LocationManagerCompat.getCurrentLocation(lm, provider, signal, ContextCompat.getMainExecutor(activity)) { cont.resume(it) }
                }
            }
            if (fix != null) return LocationResult.Found(fix.latitude, fix.longitude)
        }
        val last = providers.mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
        return if (last != null) LocationResult.Found(last.latitude, last.longitude) else LocationResult.Unavailable
    }
}

@Composable
actual fun PlatformBackHandler(enabled: Boolean, onBack: () -> Unit) = BackHandler(enabled, onBack)
