package com.quicklysolutions.multitienda.delivery.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.delivery.config.AppConfig
import com.quicklysolutions.multitienda.delivery.domain.OrderAction
import com.quicklysolutions.multitienda.delivery.domain.OrderFlow
import com.quicklysolutions.multitienda.delivery.model.GeoPoint
import com.quicklysolutions.multitienda.delivery.model.Order
import com.quicklysolutions.multitienda.delivery.platform.MapApp
import com.quicklysolutions.multitienda.delivery.state.AppViewModel
import com.quicklysolutions.multitienda.delivery.util.formatDate
import com.quicklysolutions.multitienda.delivery.util.money
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailScreen(vm: AppViewModel) {
    val d by vm.detail.collectAsState()
    val settings by vm.settings.collectAsState()
    val session by vm.session.collectAsState()
    val order = d.order
    val chatOpen = order != null && OrderFlow.hasChat(order.statusId)

    // Refresco del chat mientras el pedido está asignado/en camino; se cancela al salir.
    LaunchedEffect(chatOpen) {
        while (chatOpen) {
            delay(AppConfig.CHAT_POLL_MS)
            vm.loadChat()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pedido #${order?.uniqueOrderId ?: ""}") },
                navigationIcon = { IconButton({ vm.closeDetail() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") } },
            )
        },
    ) { pad ->
        when {
            d.loading -> Loading(Modifier.padding(pad).fillMaxSize())
            order == null -> Column(Modifier.padding(pad).padding(16.dp)) { ErrorBanner(d.error ?: "El pedido ya no está disponible") }
            else -> Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { StatusChip(order.statusId) }
                d.error?.let { ErrorBanner(it) }
                d.notice?.let { InfoBanner(it) }

                PlaceCard("Comercio", order.restaurant?.name ?: "-", order.restaurant?.address, order.restaurant?.point, vm)
                PlaceCard("Cliente", order.address?.takeIf { it.isNotBlank() } ?: "Sin dirección", null, order.customerPoint, vm)
                Bill(order, settings.currency)

                val cash = OrderFlow.cashToCollect(order)
                if (cash > 0) {
                    Banner("A cobrar en efectivo: ${money(settings.currency, cash)}. Se entrega a la plataforma en el cierre de caja.", Color(0xFFFFF8E1), Color(0xFFE65100))
                }
                order.comment?.takeIf { it.isNotBlank() }?.let { Banner(it, Color(0xFFFFF3E0), Color(0xFF5D4037)) }

                ActionArea(order, d.acting, vm)

                if (chatOpen) {
                    Chat(vm, d.messages, session?.userId ?: -1)
                }
            }
        }
    }

    if (d.pinDialog) PinDialog(d.pinError, d.acting, onConfirm = { vm.act(OrderAction.DELIVER, it) }, onDismiss = { vm.dismissPinDialog() })
}

@Composable
private fun PlaceCard(title: String, name: String, address: String?, point: GeoPoint?, vm: AppViewModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontSize = 12.sp, color = Color.Gray)
            Text(name, fontWeight = FontWeight.SemiBold)
            address?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 12.sp, color = Color.Gray) }
            if (point != null && point.isValid) {
                Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button({ vm.openMap(MapApp.GOOGLE_MAPS, point) }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4285F4))) { Text("Maps") }
                    Button({ vm.openMap(MapApp.WAZE, point) }, Modifier.weight(1f), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF33CCFF))) { Text("Waze") }
                }
            }
        }
    }
}

@Composable
private fun Bill(o: Order, cur: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            o.items.forEach { item ->
                KeyValue("${item.quantity ?: 1}x ${item.name.orEmpty()}", money(cur, (item.price ?: 0.0) * (item.quantity ?: 1)))
                item.addons.forEach { Text("+ ${it.name.orEmpty()} (${money(cur, it.price)})", fontSize = 11.sp, color = Color.Gray, modifier = Modifier.padding(start = 16.dp)) }
            }
            HorizontalDivider()
            KeyValue("Subtotal", money(cur, o.subTotal ?: o.total))
            KeyValue("Envío", money(cur, o.deliveryCharge))
            if ((o.restaurantCharge ?: 0.0) > 0) KeyValue("Cargo servicio", money(cur, o.restaurantCharge))
            if ((o.couponAmount ?: 0.0) > 0) KeyValue("Cupón", "-" + money(cur, o.couponAmount), Color(0xFF2E7D32))
            if ((o.tipAmount ?: 0.0) > 0) KeyValue("Propina (100% para ti)", money(cur, o.tipAmount))
            KeyValue("Total", money(cur, o.total))
            KeyValue("Pago", o.paymentMode ?: "COD")
        }
    }
}

@Composable
private fun ActionArea(order: Order, acting: Boolean, vm: AppViewModel) {
    val action = OrderFlow.nextAction(order.statusId)
    if (action == null) {
        if (order.statusId == com.quicklysolutions.multitienda.delivery.domain.OrderStatus.DELIVERED) {
            Text("Pedido entregado", color = Color(0xFF4CAF50), fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        return
    }
    val (label, color) = when (action) {
        OrderAction.ACCEPT -> "Aceptar pedido" to MaterialTheme.colorScheme.primary
        OrderAction.PICKUP -> "Recogido del comercio" to Color(0xFFFF9800)
        OrderAction.DELIVER -> "Marcar como entregado" to Color(0xFF4CAF50)
    }
    Button(
        onClick = { if (action == OrderAction.DELIVER) vm.requestDeliver() else vm.act(action) },
        enabled = !acting,
        modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = color),
    ) {
        if (acting) CircularProgressIndicator(Modifier.padding(2.dp), strokeWidth = 2.dp, color = Color.White) else Text(label)
    }
}

@Composable
private fun Chat(vm: AppViewModel, messages: List<com.quicklysolutions.multitienda.delivery.model.ChatMessage>, myId: Int) {
    var text by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size) { if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex) }
    Text("Chat con el cliente", fontWeight = FontWeight.SemiBold)
    Column(Modifier.fillMaxWidth().heightIn(max = 260.dp).background(Color(0xFFF5F5F5), RoundedCornerShape(8.dp)).padding(8.dp)) {
        if (messages.isEmpty()) {
            Text("Sin mensajes aún", color = Color.Gray, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(16.dp))
        } else {
            LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(messages.size, key = { messages[it].id }) { i ->
                    val m = messages[i]
                    val mine = m.senderId == myId
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                        Column(
                            Modifier.background(if (mine) MaterialTheme.colorScheme.primary else Color.White, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            Text(m.message, fontSize = 13.sp, color = if (mine) Color.White else Color.Black)
                            Text(formatDate(m.createdAt), fontSize = 10.sp, color = if (mine) Color(0xCCFFFFFF) else Color.Gray)
                        }
                    }
                }
            }
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            text,
            { if (it.length <= AppConfig.CHAT_MAX_LENGTH) text = it },
            placeholder = { Text("Escribe un mensaje...") },
            modifier = Modifier.weight(1f),
            singleLine = true,
        )
        IconButton({ vm.sendChat(text); text = "" }, enabled = text.isNotBlank()) { Icon(Icons.AutoMirrored.Filled.Send, "Enviar", tint = MaterialTheme.colorScheme.primary) }
    }
}

@Composable
private fun PinDialog(error: String?, busy: Boolean, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var pin by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("PIN de entrega") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Pide al cliente el PIN de entrega.", fontSize = 13.sp)
                OutlinedTextField(pin, { pin = it.filter(Char::isDigit).take(8) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword))
                error?.let { Text(it, color = Color(0xFFC62828), fontSize = 12.sp) }
            }
        },
        confirmButton = { TextButton({ onConfirm(pin) }, enabled = pin.isNotBlank() && !busy) { Text("Confirmar entrega") } },
        dismissButton = { TextButton(onDismiss) { Text("Cancelar") } },
    )
}
