package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.ApiJson
import com.quicklysolutions.multitienda.cliente.data.ChatMessage
import com.quicklysolutions.multitienda.cliente.data.DeliveryDetails
import com.quicklysolutions.multitienda.cliente.data.GpsPoint
import com.quicklysolutions.multitienda.cliente.data.Order
import com.quicklysolutions.multitienda.cliente.data.OrderLocation
import com.quicklysolutions.multitienda.cliente.domain.OrderStatus
import com.quicklysolutions.multitienda.cliente.domain.agoText
import com.quicklysolutions.multitienda.cliente.domain.distanceKm
import com.quicklysolutions.multitienda.cliente.domain.fixed2
import com.quicklysolutions.multitienda.cliente.domain.formatTime
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.BillRow
import com.quicklysolutions.multitienda.cliente.ui.EmptyBox
import com.quicklysolutions.multitienda.cliente.ui.ErrorText
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.LoadingBox
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.LoginPrompt
import com.quicklysolutions.multitienda.cliente.ui.SectionTitle
import com.quicklysolutions.multitienda.cliente.ui.StatusChip
import com.quicklysolutions.multitienda.cliente.ui.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock

private const val POLL_MS = 20_000L

/** Conserva complementos/valoracion que /update-user-info no incluye al refrescar un pedido ya cargado. */
private fun mergeOrder(prev: Order?, fresh: Order): Order {
    if (prev == null) return fresh
    val items = if (fresh.orderitems.isEmpty()) prev.orderitems else fresh.orderitems.map { fi ->
        prev.orderitems.firstOrNull { it.id == fi.id }?.let { fi.copy(addons = it.addons) } ?: fi
    }
    return fresh.copy(orderitems = items, isRatable = fresh.isRatable || prev.isRatable, rating = fresh.rating ?: prev.rating)
}

private fun unquote(s: String?): String = s.orEmpty().trim().trim('"')

@Composable
fun OrderDetailScreen(uniqueId: String, initial: Order?) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    var order by remember(uniqueId) { mutableStateOf(initial) }
    var courier by remember(uniqueId) { mutableStateOf<DeliveryDetails?>(null) }
    var gps by remember(uniqueId) { mutableStateOf<GpsPoint?>(null) }
    var messages by remember(uniqueId) { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var loaded by remember(uniqueId) { mutableStateOf(initial != null) }
    var error by remember(uniqueId) { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    var confirmCancel by remember { mutableStateOf(false) }
    var chatText by remember { mutableStateOf("") }
    var acting by remember { mutableStateOf(false) }

    // Sondeo cada 20 s mientras el pedido siga en curso (igual que la web); se cancela al salir de la pantalla.
    LaunchedEffect(uniqueId, tick, app.isLoggedIn) {
        if (!app.isLoggedIn) return@LaunchedEffect
        while (true) {
            try {
                val r = app.api.userInfo(uniqueId)
                r.runningOrder?.let { order = mergeOrder(order, it) }
                courier = r.deliveryDetails
                error = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = e.userMessage()
            }
            loaded = true
            val o = order ?: break
            if (o.orderitems.isEmpty()) runCatching { app.api.orderItems(o.id) }.getOrNull()?.let { order = o.copy(orderitems = it) }
            if (OrderStatus.isTrackable(o.statusId)) {
                gps = runCatching { app.api.courierLocation(o.id) }.getOrNull()
                runCatching { app.api.chat(o.id) }.getOrNull()?.let { messages = it }
            }
            if (!OrderStatus.isRunning(o.statusId)) break
            delay(POLL_MS)
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppBar("Pedido #$uniqueId", onBack = { app.nav.pop() })
        val o = order
        when {
            !app.isLoggedIn -> LoginPrompt("Inicia sesión para ver tu pedido")
            o == null && !loaded -> LoadingBox()
            o == null -> EmptyBox(error ?: "Pedido no encontrado")
            else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    StatusChip(o.statusId)
                    if (o.etaAt != null && OrderStatus.isRunning(o.statusId) && !o.isScheduled) Text("Llegada estimada: ${formatTime(o.etaAt)}", Modifier.padding(top = 6.dp), fontSize = 13.sp, color = Color.Gray)
                    if (o.isScheduled) Text("Programado: ${unquote(o.scheduleDate)} ${unquote(o.scheduleSlot)}", Modifier.padding(top = 6.dp), fontSize = 13.sp, color = Color.Gray)
                    if (app.showDeliveryPin && OrderStatus.isTrackable(o.statusId) && !o.deliveryPin.isNullOrBlank()) {
                        Text("PIN de entrega: ${o.deliveryPin}", Modifier.padding(top = 8.dp), fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text("Díselo al repartidor al recibir tu pedido", fontSize = 11.sp, color = Color.Gray)
                    }
                }
                ErrorText(error)

                if (OrderStatus.isTrackable(o.statusId)) TrackingCard(o, courier, gps)

                SectionTitle("Detalle")
                Column(Modifier.padding(horizontal = 16.dp)) {
                    o.orderitems.forEach { it ->
                        BillRow("${it.quantity}x ${it.name}", app.price(it.price * it.quantity))
                        it.addons.forEach { a -> Text("  + ${a.addonName} (${app.price(a.addonPrice)})", fontSize = 11.sp, color = Color.Gray) }
                    }
                    Spacer(Modifier.height(6.dp))
                    BillRow(app.t("cartItemTotalText", "Subtotal"), app.price(if (o.subTotal > 0) o.subTotal else o.total))
                    BillRow(app.t("cartDeliveryCharges", "Envío"), app.price(o.deliveryCharge))
                    if (o.restaurantCharge > 0) BillRow("Cargo de servicio", app.price(o.restaurantCharge))
                    if (o.taxAmount > 0) BillRow("Impuesto", app.price(o.taxAmount))
                    if (o.couponAmount > 0) BillRow("Cupón ${o.couponName.orEmpty()}", "-" + app.price(o.couponAmount), color = Color(0xFF2E7D32))
                    if (o.tipAmount > 0) BillRow("Propina", app.price(o.tipAmount))
                    BillRow(app.t("cartToPayText", "Total"), app.price(o.total), bold = true)
                    if (o.walletAmount > 0) {
                        BillRow(app.t("orderAmountPaidWithWallet", "Pagado con billetera"), app.price(o.walletAmount))
                        BillRow(app.t("orderAmountRemainingToPay", "Restante"), app.price(o.payable))
                    }
                }

                InfoCard("Comercio", o.restaurant?.name ?: "-")
                InfoCard(app.t("orderDetailsPaymentMode", "Pago"), o.paymentMode ?: "COD")
                if (o.deliveryType == 2) InfoCard("Entrega", "Recoger en tienda") else if (!o.address.isNullOrBlank() && o.address != "NA") InfoCard("Dirección", o.address)
                if (!o.orderComment.isNullOrBlank()) InfoCard("Comentario", o.orderComment)

                if (OrderStatus.canCancel(o.statusId)) {
                    OutlinedButton(
                        onClick = { confirmCancel = true }, enabled = !acting,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                    ) { Text("Cancelar orden") }
                }
                if (OrderStatus.canRate(o)) {
                    Button(
                        onClick = {
                            scope.launch {
                                acting = true
                                val ratable = runCatching { app.api.ratableOrder(o.id) }.getOrNull()
                                if (ratable != null) app.nav.push(Screen.Rate(o.id)) else app.message = "Este pedido ya fue calificado"
                                acting = false
                            }
                        },
                        enabled = !acting, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    ) { Text(app.t("orderRateOrderButton", "Calificar pedido")) }
                }

                if (OrderStatus.isTrackable(o.statusId)) ChatSection(o, messages, chatText, { chatText = it }, acting) {
                    scope.launch {
                        acting = true
                        val r = runCatching { app.api.sendChat(o.id, chatText.trim()) }.getOrNull()
                        if (r?.success == true) { chatText = ""; runCatching { app.api.chat(o.id) }.getOrNull()?.let { messages = it } }
                        else app.message = r?.message ?: "No se pudo enviar el mensaje"
                        acting = false
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (confirmCancel) {
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            title = { Text(app.t("orderCancellationConfirmationText", "¿Cancelar esta orden?")) },
            confirmButton = {
                TextButton(onClick = {
                    confirmCancel = false
                    val id = order?.id ?: return@TextButton
                    scope.launch {
                        acting = true
                        val r = runCatching { app.api.cancelOrder(id) }.getOrNull()
                        if (r?.success == true) {
                            app.message = if (r.refund) "Orden cancelada. El pago fue reembolsado." else app.t("orderCancelledText", "Orden cancelada")
                            tick++
                        } else app.message = r?.message ?: "No se pudo cancelar la orden"
                        acting = false
                    }
                }) { Text("Sí, cancelar") }
            },
            dismissButton = { TextButton(onClick = { confirmCancel = false }) { Text("No") } },
        )
    }
}

@Composable
private fun InfoCard(label: String, value: String) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFFF5F5F5)).padding(12.dp)) {
        Text(label, fontSize = 12.sp, color = Color.Gray)
        Text(value, fontSize = 14.sp)
    }
}

@Composable
private fun TrackingCard(o: Order, courier: DeliveryDetails?, gps: GpsPoint?) {
    val uriHandler = LocalUriHandler.current
    SectionTitle("Seguimiento del repartidor")
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFFF5F5F5)).padding(12.dp)) {
        if (courier != null) {
            Text(courier.name?.takeIf { it.isNotBlank() } ?: "Repartidor", fontWeight = FontWeight.Medium)
            courier.phone?.takeIf { it.isNotBlank() }?.let { phone -> TextButton(onClick = { uriHandler.openUri("tel:$phone") }) { Text("Llamar: $phone") } }
            courier.rating?.takeIf { it.isNotBlank() && it != "0.0" }?.let { Text("Calificación: $it", fontSize = 12.sp, color = Color.Gray) }
        }
        val lat = gps?.lat
        val lng = gps?.lng
        if (lat != null && lng != null) {
            val dest = o.location?.let { runCatching { ApiJson.decodeFromString<OrderLocation>(it) }.getOrNull() }
            if (dest?.lat != null && dest.lng != null) Text("A ${fixed2(distanceKm(lat, lng, dest.lat, dest.lng))} km de tu dirección", fontSize = 13.sp)
            agoText(gps.updatedAt, Clock.System.now().toEpochMilliseconds())?.let { Text("Ubicación actualizada $it", fontSize = 11.sp, color = Color.Gray) }
            TextButton(onClick = { uriHandler.openUri("geo:$lat,$lng?q=$lat,$lng(Repartidor)") }) { Text("Ver en el mapa") }
        } else {
            Text("Aún no hay ubicación del repartidor", fontSize = 12.sp, color = Color.Gray)
        }
    }
}

@Composable
private fun ChatSection(o: Order, messages: List<ChatMessage>, text: String, onText: (String) -> Unit, busy: Boolean, onSend: () -> Unit) {
    val app = LocalApp.current
    SectionTitle("Chat con el repartidor")
    Column(Modifier.padding(horizontal = 16.dp)) {
        Column(Modifier.fillMaxWidth().heightIn(max = 240.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFFF5F5F5)).verticalScroll(rememberScrollState()).padding(10.dp)) {
            if (messages.isEmpty()) Text("Sin mensajes aún", fontSize = 12.sp, color = Color.Gray)
            messages.forEach { m ->
                val mine = m.senderId == app.user?.id
                Box(Modifier.fillMaxWidth().padding(vertical = 3.dp), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
                    Column(
                        Modifier.clip(RoundedCornerShape(12.dp)).background(if (mine) MaterialTheme.colorScheme.primary else Color.White).padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Text(m.message, fontSize = 13.sp, color = if (mine) Color.White else Color.Black)
                        Text(formatTime(m.createdAt), fontSize = 10.sp, color = if (mine) Color.White.copy(alpha = 0.7f) else Color.Gray)
                    }
                }
            }
        }
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Field(text, onText, "Escribe un mensaje...", Modifier.weight(1f))
            IconButton(onClick = onSend, enabled = text.isNotBlank() && !busy) { Icon(Icons.Default.Send, "Enviar", tint = MaterialTheme.colorScheme.primary) }
        }
    }
}
