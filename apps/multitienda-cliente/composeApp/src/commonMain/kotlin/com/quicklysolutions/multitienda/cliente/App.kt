package com.quicklysolutions.multitienda.cliente

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.quicklysolutions.multitienda.cliente.ui.AppTheme
import com.quicklysolutions.multitienda.cliente.ui.LoadingBox
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.screens.AccountScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.AddressesScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.CartScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.CheckoutScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.FavoritesScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.ForgotPasswordScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.HomeScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.LocationScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.LoginOtpScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.LoginScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.NotificationsScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.OrderDetailScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.OrdersScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.ProfileScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.RateScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.RegisterScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.SearchScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.StoreScreen
import com.quicklysolutions.multitienda.cliente.ui.screens.WalletScreen

@Composable
fun App(platform: PlatformServices) {
    val app = remember { AppState(platform) }
    LaunchedEffect(Unit) { app.bootstrap() }
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(app.message) {
        app.message?.let { snackbar.showSnackbar(it); app.message = null }
    }

    AppTheme(app.primaryColor) {
        CompositionLocalProvider(LocalApp provides app) {
            PlatformBackHandler(enabled = app.nav.stack.size > 1) { app.nav.pop() }
            Scaffold(
                snackbarHost = { SnackbarHost(snackbar) },
                bottomBar = { if (app.nav.isTab) TabBar(app) },
            ) { padding ->
                Box(Modifier.padding(padding)) {
                    if (!app.ready) LoadingBox() else Router(app)
                }
            }
        }
    }
}

@Composable
private fun TabBar(app: AppState) {
    val current = app.nav.current
    NavigationBar {
        TabItem(app, Screen.Home, app.t("footerNearme", "Inicio"), Icons.Default.Home, current)
        TabItem(app, Screen.Search, app.t("footerExplore", "Buscar"), Icons.Default.Search, current)
        NavigationBarItem(
            selected = current == Screen.Cart,
            onClick = { app.nav.selectTab(Screen.Cart) },
            icon = {
                BadgedBox(badge = { if (app.cart.count > 0) Badge { Text(app.cart.count.toString()) } }) {
                    Icon(Icons.Default.ShoppingCart, null)
                }
            },
            label = { Text(app.t("footerCart", "Carrito")) },
        )
        TabItem(app, Screen.Account, app.t("footerAccount", "Cuenta"), Icons.Default.Person, current)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.TabItem(app: AppState, tab: Screen, label: String, icon: ImageVector, current: Screen) {
    NavigationBarItem(selected = current == tab, onClick = { app.nav.selectTab(tab) }, icon = { Icon(icon, null) }, label = { Text(label) })
}

@Composable
private fun Router(app: AppState) {
    when (val s = app.nav.current) {
        Screen.Home -> HomeScreen()
        Screen.Search -> SearchScreen()
        Screen.Cart -> CartScreen()
        Screen.Account -> AccountScreen()
        Screen.Location -> LocationScreen()
        is Screen.Store -> StoreScreen(s.slug)
        Screen.Checkout -> CheckoutScreen()
        Screen.Login -> LoginScreen()
        Screen.LoginOtp -> LoginOtpScreen()
        Screen.Register -> RegisterScreen()
        Screen.ForgotPassword -> ForgotPasswordScreen()
        Screen.Orders -> OrdersScreen()
        is Screen.OrderDetail -> OrderDetailScreen(s.uniqueId, s.initial)
        is Screen.Rate -> RateScreen(s.orderId)
        Screen.Addresses -> AddressesScreen()
        Screen.Wallet -> WalletScreen()
        Screen.Favorites -> FavoritesScreen()
        Screen.Notifications -> NotificationsScreen()
        Screen.Profile -> ProfileScreen()
    }
}
