package com.quicklysolutions.multitienda.delivery.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive

// El API devuelve DECIMAL de MySQL como string ("12.50") y otros campos como número: se aceptan ambos.

object LenientDouble : KSerializer<Double> {
    override val descriptor = PrimitiveSerialDescriptor("LenientDouble", PrimitiveKind.DOUBLE)
    override fun deserialize(decoder: Decoder): Double {
        val el = (decoder as JsonDecoder).decodeJsonElement()
        return (el as JsonPrimitive).content.trim().toDouble()
    }
    override fun serialize(encoder: Encoder, value: Double) = encoder.encodeDouble(value)
}

object LenientInt : KSerializer<Int> {
    override val descriptor = PrimitiveSerialDescriptor("LenientInt", PrimitiveKind.INT)
    override fun deserialize(decoder: Decoder): Int {
        val el = (decoder as JsonDecoder).decodeJsonElement()
        val c = (el as JsonPrimitive).content.trim()
        return when (c) {
            "true" -> 1
            "false" -> 0
            else -> c.toIntOrNull() ?: c.toDouble().toInt()
        }
    }
    override fun serialize(encoder: Encoder, value: Int) = encoder.encodeInt(value)
}

object LenientString : KSerializer<String> {
    override val descriptor = PrimitiveSerialDescriptor("LenientString", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): String {
        val el = (decoder as JsonDecoder).decodeJsonElement()
        return if (el is JsonPrimitive) el.content else el.toString()
    }
    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
}
