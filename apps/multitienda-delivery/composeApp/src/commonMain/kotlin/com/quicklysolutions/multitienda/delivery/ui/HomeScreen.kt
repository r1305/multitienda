package com.quicklysolutions.multitienda.delivery.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.delivery.config.AppConfig
import com.quicklysolutions.multitienda.delivery.model.Order
import com.quicklysolutions.multitienda.delivery.state.AppViewModel
import com.quicklysolutions.multitienda.delivery.state.HomeTab
import com.quicklysolutions.multitienda.delivery.state.OrdersTab
import com.quicklysolutions.multitienda.delivery.state.Screen
import com.quicklysolutions.multitienda.delivery.util.formatDate
import com.quicklysolutions.multitienda.delivery.util.money
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: AppViewModel) {
    val tab by vm.homeTab.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        when (tab) {
                            HomeTab.ORDERS -> "Mis pedidos"
                            HomeTab.HISTORY -> "Historial de entregas"
                            HomeTab.EARNINGS -> "Mis ganancias"
                            HomeTab.PROFILE -> "Perfil"
                        },
                    )
                },
                actions = {
                    IconButton({
                        when (tab) {
                            HomeTab.ORDERS -> vm.refreshBoard()
                            HomeTab.HISTORY -> vm.loadHistory()
                            HomeTab.EARNINGS -> vm.loadEarnings()
                            HomeTab.PROFILE -> vm.loadProfile()
                        }
                    }) { Icon(Icons.Default.Refresh, "Actualizar") }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(tab == HomeTab.ORDERS, { vm.selectHomeTab(HomeTab.ORDERS) }, { Icon(Icons.AutoMirrored.Filled.List, null) }, label = { Text("Pedidos") })
                NavigationBarItem(tab == HomeTab.HISTORY, { vm.selectHomeTab(HomeTab.HISTORY) }, { Icon(Icons.Default.History, null) }, label = { Text("Historial") })
                NavigationBarItem(tab == HomeTab.EARNINGS, { vm.selectHomeTab(HomeTab.EARNINGS) }, { Icon(Icons.Default.AttachMoney, null) }, label = { Text("Ganancias") })
                NavigationBarItem(tab == HomeTab.PROFILE, { vm.selectHomeTab(HomeTab.PROFILE) }, { Icon(Icons.Default.Person, null) }, label = { Text("Perfil") })
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            when (tab) {
                HomeTab.ORDERS -> OrdersContent(vm)
                HomeTab.HISTORY -> HistoryContent(vm)
                HomeTab.EARNINGS -> EarningsContent(vm)
                HomeTab.PROFILE -> ProfileContent(vm)
            }
        }
    }
}

@Composable
private fun OrdersContent(vm: AppViewModel) {
    val state by vm.board.collectAsState()
    val ordersTab by vm.ordersTab.collectAsState()
    val settings by vm.settings.collectAsState()
    val granted by vm.locationGranted.collectAsState()

    // Se cancela al salir de la composición (equivale al clearInterval de la web).
    LaunchedEffect(Unit) {
        while (true) {
            vm.refreshBoard()
            delay(AppConfig.ORDERS_POLL_MS)
        }
    }
    LaunchedEffect(granted) { if (granted) vm.refreshBoard() }

    val b = state.board
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(ordersTab == OrdersTab.AVAILABLE, { vm.selectOrdersTab(OrdersTab.AVAILABLE) }, { Text("Disponibles (${b.available.size})") })
        FilterChip(ordersTab == OrdersTab.ACTIVE, { vm.selectOrdersTab(OrdersTab.ACTIVE) }, { Text("Activos (${b.active.size})") })
    }
    if (!granted) {
        Banner("Activa el GPS para ver pedidos cercanos y compartir tu ubicación en las entregas.", Color(0xFFFFF3E0), Color(0xFFE65100), Modifier.padding(horizontal = 16.dp))
        OutlinedButton({ vm.requestPermissions() }, Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) { Text("Activar GPS") }
    }
    state.error?.let { ErrorBanner(it, Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }

    val list = if (ordersTab == OrdersTab.AVAILABLE) b.available else b.active
    when {
        state.loading && !state.loaded -> Loading()
        list.isEmpty() -> EmptyState(if (ordersTab == OrdersTab.AVAILABLE) "No hay pedidos disponibles en tu zona" else "No tienes pedidos activos")
        else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(list, key = { it.id }) { o ->
                OrderCard(o, settings.currency, onOpen = { vm.openOrder(o.id) }, trailing = if (ordersTab == OrdersTab.AVAILABLE) {
                    { IconButton({ vm.ignoreOrder(o.id) }) { Icon(Icons.Default.Close, "Ignorar", tint = Color(0xFFC62828)) } }
                } else null)
            }
        }
    }
}

@Composable
private fun HistoryContent(vm: AppViewModel) {
    val state by vm.history.collectAsState()
    val settings by vm.settings.collectAsState()
    LaunchedEffect(Unit) { vm.loadHistory() }
    when {
        state.loading && state.items.isEmpty() -> Loading()
        state.error != null -> ErrorBanner(state.error.orEmpty(), Modifier.padding(16.dp))
        state.items.isEmpty() -> EmptyState("Sin entregas completadas")
        else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(state.items, key = { it.id }) { o -> HistoryCard(o, settings.currency) }
        }
    }
}

@Composable
private fun HistoryCard(o: Order, currency: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("#${o.uniqueOrderId ?: o.id}", fontWeight = FontWeight.SemiBold)
                Text(money(currency, o.total), fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
            }
            Text(o.restaurant?.name ?: "-", fontSize = 12.sp, color = Color.Gray)
            Text(formatDate(o.createdAt), fontSize = 12.sp, color = Color.Gray)
        }
    }
}

@Composable
private fun EarningsContent(vm: AppViewModel) {
    val state by vm.earnings.collectAsState()
    val settings by vm.settings.collectAsState()
    val cur = settings.currency
    LaunchedEffect(Unit) { vm.loadEarnings() }
    val s = state.summary
    if (state.loading && s == null) {
        Loading()
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.error?.let { ErrorBanner(it) }
        if (s != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Ganancias totales", fontSize = 13.sp)
                    Text(money(cur, s.totalEarnings), fontSize = 28.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    Text("${s.totalDeliveries} entregas completadas", fontSize = 12.sp, color = Color.Gray)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Hoy", money(cur, s.todayEarnings), Color(0xFF4CAF50), Modifier.weight(1f))
                StatCard("Esta semana", money(cur, s.weekEarnings), Color(0xFF2196F3), Modifier.weight(1f))
            }
        }
        state.balance?.let { bal ->
            val b = bal.balance
            Text("Mi saldo", fontWeight = FontWeight.SemiBold)
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    KeyValue("Efectivo por entregar", money(cur, b.cashPending), Color(0xFFE65100))
                    Text("${b.cashPendingOrders} pedidos sin cierre de caja", fontSize = 11.sp, color = Color.Gray)
                    KeyValue("Efectivo entregado", money(cur, b.cashDelivered))
                    HorizontalDivider()
                    KeyValue("Ganancias acumuladas", money(cur, b.earningsTotal))
                    KeyValue("Incluye propinas", money(cur, b.earningsTips))
                    KeyValue("Pendiente de pago", money(cur, b.earningsPending), Color(0xFF2196F3))
                    KeyValue("Pagado", money(cur, b.earningsPaid), Color(0xFF4CAF50))
                }
            }
            if (bal.closings.isNotEmpty()) {
                Text("Últimos cierres de caja", fontSize = 12.sp, color = Color.Gray)
                bal.closings.take(5).forEach { KeyValue(formatDate(it.createdAt), money(cur, it.receivedAmount)) }
            }
            if (bal.payouts.isNotEmpty()) {
                Text("Últimos pagos recibidos", fontSize = 12.sp, color = Color.Gray)
                bal.payouts.take(5).forEach { KeyValue("${formatDate(it.createdAt)} · ${it.reference.orEmpty()}", money(cur, it.amount)) }
            }
        }
        if (s != null) {
            Text("Últimas entregas", fontWeight = FontWeight.SemiBold)
            if (s.earnings.isEmpty()) Text("Sin entregas aún", color = Color.Gray)
            s.earnings.take(20).forEach {
                KeyValue(
                    "#${it.uniqueOrderId.orEmpty()}  ${formatDate(it.orderDate ?: it.createdAt)} · ${if (it.commissionType == "percentage") "Porcentual" else "Fijo"}",
                    "+" + money(cur, it.amount),
                    Color(0xFF4CAF50),
                )
            }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, color: Color, modifier: Modifier) {
    Card(modifier) {
        Column(Modifier.padding(14.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = color)
            Text(label, fontSize = 11.sp, color = Color.Gray)
        }
    }
}

@Composable
internal fun KeyValue(key: String, value: String, valueColor: Color = Color.Unspecified) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(key, fontSize = 13.sp, modifier = Modifier.weight(1f))
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = valueColor)
    }
}

@Composable
private fun ProfileContent(vm: AppViewModel) {
    val state by vm.profile.collectAsState()
    val session by vm.session.collectAsState()
    LaunchedEffect(Unit) { vm.loadProfile() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.error?.let { ErrorBanner(it) }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val p = state.profile
                Text(p?.name ?: session?.name.orEmpty(), fontSize = 18.sp, fontWeight = FontWeight.Bold)
                KeyValue("Teléfono", p?.phone ?: session?.phone.orEmpty())
                p?.email?.let { KeyValue("Email", it) }
                p?.vehicleNumber?.takeIf { it.isNotBlank() }?.let { KeyValue("Vehículo", it) }
                if (p != null) KeyValue("Estado", if (p.isAvailable) "En línea" else "Fuera de línea")
            }
        }
        Button({ vm.push(Screen.Notifications) }, Modifier.fillMaxWidth()) {
            Icon(Icons.Default.Notifications, null)
            Text("  Notificaciones")
        }
        OutlinedButton({ vm.logout() }, Modifier.fillMaxWidth()) {
            Icon(Icons.AutoMirrored.Filled.Logout, null)
            Text("  Cerrar sesión")
        }
    }
}
