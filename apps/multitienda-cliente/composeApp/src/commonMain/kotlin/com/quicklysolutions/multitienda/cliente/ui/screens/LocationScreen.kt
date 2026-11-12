package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.GeoLocation
import com.quicklysolutions.multitienda.cliente.LocationResult
import com.quicklysolutions.multitienda.cliente.data.AddressDto
import com.quicklysolutions.multitienda.cliente.data.PlaceDto
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.ErrorText
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.LoadingBox
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.SectionTitle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

fun locationErrorText(r: LocationResult): String = when (r) {
    LocationResult.PermissionDenied -> "Activa el permiso de ubicación para la app en los Ajustes del teléfono."
    LocationResult.ServicesOff -> "Los servicios de ubicación están desactivados. Enciende el GPS e inténtalo de nuevo."
    else -> "No se pudo obtener la ubicación"
}

@Composable
fun LocationScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val results by produceState(emptyList<PlaceDto>(), query) {
        if (query.trim().length < 2) { value = emptyList(); return@produceState }
        delay(400)
        value = runCatching { app.api.searchLocation(query.trim()) }.getOrDefault(emptyList())
    }
    val popular by produceState(emptyList<PlaceDto>()) { value = runCatching { app.api.popularLocations() }.getOrDefault(emptyList()) }
    val addresses by produceState(emptyList<AddressDto>(), app.isLoggedIn) {
        value = if (app.isLoggedIn) runCatching { app.api.addresses() }.getOrDefault(emptyList()) else emptyList()
    }

    fun choose(loc: GeoLocation) {
        app.chooseLocation(loc)
        scope.launch { app.loadFavorites() }
        app.nav.pop()
    }

    Column(Modifier.fillMaxSize()) {
        AppBar("Seleccionar ubicación", onBack = { app.nav.pop() })
        if (busy) { LoadingBox(); return@Column }
        LazyColumn(Modifier.fillMaxSize()) {
            item {
                Row(
                    Modifier.fillMaxWidth().clickable {
                        scope.launch {
                            busy = true; error = null
                            when (val r = app.platform.currentLocation()) {
                                is LocationResult.Found -> {
                                    val addr = runCatching { app.api.coordinateToAddress(r.lat, r.lng) }.getOrDefault("")
                                    choose(GeoLocation(r.lat, r.lng, addr.ifBlank { "${fmt4(r.lat)}, ${fmt4(r.lng)}" }))
                                }
                                else -> error = locationErrorText(r)
                            }
                            busy = false
                        }
                    }.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.MyLocation, null, tint = MaterialTheme.colorScheme.primary)
                    Text("Usar mi ubicación actual", Modifier.padding(start = 12.dp), fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)
                }
                ErrorText(error)
                Field(query, { query = it }, "Buscar zona o dirección", Modifier.padding(horizontal = 16.dp))
                if (query.trim().length >= 3) {
                    TextButton(
                        onClick = {
                            scope.launch {
                                busy = true; error = null
                                val c = runCatching { app.api.addressToCoordinate(query.trim()) }.getOrNull()
                                if (c != null) choose(GeoLocation(c.first, c.second, query.trim())) else error = "No se encontró esa dirección"
                                busy = false
                            }
                        },
                        Modifier.padding(horizontal = 8.dp),
                    ) { Icon(Icons.Default.Search, null); Text("  Buscar «${query.trim()}» en el mapa") }
                }
            }
            if (results.isNotEmpty()) {
                item { SectionTitle("Resultados") }
                items(results, key = { "r${it.id}" }) { p -> PlaceRow(p.name) { p.latitude?.let { la -> p.longitude?.let { lo -> choose(GeoLocation(la, lo, p.name)) } } } }
            }
            if (app.isLoggedIn && addresses.isNotEmpty()) {
                item { SectionTitle("Mis direcciones") }
                items(addresses, key = { "a${it.id}" }) { a ->
                    PlaceRow(listOfNotNull(a.tag, a.address).joinToString(" · ")) {
                        if (a.latitude != null && a.longitude != null) choose(GeoLocation(a.latitude, a.longitude, a.address.orEmpty()))
                    }
                }
            } else if (!app.isLoggedIn) {
                item { Text("Inicia sesión para ver tus direcciones guardadas", Modifier.padding(16.dp), fontSize = 12.sp, color = Color.Gray) }
            }
            if (popular.isNotEmpty()) {
                item { SectionTitle("Lugares populares") }
                items(popular, key = { "p${it.id}" }) { p -> PlaceRow(p.name) { p.latitude?.let { la -> p.longitude?.let { lo -> choose(GeoLocation(la, lo, p.name)) } } } }
            }
        }
    }
}

@Composable
private fun PlaceRow(text: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.LocationOn, null, tint = Color.Gray)
        Text(text, Modifier.padding(start = 12.dp), fontSize = 14.sp)
    }
}

private fun fmt4(v: Double): String = (kotlin.math.round(v * 10000) / 10000).toString()
