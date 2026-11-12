package com.quicklysolutions.multitienda.cliente.domain

import com.quicklysolutions.multitienda.cliente.data.Coupon
import kotlinx.serialization.Serializable

const val MAX_QUANTITY = 99
const val MAX_LINES = 100

@Serializable
data class CartAddon(val id: Int, val name: String, val price: Double, val categoryName: String? = null)

@Serializable
data class CartLine(
    val itemId: Int,
    val restaurantId: Int,
    val name: String,
    val image: String? = null,
    val basePrice: Double,
    val addons: List<CartAddon> = emptyList(),
    val quantity: Int = 1,
    val storeSlug: String = "",
    val storeName: String = "",
) {
    val key: String get() = "$itemId:" + addons.map { it.id }.sorted().joinToString(",")

    /** Con complementos el precio unitario es la suma de ellos; sin complementos, el del producto (src/helpers/orderRules.js:119-121). */
    val unitPrice: Double get() = unitPriceOf(basePrice, addons)
    val lineTotal: Double get() = toMoney(unitPrice * quantity)
}

fun unitPriceOf(basePrice: Double, addons: List<CartAddon>): Double =
    if (addons.isEmpty()) toMoney(basePrice) else toMoney(addons.sumOf { toMoney(it.price) })

@Serializable
data class CartState(
    val lines: List<CartLine> = emptyList(),
    val couponCode: String? = null,
    val coupon: Coupon? = null,
) {
    val count: Int get() = lines.sumOf { it.quantity }
    val restaurantId: Int? get() = lines.firstOrNull()?.restaurantId
    val subtotal: Double get() = CartRules.subtotal(lines)
}

sealed interface AddResult {
    data class Added(val lines: List<CartLine>) : AddResult
    data object OtherStore : AddResult
    data object Limit : AddResult
}

object CartRules {
    fun subtotal(lines: List<CartLine>): Double = toMoney(lines.sumOf { it.lineTotal })

    /** Un carrito pertenece a una sola tienda (orderController.js:51 y orderRules.js:107-109). */
    fun add(lines: List<CartLine>, line: CartLine): AddResult {
        if (lines.isNotEmpty() && lines.first().restaurantId != line.restaurantId) return AddResult.OtherStore
        val idx = lines.indexOfFirst { it.key == line.key }
        if (idx >= 0) {
            val current = lines[idx]
            if (current.quantity >= MAX_QUANTITY) return AddResult.Limit
            return AddResult.Added(lines.toMutableList().also { it[idx] = current.copy(quantity = current.quantity + 1) })
        }
        if (lines.size >= MAX_LINES) return AddResult.Limit
        return AddResult.Added(lines + line.copy(quantity = 1))
    }

    fun decrement(lines: List<CartLine>, key: String): List<CartLine> =
        lines.mapNotNull { if (it.key != key) it else if (it.quantity > 1) it.copy(quantity = it.quantity - 1) else null }

    /** Quita una unidad del ultimo renglon de ese producto (boton "-" en el menu). */
    fun decrementItem(lines: List<CartLine>, itemId: Int): List<CartLine> {
        val last = lines.lastOrNull { it.itemId == itemId } ?: return lines
        return decrement(lines, last.key)
    }

    fun quantityOf(lines: List<CartLine>, itemId: Int): Int = lines.filter { it.itemId == itemId }.sumOf { it.quantity }

    fun remove(lines: List<CartLine>, key: String): List<CartLine> = lines.filter { it.key != key }
}

data class LineStatus(val available: Boolean, val serverPrice: Double?)

/**
 * /check-cart-items-availability devuelve una fila por renglon cuyo producto existe, en el mismo orden
 * (restaurantController.js:251). Un renglon sin fila es un producto que ya no existe.
 */
fun matchAvailability(lines: List<CartLine>, rows: List<com.quicklysolutions.multitienda.cliente.data.AvailabilityRow>): Map<String, LineStatus> {
    val out = HashMap<String, LineStatus>()
    var j = 0
    for (line in lines) {
        val row = rows.getOrNull(j)
        if (row != null && row.id == line.itemId) {
            out[line.key] = LineStatus(row.isActive, row.price)
            j++
        } else {
            out[line.key] = LineStatus(false, null)
        }
    }
    return out
}

/** Alinea el precio de renglones sin complementos con el vigente en el servidor. */
fun repriceLines(lines: List<CartLine>, status: Map<String, LineStatus>): List<CartLine> =
    lines.map { l ->
        val s = status[l.key]
        if (s != null && s.available && l.addons.isEmpty() && s.serverPrice != null && toMoney(s.serverPrice) != l.unitPrice) l.copy(basePrice = s.serverPrice) else l
    }
