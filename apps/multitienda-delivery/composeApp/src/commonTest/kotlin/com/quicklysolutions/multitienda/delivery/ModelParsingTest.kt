package com.quicklysolutions.multitienda.delivery

import com.quicklysolutions.multitienda.delivery.model.AppJson
import com.quicklysolutions.multitienda.delivery.model.AppNotification
import com.quicklysolutions.multitienda.delivery.model.Order
import com.quicklysolutions.multitienda.delivery.util.formatDate
import com.quicklysolutions.multitienda.delivery.util.money
import kotlinx.datetime.TimeZone
import kotlinx.serialization.builtins.ListSerializer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ModelParsingTest {
    private val json = """
        [{"id":7,"unique_order_id":"OD-11-12-AB12-XYZ","orderstatus_id":"12","total":"45.50","payable":"45.50",
          "payment_mode":"COD","delivery_charge":5,"tip_amount":null,"extra":"ignorado",
          "location":"{\"lat\":-12.05,\"lng\":-77.04,\"address\":\"Av. X\"}",
          "restaurant":{"id":3,"name":"Pizzería","latitude":"-12.0464","longitude":"-77.0428"},
          "orderitems":[{"name":"Pizza","quantity":2,"price":"10.00","order_item_addons":[{"addon_name":"Queso","addon_price":"1.50"}]}]}]
    """.trimIndent()

    @Test
    fun `acepta decimales como string y numeros, y campos nulos`() {
        val o = AppJson.decodeFromString(ListSerializer(Order.serializer()), json).single()
        assertEquals(7, o.id)
        assertEquals(12, o.statusId)
        assertEquals(45.5, o.total)
        assertEquals(5.0, o.deliveryCharge)
        assertNull(o.tipAmount)
        assertEquals(-12.0464, o.restaurant?.latitude)
        assertEquals(1.5, o.items.single().addons.single().price)
    }

    @Test
    fun `parsea la ubicacion del cliente desde el JSON string`() {
        val o = AppJson.decodeFromString(ListSerializer(Order.serializer()), json).single()
        val p = assertNotNull(o.customerPoint)
        assertEquals(-12.05, p.lat)
        assertEquals(-77.04, p.lng)
        assertNull(Order(id = 1, location = "no es json").customerPoint)
        assertNull(Order(id = 1, location = null).customerPoint)
    }

    @Test
    fun `notificacion extrae titulo y mensaje del campo data`() {
        val n = AppJson.decodeFromString(AppNotification.serializer(), """{"id":"u1","data":"{\"title\":\"Nuevo\",\"message\":\"Pedido\"}","read_at":null}""")
        assertEquals("Nuevo", n.title)
        assertEquals("Pedido", n.message)
    }

    @Test
    fun `formatea dinero y fechas`() {
        assertEquals("S/12.50", money("S/", 12.5))
        assertEquals("$0.05", money("$", 0.05))
        assertEquals("-$3.00", money("$", -3.0))
        assertEquals("$0.00", money("$", null))
        assertEquals("12/11 09:05", formatDate("2026-11-12T09:05:00.000Z", TimeZone.UTC))
        assertEquals("", formatDate(null))
        assertEquals("texto", formatDate("texto"))
    }
}
