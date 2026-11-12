package com.quicklysolutions.multitienda.delivery

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.quicklysolutions.multitienda.delivery.state.AppContainer
import com.quicklysolutions.multitienda.delivery.state.AppViewModel
import com.quicklysolutions.multitienda.delivery.state.Screen
import com.quicklysolutions.multitienda.delivery.ui.DeliveryTheme
import com.quicklysolutions.multitienda.delivery.ui.DetailScreen
import com.quicklysolutions.multitienda.delivery.ui.HomeScreen
import com.quicklysolutions.multitienda.delivery.ui.LoginScreen
import com.quicklysolutions.multitienda.delivery.ui.NotificationsScreen
import com.quicklysolutions.multitienda.delivery.ui.RegisterScreen

/** [backHandler] lo aporta cada plataforma (Android: androidx.activity.compose.BackHandler). */
@Composable
fun App(container: AppContainer, backHandler: @Composable (enabled: Boolean, onBack: () -> Unit) -> Unit) {
    DeliveryTheme {
        val vm = viewModel { AppViewModel(container) }
        val stack by vm.stack.collectAsState()
        val auth by vm.auth.collectAsState()
        val top = stack.last()

        backHandler(stack.size > 1) {
            if (top is Screen.Detail) vm.closeDetail() else vm.back()
        }

        when (top) {
            Screen.Login -> LoginScreen(vm, auth)
            Screen.Register -> RegisterScreen(vm, auth)
            Screen.Home -> HomeScreen(vm)
            is Screen.Detail -> DetailScreen(vm)
            Screen.Notifications -> NotificationsScreen(vm)
        }
    }
}
