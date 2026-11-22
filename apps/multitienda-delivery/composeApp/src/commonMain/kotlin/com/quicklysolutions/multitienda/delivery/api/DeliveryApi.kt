package com.quicklysolutions.multitienda.delivery.api

import com.quicklysolutions.multitienda.delivery.api.ApiResult.Fail
import com.quicklysolutions.multitienda.delivery.api.ApiResult.Kind
import com.quicklysolutions.multitienda.delivery.api.ApiResult.Ok
import com.quicklysolutions.multitienda.delivery.model.AppJson
import com.quicklysolutions.multitienda.delivery.model.AppNotification
import com.quicklysolutions.multitienda.delivery.model.AppSettings
import com.quicklysolutions.multitienda.delivery.model.BalanceResponse
import com.quicklysolutions.multitienda.delivery.model.ChatMessage
import com.quicklysolutions.multitienda.delivery.model.DeliveryProfile
import com.quicklysolutions.multitienda.delivery.model.EarningsSummary
import com.quicklysolutions.multitienda.delivery.model.Order
import com.quicklysolutions.multitienda.delivery.model.Session
import io.ktor.client.HttpClient
import io.ktor.client.request.accept
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/**
 * Cliente REST del repartidor. Casi todo es POST con JSON y `Authorization: Bearer <token>`
 * (el middleware `auth` del servidor solo lee el header; el `token` del body de la web es redundante).
 */
class DeliveryApi(
    private val http: HttpClient,
    private val baseUrl: String,
    private val token: () -> String?,
) {
    private class Raw(val status: Int, val body: String)

    private class Rejected(message: String) : Exception(message)

    private suspend fun send(method: HttpMethod, path: String, body: JsonObject?, auth: Boolean): Raw = try {
        val r = http.request(baseUrl + path) {
            this.method = method
            accept(ContentType.Application.Json)
            if (auth) token()?.let { header(HttpHeaders.Authorization, "Bearer $it") }
            if (body != null) {
                contentType(ContentType.Application.Json)
                setBody(body.toString())
            }
        }
        Raw(r.status.value, r.bodyAsText())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Raw(0, "")
    }

    private suspend fun post(path: String, body: JsonObject = JsonObject(emptyMap()), auth: Boolean = true) =
        send(HttpMethod.Post, path, body, auth)

    private fun <T> Raw.decode(parse: (JsonElement) -> T): ApiResult<T> {
        if (status == 0) return Fail(Kind.NETWORK, "Sin conexión con el servidor")
        val el = runCatching { AppJson.parseToJsonElement(body) }.getOrNull()
        val msg = (el as? JsonObject)?.str("message")
        return when (status) {
            in 200..299 -> try {
                Ok(parse(el ?: JsonNull))
            } catch (e: Rejected) {
                Fail(Kind.HTTP, e.message.orEmpty())
            } catch (e: Exception) {
                Fail(Kind.INVALID, "Respuesta inválida del servidor")
            }
            401 -> Fail(Kind.UNAUTHORIZED, msg ?: "Sesión expirada")
            403 -> Fail(Kind.FORBIDDEN, msg ?: "No tienes permiso para esta acción")
            409 -> Fail(Kind.CONFLICT, msg ?: "El pedido cambió de estado")
            else -> Fail(Kind.HTTP, msg ?: "Error del servidor ($status)")
        }
    }

    // Las acciones responden {success:true} o {success:false,message}; con success:false el HTTP puede ser 200.
    private fun Raw.ack(): ApiResult<Unit> = decode { el ->
        val o = el as? JsonObject
        if (o?.bool("success") == false) throw Rejected(o.str("message") ?: "No se pudo completar la acción")
    }

    private fun <T> Raw.list(serializer: kotlinx.serialization.KSerializer<T>): ApiResult<List<T>> =
        decode { AppJson.decodeFromJsonElement(ListSerializer(serializer), if (it is JsonArray) it else JsonArray(emptyList())) }

    private fun orderBody(orderId: Int) = buildJsonObject { put("order_id", orderId) }

    // ── Público ──────────────────────────────────────────────────────────────

    /** POST /delivery/login (miscControllers.js deliveryLogin). 401 + data:'DONOTMATCH' = credenciales inválidas. */
    suspend fun login(phone: String, password: String): ApiResult<Session> {
        val raw = post("/delivery/login", buildJsonObject { put("phone", phone); put("password", password) }, auth = false)
        if (raw.status == 401) return Fail(Kind.UNAUTHORIZED, "Credenciales incorrectas")
        return raw.decode { el ->
            val o = el as JsonObject
            if (o.bool("success") != true) throw Rejected(o.str("message") ?: "No se pudo iniciar sesión")
            val d = o["data"] as JsonObject
            Session(
                token = d.str("auth_token") ?: throw Rejected("Respuesta sin token"),
                userId = d.str("id")?.toIntOrNull() ?: throw Rejected("Respuesta sin id"),
                name = d.str("name").orEmpty(),
                phone = d.str("phone").orEmpty(),
            )
        }
    }

    /** POST /delivery/register: crea el usuario inactivo (pendiente de aprobación del admin). */
    suspend fun register(name: String, email: String, phone: String, password: String, vehicle: String): ApiResult<Unit> =
        post(
            "/delivery/register",
            buildJsonObject {
                put("name", name); put("email", email); put("phone", phone)
                put("password", password); put("vehicle_number", vehicle)
            },
            auth = false,
        ).ack()

    /** GET /get-settings (público): moneda, PIN de entrega, nombre de la tienda. */
    suspend fun settings(): ApiResult<AppSettings> = send(HttpMethod.Get, "/get-settings", null, auth = false).decode { el ->
        val map = (el as JsonArray).mapNotNull { it as? JsonObject }.associate { (it.str("key") ?: "") to it.str("value") }
        AppSettings(
            currency = map["currencySymbol"]?.takeIf { it.isNotBlank() } ?: "$",
            pinRequired = map["enableDeliveryPin"] == "true",
            storeName = map["storeName"].orEmpty(),
        )
    }

    // ── Pedidos ──────────────────────────────────────────────────────────────

    /** POST /delivery/get-delivery-orders: disponibles (estado 2/12, delivery_type 1) dentro del radio del comercio. */
    suspend fun availableOrders(lat: Double?, lng: Double?): ApiResult<List<Order>> =
        post(
            "/delivery/get-delivery-orders",
            buildJsonObject {
                if (lat != null && lng != null) { put("latitude", lat); put("longitude", lng) }
            },
        ).list(Order.serializer())

    /** POST /delivery/get-active-orders: asignados a mí en estado 3 o 4. */
    suspend fun activeOrders(): ApiResult<List<Order>> = post("/delivery/get-active-orders").list(Order.serializer())

    /** POST /delivery/get-completed-orders: mis entregas (estado 5), máx. 50. */
    suspend fun completedOrders(): ApiResult<List<Order>> = post("/delivery/get-completed-orders").list(Order.serializer())

    /** POST /delivery/get-single-delivery-order: 403 si no está asignado a mí ni disponible. */
    suspend fun order(orderId: Int): ApiResult<Order> = post("/delivery/get-single-delivery-order", orderBody(orderId)).decode {
        if (it is JsonNull) throw Rejected("El pedido ya no está disponible")
        AppJson.decodeFromJsonElement(Order.serializer(), it)
    }

    /** POST /delivery/ignore-order: lo oculta de mi lista de disponibles. */
    suspend fun ignore(orderId: Int): ApiResult<Unit> = post("/delivery/ignore-order", orderBody(orderId)).ack()

    /** POST /delivery/accept-to-deliver: 2/12 -> 3. 409 si otro repartidor ya lo tomó. */
    suspend fun accept(orderId: Int): ApiResult<Unit> = post("/delivery/accept-to-deliver", orderBody(orderId)).ack()

    /** POST /delivery/pickedup-order: 3 -> 4. Solo el repartidor asignado. */
    suspend fun pickup(orderId: Int): ApiResult<Unit> = post("/delivery/pickedup-order", orderBody(orderId)).ack()

    /** POST /delivery/deliver-order: 4 -> 5. Con PIN de entrega activo hay que enviar `delivery_pin`. */
    suspend fun deliver(orderId: Int, pin: String?): ApiResult<Unit> = post(
        "/delivery/deliver-order",
        buildJsonObject {
            put("order_id", orderId)
            if (!pin.isNullOrBlank()) put("delivery_pin", pin.trim())
        },
    ).ack()

    // ── GPS ──────────────────────────────────────────────────────────────────

    /** POST /delivery/set-delivery-guy-gps-location: el servidor valida rango y limita la escritura a BD. */
    suspend fun sendGps(lat: Double, lng: Double, heading: Double): ApiResult<Unit> = post(
        "/delivery/set-delivery-guy-gps-location",
        buildJsonObject { put("latitude", lat); put("longitude", lng); put("heading", heading) },
    ).ack()

    // ── Chat ─────────────────────────────────────────────────────────────────

    /** POST /conversation/chat: solo participantes del pedido (cliente o repartidor asignado). */
    suspend fun chat(orderId: Int): ApiResult<List<ChatMessage>> = post("/conversation/chat", orderBody(orderId)).list(ChatMessage.serializer())

    /** POST /conversation/send: mensaje no vacío, máx. 1000 caracteres. */
    suspend fun sendChat(orderId: Int, message: String): ApiResult<Unit> = post(
        "/conversation/send",
        buildJsonObject { put("order_id", orderId); put("message", message) },
    ).ack()

    // ── Ganancias ────────────────────────────────────────────────────────────

    /** POST /delivery/get-earnings: totales calculados en el servidor al entregar (comisión + 100 % propina). */
    suspend fun earnings(): ApiResult<EarningsSummary> =
        post("/delivery/get-earnings").decode { AppJson.decodeFromJsonElement(EarningsSummary.serializer(), it) }

    /** POST /delivery/get-balance: efectivo por entregar, ganancias pendientes/pagadas, cierres y pagos. */
    suspend fun balance(): ApiResult<BalanceResponse> =
        post("/delivery/get-balance").decode { AppJson.decodeFromJsonElement(BalanceResponse.serializer(), it) }

    // ── Perfil ───────────────────────────────────────────────────────────────

    /** POST /delivery/update-user-info: devuelve usuario + detalle de repartidor (no modifica nada). */
    suspend fun profile(): ApiResult<DeliveryProfile> = post("/delivery/update-user-info").decode(::parseProfile)

    /**
     * POST /delivery/toggle-delivery-guy-status. El servidor lo enruta al mismo handler que update-user-info
     * (api.js:121), así que NO cambia `is_available`; solo devuelve el estado actual.
     */
    suspend fun toggleStatus(): ApiResult<DeliveryProfile> = post("/delivery/toggle-delivery-guy-status").decode(::parseProfile)

    private fun parseProfile(el: JsonElement): DeliveryProfile {
        val data = (el as JsonObject)["data"] as JsonObject
        val user = data["user"] as? JsonObject
        val detail = data["delivery_detail"] as? JsonObject
        return DeliveryProfile(
            name = user?.str("name"),
            email = user?.str("email"),
            phone = user?.str("phone"),
            vehicleNumber = detail?.str("vehicle_number"),
            isAvailable = detail?.str("is_available").let { it == "1" || it == "true" },
        )
    }

    // ── Push / notificaciones ────────────────────────────────────────────────

    /** POST /save-fcm-token. */
    suspend fun saveFcmToken(fcmToken: String, platform: String = "android"): ApiResult<Unit> =
        post("/save-fcm-token", buildJsonObject { put("token", fcmToken); put("platform", platform) }).ack()

    /** POST /save-notification-token. */
    suspend fun saveNotificationToken(pushToken: String, deviceType: String = "android"): ApiResult<Unit> =
        post("/save-notification-token", buildJsonObject { put("token", pushToken); put("device_type", deviceType) }).ack()

    /** POST /get-user-notifications: últimas 20. */
    suspend fun notifications(): ApiResult<List<AppNotification>> = post("/get-user-notifications").list(AppNotification.serializer())
}

internal fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

internal fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull
