package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.ErrorText
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.LoginPrompt
import com.quicklysolutions.multitienda.cliente.ui.userMessage
import kotlinx.coroutines.launch

@Composable
fun AccountScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var showLanguages by remember { mutableStateOf(false) }
    val user = app.user

    Column(Modifier.fillMaxSize()) {
        AppBar(app.t("accountMyAccount", "Mi cuenta"))
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            if (!app.isLoggedIn || user == null) {
                Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.Person, null, Modifier.size(64.dp), tint = Color.LightGray)
                    Text("Inicia sesión para acceder a tu cuenta", Modifier.padding(vertical = 12.dp), color = Color.Gray)
                    Button(onClick = { app.nav.push(Screen.Login) }, Modifier.fillMaxWidth()) { Text(app.t("cartLoginButtonText", "Iniciar sesión")) }
                    OutlinedButton(onClick = { app.nav.push(Screen.Register) }, Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Crear cuenta") }
                }
            } else {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    val avatar = app.image(user.avatar)
                    if (avatar != null) AsyncImage(avatar, null, Modifier.size(56.dp).clip(CircleShape), contentScale = ContentScale.Crop)
                    else Box(Modifier.size(56.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                        Text((user.name?.firstOrNull() ?: 'U').uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                    }
                    Column(Modifier.padding(start = 14.dp)) {
                        Text(user.name.orEmpty(), fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        Text(user.email.orEmpty(), fontSize = 13.sp, color = Color.Gray)
                        if (!user.phone.isNullOrBlank()) Text(user.phone, fontSize = 13.sp, color = Color.Gray)
                    }
                }
                MenuRow(Icons.AutoMirrored.Filled.ReceiptLong, app.t("accountMyOrders", "Mis pedidos")) { app.nav.push(Screen.Orders) }
                MenuRow(Icons.Default.LocationOn, app.t("accountManageAddress", "Mis direcciones")) { app.nav.push(Screen.Addresses) }
                MenuRow(Icons.Default.AccountBalanceWallet, app.walletName + " · " + app.price(user.walletBalance)) { app.nav.push(Screen.Wallet) }
                MenuRow(Icons.Default.Favorite, app.t("accountMyFavouriteStores", "Mis favoritos")) { app.nav.push(Screen.Favorites) }
                MenuRow(Icons.Default.Notifications, "Notificaciones") { app.nav.push(Screen.Notifications) }
                MenuRow(Icons.Default.Person, "Mi perfil") { app.nav.push(Screen.Profile) }
            }
            if (app.languages.size > 1) MenuRow(Icons.Default.Language, "Idioma") { showLanguages = true }
            if (app.isLoggedIn) {
                MenuRow(Icons.AutoMirrored.Filled.ExitToApp, app.t("accountLogout", "Cerrar sesión"), danger = true) {
                    app.logout()
                    app.nav.selectTab(Screen.Home)
                }
            }
        }
    }

    if (showLanguages) {
        AlertDialog(
            onDismissRequest = { showLanguages = false },
            title = { Text("Idioma") },
            text = {
                Column {
                    app.languages.forEach { l ->
                        Text(
                            l.languageName + if (l.id == app.languageId) "  ✓" else "",
                            Modifier.fillMaxWidth().clickable {
                                showLanguages = false
                                scope.launch { runCatching { app.selectLanguage(l) }.onFailure { app.message = it.userMessage() } }
                            }.padding(vertical = 12.dp),
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showLanguages = false }) { Text("Cerrar") } },
        )
    }
}

@Composable
private fun MenuRow(icon: ImageVector, text: String, danger: Boolean = false, onClick: () -> Unit) {
    val tint = if (danger) MaterialTheme.colorScheme.error else Color.Unspecified
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = if (danger) tint else MaterialTheme.colorScheme.primary)
        Text(text, Modifier.weight(1f).padding(start = 16.dp), color = tint)
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color.LightGray)
    }
}

@Composable
fun ProfileScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val user = app.user
    var tax by remember { mutableStateOf(user?.taxNumber.orEmpty()) }
    var avatar by remember { mutableStateOf(user?.avatar.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize()) {
        AppBar("Mi perfil", onBack = { app.nav.pop() })
        if (user == null) { LoginPrompt("Inicia sesión para ver tu perfil"); return@Column }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text("Nombre", fontSize = 12.sp, color = Color.Gray)
            Text(user.name.orEmpty(), Modifier.padding(bottom = 10.dp))
            Text("Correo", fontSize = 12.sp, color = Color.Gray)
            Text(user.email.orEmpty(), Modifier.padding(bottom = 10.dp))
            Text("Teléfono", fontSize = 12.sp, color = Color.Gray)
            Text(user.phone.orEmpty(), Modifier.padding(bottom = 16.dp))
            Field(tax, { tax = it }, app.t("accountTaxVatText", "Número de impuesto (RUC / NIT)"))
            Spacer(Modifier.height(8.dp))
            Field(avatar, { avatar = it }, "URL de tu foto de perfil")
            ErrorText(error)
            Button(
                enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                onClick = {
                    scope.launch {
                        busy = true; error = null
                        try {
                            if (tax.trim() != user.taxNumber.orEmpty()) app.api.updateTaxNumber(tax.trim())
                            if (avatar.trim() != user.avatar.orEmpty()) app.api.changeAvatar(avatar.trim())
                            app.updateUser { it.copy(taxNumber = tax.trim(), avatar = avatar.trim().ifBlank { null }) }
                            app.message = "Perfil actualizado"
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
