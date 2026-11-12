package com.quicklysolutions.multitienda.delivery.state

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.quicklysolutions.multitienda.delivery.api.ApiResult
import com.quicklysolutions.multitienda.delivery.api.ApiResult.Fail
import com.quicklysolutions.multitienda.delivery.api.ApiResult.Kind
import com.quicklysolutions.multitienda.delivery.api.ApiResult.Ok
import com.quicklysolutions.multitienda.delivery.config.AppConfig
import com.quicklysolutions.multitienda.delivery.domain.Board
import com.quicklysolutions.multitienda.delivery.domain.OrderAction
import com.quicklysolutions.multitienda.delivery.domain.OrderFlow
import com.quicklysolutions.multitienda.delivery.model.AppNotification
import com.quicklysolutions.multitienda.delivery.model.AppSettings
import com.quicklysolutions.multitienda.delivery.model.BalanceResponse
import com.quicklysolutions.multitienda.delivery.model.ChatMessage
import com.quicklysolutions.multitienda.delivery.model.DeliveryProfile
import com.quicklysolutions.multitienda.delivery.model.EarningsSummary
import com.quicklysolutions.multitienda.delivery.model.GeoPoint
import com.quicklysolutions.multitienda.delivery.model.Order
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface Screen {
    data object Login : Screen
    data object Register : Screen
    data object Home : Screen
    data class Detail(val id: Int) : Screen
    data object Notifications : Screen
}

enum class HomeTab { ORDERS, HISTORY, EARNINGS, PROFILE }

enum class OrdersTab { AVAILABLE, ACTIVE }

data class AuthState(val loading: Boolean = false, val error: String? = null, val info: String? = null)

data class BoardState(
    val board: Board = Board(emptyList(), emptyList()),
    val loading: Boolean = false,
    val loaded: Boolean = false,
    val error: String? = null,
)

data class ListState<T>(val items: List<T> = emptyList(), val loading: Boolean = false, val error: String? = null)

data class EarningsState(
    val summary: EarningsSummary? = null,
    val balance: BalanceResponse? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

data class ProfileState(val profile: DeliveryProfile? = null, val loading: Boolean = false, val error: String? = null)

data class DetailState(
    val id: Int = 0,
    val order: Order? = null,
    val loading: Boolean = false,
    val acting: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    val pinDialog: Boolean = false,
    val pinError: String? = null,
)

class AppViewModel(private val c: AppContainer) : ViewModel() {
    private val api = c.api
    private val platform = c.platform

    val session = MutableStateFlow(c.sessions.current)
    val settings = MutableStateFlow(AppSettings())
    val stack = MutableStateFlow<List<Screen>>(listOf(if (session.value != null) Screen.Home else Screen.Login))
    val homeTab = MutableStateFlow(HomeTab.ORDERS)
    val ordersTab = MutableStateFlow(OrdersTab.AVAILABLE)
    val auth = MutableStateFlow(AuthState())
    val board = MutableStateFlow(BoardState())
    val history = MutableStateFlow(ListState<Order>())
    val earnings = MutableStateFlow(EarningsState())
    val profile = MutableStateFlow(ProfileState())
    val notifications = MutableStateFlow(ListState<AppNotification>())
    val detail = MutableStateFlow(DetailState())
    val locationGranted = platform.locationGranted

    private val ignored = mutableSetOf<Int>()
    private var location: GeoPoint? = null
    private var refreshJob: Job? = null

    init {
        viewModelScope.launch { (api.settings() as? Ok)?.let { settings.value = it.value } }
    }

    // ── Navegación ───────────────────────────────────────────────────────────

    fun push(s: Screen) = stack.update { it + s }

    fun back() {
        if (stack.value.size > 1) stack.update { it.dropLast(1) }
    }

    fun selectHomeTab(t: HomeTab) {
        homeTab.value = t
    }

    fun selectOrdersTab(t: OrdersTab) {
        ordersTab.value = t
    }

    fun requestPermissions() = platform.requestPermissions()

    // ── Sesión ───────────────────────────────────────────────────────────────

    fun login(phone: String, password: String) {
        if (phone.isBlank() || password.isBlank()) {
            auth.value = AuthState(error = "Ingresa teléfono y contraseña")
            return
        }
        auth.value = AuthState(loading = true)
        viewModelScope.launch {
            when (val r = api.login(phone.trim(), password)) {
                is Ok -> {
                    c.sessions.save(r.value)
                    session.value = r.value
                    auth.value = AuthState()
                    stack.value = listOf(Screen.Home)
                    homeTab.value = HomeTab.ORDERS
                }
                is Fail -> auth.value = AuthState(error = r.message)
            }
        }
    }

    fun register(name: String, email: String, phone: String, password: String, vehicle: String) {
        when {
            name.isBlank() || email.isBlank() || phone.isBlank() -> auth.value = AuthState(error = "Completa nombre, email y teléfono")
            password.length < 8 -> auth.value = AuthState(error = "La contraseña debe tener al menos 8 caracteres")
            else -> {
                auth.value = AuthState(loading = true)
                viewModelScope.launch {
                    when (val r = api.register(name.trim(), email.trim(), phone.trim(), password, vehicle.trim())) {
                        is Ok -> {
                            auth.value = AuthState(info = "Solicitud enviada. El administrador revisará tu registro y te notificará cuando seas aprobado.")
                            stack.value = listOf(Screen.Login)
                        }
                        is Fail -> auth.value = AuthState(error = r.message)
                    }
                }
            }
        }
    }

    fun clearAuthMessages() {
        auth.value = AuthState()
    }

    fun logout(notice: String? = null) {
        platform.stopTracking()
        c.sessions.clear()
        session.value = null
        refreshJob?.cancel()
        ignored.clear()
        board.value = BoardState()
        history.value = ListState()
        earnings.value = EarningsState()
        profile.value = ProfileState()
        notifications.value = ListState()
        detail.value = DetailState()
        auth.value = AuthState(error = notice)
        stack.value = listOf(Screen.Login)
    }

    /** Un 401 (token vencido / usuario inexistente) cierra la sesión; el resto se muestra como mensaje. */
    private fun failMessage(f: Fail): String {
        if (f.kind == Kind.UNAUTHORIZED) logout("Tu sesión expiró. Inicia sesión de nuevo.")
        return f.message
    }

    // ── Pedidos ──────────────────────────────────────────────────────────────

    fun refreshBoard() {
        if (session.value == null || refreshJob?.isActive == true) return
        refreshJob = viewModelScope.launch {
            board.update { it.copy(loading = !it.loaded) }
            platform.currentLocation()?.let { location = it }
            val available = api.availableOrders(location?.lat, location?.lng)
            val active = api.activeOrders()
            val av = (available as? Ok)?.value
            val ac = (active as? Ok)?.value
            if (av == null || ac == null) {
                val f = (available as? Fail) ?: (active as Fail)
                board.update { it.copy(loading = false, error = failMessage(f)) }
                return@launch
            }
            val b = OrderFlow.board(av, ac, ignored)
            board.value = BoardState(b, loading = false, loaded = true)
            if (OrderFlow.needsTracking(b.active)) platform.startTracking() else platform.stopTracking()
        }
    }

    fun ignoreOrder(orderId: Int) {
        viewModelScope.launch {
            when (val r = api.ignore(orderId)) {
                is Ok -> {
                    ignored += orderId
                    board.update { s -> s.copy(board = s.board.copy(available = s.board.available.filter { it.id != orderId })) }
                }
                is Fail -> board.update { it.copy(error = failMessage(r)) }
            }
        }
    }

    fun loadHistory() {
        history.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = api.completedOrders()) {
                is Ok -> history.value = ListState(r.value)
                is Fail -> history.value = ListState(error = failMessage(r))
            }
        }
    }

    fun loadEarnings() {
        earnings.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val e = api.earnings()
            val b = api.balance()
            val fail = (e as? Fail) ?: (b as? Fail)
            earnings.value = EarningsState(
                summary = (e as? Ok)?.value,
                balance = (b as? Ok)?.value,
                error = fail?.let { failMessage(it) },
            )
        }
    }

    fun loadProfile() {
        profile.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = api.profile()) {
                is Ok -> profile.value = ProfileState(r.value)
                is Fail -> profile.value = ProfileState(error = failMessage(r))
            }
        }
    }

    fun loadNotifications() {
        notifications.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = api.notifications()) {
                is Ok -> notifications.value = ListState(r.value)
                is Fail -> notifications.value = ListState(error = failMessage(r))
            }
        }
    }

    // ── Detalle del pedido ───────────────────────────────────────────────────

    fun openOrder(id: Int) {
        detail.value = DetailState(id = id, loading = true)
        push(Screen.Detail(id))
        viewModelScope.launch {
            when (val r = api.order(id)) {
                is Ok -> {
                    detail.update { it.copy(order = r.value, loading = false) }
                    if (OrderFlow.hasChat(r.value.statusId)) loadChat()
                }
                is Fail -> detail.update {
                    it.copy(loading = false, error = if (r.kind == Kind.FORBIDDEN) "El pedido ya no está disponible" else failMessage(r))
                }
            }
        }
    }

    fun closeDetail() {
        detail.value = DetailState()
        back()
    }

    /** Ejecuta una transición validando antes con [OrderFlow.apply]; el servidor decide en última instancia (409 si otro lo tomó). */
    fun act(action: OrderAction, pin: String? = null) {
        val d = detail.value
        val order = d.order ?: return
        if (d.acting) return
        val next = OrderFlow.apply(order.statusId, action) ?: return
        detail.update { it.copy(acting = true, error = null, notice = null, pinError = null) }
        viewModelScope.launch {
            val r = when (action) {
                OrderAction.ACCEPT -> api.accept(order.id)
                OrderAction.PICKUP -> api.pickup(order.id)
                OrderAction.DELIVER -> api.deliver(order.id, pin)
            }
            when (r) {
                is Ok -> {
                    detail.update {
                        it.copy(
                            order = order.copy(statusId = next),
                            acting = false,
                            pinDialog = false,
                            notice = when (action) {
                                OrderAction.ACCEPT -> "¡Pedido aceptado!"
                                OrderAction.PICKUP -> "¡Pedido recogido!"
                                OrderAction.DELIVER -> "¡Pedido entregado!"
                            },
                        )
                    }
                    refreshBoard()
                    if (OrderFlow.hasChat(next)) loadChat()
                }
                is Fail -> {
                    if (action == OrderAction.DELIVER && r.message.contains("PIN", ignoreCase = true)) {
                        detail.update { it.copy(acting = false, pinDialog = true, pinError = r.message) }
                    } else {
                        detail.update { it.copy(acting = false, error = failMessage(r)) }
                        if (r.kind == Kind.CONFLICT) {
                            (api.order(order.id) as? Ok)?.let { fresh -> detail.update { it.copy(order = fresh.value) } }
                            refreshBoard()
                        }
                    }
                }
            }
        }
    }

    fun requestDeliver() {
        if (settings.value.pinRequired) detail.update { it.copy(pinDialog = true, pinError = null) } else act(OrderAction.DELIVER)
    }

    fun dismissPinDialog() {
        detail.update { it.copy(pinDialog = false, pinError = null) }
    }

    fun loadChat() {
        val id = detail.value.order?.id ?: return
        viewModelScope.launch {
            when (val r = api.chat(id)) {
                is Ok -> detail.update { it.copy(messages = r.value) }
                is Fail -> if (r.kind == Kind.UNAUTHORIZED) failMessage(r)
            }
        }
    }

    fun sendChat(text: String) {
        val id = detail.value.order?.id ?: return
        val msg = text.trim()
        if (msg.isEmpty() || msg.length > AppConfig.CHAT_MAX_LENGTH) return
        viewModelScope.launch {
            when (val r = api.sendChat(id, msg)) {
                is Ok -> loadChat()
                is Fail -> detail.update { it.copy(error = failMessage(r)) }
            }
        }
    }

    fun openMap(app: com.quicklysolutions.multitienda.delivery.platform.MapApp, p: GeoPoint) = platform.openMap(app, p.lat, p.lng)
}
