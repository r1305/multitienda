package com.quicklysolutions.multitienda.cliente.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.quicklysolutions.multitienda.cliente.AppState
import com.quicklysolutions.multitienda.cliente.data.ApiException
import com.quicklysolutions.multitienda.cliente.data.StoreSummary
import com.quicklysolutions.multitienda.cliente.domain.OrderStatus
import kotlinx.coroutines.CancellationException

val LocalApp = staticCompositionLocalOf<AppState> { error("AppState no disponible") }

private val DefaultPrimary = Color(0xFFFF5722)

fun parseHexColor(hex: String?): Color? {
    val h = hex?.trim()?.removePrefix("#") ?: return null
    if (h.length != 6 && h.length != 8) return null
    val v = h.toLongOrNull(16) ?: return null
    return if (h.length == 6) Color(0xFF000000 or v) else Color(v)
}

@Composable
fun AppTheme(primaryHex: String?, content: @Composable () -> Unit) {
    val scheme: ColorScheme = lightColorScheme(
        primary = parseHexColor(primaryHex) ?: DefaultPrimary,
        background = Color(0xFFF5F5F5),
        surface = Color.White,
    )
    MaterialTheme(colorScheme = scheme, content = content)
}

fun Throwable.userMessage(): String = (this as? ApiException)?.message ?: "Ocurrió un error. Intenta de nuevo"

// ---- Carga asincrona con reintento ----
sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Err(val message: String) : Load<Nothing>
}

class LoadHolder<T> {
    var state by mutableStateOf<Load<T>>(Load.Loading)
    internal var tick by mutableIntStateOf(0)
    fun reload() { tick++ }
}

@Composable
fun <T> rememberLoad(key: Any?, block: suspend () -> T): LoadHolder<T> {
    val holder = remember(key) { LoadHolder<T>() }
    val current by rememberUpdatedState(block)
    LaunchedEffect(key, holder.tick) {
        holder.state = Load.Loading
        holder.state = try {
            Load.Ok(current())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Load.Err(e.userMessage())
        }
    }
    return holder
}

@Composable
fun <T> LoadView(holder: LoadHolder<T>, content: @Composable (T) -> Unit) {
    when (val s = holder.state) {
        Load.Loading -> LoadingBox()
        is Load.Err -> ErrorBox(s.message) { holder.reload() }
        is Load.Ok -> content(s.value)
    }
}

// ---- Piezas basicas ----
@Composable
fun AppBar(title: String, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 2.dp) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver") }
            } else Spacer(Modifier.width(12.dp))
            Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            actions()
        }
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier.fillMaxSize()) {
    Box(modifier, contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun ErrorBox(message: String, onRetry: (() -> Unit)? = null) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
        if (onRetry != null) { Spacer(Modifier.height(12.dp)); Button(onClick = onRetry) { Text("Reintentar") } }
    }
}

@Composable
fun EmptyBox(text: String, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(text, textAlign = TextAlign.Center, color = Color.Gray)
        if (action != null) { Spacer(Modifier.height(12.dp)); action() }
    }
}

@Composable
fun LoginPrompt(text: String) {
    val app = LocalApp.current
    EmptyBox(text) { Button(onClick = { app.nav.push(com.quicklysolutions.multitienda.cliente.Screen.Login) }) { Text("Iniciar sesión") } }
}

@Composable
fun RemoteImage(url: String?, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop) {
    val shape = RoundedCornerShape(10.dp)
    if (url == null) {
        Box(modifier.clip(shape).background(Color(0xFFEEEEEE)), contentAlignment = Alignment.Center) { Text("Sin foto", fontSize = 10.sp, color = Color(0xFFBBBBBB)) }
    } else {
        AsyncImage(model = url, contentDescription = null, modifier = modifier.clip(shape).background(Color(0xFFEEEEEE)), contentScale = contentScale)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier.padding(horizontal = 16.dp, vertical = 10.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
}

@Composable
fun BillRow(label: String, value: String, bold: Boolean = false, color: Color = Color.Unspecified) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, color = color)
        Text(value, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal, color = color)
    }
}

@Composable
fun QtyControl(qty: Int, onMinus: () -> Unit, onPlus: () -> Unit, trashAtOne: Boolean = false) {
    Row(
        Modifier.clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onMinus, Modifier.size(34.dp)) {
            Icon(if (trashAtOne && qty <= 1) Icons.Default.Delete else Icons.Default.Remove, contentDescription = "Quitar", tint = MaterialTheme.colorScheme.primary)
        }
        Text(qty.toString(), fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 4.dp))
        IconButton(onClick = onPlus, Modifier.size(34.dp)) { Icon(Icons.Default.Add, contentDescription = "Agregar", tint = MaterialTheme.colorScheme.primary) }
    }
}

@Composable
fun StatusChip(statusId: Int) {
    Text(
        OrderStatus.label(statusId), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Color(OrderStatus.color(statusId))).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    keyboard: KeyboardType = KeyboardType.Text,
    password: Boolean = false,
    singleLine: Boolean = true,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = value, onValueChange = onChange, label = { Text(label) }, singleLine = singleLine, enabled = enabled,
        modifier = modifier.fillMaxWidth(),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = keyboard),
        visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
    )
}

@Composable
fun ErrorText(text: String?) {
    if (!text.isNullOrBlank()) Text(text, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.padding(vertical = 4.dp))
}

@Composable
fun Banner(text: String, color: Color = Color(0xFFFFF3E0), modifier: Modifier = Modifier) {
    Text(text, modifier.fillMaxWidth().background(color).padding(12.dp), fontSize = 13.sp)
}

@Composable
fun StoreCard(store: StoreSummary, favorite: Boolean?, onFavorite: (() -> Unit)?, onClick: () -> Unit) {
    val app = LocalApp.current
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = if (store.isActive) Color.White else Color(0xFFEEEEEE)),
    ) {
        Row(Modifier.padding(10.dp)) {
            RemoteImage(app.image(store.image), Modifier.size(84.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(store.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!store.description.isNullOrBlank()) Text(store.description, fontSize = 12.sp, color = Color.Gray, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!store.isActive) Text("Cerrado", fontSize = 11.sp, color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                else if (store.isFeatured) Text(store.customFeaturedName ?: "Destacado", fontSize = 11.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Default.Star, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                    Text(store.ratingText, fontSize = 12.sp)
                    Icon(Icons.Default.Schedule, null, Modifier.size(14.dp), tint = Color.Gray)
                    Text("${store.deliveryTime ?: "?"} min", fontSize = 12.sp)
                    store.distance?.let { Text("${(kotlin.math.round(it * 10) / 10)} km", fontSize = 12.sp, color = Color.Gray) }
                }
            }
            if (onFavorite != null && favorite != null) {
                IconButton(onClick = onFavorite) {
                    Icon(if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, "Favorito", tint = if (favorite) Color(0xFFE91E63) else Color.Gray)
                }
            }
        }
    }
}

@Composable
fun TextLink(text: String, onClick: () -> Unit) {
    TextButton(onClick = onClick) { Text(text) }
}
