package com.quicklysolutions.multitienda.cliente.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class AddressDto(
    @Serializable(FlexInt::class) val id: Int = 0,
    val address: String? = null,
    val house: String? = null,
    val tag: String? = null,
    @Serializable(FlexDoubleN::class) val latitude: Double? = null,
    @Serializable(FlexDoubleN::class) val longitude: Double? = null,
) {
    val title: String get() = tag?.takeIf { it.isNotBlank() } ?: house?.takeIf { it.isNotBlank() } ?: "Dirección"
}

@Serializable
data class UserDto(
    @Serializable(FlexInt::class) val id: Int = 0,
    @SerialName("auth_token") val authToken: String? = null,
    val name: String? = null,
    val email: String? = null,
    @Serializable(FlexStr::class) val phone: String? = null,
    @SerialName("default_address_id") @Serializable(FlexIntN::class) val defaultAddressId: Int? = null,
    @SerialName("default_address") val defaultAddress: AddressDto? = null,
    @SerialName("wallet_balance") @Serializable(FlexDouble::class) val walletBalance: Double = 0.0,
    val avatar: String? = null,
    @SerialName("tax_number") @Serializable(FlexStr::class) val taxNumber: String? = null,
    val role: String? = null,
)

@Serializable
data class StoreSummary(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String = "",
    val description: String? = null,
    val image: String? = null,
    @Serializable(FlexStr::class) val rating: String? = null,
    @Serializable(FlexStr::class) val avgRating: String? = null,
    @SerialName("delivery_time") @Serializable(FlexStr::class) val deliveryTime: String? = null,
    @SerialName("price_range") @Serializable(FlexStr::class) val priceRange: String? = null,
    val slug: String = "",
    @SerialName("business_type_id") @Serializable(FlexIntN::class) val businessTypeId: Int? = null,
    @SerialName("business_type_name") val businessTypeName: String? = null,
    @SerialName("is_featured") @Serializable(FlexBool::class) val isFeatured: Boolean = false,
    @SerialName("is_active") @Serializable(FlexBool::class) val isActive: Boolean = true,
    @Serializable(FlexDoubleN::class) val distance: Double? = null,
    @SerialName("custom_featured_name") val customFeaturedName: String? = null,
    @SerialName("custom_message_on_list") val customMessageOnList: String? = null,
) {
    val ratingText: String get() = avgRating?.takeIf { it.isNotBlank() && it != "0" } ?: rating?.takeIf { it.isNotBlank() } ?: "-"
}

@Serializable
data class RestaurantInfo(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String = "",
    val description: String? = null,
    val slug: String = "",
    val image: String? = null,
    @Serializable(FlexDoubleN::class) val latitude: Double? = null,
    @Serializable(FlexDoubleN::class) val longitude: Double? = null,
    @SerialName("delivery_radius") @Serializable(FlexDoubleN::class) val deliveryRadius: Double? = null,
    @SerialName("delivery_charges") @Serializable(FlexDouble::class) val deliveryCharges: Double = 0.0,
    @SerialName("delivery_charge_type") val deliveryChargeType: String? = null,
    @SerialName("base_delivery_charge") @Serializable(FlexDouble::class) val baseDeliveryCharge: Double = 0.0,
    @SerialName("base_delivery_distance") @Serializable(FlexDouble::class) val baseDeliveryDistance: Double = 0.0,
    @SerialName("extra_delivery_charge") @Serializable(FlexDouble::class) val extraDeliveryCharge: Double = 0.0,
    @SerialName("extra_delivery_distance") @Serializable(FlexDouble::class) val extraDeliveryDistance: Double = 0.0,
    @SerialName("restaurant_charges") @Serializable(FlexDouble::class) val restaurantCharges: Double = 0.0,
    @SerialName("delivery_time") @Serializable(FlexStr::class) val deliveryTime: String? = null,
    @SerialName("price_range") @Serializable(FlexStr::class) val priceRange: String? = null,
    @SerialName("is_active") @Serializable(FlexBool::class) val isActive: Boolean = true,
    @SerialName("is_accepted") @Serializable(FlexBool::class) val isAccepted: Boolean = true,
    @SerialName("is_schedulable") @Serializable(FlexBool::class) val isSchedulable: Boolean = false,
    @SerialName("delivery_type") @Serializable(FlexIntN::class) val deliveryType: Int? = null,
    @SerialName("min_order_price") @Serializable(FlexDouble::class) val minOrderPrice: Double = 0.0,
    @SerialName("free_delivery_subtotal") @Serializable(FlexDouble::class) val freeDeliverySubtotal: Double = 0.0,
    @Serializable(FlexStr::class) val rating: String? = null,
    @Serializable(FlexStr::class) val avgRating: String? = null,
    @SerialName("is_favorited") @Serializable(FlexBool::class) val isFavorited: Boolean = false,
) {
    val ratingText: String get() = avgRating?.takeIf { it.isNotBlank() && it != "0" } ?: rating?.takeIf { it.isNotBlank() } ?: "-"
    val supportsDelivery: Boolean get() = deliveryType == null || deliveryType == 1 || deliveryType == 3
    val supportsPickup: Boolean get() = deliveryType == null || deliveryType == 2 || deliveryType == 3
}

@Serializable
data class Addon(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String = "",
    @Serializable(FlexDouble::class) val price: Double = 0.0,
    @SerialName("addon_category_id") @Serializable(FlexInt::class) val addonCategoryId: Int = 0,
    @SerialName("is_active") @Serializable(FlexBool::class) val isActive: Boolean = true,
)

@Serializable
data class AddonCategory(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String = "",
    val type: String? = null,
    @Serializable(FlexInt::class) val addonlimit: Int = 0,
    val addons: List<Addon> = emptyList(),
) {
    val isSingleChoice: Boolean get() = type == "SINGLE" || (type.isNullOrEmpty() && addonlimit == 1)
}

@Serializable
data class Item(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String = "",
    val description: String? = null,
    @Serializable(FlexDouble::class) val price: Double = 0.0,
    @SerialName("old_price") @Serializable(FlexDouble::class) val oldPrice: Double = 0.0,
    val image: String? = null,
    @SerialName("is_active") @Serializable(FlexBool::class) val isActive: Boolean = true,
    @SerialName("is_veg") @Serializable(FlexBool::class) val isVeg: Boolean = false,
    @SerialName("restaurant_id") @Serializable(FlexInt::class) val restaurantId: Int = 0,
    @SerialName("addon_categories") val addonCategories: List<AddonCategory> = emptyList(),
    val restaurant: RestaurantInfo? = null,
)

@Serializable
data class MenuResponse(
    val recommended: List<Item> = emptyList(),
    val items: Map<String, List<Item>> = emptyMap(),
)

@Serializable
data class SearchResponse(
    val restaurants: List<StoreSummary> = emptyList(),
    val items: List<Item> = emptyList(),
)

@Serializable
data class PromoSlide(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String? = null,
    val image: String? = null,
    val url: String? = null,
)

@Serializable
data class BusinessType(@Serializable(FlexInt::class) val id: Int = 0, val name: String = "")

@Serializable
data class StoreCategory(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String = "",
    val image: String? = null,
)

@Serializable
data class PlaceDto(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String = "",
    @Serializable(FlexDoubleN::class) val latitude: Double? = null,
    @Serializable(FlexDoubleN::class) val longitude: Double? = null,
)

@Serializable
data class LanguageDto(
    @Serializable(FlexInt::class) val id: Int = 0,
    @SerialName("language_name") val languageName: String = "",
    @SerialName("language_code") val languageCode: String = "",
    @SerialName("is_default") @Serializable(FlexBool::class) val isDefault: Boolean = false,
)

@Serializable
data class SettingRow(val key: String = "", @Serializable(FlexStr::class) val value: String? = null)

@Serializable
data class OrderItemAddon(
    @Serializable(FlexInt::class) val id: Int = 0,
    @SerialName("addon_name") val addonName: String = "",
    @SerialName("addon_category_name") val addonCategoryName: String? = null,
    @SerialName("addon_price") @Serializable(FlexDouble::class) val addonPrice: Double = 0.0,
)

@Serializable
data class OrderItem(
    @Serializable(FlexInt::class) val id: Int = 0,
    @SerialName("item_id") @Serializable(FlexInt::class) val itemId: Int = 0,
    val name: String = "",
    @Serializable(FlexInt::class) val quantity: Int = 1,
    @Serializable(FlexDouble::class) val price: Double = 0.0,
    @SerialName("order_item_addons") val addons: List<OrderItemAddon> = emptyList(),
)

@Serializable
data class Order(
    @Serializable(FlexInt::class) val id: Int = 0,
    @SerialName("unique_order_id") val uniqueOrderId: String = "",
    @SerialName("restaurant_id") @Serializable(FlexInt::class) val restaurantId: Int = 0,
    @SerialName("orderstatus_id") @Serializable(FlexInt::class) val statusId: Int = 0,
    @Serializable(FlexDouble::class) val total: Double = 0.0,
    @SerialName("sub_total") @Serializable(FlexDouble::class) val subTotal: Double = 0.0,
    @SerialName("delivery_charge") @Serializable(FlexDouble::class) val deliveryCharge: Double = 0.0,
    @SerialName("restaurant_charge") @Serializable(FlexDouble::class) val restaurantCharge: Double = 0.0,
    @SerialName("tax_amount") @Serializable(FlexDouble::class) val taxAmount: Double = 0.0,
    @SerialName("coupon_name") val couponName: String? = null,
    @SerialName("coupon_amount") @Serializable(FlexDouble::class) val couponAmount: Double = 0.0,
    @SerialName("tip_amount") @Serializable(FlexDouble::class) val tipAmount: Double = 0.0,
    @SerialName("wallet_amount") @Serializable(FlexDouble::class) val walletAmount: Double = 0.0,
    @Serializable(FlexDouble::class) val payable: Double = 0.0,
    @SerialName("payment_mode") val paymentMode: String? = null,
    val address: String? = null,
    val location: String? = null,
    @SerialName("delivery_type") @Serializable(FlexInt::class) val deliveryType: Int = 1,
    @SerialName("delivery_pin") @Serializable(FlexStr::class) val deliveryPin: String? = null,
    @SerialName("order_comment") val orderComment: String? = null,
    @SerialName("is_scheduled") @Serializable(FlexBool::class) val isScheduled: Boolean = false,
    @SerialName("schedule_date") @Serializable(FlexStr::class) val scheduleDate: String? = null,
    @SerialName("schedule_slot") @Serializable(FlexStr::class) val scheduleSlot: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("eta_at") val etaAt: String? = null,
    @SerialName("is_ratable") @Serializable(FlexBool::class) val isRatable: Boolean = false,
    val rating: JsonElement? = null,
    val orderitems: List<OrderItem> = emptyList(),
    val restaurant: RestaurantInfo? = null,
)

@Serializable
data class OrdersPage(
    val data: List<Order> = emptyList(),
    @Serializable(FlexInt::class) val total: Int = 0,
    @SerialName("per_page") @Serializable(FlexInt::class) val perPage: Int = 10,
    @SerialName("current_page") @Serializable(FlexInt::class) val currentPage: Int = 1,
)

@Serializable
data class DeliveryDetails(
    val name: String? = null,
    @Serializable(FlexStr::class) val phone: String? = null,
    @Serializable(FlexStr::class) val rating: String? = null,
    @SerialName("vehicle_number") val vehicleNumber: String? = null,
)

@Serializable
data class UserInfoResponse(
    val success: Boolean = false,
    val data: UserDto? = null,
    @SerialName("running_order") val runningOrder: Order? = null,
    @SerialName("delivery_details") val deliveryDetails: DeliveryDetails? = null,
)

@Serializable
data class OrderLocation(
    @Serializable(FlexDoubleN::class) val lat: Double? = null,
    @Serializable(FlexDoubleN::class) val lng: Double? = null,
    val address: String? = null,
)

@Serializable
data class Coupon(
    @Serializable(FlexInt::class) val id: Int = 0,
    val code: String = "",
    @Serializable(FlexDouble::class) val discount: Double = 0.0,
    @SerialName("discount_type") val discountType: String? = null,
    @SerialName("max_discount") @Serializable(FlexDouble::class) val maxDiscount: Double = 0.0,
    @SerialName("min_sub_total") @Serializable(FlexDouble::class) val minSubTotal: Double = 0.0,
    @SerialName("max_sub_total") @Serializable(FlexDouble::class) val maxSubTotal: Double = 0.0,
    @Serializable(FlexInt::class) val count: Int = 0,
    @SerialName("max_count") @Serializable(FlexInt::class) val maxCount: Int = 0,
    @SerialName("restaurant_id") @Serializable(FlexIntN::class) val restaurantId: Int? = null,
)

@Serializable
data class PaymentGateway(
    @Serializable(FlexInt::class) val id: Int = 0,
    val name: String = "",
    val title: String? = null,
    @SerialName("account_number") @Serializable(FlexStr::class) val accountNumber: String? = null,
    @SerialName("phone_number") @Serializable(FlexStr::class) val phoneNumber: String? = null,
)

@Serializable
data class AvailabilityRow(
    @Serializable(FlexInt::class) val id: Int = 0,
    @Serializable(FlexDouble::class) val price: Double = 0.0,
    @SerialName("is_active") @Serializable(FlexBool::class) val isActive: Boolean = false,
)

@Serializable
data class ChatMessage(
    @Serializable(FlexInt::class) val id: Int = 0,
    @SerialName("sender_id") @Serializable(FlexInt::class) val senderId: Int = 0,
    val message: String = "",
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class GpsPoint(
    @SerialName("delivery_lat") @Serializable(FlexDoubleN::class) val lat: Double? = null,
    @SerialName("delivery_long") @Serializable(FlexDoubleN::class) val lng: Double? = null,
    @SerialName("updated_at") @Serializable(FlexStr::class) val updatedAt: String? = null,
    @Serializable(FlexBool::class) val live: Boolean = false,
)

@Serializable
data class AppNotification(
    @Serializable(FlexStr::class) val id: String? = null,
    val data: JsonElement? = null,
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class WalletTx(
    @Serializable(FlexInt::class) val id: Int = 0,
    val type: String = "",
    @Serializable(FlexDouble::class) val amount: Double = 0.0,
    val meta: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class WalletResponse(
    val success: Boolean = false,
    @Serializable(FlexDouble::class) val balance: Double = 0.0,
    val transactions: List<WalletTx> = emptyList(),
)

@Serializable
data class ReviewDto(
    @Serializable(FlexDouble::class) val rating: Double = 0.0,
    val comment: String? = null,
    val reply: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class ReviewsPage(
    val success: Boolean = false,
    @Serializable(FlexDoubleN::class) val average: Double? = null,
    @Serializable(FlexInt::class) val total: Int = 0,
    @SerialName("per_page") @Serializable(FlexInt::class) val perPage: Int = 10,
    @SerialName("current_page") @Serializable(FlexInt::class) val currentPage: Int = 1,
    val data: List<ReviewDto> = emptyList(),
)
