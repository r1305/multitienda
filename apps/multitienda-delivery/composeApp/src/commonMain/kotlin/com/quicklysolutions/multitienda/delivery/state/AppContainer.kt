package com.quicklysolutions.multitienda.delivery.state

import com.quicklysolutions.multitienda.delivery.api.DeliveryApi
import com.quicklysolutions.multitienda.delivery.config.AppConfig
import com.quicklysolutions.multitienda.delivery.model.Session
import com.quicklysolutions.multitienda.delivery.platform.KeyValueStore
import com.quicklysolutions.multitienda.delivery.platform.PlatformServices
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout

/** Sesión del repartidor (equivale a `deliveryUser` + `deliveryToken` de localStorage en la web). */
class SessionStore(private val store: KeyValueStore) {
    var current: Session? = load()
        private set

    private fun load(): Session? {
        val token = store.get(K_TOKEN) ?: return null
        val id = store.get(K_ID)?.toIntOrNull() ?: return null
        return Session(token, id, store.get(K_NAME).orEmpty(), store.get(K_PHONE).orEmpty())
    }

    fun save(s: Session) {
        store.put(K_TOKEN, s.token)
        store.put(K_ID, s.userId.toString())
        store.put(K_NAME, s.name)
        store.put(K_PHONE, s.phone)
        current = s
    }

    fun clear() {
        listOf(K_TOKEN, K_ID, K_NAME, K_PHONE).forEach(store::remove)
        current = null
    }

    private companion object {
        const val K_TOKEN = "delivery_token"
        const val K_ID = "delivery_user_id"
        const val K_NAME = "delivery_user_name"
        const val K_PHONE = "delivery_user_phone"
    }
}

/** Un único HttpClient (un solo pool de conexiones) y un único API para toda la app. */
class AppContainer(
    val platform: PlatformServices,
    http: HttpClient = HttpClient {
        install(HttpTimeout) {
            requestTimeoutMillis = 20_000
            connectTimeoutMillis = 10_000
        }
    },
) {
    val sessions = SessionStore(platform.store)
    val api = DeliveryApi(http, AppConfig.API_BASE) { sessions.current?.token }
}
