package com.quicklysolutions.multitienda.cliente.domain

import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/** Redondeo a centimos igual que el servidor (orderRules.js toMoney). */
fun toMoney(v: Double): Double = if (!v.isFinite()) 0.0 else floor(v * 100 + 0.5) / 100

fun fixed2(v: Double): String {
    val cents = floor(abs(v) * 100 + 0.5).toLong()
    val sign = if (v < 0 && cents > 0) "-" else ""
    return "$sign${cents / 100}.${(cents % 100).toString().padStart(2, '0')}"
}

/** Igual que Store.formatPrice de la web: simbolo a la izquierda por defecto. */
fun formatMoney(value: Double, symbol: String, symbolLeft: Boolean = true): String =
    if (symbolLeft) symbol + fixed2(value) else fixed2(value) + symbol

/** Distancia en km (misma formula que src/helpers/utils.js getDistance). */
fun distanceKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    fun rad(v: Double) = v * kotlin.math.PI / 180
    val dLat = rad(lat2) - rad(lat1)
    val dLon = rad(lon2) - rad(lon1)
    val a = sin(dLat / 2).pow(2) + cos(rad(lat1)) * cos(rad(lat2)) * sin(dLon / 2).pow(2)
    return 2 * asin(sqrt(a)) * 6371
}

/** Rutas de imagen de la API -> URL absoluta (misma logica que Store.imageUrl de la web). */
fun resolveImageUrl(path: String?, siteBase: String): String? {
    if (path.isNullOrBlank() || path == "null" || path == "undefined") return null
    var url = path.trim()
    if (url.startsWith("http://") || url.startsWith("https://")) return url
    if (url.startsWith("//")) return "https:$url"
    if (url.startsWith("storage/")) url = "/uploads/" + url.removePrefix("storage/")
    else if (url.startsWith("/storage/")) url = "/uploads/" + url.removePrefix("/storage/")
    if (!url.startsWith("/")) url = "/$url"
    return siteBase.trimEnd('/') + url
}

/** La API vive en <sitio>/api o <sitio>/public/api; las imagenes en <sitio>/uploads. */
fun siteBaseFromApi(apiBase: String): String =
    apiBase.trimEnd('/').removeSuffix("/api").removeSuffix("/public")

private fun parseInstant(raw: String?): Instant? {
    if (raw.isNullOrBlank()) return null
    val s = raw.trim().replace(' ', 'T')
    return runCatching { Instant.parse(s) }.getOrNull()
        ?: runCatching { Instant.parse(s + "Z") }.getOrNull()
}

private val MONTHS = listOf("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

private fun LocalDateTime.hhmm() = "${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}"

fun formatTime(raw: String?): String =
    parseInstant(raw)?.toLocalDateTime(TimeZone.currentSystemDefault())?.hhmm() ?: ""

fun formatDate(raw: String?, withTime: Boolean = false): String {
    val dt = parseInstant(raw)?.toLocalDateTime(TimeZone.currentSystemDefault()) ?: return ""
    val base = "${dt.dayOfMonth} ${MONTHS[dt.monthNumber - 1]}"
    return if (withTime) "$base ${dt.hhmm()}" else "$base ${dt.year}"
}

/** "hace 3 min" a partir de un epoch en milisegundos (updated_at del GPS). */
fun agoText(updatedAtMillis: String?, nowMillis: Long): String? {
    val t = updatedAtMillis?.toDoubleOrNull()?.toLong() ?: return null
    val sec = ((nowMillis - t) / 1000).coerceAtLeast(0)
    return when {
        sec < 60 -> "hace ${sec}s"
        sec < 3600 -> "hace ${sec / 60} min"
        else -> "hace ${sec / 3600} h"
    }
}
