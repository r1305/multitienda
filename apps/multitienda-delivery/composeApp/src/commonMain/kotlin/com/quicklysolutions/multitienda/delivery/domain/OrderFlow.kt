package com.quicklysolutions.multitienda.delivery.domain

import com.quicklysolutions.multitienda.delivery.model.Order

/** Estados de pedido relevantes para el repartidor (servidor: src/helpers/orderStates.js, tabla orderstatus). */
object OrderStatus {
    const val ACCEPTED = 2
    const val ASSIGNED = 3
    const val PICKED_UP = 4
    const val DELIVERED = 5
    const val CANCELLED = 6
    const val PREPARING = 12
}

/**
 * Transiciones que puede ejecutar el repartidor. Espejo de ACTOR_RULES.delivery en orderStates.js:
 * `{ 3: [2, 12], 4: [3], 5: [4] }` (destino: orígenes permitidos).
 */
enum class OrderAction(val from: Set<Int>, val to: Int) {
    ACCEPT(setOf(OrderStatus.ACCEPTED, OrderStatus.PREPARING), OrderStatus.ASSIGNED),
    PICKUP(setOf(OrderStatus.ASSIGNED), OrderStatus.PICKED_UP),
    DELIVER(setOf(OrderStatus.PICKED_UP), OrderStatus.DELIVERED),
}

data class Board(val available: List<Order>, val active: List<Order>)

object OrderFlow {
    fun isAvailable(status: Int) = status == OrderStatus.ACCEPTED || status == OrderStatus.PREPARING

    fun isActive(status: Int) = status == OrderStatus.ASSIGNED || status == OrderStatus.PICKED_UP

    /** Acción disponible para el repartidor en cada estado (la web: delivery.js:326-329). */
    fun nextAction(status: Int): OrderAction? = OrderAction.entries.firstOrNull { status in it.from }

    /** Estado resultante de aplicar [action], o null si no es válida desde [status]. */
    fun apply(status: Int, action: OrderAction): Int? = if (status in action.from) action.to else null

    /** El chat y el GPS solo operan con el pedido asignado (3) o en camino (4). */
    fun hasChat(status: Int) = isActive(status)

    fun needsTracking(active: List<Order>) = active.any { isActive(it.statusId) }

    /**
     * Combina las listas del servidor: sin duplicados por id, sin ignorados y sin los que ya tomé
     * (un pedido recién aceptado puede aparecer un instante en ambas listas).
     */
    fun board(available: List<Order>, active: List<Order>, ignored: Set<Int>): Board {
        val mine = active.filter { isActive(it.statusId) }.distinctBy { it.id }
        val taken = mine.map { it.id }.toSet() + ignored
        val open = available.filter { isAvailable(it.statusId) && it.id !in taken }.distinctBy { it.id }
        return Board(open, mine)
    }

    /** Efectivo a cobrar al cliente: `payable` solo si el pago es COD (delivery.js:354). */
    fun cashToCollect(order: Order): Double {
        val cash = order.paymentMode?.trim()?.uppercase() == "COD"
        val p = order.payable ?: 0.0
        return if (cash && p > 0) p else 0.0
    }
}

/** Limita el envío de GPS a uno cada [minIntervalMs] (la web envía cada 30 s). */
class GpsThrottle(private val minIntervalMs: Long) {
    private var last: Long? = null

    fun shouldSend(nowMs: Long): Boolean {
        val l = last
        if (l != null && nowMs - l < minIntervalMs) return false
        last = nowMs
        return true
    }
}
