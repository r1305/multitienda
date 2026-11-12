package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.CouponResult
import com.quicklysolutions.multitienda.cliente.domain.CartRules
import com.quicklysolutions.multitienda.cliente.domain.CouponEval
import com.quicklysolutions.multitienda.cliente.domain.LineStatus
import com.quicklysolutions.multitienda.cliente.domain.Pricing
import com.quicklysolutions.multitienda.cliente.domain.matchAvailability
import com.quicklysolutions.multitienda.cliente.domain.repriceLines
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.BillRow
import com.quicklysolutions.multitienda.cliente.ui.EmptyBox
import com.quicklysolutions.multitienda.cliente.ui.ErrorText
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.QtyControl
import com.quicklysolutions.multitienda.cliente.ui.RemoteImage
import com.quicklysolutions.multitienda.cliente.ui.SectionTitle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun CartScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val cart = app.cart
    val lines = cart.lines

    Column(Modifier.fillMaxSize()) {
        AppBar(app.t("cartPageTitle", "Carrito"))
        if (lines.isEmpty()) {
            EmptyBox(app.t("cartEmptyText", "Tu carrito está vacío")) { Button(onClick = { app.nav.selectTab(Screen.Home) }) { Text("Ver comercios") } }
            return@Column
        }

        val status by produceState<Map<String, LineStatus>>(emptyMap(), lines) {
            delay(300)
            val rows = runCatching { app.api.checkCartAvailability(lines, cart.restaurantId) }.getOrNull() ?: return@produceState
            val matched = matchAvailability(lines, rows)
            value = matched
            val repriced = repriceLines(lines, matched)
            if (repriced != lines) app.updateCart(app.cart.copy(lines = repriced))
        }
        val blocked = lines.any { status[it.key]?.available == false }

        val subtotal = cart.subtotal
        var code by remember { mutableStateOf("") }
        var couponMsg by remember { mutableStateOf<String?>(null) }
        var busy by remember { mutableStateOf(false) }
        val couponEval = cart.coupon?.let { Pricing.evaluateCoupon(it, subtotal, cart.restaurantId) }
        val discount = (couponEval as? CouponEval.Ok)?.amount ?: 0.0
        LaunchedEffect(couponEval) {
            if (couponEval is CouponEval.Fail) {
                couponMsg = couponEval.message
                app.updateCart(app.cart.copy(coupon = null, couponCode = null))
            }
        }

        LazyColumn(Modifier.weight(1f)) {
            item {
                val name = lines.first().storeName
                if (name.isNotBlank()) Text(name, Modifier.padding(16.dp, 12.dp, 16.dp, 0.dp), fontWeight = FontWeight.Bold)
            }
            items(lines, key = { it.key }) { line ->
                val st = status[line.key]
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    RemoteImage(app.image(line.image), Modifier.size(56.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(line.name, fontWeight = FontWeight.Medium)
                        if (line.addons.isNotEmpty()) Text(line.addons.joinToString(", ") { it.name }, fontSize = 11.sp, color = Color.Gray)
                        Text(app.price(line.unitPrice), fontSize = 13.sp)
                        if (st?.available == false) Text(app.t("cartItemNotAvailable", "No disponible"), fontSize = 12.sp, color = Color(0xFFC62828), fontWeight = FontWeight.Bold)
                    }
                    QtyControl(
                        line.quantity, trashAtOne = true,
                        onMinus = { app.updateCart(cart.copy(lines = CartRules.decrement(lines, line.key))) },
                        onPlus = { app.addToCart(line) },
                    )
                }
                if (st?.available == false) TextButton(onClick = { app.updateCart(cart.copy(lines = CartRules.remove(lines, line.key))) }, Modifier.padding(start = 8.dp)) { Text("Quitar del carrito") }
            }
            item {
                SectionTitle(app.t("cartCouponText", "Cupón"))
                if (cart.coupon != null) {
                    Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${cart.couponCode} aplicado", Modifier.weight(1f), color = Color(0xFF2E7D32))
                        TextButton(onClick = { app.updateCart(cart.copy(coupon = null, couponCode = null)); couponMsg = null }) { Text("Quitar") }
                    }
                } else {
                    Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Field(code, { code = it.uppercase() }, "Código de cupón", Modifier.weight(1f))
                        Spacer(Modifier.width(8.dp))
                        OutlinedButton(
                            enabled = code.isNotBlank() && !busy,
                            onClick = {
                                if (!app.isLoggedIn) { app.message = "Inicia sesión para usar cupones"; app.nav.push(Screen.Login); return@OutlinedButton }
                                scope.launch {
                                    busy = true; couponMsg = null
                                    val rid = cart.restaurantId
                                    try {
                                        when (val r = app.api.applyCoupon(code.trim(), rid, subtotal)) {
                                            is CouponResult.Ok -> { app.updateCart(app.cart.copy(coupon = r.coupon, couponCode = r.coupon.code)); code = ""; app.message = "Cupón aplicado" }
                                            is CouponResult.Fail -> couponMsg = r.message
                                        }
                                    } catch (e: kotlinx.coroutines.CancellationException) {
                                        throw e
                                    } catch (e: Exception) {
                                        couponMsg = "Error aplicando cupón"
                                    }
                                    busy = false
                                }
                            },
                        ) { Text("Aplicar") }
                    }
                }
                ErrorText(couponMsg)
            }
            item {
                Column(Modifier.padding(16.dp)) {
                    BillRow(app.t("cartItemTotalText", "Subtotal"), app.price(subtotal))
                    if (discount > 0) BillRow("Descuento", "-" + app.price(discount), color = Color(0xFF2E7D32))
                    BillRow(app.t("cartToPayText", "Total"), app.price(Pricing.total(subtotal, discount, 0.0, 0.0, 0.0)), bold = true)
                    Text("El envío y otros cargos se calculan en el pago.", fontSize = 12.sp, color = Color.Gray)
                }
            }
        }
        Column(Modifier.padding(16.dp)) {
            if (blocked) Text("Quita los productos no disponibles para continuar.", color = Color(0xFFC62828), fontSize = 13.sp)
            Spacer(Modifier.height(4.dp))
            Button(
                enabled = !blocked,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    if (app.isLoggedIn) app.nav.push(Screen.Checkout)
                    else { app.message = app.t("cartLoginSubHeader", "Inicia sesión para continuar"); app.nav.push(Screen.Login) }
                },
            ) { Text("Proceder al pago") }
        }
    }
}
