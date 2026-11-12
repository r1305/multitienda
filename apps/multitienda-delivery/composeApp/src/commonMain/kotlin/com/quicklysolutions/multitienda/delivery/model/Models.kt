package com.quicklysolutions.multitienda.delivery.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

val AppJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    explicitNulls = false
}

data class Session(val token: String, val userId: Int, val name: String, val phone: String)

data class GeoPoint(val lat: Double, val lng: Double) {
    val isValid: Boolean get() = lat in -90.0..90.0 && lng in -180.0..180.0 && !(lat == 0.0 && lng == 0.0)
}

@Serializable
data class Restaurant(
    @Serializable(with = LenientInt::class) val id: Int? = null,
    @Serializable(with = LenientString::class) val name: String? = null,
    @Serializable(with = LenientDouble::class) val latitude: Double? = null,
    @Serializable(with = LenientDouble::class) val longitude: Double? = null,
    @Serializable(with = LenientString::class) val address: String? = null,
) {
    val point: GeoPoint? get() = if (latitude != null && longitude != null) GeoPoint(latitude, longitude) else null
}

@Serializable
data class AddonLine(
    @Serializable(with = LenientString::class) @SerialName("addon_name") val name: String? = null,
    @Serializable(with = LenientDouble::class) @SerialName("addon_price") val price: Double? = null,
)

@Serializable
data class OrderItem(
    @Serializable(with = LenientString::class) val name: String? = null,
    @Serializable(with = LenientInt::class) val quantity: Int? = null,
    @Serializable(with = LenientDouble::class) val price: Double? = null,
    @SerialName("order_item_addons") val addons: List<AddonLine> = emptyList(),
)

@Serializable
data class Order(
    @Serializable(with = LenientInt::class) val id: Int,
    @Serializable(with = LenientString::class) @SerialName("unique_order_id") val uniqueOrderId: String? = null,
    @Serializable(with = LenientInt::class) @SerialName("orderstatus_id") val statusId: Int = 0,
    @Serializable(with = LenientDouble::class) val total: Double? = null,
    @Serializable(with = LenientDouble::class) @SerialName("sub_total") val subTotal: Double? = null,
    @Serializable(with = LenientDouble::class) @SerialName("delivery_charge") val deliveryCharge: Double? = null,
    @Serializable(with = LenientDouble::class) @SerialName("restaurant_charge") val restaurantCharge: Double? = null,
    @Serializable(with = LenientDouble::class) @SerialName("coupon_amount") val couponAmount: Double? = null,
    @Serializable(with = LenientDouble::class) @SerialName("tip_amount") val tipAmount: Double? = null,
    @Serializable(with = LenientString::class) @SerialName("payment_mode") val paymentMode: String? = null,
    @Serializable(with = LenientDouble::class) val payable: Double? = null,
    @Serializable(with = LenientString::class) val address: String? = null,
    @Serializable(with = LenientString::class) val location: String? = null,
    @Serializable(with = LenientString::class) @SerialName("order_comment") val comment: String? = null,
    @Serializable(with = LenientString::class) @SerialName("created_at") val createdAt: String? = null,
    val restaurant: Restaurant? = null,
    @SerialName("orderitems") val items: List<OrderItem> = emptyList(),
) {
    /** Destino del cliente: `location` llega como JSON string `{"lat":..,"lng":..}`. */
    val customerPoint: GeoPoint?
        get() = runCatching {
            val o = AppJson.parseToJsonElement(location ?: return null) as kotlinx.serialization.json.JsonObject
            val lat = (o["lat"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()
            val lng = (o["lng"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()
            if (lat != null && lng != null) GeoPoint(lat, lng) else null
        }.getOrNull()
}

@Serializable
data class ChatMessage(
    @Serializable(with = LenientInt::class) val id: Int = 0,
    @Serializable(with = LenientInt::class) @SerialName("sender_id") val senderId: Int = 0,
    @Serializable(with = LenientString::class) val message: String = "",
    @Serializable(with = LenientString::class) @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class EarningLine(
    @Serializable(with = LenientInt::class) val id: Int = 0,
    @Serializable(with = LenientString::class) @SerialName("unique_order_id") val uniqueOrderId: String? = null,
    @Serializable(with = LenientDouble::class) val amount: Double? = null,
    @Serializable(with = LenientString::class) @SerialName("commission_type") val commissionType: String? = null,
    @Serializable(with = LenientString::class) @SerialName("order_date") val orderDate: String? = null,
    @Serializable(with = LenientString::class) @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class EarningsSummary(
    val earnings: List<EarningLine> = emptyList(),
    @Serializable(with = LenientDouble::class) val totalEarnings: Double = 0.0,
    @Serializable(with = LenientDouble::class) val todayEarnings: Double = 0.0,
    @Serializable(with = LenientDouble::class) val weekEarnings: Double = 0.0,
    @Serializable(with = LenientInt::class) val totalDeliveries: Int = 0,
)

@Serializable
data class Balance(
    @Serializable(with = LenientDouble::class) @SerialName("cash_pending") val cashPending: Double = 0.0,
    @Serializable(with = LenientInt::class) @SerialName("cash_pending_orders") val cashPendingOrders: Int = 0,
    @Serializable(with = LenientDouble::class) @SerialName("cash_delivered") val cashDelivered: Double = 0.0,
    @Serializable(with = LenientDouble::class) @SerialName("earnings_total") val earningsTotal: Double = 0.0,
    @Serializable(with = LenientDouble::class) @SerialName("earnings_tips") val earningsTips: Double = 0.0,
    @Serializable(with = LenientDouble::class) @SerialName("earnings_pending") val earningsPending: Double = 0.0,
    @Serializable(with = LenientDouble::class) @SerialName("earnings_paid") val earningsPaid: Double = 0.0,
)

@Serializable
data class CashClosing(
    @Serializable(with = LenientInt::class) val id: Int = 0,
    @Serializable(with = LenientDouble::class) @SerialName("received_amount") val receivedAmount: Double = 0.0,
    @Serializable(with = LenientString::class) @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class Payout(
    @Serializable(with = LenientInt::class) val id: Int = 0,
    @Serializable(with = LenientDouble::class) val amount: Double = 0.0,
    @Serializable(with = LenientString::class) val reference: String? = null,
    @Serializable(with = LenientString::class) @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class BalanceResponse(
    val balance: Balance = Balance(),
    val closings: List<CashClosing> = emptyList(),
    val payouts: List<Payout> = emptyList(),
)

data class DeliveryProfile(
    @Serializable(with = LenientString::class) val name: String? = null,
    @Serializable(with = LenientString::class) val email: String? = null,
    @Serializable(with = LenientString::class) val phone: String? = null,
    @Serializable(with = LenientString::class) val vehicleNumber: String? = null,
    val isAvailable: Boolean = false,
)

@Serializable
data class AppNotification(
    @Serializable(with = LenientString::class) val id: String = "",
    @Serializable(with = LenientString::class) val data: String? = null,
    @Serializable(with = LenientString::class) @SerialName("read_at") val readAt: String? = null,
    @Serializable(with = LenientString::class) @SerialName("created_at") val createdAt: String? = null,
) {
    private val payload get() = runCatching { AppJson.parseToJsonElement(data ?: "") as kotlinx.serialization.json.JsonObject }.getOrNull()
    val title: String get() = (payload?.get("title") as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
    val message: String get() = (payload?.get("message") as? kotlinx.serialization.json.JsonPrimitive)?.content ?: ""
}

/** Ajustes públicos de /get-settings que usa la app. */
data class AppSettings(val currency: String = "$", val pinRequired: Boolean = false, val storeName: String = "")
