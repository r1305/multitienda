package com.quicklysolutions.multitienda.cliente.domain

import com.quicklysolutions.multitienda.cliente.data.Coupon
import com.quicklysolutions.multitienda.cliente.data.Order
import com.quicklysolutions.multitienda.cliente.data.RestaurantInfo
import kotlin.math.max
import kotlin.math.min
import kotlinx.serialization.json.JsonNull

const val MAX_TIP = 10000.0
const val WALLET_METHOD = "WALLET"
const val DEFAULT_CASH_METHOD = "COD"
val PENDING_PAYMENT_METHODS = listOf("MERCADOPAGO", "PAYTM", "RAZORPAY")

sealed interface CouponEval {
    data class Ok(val amount: Double) : CouponEval
    data class Fail(val message: String) : CouponEval
}

object Pricing {
    /**
     * Estimacion del envio (orderController.js:25-43 y :101-103). El servidor recalcula y manda: aqui solo se muestra.
     * Sin ubicacion de entrega el cargo es 0; recojo en tienda no paga envio.
     */
    fun deliveryCharge(r: RestaurantInfo, destLat: Double?, destLng: Double?, subtotal: Double, deliveryType: Int): Double {
        if (deliveryType != 1) return 0.0
        if (destLat == null || destLng == null || r.latitude == null || r.longitude == null) return 0.0
        val distance = distanceKm(destLat, destLng, r.latitude, r.longitude)
        var charge = if (r.deliveryChargeType == "DYNAMIC") {
            if (distance > r.baseDeliveryDistance && r.extraDeliveryDistance > 0) {
                r.baseDeliveryCharge + (distance - r.baseDeliveryDistance) / r.extraDeliveryDistance * r.extraDeliveryCharge
            } else r.baseDeliveryCharge
        } else r.deliveryCharges
        charge = toMoney(charge)
        if (r.freeDeliverySubtotal > 0 && subtotal >= r.freeDeliverySubtotal) charge = 0.0
        return charge
    }

    fun total(subTotal: Double, couponAmount: Double, deliveryCharge: Double, restaurantCharge: Double, tip: Double): Double =
        toMoney(max(0.0, toMoney(subTotal) - toMoney(couponAmount) + toMoney(deliveryCharge) + toMoney(restaurantCharge) + toMoney(tip)))

    /** Propina opcional entre 0 y 10000 (orderRules.js parseTip). null = invalida. */
    fun parseTip(text: String): Double? {
        val t = text.trim().replace(',', '.')
        if (t.isEmpty()) return 0.0
        val n = t.toDoubleOrNull() ?: return null
        return if (n < 0 || n > MAX_TIP) null else toMoney(n)
    }

    /** Cupon: mismas reglas que orderRules.js evaluateCoupon (el uso por usuario lo valida el servidor). */
    fun evaluateCoupon(c: Coupon, subTotal: Double, restaurantId: Int?): CouponEval {
        if (c.restaurantId != null && c.restaurantId != 0 && restaurantId != null && c.restaurantId != restaurantId) {
            return CouponEval.Fail("Cupón no válido para esta tienda")
        }
        if (c.maxCount > 0 && c.count >= c.maxCount) return CouponEval.Fail("Cupón agotado")
        val sub = toMoney(subTotal)
        val minSub = toMoney(c.minSubTotal)
        if (minSub > 0 && sub < minSub) return CouponEval.Fail("Pedido mínimo: ${fixed2(minSub)}")
        val maxSub = toMoney(c.maxSubTotal)
        if (maxSub > 0 && sub > maxSub) return CouponEval.Fail("Pedido máximo para este cupón: ${fixed2(maxSub)}")
        val discount = toMoney(c.discount)
        if (discount <= 0) return CouponEval.Fail("Cupón inválido")
        var amount: Double
        if (c.discountType == "PERCENTAGE") {
            if (discount > 100) return CouponEval.Fail("Cupón inválido")
            amount = discount / 100 * sub
            val maxDiscount = toMoney(c.maxDiscount)
            if (maxDiscount > 0 && amount > maxDiscount) amount = maxDiscount
        } else {
            amount = discount
        }
        return CouponEval.Ok(toMoney(min(max(0.0, amount), sub)))
    }

    /** Pago con billetera (orderRules.js splitWalletPayment). null = saldo insuficiente para pagar todo con billetera. */
    fun splitWallet(method: String, total: Double, balance: Double, partial: Boolean): WalletSplit? {
        val t = toMoney(total)
        val b = toMoney(balance)
        if (method == WALLET_METHOD) return if (b < t) null else WalletSplit(t, 0.0)
        if (partial && b > 0) {
            val used = toMoney(min(b, t))
            return WalletSplit(used, toMoney(t - used))
        }
        return WalletSplit(0.0, t)
    }

    /** Metodos que acepta el servidor: pasarelas activas (o COD si no hay) mas WALLET (orderRules.js resolveAllowedMethods). */
    fun allowedMethods(gatewayNames: List<String>): List<String> {
        val names = gatewayNames.map { it.trim().uppercase() }.filter { it.isNotEmpty() }
        val allowed = names.ifEmpty { listOf(DEFAULT_CASH_METHOD) }.toMutableList()
        if (WALLET_METHOD !in allowed) allowed.add(WALLET_METHOD)
        return allowed
    }
}

data class WalletSplit(val walletAmount: Double, val payable: Double)

object OrderStatus {
    fun label(id: Int): String = when (id) {
        1 -> "Recibida"; 2 -> "Aceptado"; 3, 4 -> "En camino"; 5 -> "Entregado"; 6 -> "Cancelado"
        7 -> "Listo"; 8 -> "Pago pendiente"; 9 -> "Pago fallido"; 10 -> "Programado"; 11 -> "Confirmado"
        12 -> "En preparación"; else -> "Desconocido"
    }

    /** Color ARGB del chip de estado (mismos colores que la web). */
    fun color(id: Int): Long = when (id) {
        1, 11 -> 0xFF2196F3; 2, 3, 4, 12 -> 0xFFFF9800; 5, 7 -> 0xFF4CAF50
        6, 9 -> 0xFFF44336; 10 -> 0xFF9C27B0; else -> 0xFF9E9E9E
    }

    /** Pedido en curso (pages.js OrderDetailPage.isRunning). */
    fun isRunning(id: Int): Boolean = id in listOf(1, 2, 3, 4, 7, 8, 12)

    /** El cliente solo cancela en estado 1 (recibida) o 10 (programada) (orderStates.js ACTOR_RULES.customer). */
    fun canCancel(id: Int): Boolean = id == 1 || id == 10

    /** Seguimiento GPS y chat solo con repartidor asignado o en camino (miscControllers.js:676). */
    fun isTrackable(id: Int): Boolean = id == 3 || id == 4

    fun canRate(order: Order): Boolean =
        order.statusId == 5 && (order.isRatable || order.rating == null || order.rating is JsonNull)
}
