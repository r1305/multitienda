package com.quicklysolutions.multitienda.cliente.data

import com.quicklysolutions.multitienda.cliente.domain.CartLine
import io.ktor.http.encodeURLPathPart
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

sealed interface AuthResult {
    data class Ok(val user: UserDto) : AuthResult
    data class Fail(val message: String) : AuthResult
    data object EmailOrPhoneUsed : AuthResult
}

sealed interface CouponResult {
    data class Ok(val coupon: Coupon, val discount: Double) : CouponResult
    data class Fail(val message: String) : CouponResult
}

sealed interface PlaceOrderResult {
    data class Ok(val order: Order, val initPoint: String?) : PlaceOrderResult
    data class Fail(val message: String) : PlaceOrderResult
}

data class OpResult(val success: Boolean, val message: String? = null, val refund: Boolean = false)

data class PlaceOrderRequest(
    val lines: List<CartLine>,
    val method: String,
    val deliveryType: Int,
    val addressId: Int?,
    val lat: Double?,
    val lng: Double?,
    val address: String?,
    val coupon: String?,
    val tip: Double?,
    val cashChange: Double?,
    val comment: String?,
    val paymentToken: String?,
    val partialWallet: Boolean,
    val scheduleDate: String?,
    val scheduleSlot: String?,
)

/** Un metodo por endpoint. Rutas: src/routes/api.js. */
class MultitiendaApi(val client: ApiClient) {

    // ---- Arranque: configuracion e idioma (miscControllers.js:22, :244, :254) ----
    suspend fun settings(): Map<String, String> {
        val rows = client.getOk("/get-settings").decode<List<SettingRow>>()
        return rows.associate { it.key to (it.value ?: "") }
    }

    suspend fun languages(): List<LanguageDto> = client.postOk("/get-all-languages").decode()

    suspend fun language(id: Int): Map<String, String> {
        val o = client.postOk("/get-single-language", buildJsonObject { put("id", id) }) as? JsonObject ?: return emptyMap()
        return o.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.contentOrNull?.let { k to it } }.toMap()
    }

    // ---- Ubicacion (miscControllers.js:54, :75, :951, :966) ----
    suspend fun coordinateToAddress(lat: Double, lng: Double): String {
        val r = client.postOk("/coordinate-to-address", buildJsonObject { put("lat", lat); put("lng", lng) })
        return (r as? JsonPrimitive)?.contentOrNull.orEmpty()
    }

    /** null si el servidor no pudo geocodificar (responde 0,0). */
    suspend fun addressToCoordinate(address: String): Pair<Double, Double>? {
        val o = client.postOk("/address-to-coordinate", buildJsonObject { put("address", address) }).asObject() ?: return null
        val lat = (o["latitude"] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull() ?: return null
        val lng = (o["longitude"] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull() ?: return null
        return if (lat == 0.0 && lng == 0.0) null else lat to lng
    }

    suspend fun searchLocation(query: String): List<PlaceDto> =
        client.postOk("/search-location/" + query.take(100).encodeURLPathPart()).decode()

    suspend fun popularLocations(): List<PlaceDto> = client.postOk("/popular-geo-locations").decode()

    // ---- Home (restaurantController.js:13-52, :206; miscControllers.js:88, :298) ----
    suspend fun deliveryStores(lat: Double, lng: Double, businessTypeId: Int?): List<StoreSummary> =
        client.postOk("/get-delivery-restaurants", location(lat, lng, businessTypeId)).decode()

    suspend fun pickupStores(lat: Double, lng: Double, businessTypeId: Int?): List<StoreSummary> =
        client.postOk("/get-selfpickup-restaurants", location(lat, lng, businessTypeId)).decode()

    suspend fun promoSliders(lat: Double, lng: Double): List<PromoSlide> =
        client.postOk("/promo-slider", location(lat, lng, null)).decode<List<PromoSlide>>().filter { !it.image.isNullOrBlank() }

    suspend fun businessTypes(): List<BusinessType> = client.postOk("/get-business-types").decode()

    suspend fun categories(): List<StoreCategory> = client.postOk("/get-all-restaurants-categories").decode()

    suspend fun filteredStores(lat: Double, lng: Double, categoryIds: List<Int>): List<StoreSummary> =
        client.postOk("/get-filtered-restaurants", buildJsonObject {
            put("latitude", lat); put("longitude", lng)
            put("category_ids", buildJsonArray { categoryIds.forEach { add(JsonPrimitive(it)) } })
        }).decode()

    // ---- Explorar (restaurantController.js:159) ----
    /** Sin ubicacion no se manda lat/lng: el servidor entonces no filtra por radio de entrega (restaurantQueries.js:19). */
    suspend fun searchStores(lat: Double?, lng: Double?, q: String): SearchResponse =
        client.postOk("/search-restaurants", buildJsonObject { lat?.let { put("latitude", it) }; lng?.let { put("longitude", it) }; put("q", q) }).decode()

    // ---- Detalle de tienda (restaurantController.js:62-157, :192, :266; miscControllers.js:455; :319) ----
    suspend fun storeInfo(slug: String, authenticated: Boolean): RestaurantInfo {
        val path = if (authenticated) "/get-restaurant-info-with-favourite/" else "/get-restaurant-info/"
        return client.postOk(path + slug.encodeURLPathPart()).decode()
    }

    suspend fun storeMenu(slug: String): MenuResponse = client.postOk("/get-restaurant-items/" + slug.encodeURLPathPart()).decode()

    suspend fun singleItem(id: Int): Item = client.postOk("/get-single-item", buildJsonObject { put("id", id) }).decode()

    suspend fun operatesAt(restaurantId: Int, lat: Double, lng: Double): Boolean {
        val r = client.postOk("/check-restaurant-operation-service", buildJsonObject {
            put("restaurant_id", restaurantId); put("latitude", lat); put("longitude", lng)
        })
        return (r as? JsonPrimitive)?.booleanOrNull ?: true
    }

    suspend fun reviewsBySlug(slug: String, page: Int): ReviewsPage =
        client.getOk("/get-store-reviews/${slug.encodeURLPathPart()}?page=$page&per_page=10").decode()

    suspend fun reviewsById(restaurantId: Int, page: Int): ReviewsPage =
        client.getOk("/restaurants/$restaurantId/ratings?page=$page&per_page=10").decode()

    // ---- Carrito y cupones (restaurantController.js:235; miscControllers.js:141) ----
    suspend fun checkCartAvailability(lines: List<CartLine>, restaurantId: Int?): List<AvailabilityRow> =
        client.postOk("/check-cart-items-availability", buildJsonObject {
            restaurantId?.let { put("restaurant_id", it) }
            put("items", buildJsonArray {
                lines.forEach { l ->
                    add(buildJsonObject {
                        put("id", l.itemId); put("quantity", l.quantity)
                        put("selectedaddons", buildJsonArray { l.addons.forEach { a -> add(buildJsonObject { put("addon_id", a.id) }) } })
                    })
                }
            })
        }).decode()

    suspend fun applyCoupon(code: String, restaurantId: Int?, subtotal: Double): CouponResult {
        val r = client.post("/apply-coupon", buildJsonObject {
            put("coupon", code); restaurantId?.let { put("restaurant_id", it) }; put("subtotal", subtotal)
        })
        if (!r.ok) return CouponResult.Fail(r.body.errorMessage() ?: "Error al validar cupón")
        val o = r.body.asObject()
        if (o?.get("success") == JsonPrimitive(true) && o["coupon"] is JsonObject) {
            val discount = (o["discount_amount"] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull() ?: 0.0
            return CouponResult.Ok(o["coupon"].decode(), discount)
        }
        return CouponResult.Fail(r.body.errorMessage() ?: "Cupón inválido")
    }

    // ---- Checkout (miscControllers.js:233; orderController.js:45) ----
    suspend fun paymentGateways(restaurantId: Int?): List<PaymentGateway> =
        client.postOk("/get-payment-gateways", buildJsonObject { restaurantId?.let { put("restaurant_id", it) } }).decode()

    suspend fun placeOrder(req: PlaceOrderRequest): PlaceOrderResult {
        val r = client.post("/place-order", buildJsonObject {
            put("order", buildJsonArray {
                req.lines.forEach { l ->
                    add(buildJsonObject {
                        put("id", l.itemId); put("quantity", l.quantity); put("restaurant_id", l.restaurantId); put("name", l.name)
                        put("selectedaddons", buildJsonArray {
                            l.addons.forEach { a ->
                                add(buildJsonObject {
                                    put("addon_id", a.id); put("addon_name", a.name); put("addon_category_name", a.categoryName.orEmpty())
                                })
                            }
                        })
                    })
                }
            })
            put("location", buildJsonObject {
                req.lat?.let { put("lat", it) }; req.lng?.let { put("lng", it) }
                put("address", req.address.orEmpty()); req.addressId?.let { put("address_id", it) }
            })
            put("method", req.method)
            put("delivery_type", req.deliveryType)
            req.coupon?.let { put("coupon", it) }
            req.tip?.takeIf { it > 0 }?.let { put("tipAmount", it) }
            req.cashChange?.takeIf { it > 0 }?.let { put("cash_change_amount", it) }
            req.comment?.takeIf { it.isNotBlank() }?.let { put("order_comment", it) }
            put("payment_token", req.paymentToken.orEmpty())
            put("pending_payment", false)
            put("partial_wallet", req.partialWallet)
            req.scheduleDate?.let { put("schedule_date", it) }
            req.scheduleSlot?.let { put("schedule_slot", it) }
        })
        val o = r.body.asObject()
        if (r.ok && o?.get("success") == JsonPrimitive(true) && o["data"] is JsonObject) {
            return PlaceOrderResult.Ok(o["data"].decode(), (o["init_point"] as? JsonPrimitive)?.contentOrNull)
        }
        return PlaceOrderResult.Fail(r.body.errorMessage() ?: "Error al procesar la orden")
    }

    // ---- Pedidos (orderController.js:228, :317, :331; userController.js:211, :267) ----
    suspend fun orders(page: Int): OrdersPage = client.postOk("/get-orders", buildJsonObject { put("page", page) }).decode()

    suspend fun orderItems(orderId: Int): List<OrderItem> = client.postOk("/get-order-items", buildJsonObject { put("order_id", orderId) }).decode()

    suspend fun hasRunningOrder(): Boolean = (client.postOk("/check-running-order") as? JsonPrimitive)?.booleanOrNull ?: false

    suspend fun cancelOrder(orderId: Int): OpResult {
        val r = client.post("/cancel-order", buildJsonObject { put("order_id", orderId) })
        val o = r.body.asObject()
        return OpResult(r.ok && o?.get("success") == JsonPrimitive(true), r.body.errorMessage(), o?.get("refund") == JsonPrimitive(true))
    }

    /** Perfil + pedido en curso (o el indicado por unique_order_id). */
    suspend fun userInfo(uniqueOrderId: String? = null): UserInfoResponse =
        client.postOk("/update-user-info", buildJsonObject { uniqueOrderId?.let { put("unique_order_id", it) } }).decode()

    // ---- Seguimiento GPS y chat (miscControllers.js:667, :890, :904) ----
    suspend fun courierLocation(orderId: Int): GpsPoint? {
        val r = client.postOk("/delivery/get-delivery-guy-gps-location", buildJsonObject { put("order_id", orderId) })
        return r.decodeOrNull()
    }

    suspend fun chat(orderId: Int): List<ChatMessage> = client.postOk("/conversation/chat", buildJsonObject { put("order_id", orderId) }).decode()

    suspend fun sendChat(orderId: Int, message: String): OpResult {
        val r = client.post("/conversation/send", buildJsonObject { put("order_id", orderId); put("message", message) })
        return OpResult(r.ok && r.body.asObject()?.get("success") == JsonPrimitive(true), r.body.errorMessage())
    }

    // ---- Calificar (miscControllers.js:400, :422) ----
    suspend fun ratableOrder(orderId: Int): Order? =
        client.postOk("/get-ratable-order", buildJsonObject { put("order_id", orderId) }).decodeOrNull()

    suspend fun rateOrder(orderId: Int, store: Int, delivery: Int, reviewStore: String): OpResult {
        val r = client.post("/rate-order", buildJsonObject {
            put("order_id", orderId); put("rating_store", store); put("rating_delivery", delivery)
            put("review_store", reviewStore); put("review_delivery", "")
        })
        return OpResult(r.ok && r.body.asObject()?.get("success") == JsonPrimitive(true), r.body.errorMessage())
    }

    // ---- Direcciones y billetera (miscControllers.js:99-138; userController.js:276) ----
    suspend fun addresses(): List<AddressDto> = client.postOk("/get-addresses").decode()

    suspend fun saveAddress(address: String, house: String, tag: String, lat: Double, lng: Double): AddressDto =
        client.postOk("/save-address", buildJsonObject {
            put("address", address); put("house", house); put("tag", tag); put("latitude", lat); put("longitude", lng)
        }).decode()

    suspend fun deleteAddress(id: Int) { client.postOk("/delete-address", buildJsonObject { put("address_id", id) }) }

    suspend fun setDefaultAddress(id: Int) { client.postOk("/set-default-address", buildJsonObject { put("address_id", id) }) }

    suspend fun wallet(): WalletResponse = client.postOk("/get-wallet-transactions").decode()

    // ---- Favoritos (userController.js:300; restaurantController.js:291) ----
    suspend fun toggleFavorite(restaurantId: Int) { client.postOk("/toggle-favorite", buildJsonObject { put("id", restaurantId) }) }

    suspend fun favoriteStores(lat: Double?, lng: Double?): List<StoreSummary> =
        client.postOk("/get-favorite-stores", location(lat, lng, null)).decode()

    // ---- Notificaciones (miscControllers.js:178, :202-229) ----
    suspend fun notifications(): List<AppNotification> = client.postOk("/get-user-notifications").decode()

    suspend fun markAllNotificationsRead() { client.postOk("/mark-all-notifications-read") }

    suspend fun markNotificationRead(id: String) { client.postOk("/mark-one-notification-read", buildJsonObject { put("id", id) }) }

    suspend fun saveFcmToken(token: String) { client.postOk("/save-fcm-token", buildJsonObject { put("token", token); put("platform", "android") }) }

    // ---- Cuenta (userController.js:287, :296, :321) ----
    suspend fun changeAvatar(avatar: String) { client.postOk("/change-avatar", buildJsonObject { put("avatar", avatar) }) }

    suspend fun updateTaxNumber(taxNumber: String) { client.postOk("/update-tax-number", buildJsonObject { put("tax_number", taxNumber) }) }

    /** false = cuenta suspendida o desactivada. */
    suspend fun checkBan(): Boolean = client.postOk("/check-ban").asObject()?.get("success") == JsonPrimitive(true)

    // ---- Autenticacion (userController.js:59-209; miscControllers.js:323-397) ----
    suspend fun login(email: String, password: String): AuthResult =
        auth(client.post("/login", buildJsonObject { put("email", email); put("password", password) }))

    suspend fun register(name: String, email: String, phone: String, password: String): AuthResult =
        auth(client.post("/register", buildJsonObject { put("name", name); put("email", email); put("phone", phone); put("password", password) }))

    suspend fun loginWithOtp(phone: String, otp: String, name: String?, email: String?): AuthResult =
        auth(client.post("/login-with-otp", buildJsonObject {
            put("phone", phone); put("otp", otp)
            name?.takeIf { it.isNotBlank() }?.let { put("name", it) }
            email?.takeIf { it.isNotBlank() }?.let { put("email", it) }
        }))

    /** El codigo llega por correo (miscControllers.js:308-321). email solo se usa si el telefono no tiene cuenta. */
    suspend fun generateOtpForLogin(phone: String, email: String?): Boolean = otpSend("/generate-otp-for-login", phone, email)

    suspend fun sendOtp(phone: String, email: String?): Boolean = otpSend("/send-otp", phone, email)

    suspend fun verifyOtp(phone: String, otp: String): OpResult {
        val r = client.post("/verify-otp", buildJsonObject { put("phone", phone); put("otp", otp) })
        return OpResult(r.ok && r.body.asObject()?.get("success") == JsonPrimitive(true), r.body.errorMessage())
    }

    suspend fun sendPasswordResetMail(email: String): Boolean {
        val r = client.post("/send-password-reset-mail", buildJsonObject { put("email", email) })
        return r.ok && r.body.asObject()?.get("success") == JsonPrimitive(true)
    }

    suspend fun verifyPasswordResetOtp(email: String, otp: String): OpResult {
        val r = client.post("/verify-password-reset-otp", buildJsonObject { put("email", email); put("otp", otp) })
        return OpResult(r.ok && r.body.asObject()?.get("success") == JsonPrimitive(true), r.body.errorMessage())
    }

    suspend fun changePassword(email: String, otp: String, password: String): OpResult {
        val r = client.post("/change-user-password", buildJsonObject { put("email", email); put("otp", otp); put("password", password) })
        return OpResult(r.ok && r.body.asObject()?.get("success") == JsonPrimitive(true), r.body.errorMessage())
    }

    private suspend fun otpSend(path: String, phone: String, email: String?): Boolean {
        val r = client.post(path, buildJsonObject { put("phone", phone); email?.takeIf { it.isNotBlank() }?.let { put("email", it) } })
        return r.ok && r.body.asObject()?.get("success") == JsonPrimitive(true)
    }

    private fun location(lat: Double?, lng: Double?, businessTypeId: Int?) = buildJsonObject {
        lat?.let { put("latitude", it) }; lng?.let { put("longitude", it) }
        businessTypeId?.let { put("business_type_id", it) }
    }

    private fun auth(r: RawResponse): AuthResult {
        val o = r.body.asObject()
        if (o?.get("email_phone_already_used") == JsonPrimitive(true)) return AuthResult.EmailOrPhoneUsed
        if (r.ok && o?.get("success") == JsonPrimitive(true) && o["data"] is JsonObject) return AuthResult.Ok(o["data"].decode())
        val raw = r.body.errorMessage()
        return AuthResult.Fail(
            when (raw) {
                "DONOTMATCH" -> "Credenciales incorrectas"
                "OTP_EXPIRED" -> "El código expiró. Solicita uno nuevo"
                "TOO_MANY_ATTEMPTS" -> "Demasiados intentos. Intenta más tarde"
                null -> if (o?.get("enter_phone_after_social_login") != null) "Ingresa tu teléfono" else "No se pudo completar la solicitud"
                else -> raw
            },
        )
    }
}
