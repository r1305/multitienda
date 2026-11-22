package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.BusinessType
import com.quicklysolutions.multitienda.cliente.data.PromoSlide
import com.quicklysolutions.multitienda.cliente.data.StoreCategory
import com.quicklysolutions.multitienda.cliente.data.StoreSummary
import com.quicklysolutions.multitienda.cliente.ui.Banner
import com.quicklysolutions.multitienda.cliente.ui.EmptyBox
import com.quicklysolutions.multitienda.cliente.ui.ErrorBox
import com.quicklysolutions.multitienda.cliente.ui.Load
import com.quicklysolutions.multitienda.cliente.ui.LoadingBox
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.RemoteImage
import com.quicklysolutions.multitienda.cliente.ui.StoreCard
import com.quicklysolutions.multitienda.cliente.ui.rememberLoad
import kotlinx.coroutines.launch

@Composable
fun HomeScreen() {
    val app = LocalApp.current
    val loc = app.location
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current

    Column(Modifier.fillMaxSize()) {
        Surface(shadowElevation = 2.dp) {
            Row(Modifier.fillMaxWidth().height(56.dp).padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f).clickable { app.nav.push(Screen.Location) }, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.LocationOn, null, tint = MaterialTheme.colorScheme.primary)
                    Text(
                        loc?.address?.takeIf { it.isNotBlank() } ?: "Seleccionar ubicación",
                        Modifier.padding(start = 6.dp), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp,
                    )
                }
                if (app.isLoggedIn) IconButton(onClick = { app.nav.push(Screen.Notifications) }) { Icon(Icons.Default.Notifications, "Notificaciones") }
            }
        }

        if (loc == null) {
            EmptyBox("Selecciona tu ubicación para ver comercios") {
                Button(onClick = { app.nav.push(Screen.Location) }) { Text("Seleccionar ubicación") }
            }
            return@Column
        }

        var mode by remember { mutableStateOf("delivery") }
        var businessTypeId by remember { mutableStateOf<Int?>(null) }
        var categoryId by remember { mutableStateOf<Int?>(null) }

        val sliders by produceState(emptyList<PromoSlide>(), loc) { value = runCatching { app.api.promoSliders(loc.lat, loc.lng) }.getOrDefault(emptyList()) }
        val types by produceState(emptyList<BusinessType>(), loc) { value = runCatching { app.api.businessTypes() }.getOrDefault(emptyList()) }
        val categories by produceState(emptyList<StoreCategory>(), loc) { value = runCatching { app.api.categories() }.getOrDefault(emptyList()) }
        val running by produceState(false, app.isLoggedIn) { value = app.isLoggedIn && runCatching { app.api.hasRunningOrder() }.getOrDefault(false) }

        val stores = rememberLoad(listOf(loc.lat, loc.lng, mode, businessTypeId, categoryId)) {
            val cat = categoryId
            when {
                cat != null -> app.api.filteredStores(loc.lat, loc.lng, listOf(cat))
                mode == "delivery" -> app.api.deliveryStores(loc.lat, loc.lng, businessTypeId)
                else -> app.api.pickupStores(loc.lat, loc.lng, businessTypeId)
            }
        }

        LazyColumn(Modifier.fillMaxSize()) {
            if (running) item {
                Banner("Tienes un pedido en curso. Toca para verlo.", Color(0xFFE3F2FD), Modifier.clickable {
                    scope.launch {
                        runCatching { app.api.userInfo() }.getOrNull()?.runningOrder?.let { app.nav.push(Screen.OrderDetail(it.uniqueOrderId, it)) }
                    }
                })
            }
            if (sliders.isNotEmpty()) item {
                LazyRow(Modifier.padding(vertical = 8.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(sliders) { s ->
                        RemoteImage(
                            app.image(s.image),
                            Modifier.width(300.dp).height(140.dp).clickable(enabled = s.url?.startsWith("http") == true) { s.url?.let { uriHandler.openUri(it) } },
                        )
                    }
                }
            }
            item {
                Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(mode == "delivery", { mode = "delivery"; categoryId = null }, { Text("Delivery") })
                    FilterChip(mode == "pickup", { mode = "pickup"; categoryId = null }, { Text("Recoger") })
                }
            }
            if (types.isNotEmpty()) item {
                LazyRow(Modifier.padding(vertical = 6.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { FilterChip(businessTypeId == null, { businessTypeId = null }, { Text("Todos") }) }
                    items(types) { t -> FilterChip(businessTypeId == t.id, { businessTypeId = t.id }, { Text(t.name) }) }
                }
            }
            if (categories.isNotEmpty()) item {
                LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(categories) { c -> FilterChip(categoryId == c.id, { categoryId = if (categoryId == c.id) null else c.id }, { Text(c.name) }) }
                }
            }
            when (val s = stores.state) {
                Load.Loading -> item { LoadingBox(Modifier.fillMaxWidth().height(200.dp)) }
                is Load.Err -> item { Column(Modifier.height(200.dp)) { ErrorBox(s.message) { stores.reload() } } }
                is Load.Ok -> {
                    val sorted = s.value.sortedByDescending { it.id in app.favorites }
                    if (sorted.isEmpty()) item { Column(Modifier.height(200.dp)) { EmptyBox("No hay comercios en tu zona") } }
                    else {
                        item { Text("${sorted.size} ${if (sorted.size == 1) "comercio" else "comercios"}", Modifier.padding(16.dp, 10.dp), fontWeight = FontWeight.Bold) }
                        items(sorted, key = { it.id }) { st -> StoreRow(st) }
                    }
                }
            }
        }
    }
}

@Composable
fun StoreRow(st: StoreSummary) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    StoreCard(
        st, favorite = st.id in app.favorites,
        onFavorite = {
            if (!app.isLoggedIn) app.message = "Inicia sesión para guardar favoritos"
            else scope.launch { app.toggleFavorite(st.id) }
        },
        onClick = { app.nav.push(Screen.Store(st.slug)) },
    )
}
