package com.quicklysolutions.multitienda.cliente

import com.quicklysolutions.multitienda.cliente.data.ApiClient
import com.quicklysolutions.multitienda.cliente.data.ApiException
import com.quicklysolutions.multitienda.cliente.data.ApiJson
import com.quicklysolutions.multitienda.cliente.data.AuthResult
import com.quicklysolutions.multitienda.cliente.data.CouponResult
import com.quicklysolutions.multitienda.cliente.data.MultitiendaApi
import com.quicklysolutions.multitienda.cliente.data.PlaceOrderRequest
import com.quicklysolutions.multitienda.cliente.data.PlaceOrderResult
import com.quicklysolutions.multitienda.cliente.domain.CartAddon
import com.quicklysolutions.multitienda.cliente.domain.CartLine
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandler
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ApiTest {
    private val json = headersOf(HttpHeaders.ContentType, "application/json")

    private fun api(token: String? = "tok", onUnauthorized: () -> Unit = {}, handler: MockRequestHandler) =
        MultitiendaApi(ApiClient(HttpClient(MockEngine(handler)), "https://x.com/api/", { token }, onUnauthorized))

    private fun HttpRequestData.bodyJson(): JsonObject = ApiJson.parseToJsonElement((body as TextContent).text).jsonObject

    @Test
    fun parsesMysqlStyleValuesInOrders() = runTest {
        val body = """{"data":[{"id":"7","unique_order_id":"OD-1","orderstatus_id":"5","total":"25.50","sub_total":"20.00","is_ratable":1,"eta_at":null,"rating":null,
            "orderitems":[{"id":1,"name":"Pizza","quantity":2,"price":"10.00","order_item_addons":[{"addon_name":"Queso","addon_price":"1.50"}]}],
            "restaurant":{"id":3,"name":"Tienda","latitude":"-12.04","is_active":1,"delivery_type":3}}],"total":1,"per_page":10,"current_page":1}"""
        val page = api { respond(body, HttpStatusCode.OK, json) }.orders(1)
        val o = page.data.single()
        assertEquals(7, o.id)
        assertEquals(5, o.statusId)
        assertEquals(25.5, o.total)
        assertTrue(o.isRatable)
        assertEquals(1.5, o.orderitems.single().addons.single().addonPrice)
        assertEquals(-12.04, o.restaurant?.latitude)
        assertTrue(o.restaurant!!.supportsPickup)
        assertEquals(1, page.total)
    }

    @Test
    fun sendsBearerTokenAndPostsJson() = runTest {
        var seen: HttpRequestData? = null
        api { req -> seen = req; respond("[]", HttpStatusCode.OK, json) }.addresses()
        val r = seen!!
        assertEquals(HttpMethod.Post, r.method)
        assertEquals("https://x.com/api/get-addresses", r.url.toString())
        assertEquals("Bearer tok", r.headers[HttpHeaders.Authorization])
    }

    @Test
    fun noAuthorizationHeaderWithoutToken() = runTest {
        var seen: HttpRequestData? = null
        api(token = null) { req -> seen = req; respond("""[{"id":1,"key":"storeName","value":"Mi Tienda"}]""", HttpStatusCode.OK, json) }.settings().also {
            assertEquals("Mi Tienda", it["storeName"])
        }
        assertEquals(HttpMethod.Get, seen!!.method)
        assertNull(seen.headers[HttpHeaders.Authorization])
    }

    @Test
    fun loginFailureAndSuccess() = runTest {
        val bad = api { respond("""{"success":false,"data":"DONOTMATCH"}""", HttpStatusCode.Created, json) }.login("a@b.c", "x")
        assertEquals(AuthResult.Fail("Credenciales incorrectas"), bad)

        val ok = api { respond("""{"success":true,"data":{"id":9,"auth_token":"jwt","name":"Ana","wallet_balance":"12.5","default_address_id":3}}""", HttpStatusCode.Created, json) }.login("a@b.c", "x")
        val u = (ok as AuthResult.Ok).user
        assertEquals("jwt", u.authToken)
        assertEquals(12.5, u.walletBalance)
        assertEquals(3, u.defaultAddressId)

        val used = api { respond("""{"email_phone_already_used":true}""", HttpStatusCode.OK, json) }.register("n", "a@b.c", "1", "12345678")
        assertEquals(AuthResult.EmailOrPhoneUsed, used)
    }

    @Test
    fun unauthorizedNotifiesSession() = runTest {
        var expired = false
        val a = api(onUnauthorized = { expired = true }) { respond("""{"message":"Invalid token"}""", HttpStatusCode.Unauthorized, json) }
        val e = assertFailsWith<ApiException> { a.wallet() }
        assertEquals(401, e.status)
        assertEquals("Invalid token", e.message)
        assertTrue(expired)
    }

    @Test
    fun networkErrorBecomesApiException() = runTest {
        val a = api { throw RuntimeException("boom") }
        assertEquals(0, assertFailsWith<ApiException> { a.orders(1) }.status)
    }

    @Test
    fun placeOrderBodyMatchesServerContract() = runTest {
        var seen: JsonObject? = null
        val a = api { req ->
            seen = req.bodyJson()
            respond("""{"success":true,"data":{"id":5,"unique_order_id":"OD-11-AB-XYZ","orderstatus_id":1,"total":"30.00"},"init_point":"https://mp.test/pay"}""", HttpStatusCode.OK, json)
        }
        val line = CartLine(itemId = 4, restaurantId = 2, name = "Pizza", basePrice = 10.0, quantity = 3, addons = listOf(CartAddon(8, "Grande", 10.0, "Tamaño")))
        val res = a.placeOrder(
            PlaceOrderRequest(
                lines = listOf(line), method = "MERCADOPAGO", deliveryType = 1, addressId = 6, lat = -12.0, lng = -77.0, address = "Av. 1",
                coupon = "PROMO", tip = 2.0, cashChange = null, comment = "sin cebolla", paymentToken = null, partialWallet = true,
                scheduleDate = null, scheduleSlot = null,
            ),
        )
        val ok = assertIs<PlaceOrderResult.Ok>(res)
        assertEquals("OD-11-AB-XYZ", ok.order.uniqueOrderId)
        assertEquals("https://mp.test/pay", ok.initPoint)

        val b = seen!!
        val l = b["order"]!!.jsonArray.single().jsonObject
        assertEquals(4, l["id"]!!.jsonPrimitive.int)
        assertEquals(3, l["quantity"]!!.jsonPrimitive.int)
        assertEquals(8, l["selectedaddons"]!!.jsonArray.single().jsonObject["addon_id"]!!.jsonPrimitive.int)
        assertEquals(6, b["location"]!!.jsonObject["address_id"]!!.jsonPrimitive.int)
        assertEquals("MERCADOPAGO", b["method"]!!.jsonPrimitive.content)
        assertEquals(1, b["delivery_type"]!!.jsonPrimitive.int)
        assertEquals("PROMO", b["coupon"]!!.jsonPrimitive.content)
        assertEquals(JsonPrimitive(true), b["partial_wallet"])
        assertEquals(2.0, b["tipAmount"]!!.jsonPrimitive.content.toDouble())
        assertTrue(b["schedule_date"] == null)
    }

    @Test
    fun placeOrderFailureReturnsServerMessage() = runTest {
        val res = api { respond("""{"success":false,"message":"Saldo insuficiente en la billetera"}""", HttpStatusCode.OK, json) }.placeOrder(
            PlaceOrderRequest(listOf(), "WALLET", 1, 1, null, null, null, null, null, null, null, null, false, null, null),
        )
        assertEquals(PlaceOrderResult.Fail("Saldo insuficiente en la billetera"), res)
    }

    @Test
    fun couponResults() = runTest {
        val ok = api { respond("""{"success":true,"coupon":{"id":1,"code":"PROMO","discount":"10.00","discount_type":"PERCENTAGE","max_discount":"0.00"},"discount_amount":5}""", HttpStatusCode.OK, json) }.applyCoupon("promo", 2, 50.0)
        val c = assertIs<CouponResult.Ok>(ok)
        assertEquals(10.0, c.coupon.discount)
        assertEquals(5.0, c.discount)
        val bad = api { respond("""{"success":false,"message":"Cupón agotado"}""", HttpStatusCode.OK, json) }.applyCoupon("x", 2, 50.0)
        assertEquals(CouponResult.Fail("Cupón agotado"), bad)
    }

    @Test
    fun reviewsAndCourierLocation() = runTest {
        val r = api { respond("""{"success":true,"average":4.5,"total":2,"per_page":10,"current_page":1,"data":[{"rating":5,"comment":"Rico","reply":null,"created_at":"2026-01-01T10:00:00.000Z"}]}""", HttpStatusCode.OK, json) }.reviewsBySlug("mi-tienda", 1)
        assertEquals(4.5, r.average)
        assertEquals("Rico", r.data.single().comment)

        val none = api { respond("null", HttpStatusCode.OK, json) }.courierLocation(5)
        assertNull(none)
        val gps = api { respond("""{"delivery_lat":"-12.1","delivery_long":-77.2,"updated_at":1700000000000,"live":true}""", HttpStatusCode.OK, json) }.courierLocation(5)
        assertEquals(-12.1, gps!!.lat)
        assertEquals(-77.2, gps.lng)
        assertTrue(gps.live)
    }

    @Test
    fun arrayBodyIsParsedAsJsonArray() = runTest {
        val a = api { respond("""[{"id":1,"name":"Centro","latitude":"-12.0","longitude":"-77.0"}]""", HttpStatusCode.OK, json) }
        assertEquals("Centro", a.searchLocation("cen").single().name)
        assertTrue(JsonArray(emptyList()).isEmpty())
    }
}
