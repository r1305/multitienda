package com.quicklysolutions.multitienda.cliente.data

import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

class ApiException(val status: Int, override val message: String, val body: JsonElement? = null) : Exception(message)

data class RawResponse(val status: Int, val body: JsonElement?) {
    val ok: Boolean get() = status in 200..299
}

/** Mensaje legible de un cuerpo de error de la API ({message}, {error} o {data: "texto"}). */
fun JsonElement?.errorMessage(): String? {
    val o = this as? JsonObject ?: return null
    return (o["message"] as? JsonPrimitive)?.contentOrNull
        ?: (o["error"] as? JsonPrimitive)?.contentOrNull
        ?: (o["data"] as? JsonPrimitive)?.contentOrNull
}

/**
 * Transporte HTTP. Casi todos los endpoints son POST con cuerpo JSON y autenticacion
 * `Authorization: Bearer <jwt>` (src/middleware/auth.js:9-10).
 */
class ApiClient(
    private val http: HttpClient,
    var baseUrl: String,
    private val tokenProvider: () -> String?,
    private val onUnauthorized: () -> Unit = {},
) {
    suspend fun raw(method: HttpMethod, path: String, body: JsonObject? = null): RawResponse {
        val token = tokenProvider()
        val response = try {
            http.request(baseUrl.trimEnd('/') + path) {
                this.method = method
                header(HttpHeaders.Accept, "application/json")
                if (token != null) header(HttpHeaders.Authorization, "Bearer $token")
                if (method != HttpMethod.Get) {
                    contentType(ContentType.Application.Json)
                    setBody((body ?: JsonObject(emptyMap())).toString())
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            throw ApiException(0, "Sin conexión con el servidor")
        }
        val text = try { response.bodyAsText() } catch (e: CancellationException) { throw e } catch (e: Exception) { "" }
        val json = text.takeIf { it.isNotBlank() }?.let { runCatching { ApiJson.parseToJsonElement(it) }.getOrNull() }
        if (response.status.value == 401 && token != null) onUnauthorized()
        return RawResponse(response.status.value, json)
    }

    suspend fun post(path: String, body: JsonObject? = null) = raw(HttpMethod.Post, path, body)
    suspend fun get(path: String) = raw(HttpMethod.Get, path)

    /** Como [raw] pero lanza [ApiException] si el estado no es 2xx. */
    suspend fun postOk(path: String, body: JsonObject? = null): JsonElement? {
        val r = post(path, body)
        if (!r.ok) throw ApiException(r.status, r.body.errorMessage() ?: "Error ${r.status}", r.body)
        return r.body
    }

    suspend fun getOk(path: String): JsonElement? {
        val r = get(path)
        if (!r.ok) throw ApiException(r.status, r.body.errorMessage() ?: "Error ${r.status}", r.body)
        return r.body
    }
}

inline fun <reified T> JsonElement?.decode(): T {
    if (this == null) throw ApiException(0, "Respuesta vacía del servidor")
    return try {
        ApiJson.decodeFromJsonElement(kotlinx.serialization.serializer<T>(), this)
    } catch (e: Exception) {
        throw ApiException(0, "Respuesta inesperada del servidor")
    }
}

inline fun <reified T> JsonElement?.decodeOrNull(): T? =
    if (this == null || this is kotlinx.serialization.json.JsonNull) null else decode<T>()

fun JsonElement?.asObject(): JsonObject? = this as? JsonObject
