package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.LocationResult
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.AddressDto
import com.quicklysolutions.multitienda.cliente.data.ApiJson
import com.quicklysolutions.multitienda.cliente.data.AppNotification
import com.quicklysolutions.multitienda.cliente.domain.formatDate
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.EmptyBox
import com.quicklysolutions.multitienda.cliente.ui.ErrorBox
import com.quicklysolutions.multitienda.cliente.ui.ErrorText
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.Load
import com.quicklysolutions.multitienda.cliente.ui.LoadView
import com.quicklysolutions.multitienda.cliente.ui.LoadingBox
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.LoginPrompt
import com.quicklysolutions.multitienda.cliente.ui.SectionTitle
import com.quicklysolutions.multitienda.cliente.ui.rememberLoad
import com.quicklysolutions.multitienda.cliente.ui.userMessage
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

// ---------------------------------------------------------------- Direcciones
@Composable
fun AddressesScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val load = rememberLoad(app.isLoggedIn) { if (app.isLoggedIn) app.api.addresses() else emptyList() }
    var address by remember { mutableStateOf("") }
    var house by remember { mutableStateOf("") }
    var tag by remember { mutableStateOf("") }
    var coords by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var toDelete by remember { mutableStateOf<AddressDto?>(null) }

    Column(Modifier.fillMaxSize()) {
        AppBar(app.t("accountManageAddress", "Mis direcciones"), onBack = { app.nav.pop() })
        if (!app.isLoggedIn) { LoginPrompt("Inicia sesión para ver tus direcciones"); return@Column }
        LoadView(load) { list ->
            val defaultId = app.user?.defaultAddressId
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                if (list.isEmpty()) Text("No tienes direcciones guardadas", Modifier.padding(16.dp), color = Color.Gray)
                list.forEach { a ->
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            scope.launch {
                                runCatching { app.api.setDefaultAddress(a.id) }.onSuccess {
                                    app.updateUser { it.copy(defaultAddressId = a.id) }
                                    app.chooseLocation(a)
                                    app.message = "Dirección predeterminada"
                                    load.reload()
                                }.onFailure { app.message = it.userMessage() }
                            }
                        }.padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.LocationOn, null, tint = if (a.id == defaultId) MaterialTheme.colorScheme.primary else Color.Gray)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(listOfNotNull(a.tag, a.house).filter { it.isNotBlank() }.joinToString(" ").ifBlank { "Dirección" }, fontWeight = if (a.id == defaultId) FontWeight.Bold else FontWeight.Normal)
                            Text(a.address.orEmpty(), fontSize = 12.sp, color = Color.Gray)
                        }
                        if (a.id == defaultId) Icon(Icons.Default.CheckCircle, "Predeterminada", tint = MaterialTheme.colorScheme.primary)
                        else IconButton(onClick = { toDelete = a }) { Icon(Icons.Default.Delete, "Eliminar", tint = MaterialTheme.colorScheme.error) }
                    }
                }
                SectionTitle("Agregar dirección")
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                busy = true; error = null
                                when (val r = app.platform.currentLocation()) {
                                    is LocationResult.Found -> {
                                        coords = r.lat to r.lng
                                        if (address.isBlank()) address = runCatching { app.api.coordinateToAddress(r.lat, r.lng) }.getOrDefault("")
                                    }
                                    else -> error = locationErrorText(r)
                                }
                                busy = false
                            }
                        },
                        enabled = !busy,
                    ) { Icon(Icons.Default.MyLocation, null); Text("  Usar mi ubicación actual") }
                    if (coords != null) Text("Ubicación GPS capturada", fontSize = 12.sp, color = Color(0xFF2E7D32))
                    Field(address, { address = it; if (coords != null && it.isBlank()) coords = null }, "Dirección")
                    Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                        Field(house, { house = it }, "Casa / Depto", Modifier.weight(1f))
                        Field(tag, { tag = it }, app.t("addressTagPlaceholder", "Etiqueta"), Modifier.weight(1f))
                    }
                    ErrorText(error)
                    Button(
                        enabled = address.isNotBlank() && !busy,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            scope.launch {
                                busy = true; error = null
                                try {
                                    val c = coords ?: runCatching { app.api.addressToCoordinate(address.trim()) }.getOrNull()
                                    if (c == null) error = "No se pudo ubicar la dirección. Usa tu ubicación actual."
                                    else {
                                        app.api.saveAddress(address.trim(), house.trim(), tag.trim(), c.first, c.second)
                                        address = ""; house = ""; tag = ""; coords = null
                                        load.reload()
                                    }
                                } catch (e: kotlinx.coroutines.CancellationException) {
                                    throw e
                                } catch (e: Exception) {
                                    error = e.userMessage()
                                }
                                busy = false
                            }
                        },
                    ) { Text(if (busy) "Guardando..." else "Guardar") }
                }
            }
        }
    }

    toDelete?.let { a ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("¿Eliminar dirección?") },
            text = { Text(a.address.orEmpty()) },
            confirmButton = {
                TextButton(onClick = {
                    toDelete = null
                    scope.launch { runCatching { app.api.deleteAddress(a.id) }.onSuccess { load.reload() }.onFailure { app.message = it.userMessage() } }
                }) { Text("Eliminar") }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("Cancelar") } },
        )
    }
}

// ------------------------------------------------------------------ Billetera
@Composable
fun WalletScreen() {
    val app = LocalApp.current
    val load = rememberLoad(app.isLoggedIn) { app.api.wallet() }
    Column(Modifier.fillMaxSize()) {
        AppBar(app.walletName, onBack = { app.nav.pop() })
        if (!app.isLoggedIn) { LoginPrompt("Inicia sesión para ver tu ${app.walletName.lowercase()}"); return@Column }
        LoadView(load) { w ->
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Column(
                        Modifier.fillMaxWidth().padding(16.dp).background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("Saldo disponible", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
                        Text(app.price(w.balance), color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    }
                    SectionTitle("Transacciones")
                    if (w.transactions.isEmpty()) Text("Sin transacciones", Modifier.padding(16.dp), color = Color.Gray)
                }
                items(w.transactions, key = { it.id }) { t ->
                    val deposit = t.type == "deposit"
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(walletDescription(t.meta), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            Text(formatDate(t.createdAt, withTime = true), fontSize = 11.sp, color = Color.Gray)
                        }
                        Text((if (deposit) "+" else "-") + app.price(t.amount), fontWeight = FontWeight.SemiBold, color = if (deposit) Color(0xFF4CAF50) else Color(0xFFF44336))
                    }
                }
            }
        }
    }
}

private fun walletDescription(meta: String?): String {
    if (meta.isNullOrBlank()) return "Transacción"
    val o = runCatching { ApiJson.parseToJsonElement(meta) }.getOrNull() as? JsonObject
    return (o?.get("description") as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() } ?: "Transacción"
}

// ------------------------------------------------------------------ Favoritos
@Composable
fun FavoritesScreen() {
    val app = LocalApp.current
    val load = rememberLoad(app.isLoggedIn to app.location) {
        if (app.isLoggedIn) app.api.favoriteStores(app.location?.lat, app.location?.lng) else emptyList()
    }
    Column(Modifier.fillMaxSize()) {
        AppBar(app.t("accountMyFavouriteStores", "Mis favoritos"), onBack = { app.nav.pop() })
        if (!app.isLoggedIn) { LoginPrompt("Inicia sesión para ver tus favoritos"); return@Column }
        LoadView(load) { stores ->
            // Quitar un favorito lo oculta de la lista al instante (app.favorites ya se actualizo).
            val shown = stores.filter { it.id in app.favorites }
            if (shown.isEmpty()) EmptyBox("No tienes favoritos aún")
            else LazyColumn(Modifier.fillMaxSize()) { items(shown, key = { it.id }) { StoreRow(it) } }
        }
    }
}

// -------------------------------------------------------------- Notificaciones
private data class NotifView(val title: String, val message: String, val uniqueOrderId: String?, val orderId: Int?)

private fun notifView(n: AppNotification): NotifView {
    var data: JsonElement? = n.data
    if (data is JsonPrimitive && data.isString) data = runCatching { ApiJson.parseToJsonElement(data.content) }.getOrNull()
    val o = data as? JsonObject
    fun s(k: String) = (o?.get(k) as? JsonPrimitive)?.contentOrNull
    return NotifView(s("title") ?: "Notificación", s("message") ?: s("body").orEmpty(), s("unique_order_id"), s("order_id")?.toIntOrNull())
}

@Composable
fun NotificationsScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val load = rememberLoad(app.isLoggedIn) { if (app.isLoggedIn) app.api.notifications() else emptyList() }
    val read = remember { mutableStateListOf<String>() }
    var allRead by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        AppBar("Notificaciones", onBack = { app.nav.pop() }, actions = {
            if (app.isLoggedIn) TextButton(onClick = {
                scope.launch { runCatching { app.api.markAllNotificationsRead() }.onSuccess { allRead = true }.onFailure { app.message = it.userMessage() } }
            }) { Text("Marcar leídas") }
        })
        if (!app.isLoggedIn) { LoginPrompt("Inicia sesión para ver tus notificaciones"); return@Column }
        LoadView(load) { list ->
            if (list.isEmpty()) EmptyBox("No tienes notificaciones")
            else LazyColumn(Modifier.fillMaxSize()) {
                items(list, key = { it.id ?: it.hashCode().toString() }) { n ->
                    val v = notifView(n)
                    val unread = n.readAt == null && !allRead && n.id !in read
                    Row(
                        Modifier.fillMaxWidth().background(if (unread) Color(0xFFFFF8E1) else Color.White).clickable {
                            scope.launch {
                                n.id?.let { id -> runCatching { app.api.markNotificationRead(id) }.onSuccess { read.add(id) } }
                                when {
                                    v.uniqueOrderId != null -> app.nav.push(Screen.OrderDetail(v.uniqueOrderId, null))
                                    v.orderId != null -> app.nav.push(Screen.Orders)
                                }
                            }
                        }.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.Notifications, null, tint = if (unread) MaterialTheme.colorScheme.primary else Color.Gray)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(v.title, fontWeight = FontWeight.Medium)
                            if (v.message.isNotBlank()) Text(v.message, fontSize = 12.sp, color = Color.Gray)
                            Text(formatDate(n.createdAt, withTime = true), fontSize = 11.sp, color = Color.Gray)
                        }
                    }
                }
            }
        }
    }
}
