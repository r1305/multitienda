package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.AddressDto
import com.quicklysolutions.multitienda.cliente.data.PaymentGateway
import com.quicklysolutions.multitienda.cliente.data.PlaceOrderRequest
import com.quicklysolutions.multitienda.cliente.data.PlaceOrderResult
import com.quicklysolutions.multitienda.cliente.data.RestaurantInfo
import com.quicklysolutions.multitienda.cliente.domain.CouponEval
import com.quicklysolutions.multitienda.cliente.domain.DEFAULT_CASH_METHOD
import com.quicklysolutions.multitienda.cliente.domain.PENDING_PAYMENT_METHODS
import com.quicklysolutions.multitienda.cliente.domain.Pricing
import com.quicklysolutions.multitienda.cliente.domain.WALLET_METHOD
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.BillRow
import com.quicklysolutions.multitienda.cliente.ui.EmptyBox
import com.quicklysolutions.multitienda.cliente.ui.ErrorText
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.LoadView
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.LoginPrompt
import com.quicklysolutions.multitienda.cliente.ui.SectionTitle
import com.quicklysolutions.multitienda.cliente.ui.rememberLoad
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private data class CheckoutData(val info: RestaurantInfo, val gateways: List<PaymentGateway>, val addresses: List<AddressDto>)

private val DATE_RE = Regex("""^\d{4}-\d{2}-\d{2}$""")
private val TIME_RE = Regex("""^\d{1,2}:\d{2}$""")

@Composable
fun CheckoutScreen() {
    val app = LocalApp.current
    val cart = app.cart
    Column(Modifier.fillMaxSize()) {
        AppBar("Pago", onBack = { app.nav.pop() })
        if (!app.isLoggedIn) { LoginPrompt("Inicia sesión para pagar"); return@Column }
        if (cart.lines.isEmpty()) { EmptyBox(app.t("cartEmptyText", "Tu carrito está vacío")); return@Column }
        val slug = cart.lines.first().storeSlug
        val load = rememberLoad(slug) {
            coroutineScope {
                val info = async { app.api.storeInfo(slug, false) }
                val gateways = async { app.api.paymentGateways(cart.restaurantId) }
                val addresses = async { app.api.addresses() }
                val fresh = async { runCatching { app.refreshUser() } }
                fresh.await()
                CheckoutData(info.await(), gateways.await(), addresses.await())
            }
        }
        LoadView(load) { CheckoutContent(it) }
    }
}

@Composable
private fun CheckoutContent(data: CheckoutData) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    val cart = app.cart
    val info = data.info
    val balance = app.user?.walletBalance ?: 0.0

    var deliveryType by remember { mutableStateOf(if (info.supportsDelivery) 1 else 2) }
    var addressId by remember { mutableStateOf(data.addresses.firstOrNull { it.id == app.user?.defaultAddressId }?.id ?: data.addresses.firstOrNull()?.id) }
    var method by remember { mutableStateOf(data.gateways.firstOrNull()?.name?.uppercase() ?: DEFAULT_CASH_METHOD) }
    var partialWallet by remember { mutableStateOf(false) }
    var tipText by remember { mutableStateOf("") }
    var cashText by remember { mutableStateOf("") }
    var comment by remember { mutableStateOf("") }
    var paymentToken by remember { mutableStateOf("") }
    var scheduled by remember { mutableStateOf(false) }
    var scheduleDate by remember { mutableStateOf("") }
    var scheduleTime by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val address = data.addresses.firstOrNull { it.id == addressId }
    val operates by produceState<Boolean?>(null, deliveryType, address?.id) {
        val a = address
        value = if (deliveryType == 1 && a?.latitude != null && a.longitude != null) {
            runCatching { app.api.operatesAt(info.id, a.latitude, a.longitude) }.getOrNull()
        } else null
    }

    val subtotal = cart.subtotal
    val discount = cart.coupon?.let { (Pricing.evaluateCoupon(it, subtotal, cart.restaurantId) as? CouponEval.Ok)?.amount } ?: 0.0
    val delivery = Pricing.deliveryCharge(info, address?.latitude, address?.longitude, subtotal, deliveryType)
    val tip = Pricing.parseTip(tipText)
    val total = Pricing.total(subtotal, discount, delivery, info.restaurantCharges, tip ?: 0.0)
    val split = Pricing.splitWallet(method, total, balance, partialWallet)
    val isCash = method == DEFAULT_CASH_METHOD
    val isManual = method != DEFAULT_CASH_METHOD && method != WALLET_METHOD && method !in PENDING_PAYMENT_METHODS

    fun submit() {
        error = null
        if (deliveryType == 1 && address == null) { error = "Selecciona una de tus direcciones guardadas para la entrega"; return }
        if (deliveryType == 1 && operates == false) { error = "Este comercio no entrega en la dirección elegida"; return }
        if (tip == null) { error = "Propina inválida"; return }
        if (split == null) { error = "Saldo insuficiente en la billetera"; return }
        if (scheduled && (!DATE_RE.matches(scheduleDate.trim()) || !TIME_RE.matches(scheduleTime.trim()))) { error = "Fecha (AAAA-MM-DD) y hora (HH:MM) de programación inválidas"; return }
        val cash = if (isCash) cashText.trim().replace(',', '.').toDoubleOrNull() else null
        if (cash != null && cash < split.payable) { error = "El monto con el que pagas debe cubrir ${app.price(split.payable)}"; return }
        val where = if (deliveryType == 1) address else null
        val here = app.location
        submitting = true
        scope.launch {
            try {
                val res = app.api.placeOrder(
                    PlaceOrderRequest(
                        lines = cart.lines, method = method, deliveryType = deliveryType,
                        addressId = where?.id, lat = where?.latitude ?: here?.lat, lng = where?.longitude ?: here?.lng,
                        address = where?.address ?: here?.address, coupon = cart.couponCode, tip = tip, cashChange = cash,
                        comment = comment, paymentToken = paymentToken.trim().takeIf { isManual && it.isNotEmpty() },
                        partialWallet = partialWallet && method != WALLET_METHOD,
                        scheduleDate = scheduleDate.trim().takeIf { scheduled }, scheduleSlot = scheduleTime.trim().takeIf { scheduled },
                    ),
                )
                when (res) {
                    is PlaceOrderResult.Ok -> {
                        app.clearCart()
                        res.initPoint?.let { uriHandler.openUri(it) }
                        app.nav.selectTab(Screen.Home)
                        app.nav.push(Screen.OrderDetail(res.order.uniqueOrderId, null))
                    }
                    is PlaceOrderResult.Fail -> error = res.message
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                error = "Error de conexión"
            }
            submitting = false
        }
    }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            if (info.supportsDelivery && info.supportsPickup) {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(deliveryType == 1, { deliveryType = 1 }, { Text("Delivery") })
                    FilterChip(deliveryType == 2, { deliveryType = 2 }, { Text("Recoger en tienda") })
                }
            }
            if (deliveryType == 1) {
                SectionTitle(app.t("cartDeliverTo", "Entregar en"))
                if (data.addresses.isEmpty()) Text("No tienes direcciones guardadas", Modifier.padding(horizontal = 16.dp), color = Color.Gray)
                data.addresses.forEach { a ->
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
                            .border(1.dp, if (a.id == addressId) MaterialTheme.colorScheme.primary else Color(0xFFDDDDDD), RoundedCornerShape(8.dp))
                            .clickable { addressId = a.id }.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(a.id == addressId, null)
                        Column(Modifier.padding(start = 10.dp)) {
                            Text(a.title, fontWeight = FontWeight.Medium)
                            Text(a.address.orEmpty(), fontSize = 12.sp, color = Color.Gray)
                        }
                    }
                }
                TextButton(onClick = { app.nav.push(Screen.Addresses) }, Modifier.padding(horizontal = 8.dp)) { Text("+ Agregar dirección") }
                if (operates == false) ErrorText("Este comercio no entrega en esa dirección.")
            } else {
                Text("Recogerás tu pedido en ${info.name}.", Modifier.padding(16.dp))
            }

            if (info.isSchedulable) {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Switch(scheduled, { scheduled = it })
                    Text("  Programar pedido")
                }
                if (scheduled) Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field(scheduleDate, { scheduleDate = it }, "Fecha AAAA-MM-DD", Modifier.weight(1f))
                    Field(scheduleTime, { scheduleTime = it }, "Hora HH:MM", Modifier.weight(1f))
                }
            }

            SectionTitle(app.t("checkoutPaymentListTitle", "Método de pago"))
            val gateways = data.gateways.ifEmpty { listOf(PaymentGateway(name = DEFAULT_CASH_METHOD, title = app.t("checkoutCodText", "Efectivo"))) }
            gateways.forEach { gw ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable { method = gw.name.uppercase() },
                    verticalAlignment = Alignment.Top,
                ) {
                    RadioButton(method == gw.name.uppercase(), null)
                    Column(Modifier.padding(start = 10.dp)) {
                        Text(gw.title?.takeIf { it.isNotBlank() } ?: gw.name, fontWeight = FontWeight.Medium)
                        if (method == gw.name.uppercase()) SelectionContainer {
                            Column {
                                gw.accountNumber?.takeIf { it.isNotBlank() }?.let { Text("Cuenta: $it", fontSize = 12.sp, color = Color.Gray) }
                                gw.phoneNumber?.takeIf { it.isNotBlank() }?.let { Text("Cel: $it", fontSize = 12.sp, color = Color.Gray) }
                            }
                        }
                    }
                }
            }
            if (balance > 0) {
                val enough = balance >= total
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clickable(enabled = enough) { method = WALLET_METHOD },
                    verticalAlignment = Alignment.Top,
                ) {
                    RadioButton(method == WALLET_METHOD, null, enabled = enough)
                    Column(Modifier.padding(start = 10.dp)) {
                        Text("${app.walletName} (saldo ${app.price(balance)})", fontWeight = FontWeight.Medium)
                        if (!enough) Text("Saldo insuficiente para pagar todo", fontSize = 12.sp, color = Color.Gray)
                    }
                }
                if (method != WALLET_METHOD) Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Switch(partialWallet, { partialWallet = it })
                    Text("  Usar saldo de ${app.walletName} como pago parcial", fontSize = 13.sp)
                }
            }
            Column(Modifier.padding(horizontal = 16.dp)) {
                if (isManual) Field(paymentToken, { paymentToken = it }, "Código de operación (opcional)", Modifier.padding(top = 8.dp))
                if (isCash) Field(cashText, { cashText = it }, "¿Con cuánto pagas? (opcional)", Modifier.padding(top = 8.dp), KeyboardType.Decimal)
                Field(tipText, { tipText = it }, "Propina (opcional)", Modifier.padding(top = 8.dp), KeyboardType.Decimal)
                if (tip == null) ErrorText("Propina inválida")
                Field(comment, { comment = it }, app.t("cartSuggestionPlaceholder", "Comentario para tu orden"), Modifier.padding(top = 8.dp), singleLine = false)
            }

            SectionTitle("Resumen")
            Column(Modifier.padding(horizontal = 16.dp)) {
                BillRow(app.t("cartItemTotalText", "Subtotal"), app.price(subtotal))
                if (discount > 0) BillRow("Descuento", "-" + app.price(discount), color = Color(0xFF2E7D32))
                if (deliveryType == 1) BillRow(app.t("cartDeliveryCharges", "Envío") + " (estimado)", app.price(delivery))
                if (info.restaurantCharges > 0) BillRow(app.t("cartRestaurantCharges", "Cargo de servicio"), app.price(info.restaurantCharges))
                if ((tip ?: 0.0) > 0) BillRow("Propina", app.price(tip ?: 0.0))
                BillRow(app.t("cartToPayText", "Total"), app.price(total), bold = true)
                if (split != null && split.walletAmount > 0) {
                    BillRow("Pagado con ${app.walletName}", app.price(split.walletAmount))
                    BillRow("Por pagar", app.price(split.payable), bold = true)
                }
                Text("El servidor confirma el total final al crear el pedido.", fontSize = 11.sp, color = Color.Gray)
            }
            ErrorText(error)
            Spacer(Modifier.height(8.dp))
        }
        Button(
            onClick = ::submit, enabled = !submitting,
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        ) {
            if (submitting) { CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), strokeWidth = 2.dp, color = Color.White); Text("  Procesando...") }
            else Text("Realizar pedido · ${app.price(total)}")
        }
    }
}
