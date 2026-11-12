package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.SearchResponse
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.EmptyBox
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.Load
import com.quicklysolutions.multitienda.cliente.ui.LoadingBox
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.RemoteImage
import com.quicklysolutions.multitienda.cliente.ui.SectionTitle
import com.quicklysolutions.multitienda.cliente.ui.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private const val MIN_QUERY = 3

@Composable
fun SearchScreen() {
    val app = LocalApp.current
    var query by remember { mutableStateOf("") }
    val q = query.trim()

    val result by produceState<Load<SearchResponse>?>(null, q) {
        if (q.length < MIN_QUERY) { value = null; return@produceState }
        delay(400)
        value = Load.Loading
        val loc = app.location
        value = try {
            Load.Ok(app.api.searchStores(loc?.lat, loc?.lng, q))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Load.Err(e.userMessage())
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppBar(app.t("footerExplore", "Buscar"))
        Field(query, { query = it }, "Buscar comercios o productos", Modifier.padding(16.dp))
        when (val r = result) {
            null -> EmptyBox(app.t("searchAtleastThreeCharsMsg", "Escribe al menos 3 caracteres"))
            Load.Loading -> LoadingBox()
            is Load.Err -> EmptyBox(r.message)
            is Load.Ok -> {
                val data = r.value
                if (data.restaurants.isEmpty() && data.items.isEmpty()) EmptyBox("Sin resultados")
                else LazyColumn(Modifier.fillMaxSize()) {
                    if (data.restaurants.isNotEmpty()) {
                        item { SectionTitle("Comercios") }
                        items(data.restaurants, key = { "s${it.id}" }) { StoreRow(it) }
                    }
                    if (data.items.isNotEmpty()) {
                        item { SectionTitle("Productos") }
                        items(data.items, key = { "i${it.id}" }) { item ->
                            Row(
                                Modifier.fillMaxWidth().clickable { item.restaurant?.slug?.takeIf { it.isNotBlank() }?.let { app.nav.push(Screen.Store(it)) } }.padding(horizontal = 16.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                RemoteImage(app.image(item.image), Modifier.size(56.dp))
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(item.name, fontWeight = FontWeight.Medium)
                                    Text(item.restaurant?.name.orEmpty(), fontSize = 12.sp, color = Color.Gray)
                                }
                                Text(app.price(item.price), fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }
    }
}
