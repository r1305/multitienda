package com.quicklysolutions.multitienda.cliente.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

// La API (Sequelize/MySQL) devuelve DECIMAL como string, BOOLEAN como true/false o 0/1 y ids como numero o texto.
// Estos serializadores aceptan cualquiera de esas formas.

private fun Decoder.prim(): JsonPrimitive? =
    ((this as JsonDecoder).decodeJsonElement() as? JsonPrimitive)?.takeUnless { it is JsonNull }

internal fun JsonPrimitive.flexDouble(): Double? =
    doubleOrNull ?: content.trim().toDoubleOrNull() ?: booleanOrNull?.let { if (it) 1.0 else 0.0 }

object FlexDouble : KSerializer<Double> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexDouble", PrimitiveKind.DOUBLE)
    override fun deserialize(decoder: Decoder): Double = decoder.prim()?.flexDouble() ?: 0.0
    override fun serialize(encoder: Encoder, value: Double) = encoder.encodeDouble(value)
}

object FlexDoubleN : KSerializer<Double?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexDoubleN", PrimitiveKind.DOUBLE)
    override fun deserialize(decoder: Decoder): Double? = decoder.prim()?.flexDouble()
    override fun serialize(encoder: Encoder, value: Double?) {
        if (value == null) encoder.encodeNull() else encoder.encodeDouble(value)
    }
}

object FlexInt : KSerializer<Int> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexInt", PrimitiveKind.INT)
    override fun deserialize(decoder: Decoder): Int = decoder.prim()?.flexDouble()?.toInt() ?: 0
    override fun serialize(encoder: Encoder, value: Int) = encoder.encodeInt(value)
}

object FlexIntN : KSerializer<Int?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexIntN", PrimitiveKind.INT)
    override fun deserialize(decoder: Decoder): Int? = decoder.prim()?.flexDouble()?.toInt()
    override fun serialize(encoder: Encoder, value: Int?) {
        if (value == null) encoder.encodeNull() else encoder.encodeInt(value)
    }
}

object FlexBool : KSerializer<Boolean> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexBool", PrimitiveKind.BOOLEAN)
    override fun deserialize(decoder: Decoder): Boolean {
        val p = decoder.prim() ?: return false
        p.booleanOrNull?.let { return it }
        val d = p.flexDouble()
        return if (d != null) d != 0.0 else p.content.equals("true", ignoreCase = true)
    }
    override fun serialize(encoder: Encoder, value: Boolean) = encoder.encodeBoolean(value)
}

object FlexStr : KSerializer<String?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("FlexStr", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): String? = decoder.prim()?.content
    override fun serialize(encoder: Encoder, value: String?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value)
    }
}

val ApiJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    explicitNulls = false
    encodeDefaults = true
}
