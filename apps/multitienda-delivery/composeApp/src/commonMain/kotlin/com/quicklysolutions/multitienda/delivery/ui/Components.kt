package com.quicklysolutions.multitienda.delivery.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.delivery.domain.OrderStatus
import com.quicklysolutions.multitienda.delivery.model.Order
import com.quicklysolutions.multitienda.delivery.util.money

private val Primary = Color(0xFFE64A19)

@Composable
fun DeliveryTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(primary = Primary, secondary = Color(0xFF2E7D32)),
        content = content,
    )
}

fun statusLabel(id: Int) = when (id) {
    OrderStatus.ACCEPTED, OrderStatus.PREPARING -> "Disponible"
    OrderStatus.ASSIGNED -> "Aceptado"
    OrderStatus.PICKED_UP -> "En camino"
    OrderStatus.DELIVERED -> "Entregado"
    OrderStatus.CANCELLED -> "Cancelado"
    else -> ""
}

fun statusColor(id: Int) = when (id) {
    OrderStatus.ACCEPTED, OrderStatus.PREPARING -> Color(0xFFFF9800)
    OrderStatus.ASSIGNED -> Color(0xFF2196F3)
    OrderStatus.PICKED_UP -> Color(0xFFFF9800)
    OrderStatus.DELIVERED -> Color(0xFF4CAF50)
    OrderStatus.CANCELLED -> Color(0xFFF44336)
    else -> Color(0xFF9E9E9E)
}

@Composable
fun StatusChip(status: Int) {
    Text(
        statusLabel(status),
        color = Color.White,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.background(statusColor(status), RoundedCornerShape(4.dp)).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun Loading(modifier: Modifier = Modifier.fillMaxSize()) {
    Box(modifier, contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun Banner(text: String, background: Color, content: Color, modifier: Modifier = Modifier) {
    Text(
        text,
        color = content,
        fontSize = 13.sp,
        modifier = modifier.fillMaxWidth().background(background, RoundedCornerShape(8.dp)).padding(10.dp),
    )
}

@Composable
fun ErrorBanner(text: String, modifier: Modifier = Modifier) = Banner(text, Color(0xFFFFEBEE), Color(0xFFC62828), modifier)

@Composable
fun InfoBanner(text: String, modifier: Modifier = Modifier) = Banner(text, Color(0xFFE8F5E9), Color(0xFF2E7D32), modifier)

@Composable
fun EmptyState(text: String) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(text, color = Color.Gray, textAlign = TextAlign.Center)
    }
}

@Composable
fun OrderCard(order: Order, currency: String, onOpen: () -> Unit, trailing: @Composable (() -> Unit)? = null) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("#${order.uniqueOrderId ?: order.id}", fontWeight = FontWeight.SemiBold)
                StatusChip(order.statusId)
            }
            Text(order.restaurant?.name ?: "Comercio", fontSize = 13.sp)
            Text(order.address?.takeIf { it.isNotBlank() } ?: "Sin dirección", fontSize = 12.sp, color = Color.Gray)
            Text(money(currency, order.total), fontSize = 12.sp, color = Color.Gray)
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = onOpen, modifier = Modifier.weight(1f)) { Text("Ver detalle") }
                trailing?.invoke()
            }
        }
    }
}
