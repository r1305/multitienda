package com.quicklysolutions.multitienda.delivery.platform

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.quicklysolutions.multitienda.delivery.model.GeoPoint
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

private class PrefsStore(private val prefs: android.content.SharedPreferences) : KeyValueStore {
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String) = prefs.edit().putString(key, value).apply()
    override fun remove(key: String) = prefs.edit().remove(key).apply()
}

class AndroidPlatform(private val context: Context) : PlatformServices {
    // Cifrado con Android Keystore; si el Keystore falla (restauración de backup, ROMs raras) se cae a prefs normales.
    override val store: KeyValueStore = PrefsStore(
        try {
            EncryptedSharedPreferences.create(
                context,
                "delivery_session",
                MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Exception) {
            context.getSharedPreferences("delivery_session_plain", Context.MODE_PRIVATE)
        },
    )

    private val granted = MutableStateFlow(hasLocationPermission())
    override val locationGranted: StateFlow<Boolean> = granted

    /** La asigna MainActivity (necesita un ActivityResultLauncher). */
    var permissionRequester: (() -> Unit)? = null
    private var tracking = false

    private fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    fun onPermissionsResult() {
        granted.value = hasLocationPermission()
    }

    override fun requestPermissions() {
        permissionRequester?.invoke()
    }

    @SuppressLint("MissingPermission")
    override suspend fun currentLocation(): GeoPoint? {
        if (!hasLocationPermission()) return null
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).firstOrNull {
            runCatching { lm.isProviderEnabled(it) }.getOrDefault(false)
        } ?: return null
        val loc = suspendCancellableCoroutine<Location?> { cont ->
            val signal = CancellationSignal()
            cont.invokeOnCancellation { signal.cancel() }
            try {
                LocationManagerCompat.getCurrentLocation(lm, provider, signal, ContextCompat.getMainExecutor(context)) { cont.resume(it) }
            } catch (e: SecurityException) {
                cont.resume(null)
            }
        }
        return loc?.let { GeoPoint(it.latitude, it.longitude) }
    }

    override fun startTracking() {
        if (tracking || !hasLocationPermission()) return
        try {
            ContextCompat.startForegroundService(context, Intent(context, TrackingService::class.java))
            tracking = true
        } catch (e: Exception) {
            tracking = false
        }
    }

    override fun stopTracking() {
        if (!tracking) return
        context.stopService(Intent(context, TrackingService::class.java))
        tracking = false
    }

    override fun openMap(app: MapApp, lat: Double, lng: Double) {
        val url = when (app) {
            MapApp.GOOGLE_MAPS -> "https://www.google.com/maps/dir/?api=1&destination=$lat,$lng"
            MapApp.WAZE -> "https://waze.com/ul?ll=$lat,$lng&navigate=yes"
        }
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            // Sin app ni navegador capaz de abrir el enlace: nada que hacer.
        }
    }
}
