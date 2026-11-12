package com.quicklysolutions.multitienda.delivery

import com.quicklysolutions.multitienda.delivery.domain.GpsThrottle
import com.quicklysolutions.multitienda.delivery.domain.OrderAction
import com.quicklysolutions.multitienda.delivery.domain.OrderFlow
import com.quicklysolutions.multitienda.delivery.model.Order
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class OrderFlowTest {
    private fun order(id: Int, status: Int, mode: String? = null, payable: Double? = null) =
        Order(id = id, statusId = status, paymentMode = mode, payable = payable)

    @Test
    fun `solo se permiten las transiciones del repartidor 2-12 a 3, 3 a 4, 4 a 5`() {
        assertEquals(3, OrderFlow.apply(2, OrderAction.ACCEPT))
        assertEquals(3, OrderFlow.apply(12, OrderAction.ACCEPT))
        assertEquals(4, OrderFlow.apply(3, OrderAction.PICKUP))
        assertEquals(5, OrderFlow.apply(4, OrderAction.DELIVER))
        assertNull(OrderFlow.apply(3, OrderAction.ACCEPT))
        assertNull(OrderFlow.apply(2, OrderAction.PICKUP))
        assertNull(OrderFlow.apply(3, OrderAction.DELIVER))
        assertNull(OrderFlow.apply(5, OrderAction.DELIVER))
        assertNull(OrderFlow.apply(6, OrderAction.ACCEPT))
    }

    @Test
    fun `la accion siguiente depende del estado`() {
        assertEquals(OrderAction.ACCEPT, OrderFlow.nextAction(2))
        assertEquals(OrderAction.ACCEPT, OrderFlow.nextAction(12))
        assertEquals(OrderAction.PICKUP, OrderFlow.nextAction(3))
        assertEquals(OrderAction.DELIVER, OrderFlow.nextAction(4))
        assertNull(OrderFlow.nextAction(5))
        assertNull(OrderFlow.nextAction(6))
    }

    @Test
    fun `board deduplica y excluye ignorados y pedidos ya tomados`() {
        val available = listOf(order(1, 2), order(1, 2), order(2, 12), order(3, 2), order(4, 5), order(5, 2))
        val active = listOf(order(3, 3), order(3, 3), order(9, 4), order(8, 5))
        val b = OrderFlow.board(available, active, ignored = setOf(5))
        assertEquals(listOf(1, 2), b.available.map { it.id })
        assertEquals(listOf(3, 9), b.active.map { it.id })
    }

    @Test
    fun `el GPS solo se activa con pedidos asignados o en camino`() {
        assertTrue(OrderFlow.needsTracking(listOf(order(1, 3))))
        assertTrue(OrderFlow.needsTracking(listOf(order(1, 4))))
        assertFalse(OrderFlow.needsTracking(emptyList()))
    }

    @Test
    fun `efectivo a cobrar solo si el pago es COD y payable mayor a cero`() {
        assertEquals(25.5, OrderFlow.cashToCollect(order(1, 4, " cod ", 25.5)))
        assertEquals(0.0, OrderFlow.cashToCollect(order(1, 4, "COD", 0.0)))
        assertEquals(0.0, OrderFlow.cashToCollect(order(1, 4, "STRIPE", 30.0)))
        assertEquals(0.0, OrderFlow.cashToCollect(order(1, 4, null, null)))
    }

    @Test
    fun `el throttle de GPS deja pasar un envio por intervalo`() {
        val t = GpsThrottle(30_000)
        assertTrue(t.shouldSend(1_000))
        assertFalse(t.shouldSend(20_000))
        assertTrue(t.shouldSend(31_000))
        assertFalse(t.shouldSend(40_000))
    }
}
