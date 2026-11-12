package com.quicklysolutions.multitienda.delivery.util

import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.math.abs
import kotlin.math.roundToLong

fun money(symbol: String, value: Double?): String {
    val cents = ((value ?: 0.0) * 100).roundToLong()
    val sign = if (cents < 0) "-" else ""
    val a = abs(cents)
    return "$sign$symbol${a / 100}.${(a % 100).toString().padStart(2, '0')}"
}

/** "dd/MM HH:mm" en la zona indicada; si no es una fecha ISO devuelve el texto tal cual. */
fun formatDate(iso: String?, tz: TimeZone = TimeZone.currentSystemDefault()): String {
    if (iso.isNullOrBlank()) return ""
    return try {
        val t = Instant.parse(iso).toLocalDateTime(tz)
        fun two(n: Int) = n.toString().padStart(2, '0')
        "${two(t.dayOfMonth)}/${two(t.monthNumber)} ${two(t.hour)}:${two(t.minute)}"
    } catch (e: Exception) {
        iso
    }
}
