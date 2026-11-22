package com.quicklysolutions.multitienda.delivery

import android.app.Application
import com.quicklysolutions.multitienda.delivery.platform.AndroidPlatform
import com.quicklysolutions.multitienda.delivery.state.AppContainer

class DeliveryApplication : Application() {
    lateinit var platform: AndroidPlatform
        private set
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        platform = AndroidPlatform(this)
        container = AppContainer(platform)
    }
}
