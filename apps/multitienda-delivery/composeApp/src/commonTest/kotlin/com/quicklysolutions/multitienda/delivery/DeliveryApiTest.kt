package com.quicklysolutions.multitienda.delivery

import com.quicklysolutions.multitienda.delivery.api.ApiResult
import com.quicklysolutions.multitienda.delivery.api.DeliveryApi
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.content.TextContent
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class DeliveryApiTest {
    private val jsonHeaders = headersOf(HttpHeaders.ContentType, "application/json")

    private fun api(status: HttpStatusCode, body: String, captured: MutableList<HttpRequestData> = mutableListOf(), token: String? = "tok") =
        DeliveryApi(
            HttpClient(MockEngine { req -> captured += req; respond(body, status, jsonHeaders) }),
            "https://example.test/api",
        ) { token }

    @Test
    fun `accept envia POST con Bearer y order_id`() = runTest {
        val reqs = mutableListOf<HttpRequestData>()
        val r = api(HttpStatusCode.OK, """{"success":true}""", reqs).accept(7)
        assertIs<ApiResult.Ok<Unit>>(r)
        val req = reqs.single()
        assertEquals(HttpMethod.Post, req.method)
        assertEquals("https://example.test/api/delivery/accept-to-deliver", req.url.toString())
        assertEquals("Bearer tok", req.headers[HttpHeaders.Authorization])
        assertEquals("""{"order_id":7}""", (req.body as TextContent).text)
    }

    @Test
    fun `accept con 409 devuelve conflicto con el mensaje del servidor`() = runTest {
        val r = api(HttpStatusCode.Conflict, """{"success":false,"message":"El pedido ya fue tomado o no está disponible"}""").accept(7)
        val f = assertIs<ApiResult.Fail>(r)
        assertEquals(ApiResult.Kind.CONFLICT, f.kind)
        assertTrue(f.message.contains("ya fue tomado"))
    }

    @Test
    fun `deliver adjunta el PIN solo si existe`() = runTest {
        val reqs = mutableListOf<HttpRequestData>()
        val a = api(HttpStatusCode.OK, """{"success":true}""", reqs)
        a.deliver(5, " 1234 ")
        a.deliver(5, null)
        assertEquals("""{"order_id":5,"delivery_pin":"1234"}""", (reqs[0].body as TextContent).text)
        assertEquals("""{"order_id":5}""", (reqs[1].body as TextContent).text)
    }

    @Test
    fun `login con 401 es credenciales incorrectas y no envia Authorization`() = runTest {
        val reqs = mutableListOf<HttpRequestData>()
        val r = api(HttpStatusCode.Unauthorized, """{"success":false,"data":"DONOTMATCH"}""", reqs).login("999", "x")
        assertEquals("Credenciales incorrectas", assertIs<ApiResult.Fail>(r).message)
        assertEquals(null, reqs.single().headers[HttpHeaders.Authorization])
    }

    @Test
    fun `login correcto devuelve la sesion`() = runTest {
        val r = api(HttpStatusCode.OK, """{"success":true,"data":{"id":12,"auth_token":"jwt","name":"Ana","phone":"999"}}""").login("999", "x")
        val s = assertIs<ApiResult.Ok<com.quicklysolutions.multitienda.delivery.model.Session>>(r).value
        assertEquals(12, s.userId)
        assertEquals("jwt", s.token)
    }

    @Test
    fun `cuenta pendiente de aprobacion llega como success false con HTTP 200`() = runTest {
        val r = api(HttpStatusCode.OK, """{"success":false,"message":"Tu cuenta aún no ha sido aprobada por el administrador."}""").login("999", "x")
        assertTrue(assertIs<ApiResult.Fail>(r).message.contains("aprobada"))
    }

    @Test
    fun `lista de pedidos disponibles incluye coordenadas solo si hay GPS`() = runTest {
        val reqs = mutableListOf<HttpRequestData>()
        val a = api(HttpStatusCode.OK, "[]", reqs)
        a.availableOrders(-12.0, -77.0)
        a.availableOrders(null, null)
        assertEquals("""{"latitude":-12.0,"longitude":-77.0}""", (reqs[0].body as TextContent).text)
        assertEquals("{}", (reqs[1].body as TextContent).text)
    }

    @Test
    fun `sin conexion devuelve error de red`() = runTest {
        val a = DeliveryApi(HttpClient(MockEngine { throw RuntimeException("sin red") }), "https://example.test/api") { "t" }
        assertEquals(ApiResult.Kind.NETWORK, assertIs<ApiResult.Fail>(a.activeOrders()).kind)
    }
}
