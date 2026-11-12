package com.quicklysolutions.multitienda.delivery.config

object AppConfig {
    /** Única constante de URL base del API (equivale a `API._base` de la web). Sin barra final. */
    const val API_BASE = "https://quickly-solutions.com/multitienda/api"

    /** Refresco de pedidos (la web refresca cada 45 s). */
    const val ORDERS_POLL_MS = 45_000L

    /** Refresco del chat (la web usa 20 s). */
    const val CHAT_POLL_MS = 20_000L

    /** Intervalo mínimo entre envíos de GPS (la web envía cada 30 s). */
    const val GPS_MIN_INTERVAL_MS = 30_000L

    const val CHAT_MAX_LENGTH = 1000
}
