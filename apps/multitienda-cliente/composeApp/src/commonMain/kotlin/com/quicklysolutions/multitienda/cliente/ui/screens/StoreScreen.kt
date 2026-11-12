package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeliveryDining
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.ApiException
import com.quicklysolutions.multitienda.cliente.data.Item
import com.quicklysolutions.multitienda.cliente.data.MenuResponse
import com.quicklysolutions.multitienda.cliente.data.RestaurantInfo
import com.quicklysolutions.multitienda.cliente.data.ReviewDto
import com.quicklysolutions.multitienda.cliente.domain.AddResult
import com.quicklysolutions.multitienda.cliente.domain.CartAddon
import com.quicklysolutions.multitienda.cliente.domain.CartLine
import com.quicklysolutions.multitienda.cliente.domain.CartRules
import com.quicklysolutions.multitienda.cliente.domain.formatDate
import com.quicklysolutions.multitienda.cliente.domain.unitPriceOf
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.Banner
import com.quicklysolutions.multitienda.cliente.ui.Load
import com.quicklysolutions.multitienda.cliente.ui.LoadView
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.QtyControl
import com.quicklysolutions.multitienda.cliente.ui.RemoteImage
import com.quicklysolutions.multitienda.cliente.ui.SectionTitle
import com.quicklysolutions.multitienda.cliente.ui.rememberLoad
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private data class StoreData(val info: RestaurantInfo, val menu: MenuResponse)

@Composable
fun StoreScreen(slug: String) {
    val app = LocalApp.current
    val load = rememberLoad(slug to app.isLoggedIn) {
        coroutineScope {
            val info = async { app.api.storeInfo(slug, app.isLoggedIn) }
            val menu = async { app.api.storeMenu(slug) }
            StoreData(info.await(), menu.await())
        }
    }
    Column(Modifier.fillMaxSize()) {
        AppBar((load.state as? Load.Ok<StoreData>)?.value?.info?.name ?: "Comercio", onBack = { app.nav.pop() })
        LoadView(load) { StoreContent(it) }
    }
}

@Composable
private fun StoreContent(data: StoreData) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val info = data.info
    var tab by remember { mutableStateOf(0) }
    var selectedItem by remember { mutableStateOf<Item?>(null) }
    var pendingOtherStore by remember { mutableStateOf<CartLine?>(null) }

    LaunchedEffect(info.id) { if (app.isLoggedIn) app.syncFavorite(info.id, info.isFavorited) }
    val operates by produceState<Boolean?>(null, info.id, app.location) {
        val l = app.location
        value = if (l == null) null else runCatching { app.api.operatesAt(info.id, l.lat, l.lng) }.getOrNull()
    }
    val canOrder = operates != false

    val reviews = remember(info.id) { mutableStateListOf<ReviewDto>() }
    var reviewTotal by remember(info.id) { mutableStateOf(0) }
    var reviewAverage by remember(info.id) { mutableStateOf<Double?>(null) }
    var reviewPage by remember(info.id) { mutableStateOf(0) }
    var reviewError by remember(info.id) { mutableStateOf<String?>(null) }
    suspend fun loadReviews() {
        val next = reviewPage + 1
        try {
            // La primera pagina usa la ruta por slug (/get-store-reviews/:slug); las siguientes la ruta por id (/restaurants/:id/ratings).
            val p = if (next == 1) app.api.reviewsBySlug(info.slug, 1) else app.api.reviewsById(info.id, next)
            reviews.addAll(p.data); reviewTotal = p.total; reviewAverage = p.average; reviewPage = next; reviewError = null
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            reviewError = "No se pudieron cargar las reseñas"
        }
    }
    LaunchedEffect(info.id) { loadReviews() }

    fun lineFor(item: Item, addons: List<CartAddon>) = CartLine(
        itemId = item.id, restaurantId = info.id, name = item.name, image = item.image, basePrice = item.price,
        addons = addons, storeSlug = info.slug, storeName = info.name,
    )

    fun addLine(line: CartLine) {
        when (app.addToCart(line)) {
            is AddResult.Added -> Unit
            AddResult.OtherStore -> pendingOtherStore = line
            AddResult.Limit -> app.message = "Alcanzaste el límite de cantidad"
        }
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 80.dp)) {
            item {
                Column {
                    RemoteImage(app.image(info.image), Modifier.fillMaxWidth().height(170.dp))
                    Row(Modifier.padding(16.dp, 12.dp, 8.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(info.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            if (!info.description.isNullOrBlank()) Text(info.description, fontSize = 13.sp, color = Color.Gray)
                        }
                        if (app.isLoggedIn) {
                            val fav = info.id in app.favorites
                            IconButton(onClick = { scope.launch { app.toggleFavorite(info.id) } }) {
                                Icon(if (fav) Icons.Default.Favorite else Icons.Default.FavoriteBorder, "Favorito", tint = if (fav) Color(0xFFE91E63) else Color.Gray)
                            }
                        }
                    }
                    Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Default.Star, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                        Text(info.ratingText, fontSize = 13.sp)
                        Icon(Icons.Default.Schedule, null, Modifier.size(16.dp), tint = Color.Gray)
                        Text("${info.deliveryTime ?: "?"} min", fontSize = 13.sp)
                        Icon(Icons.Default.DeliveryDining, null, Modifier.size(16.dp), tint = Color.Gray)
                        Text(app.price(info.deliveryCharges), fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(8.dp))
                    if (!info.isActive) Banner("Este comercio está cerrado en este momento.")
                    if (operates == false) Banner("Este comercio no entrega en tu ubicación. Puedes ver el menú, pero no pedir.", Color(0xFFFFEBEE))
                    TabRow(selectedTabIndex = tab) {
                        Tab(tab == 0, { tab = 0 }, text = { Text("Menú") })
                        Tab(tab == 1, { tab = 1 }, text = { Text("Reseñas${if (reviewTotal > 0) " ($reviewTotal)" else ""}") })
                    }
                }
            }
            if (tab == 0) {
                if (data.menu.recommended.isNotEmpty()) {
                    item { SectionTitle("Recomendados") }
                    items(data.menu.recommended, key = { "rec${it.id}" }) { ItemRow(it, canOrder, { selectedItem = it }, ::addLine) { lineFor(it, emptyList()) } }
                }
                data.menu.items.forEach { (category, list) ->
                    item(key = "cat$category") { SectionTitle(category) }
                    items(list, key = { "it${it.id}" }) { ItemRow(it, canOrder, { selectedItem = it }, ::addLine) { lineFor(it, emptyList()) } }
                }
            } else {
                item {
                    Column(Modifier.padding(16.dp)) {
                        if (reviewAverage != null) Text("★ ${reviewAverage} · $reviewTotal reseñas", fontWeight = FontWeight.Bold)
                        if (reviewError != null) Text(reviewError!!, color = MaterialTheme.colorScheme.error)
                        if (reviews.isEmpty() && reviewError == null) Text("Aún no hay reseñas", color = Color.Gray)
                    }
                }
                items(reviews.size) { i ->
                    val r = reviews[i]
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Text("${"★".repeat(r.rating.toInt().coerceIn(0, 5))}  ${formatDate(r.createdAt)}", fontSize = 12.sp, color = Color.Gray)
                        if (!r.comment.isNullOrBlank()) Text(r.comment)
                        if (!r.reply.isNullOrBlank()) Text("Respuesta del comercio: ${r.reply}", fontSize = 12.sp, color = Color.Gray, modifier = Modifier.padding(top = 4.dp))
                    }
                }
                if (reviews.size < reviewTotal) item {
                    OutlinedButton(onClick = { scope.launch { loadReviews() } }, Modifier.padding(16.dp)) { Text("Ver más reseñas") }
                }
            }
        }
        if (app.cart.count > 0) {
            Button(
                onClick = { app.nav.selectTab(Screen.Cart) },
                modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp).fillMaxWidth(),
            ) {
                Text("${app.cart.count} ${if (app.cart.count == 1) "producto" else "productos"}", Modifier.weight(1f))
                Text("Ver carrito  " + app.price(app.cart.subtotal))
            }
        }
    }

    selectedItem?.let { item ->
        ItemDialog(item, canOrder, onDismiss = { selectedItem = null }) { addons -> addLine(lineFor(item, addons)); selectedItem = null }
    }
    pendingOtherStore?.let { line ->
        AlertDialog(
            onDismissRequest = { pendingOtherStore = null },
            title = { Text("¿Vaciar el carrito?") },
            text = { Text("Tu carrito tiene productos de otra tienda. Solo puedes pedir a un comercio a la vez.") },
            confirmButton = { TextButton(onClick = { app.clearCart(); addLine(line); pendingOtherStore = null }) { Text("Vaciar y agregar") } },
            dismissButton = { TextButton(onClick = { pendingOtherStore = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun ItemRow(item: Item, canOrder: Boolean, onOpen: () -> Unit, onAdd: (CartLine) -> Unit, quickLine: () -> CartLine) {
    val app = LocalApp.current
    val qty = CartRules.quantityOf(app.cart.lines, item.id)
    Row(Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(item.name, fontWeight = FontWeight.Medium)
            if (!item.description.isNullOrBlank()) Text(item.description, fontSize = 12.sp, color = Color.Gray, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(app.price(item.price), fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                if (item.oldPrice > 0) Text("  " + app.price(item.oldPrice), fontSize = 12.sp, color = Color.Gray, textDecoration = TextDecoration.LineThrough)
            }
        }
        Spacer(Modifier.width(10.dp))
        if (!item.image.isNullOrBlank()) RemoteImage(app.image(item.image), Modifier.size(72.dp))
        if (canOrder) {
            Spacer(Modifier.width(8.dp))
            val hasAddons = item.addonCategories.isNotEmpty()
            if (qty > 0) QtyControl(
                qty,
                onMinus = { app.updateCart(app.cart.copy(lines = CartRules.decrementItem(app.cart.lines, item.id))) },
                onPlus = { if (hasAddons) onOpen() else onAdd(quickLine()) },
            ) else IconButton(
                onClick = { if (hasAddons) onOpen() else onAdd(quickLine()) },
                modifier = Modifier.size(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
            ) { Icon(Icons.Default.Add, "Agregar", tint = Color.White) }
        }
    }
}

@Composable
private fun ItemDialog(item: Item, canOrder: Boolean, onDismiss: () -> Unit, onAdd: (List<CartAddon>) -> Unit) {
    val app = LocalApp.current
    var unavailable by remember { mutableStateOf(false) }
    val fresh by produceState(item, item.id) {
        value = try {
            app.api.singleItem(item.id)
        } catch (e: ApiException) {
            if (e.status == 404) unavailable = true
            item
        }
    }
    val chosen = remember { mutableStateListOf<CartAddon>() }
    val categories = fresh.addonCategories.filter { it.addons.isNotEmpty() }
    val unit = unitPriceOf(fresh.price, chosen.toList())

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(fresh.name) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (!fresh.description.isNullOrBlank()) Text(fresh.description!!, fontSize = 13.sp, color = Color.Gray)
                if (unavailable) Text("Este producto ya no está disponible.", color = MaterialTheme.colorScheme.error)
                categories.forEach { cat ->
                    Text(cat.name + if (cat.isSingleChoice) "  (elige 1)" else "  (elige varios)", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
                    cat.addons.filter { it.isActive }.forEach { addon ->
                        val on = chosen.any { it.id == addon.id }
                        val toggle = {
                            if (cat.isSingleChoice) {
                                chosen.removeAll { c -> cat.addons.any { it.id == c.id } }
                                if (!on) chosen.add(CartAddon(addon.id, addon.name, addon.price, cat.name))
                            } else if (on) chosen.removeAll { it.id == addon.id }
                            else chosen.add(CartAddon(addon.id, addon.name, addon.price, cat.name))
                        }
                        Row(
                            Modifier.fillMaxWidth().selectable(selected = on, role = if (cat.isSingleChoice) Role.RadioButton else Role.Checkbox, onClick = { toggle() }),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (cat.isSingleChoice) RadioButton(on, null) else Checkbox(on, null)
                            Text(addon.name, Modifier.weight(1f).padding(start = 8.dp), fontSize = 14.sp)
                            Text(app.price(addon.price), fontSize = 13.sp)
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (canOrder && !unavailable) Button(onClick = { onAdd(chosen.toList()) }) { Text("Agregar  ${app.price(unit)}") }
            else TextButton(onClick = onDismiss) { Text("Cerrar") }
        },
        dismissButton = if (canOrder && !unavailable) ({ TextButton(onClick = onDismiss) { Text("Cancelar") } }) else null,
    )
}
