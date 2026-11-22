package com.quicklysolutions.multitienda.delivery.platform

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.location.LocationListenerCompat
import com.quicklysolutions.multitienda.delivery.DeliveryApplication
import com.quicklysolutions.multitienda.delivery.R
import com.quicklysolutions.multitienda.delivery.config.AppConfig
import com.quicklysolutions.multitienda.delivery.domain.GpsThrottle
import com.quicklysolutions.multitienda.delivery.model.GeoPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Envía la posición mientras hay pedidos activos (equivale al watcher nativo de la web: delivery.js:369-392).
 * Un único listener; el envío se limita a uno cada [AppConfig.GPS_MIN_INTERVAL_MS]. Se detiene con stopService.
 */
class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val throttle = GpsThrottle(AppConfig.GPS_MIN_INTERVAL_MS)
    private var manager: LocationManager? = null

    private val listener = LocationListenerCompat { loc -> onFix(loc) }

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("MissingPermission")
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        manager = lm
        try {
            lm.removeUpdates(listener)
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                .filter { lm.isProviderEnabled(it) }
                .forEach { lm.requestLocationUpdates(it, 15_000L, 20f, listener, Looper.getMainLooper()) }
        } catch (e: SecurityException) {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun onFix(loc: Location) {
        val point = GeoPoint(loc.latitude, loc.longitude)
        if (!point.isValid || !throttle.shouldSend(System.currentTimeMillis())) return
        val api = (application as DeliveryApplication).container.api
        scope.launch { api.sendGps(point.lat, point.lng, if (loc.hasBearing()) loc.bearing.toDouble() else 0.0) }
    }

    private fun startInForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Entrega en curso", NotificationManager.IMPORTANCE_LOW))
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle("Entrega en curso")
            .setContentText("Compartiendo ubicación para tu entrega")
            .setSmallIcon(R.drawable.ic_stat_gps)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, n)
        }
    }

    override fun onDestroy() {
        manager?.removeUpdates(listener)
        scope.cancel()
        super.onDestroy()
    }

    private companion object {
        const val CHANNEL = "tracking"
        const val NOTIFICATION_ID = 1001
    }
}
