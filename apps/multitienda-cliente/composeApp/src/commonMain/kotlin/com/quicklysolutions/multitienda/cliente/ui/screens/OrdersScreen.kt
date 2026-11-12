package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.Order
import com.quicklysolutions.multitienda.cliente.domain.OrderStatus
import com.quicklysolutions.multitienda.cliente.domain.formatDate
import com.quicklysolutions.multitienda.cliente.domain.formatTime
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.EmptyBox
import com.quicklysolutions.multitienda.cliente.ui.ErrorBox
import com.quicklysolutions.multitienda.cliente.ui.LoadingBox
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.LoginPrompt
import com.quicklysolutions.multitienda.cliente.ui.StatusChip
import com.quicklysolutions.multitienda.cliente.ui.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun OrdersScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val orders = remember { mutableStateListOf<Order>() }
    var total by remember { mutableStateOf(0) }
    var page by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun loadNext() {
        loading = true
        try {
            val p = app.api.orders(page + 1)
            orders.addAll(p.data); total = p.total; page = p.currentPage; error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage()
        }
        loading = false
    }
    LaunchedEffect(app.isLoggedIn) { if (app.isLoggedIn) { orders.clear(); page = 0; loadNext() } }

    Column(Modifier.fillMaxSize()) {
        AppBar(app.t("accountMyOrders", "Mis pedidos"), onBack = { app.nav.pop() })
        when {
            !app.isLoggedIn -> LoginPrompt("Inicia sesión para ver tus pedidos")
            orders.isEmpty() && loading -> LoadingBox()
            orders.isEmpty() && error != null -> ErrorBox(error!!) { scope.launch { loadNext() } }
            orders.isEmpty() -> EmptyBox("No tienes pedidos aún")
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(orders, key = { it.id }) { o -> OrderCard(o) }
                if (orders.size < total) item {
                    OutlinedButton(onClick = { scope.launch { loadNext() } }, enabled = !loading, modifier = Modifier.padding(16.dp)) { Text(if (loading) "Cargando..." else "Cargar más") }
                }
            }
        }
    }
}

@Composable
private fun OrderCard(o: Order) {
    val app = LocalApp.current
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).clickable { app.nav.push(Screen.OrderDetail(o.uniqueOrderId, o)) },
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("#${o.uniqueOrderId}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                StatusChip(o.statusId)
            }
            Text(o.restaurant?.name.orEmpty(), fontSize = 12.sp, color = Color.Gray)
            if (o.etaAt != null && OrderStatus.isRunning(o.statusId)) Text("Llegada estimada: ${formatTime(o.etaAt)}", fontSize = 12.sp, color = Color.Gray)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatDate(o.createdAt), fontSize = 13.sp, color = Color.Gray)
                Text(app.price(o.total), fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
