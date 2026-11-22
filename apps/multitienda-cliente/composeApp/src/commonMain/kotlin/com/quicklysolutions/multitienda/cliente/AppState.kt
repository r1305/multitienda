package com.quicklysolutions.multitienda.cliente

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.quicklysolutions.multitienda.cliente.data.AddressDto
import com.quicklysolutions.multitienda.cliente.data.ApiClient
import com.quicklysolutions.multitienda.cliente.data.ApiException
import com.quicklysolutions.multitienda.cliente.data.ApiJson
import com.quicklysolutions.multitienda.cliente.data.LanguageDto
import com.quicklysolutions.multitienda.cliente.data.MultitiendaApi
import com.quicklysolutions.multitienda.cliente.data.Order
import com.quicklysolutions.multitienda.cliente.data.UserDto
import com.quicklysolutions.multitienda.cliente.data.UserInfoResponse
import com.quicklysolutions.multitienda.cliente.domain.AddResult
import com.quicklysolutions.multitienda.cliente.domain.CartLine
import com.quicklysolutions.multitienda.cliente.domain.CartRules
import com.quicklysolutions.multitienda.cliente.domain.CartState
import com.quicklysolutions.multitienda.cliente.domain.formatMoney
import com.quicklysolutions.multitienda.cliente.domain.resolveImageUrl
import com.quicklysolutions.multitienda.cliente.domain.siteBaseFromApi
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable

@Serializable
data class GeoLocation(val lat: Double, val lng: Double, val address: String = "")

sealed interface Screen {
    data object Home : Screen
    data object Search : Screen
    data object Cart : Screen
    data object Account : Screen
    data object Location : Screen
    data class Store(val slug: String) : Screen
    data object Checkout : Screen
    data object Login : Screen
    data object LoginOtp : Screen
    data object Register : Screen
    data object ForgotPassword : Screen
    data object Orders : Screen
    data class OrderDetail(val uniqueId: String, val initial: Order? = null) : Screen
    data class Rate(val orderId: Int) : Screen
    data object Addresses : Screen
    data object Wallet : Screen
    data object Favorites : Screen
    data object Notifications : Screen
    data object Profile : Screen
}

private val TABS = setOf<Screen>(Screen.Home, Screen.Search, Screen.Cart, Screen.Account)

class Navigator {
    val stack = mutableStateListOf<Screen>(Screen.Home)
    val current: Screen get() = stack.last()
    val isTab: Boolean get() = current in TABS

    fun push(s: Screen) { stack.add(s) }
    fun pop(): Boolean = if (stack.size > 1) { stack.removeAt(stack.lastIndex); true } else false
    fun selectTab(tab: Screen) {
        stack.clear()
        stack.add(Screen.Home)
        if (tab != Screen.Home) stack.add(tab)
    }
}

class AppState(val platform: PlatformServices) {
    val nav = Navigator()
    private val store = platform.store

    var settings by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var translations by mutableStateOf<Map<String, String>>(emptyMap())
        private set
    var languages by mutableStateOf<List<LanguageDto>>(emptyList())
        private set
    var languageId by mutableStateOf<Int?>(null)
        private set
    var user by mutableStateOf<UserDto?>(null)
        private set
    var token by mutableStateOf<String?>(null)
        private set
    var location by mutableStateOf<GeoLocation?>(null)
        private set
    var cart by mutableStateOf(CartState())
        private set
    var favorites by mutableStateOf<Set<Int>>(emptySet())
        private set
    var message by mutableStateOf<String?>(null)
    var ready by mutableStateOf(false)
        private set

    private val client = ApiClient(platform.createHttpClient(), platform.apiBaseUrl, { token }, { onSessionExpired() })
    val api = MultitiendaApi(client)

    val isLoggedIn: Boolean get() = token != null && user != null
    val siteBase: String get() = siteBaseFromApi(client.baseUrl)

    init {
        token = store.getString(K_TOKEN)
        user = store.getString(K_USER)?.let { runCatching { ApiJson.decodeFromString<UserDto>(it) }.getOrNull() }
        if (user == null) token = null
        location = store.getString(K_LOCATION)?.let { runCatching { ApiJson.decodeFromString<GeoLocation>(it) }.getOrNull() }
        cart = store.getString(K_CART)?.let { runCatching { ApiJson.decodeFromString<CartState>(it) }.getOrNull() } ?: CartState()
    }

    // ---- Presentacion ----
    val currencySymbol: String
        get() = settings["currencySymbol"]?.takeIf { it.isNotBlank() } ?: settings["currencyFormat"]?.takeIf { it.isNotBlank() } ?: "$"
    val storeName: String get() = settings["storeName"]?.takeIf { it.isNotBlank() } ?: "Multitienda"
    val primaryColor: String? get() = settings["primaryColor"]
    val walletName: String get() = settings["walletName"]?.takeIf { it.isNotBlank() } ?: "Billetera"
    val showDeliveryPin: Boolean get() = settings["enableDeliveryPin"] == "true"

    fun price(v: Double): String = formatMoney(v, currencySymbol, true)
    fun image(path: String?): String? = resolveImageUrl(path, siteBase)

    /** Texto traducido del servidor (/get-single-language) o el valor por defecto en espanol. */
    fun t(key: String, default: String): String = translations[key]?.takeIf { it.isNotBlank() } ?: default

    // ---- Arranque: /get-settings, /get-all-languages, /get-single-language, /check-ban ----
    suspend fun bootstrap() {
        discoverBase()
        runCatching { settings = api.settings() }
        runCatching {
            languages = api.languages()
            val saved = store.getString(K_LANG)?.toIntOrNull()
            val pick = languages.firstOrNull { it.id == saved } ?: languages.firstOrNull { it.isDefault }
            if (pick != null) selectLanguage(pick)
        }
        if (isLoggedIn) {
            runCatching { if (!api.checkBan()) { message = "Tu cuenta no está activa o fue suspendida"; logout() } }
            if (isLoggedIn) { runCatching { refreshUser() }; loadFavorites() }
        }
        ready = true
    }

    suspend fun selectLanguage(lang: LanguageDto) {
        translations = api.language(lang.id)
        languageId = lang.id
        store.putString(K_LANG, lang.id.toString())
    }

    /** Como la web (api.js resolveBase): si la URL configurada no responde, prueba rutas habituales del mismo origen. */
    private suspend fun discoverBase() {
        if (runCatching { api.settings() }.isSuccess) return
        val origin = Regex("^https?://[^/]+").find(client.baseUrl)?.value ?: return
        for (suffix in listOf("/apps/multitienda/api", "/multitienda/api", "/api", "/public/api", "/apps/multitienda/public/api")) {
            val candidate = origin + suffix
            if (candidate == client.baseUrl) continue
            val previous = client.baseUrl
            client.baseUrl = candidate
            if (runCatching { api.settings() }.isSuccess) return
            client.baseUrl = previous
        }
    }

    // ---- Sesion ----
    fun onLoggedIn(u: UserDto) {
        token = u.authToken
        user = u
        persistUser()
        message = null
    }

    suspend fun afterLogin() {
        loadFavorites()
    }

    fun logout() {
        token = null
        user = null
        favorites = emptySet()
        store.putString(K_TOKEN, null)
        store.putString(K_USER, null)
    }

    private fun onSessionExpired() {
        if (token != null) { message = "Tu sesión expiró. Inicia sesión de nuevo"; logout() }
    }

    private fun persistUser() {
        store.putString(K_TOKEN, token)
        store.putString(K_USER, user?.let { ApiJson.encodeToString(it) })
    }

    /** /update-user-info: datos frescos del perfil, billetera y direccion por defecto. Conserva el token. */
    suspend fun refreshUser(): UserInfoResponse {
        val r = api.userInfo()
        r.data?.let { user = it.copy(authToken = token, role = user?.role) ; persistUser() }
        return r
    }

    fun updateUser(transform: (UserDto) -> UserDto) {
        user = user?.let(transform)
        persistUser()
    }

    suspend fun loadFavorites() {
        if (!isLoggedIn) return
        val loc = location
        runCatching { favorites = api.favoriteStores(loc?.lat, loc?.lng).map { it.id }.toSet() }
    }

    /** Alinea el estado local con is_favorited de /get-restaurant-info-with-favourite (sin llamar al servidor). */
    fun syncFavorite(restaurantId: Int, value: Boolean) {
        if ((restaurantId in favorites) != value) favorites = if (value) favorites + restaurantId else favorites - restaurantId
    }

    /** /toggle-favorite alterna en el servidor; se actualiza la UI antes y se revierte si falla. */
    suspend fun toggleFavorite(restaurantId: Int): Boolean {
        if (!isLoggedIn) return false
        val before = favorites
        favorites = if (restaurantId in before) before - restaurantId else before + restaurantId
        return try {
            api.toggleFavorite(restaurantId)
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            favorites = before
            message = (e as? ApiException)?.message ?: "No se pudo actualizar el favorito"
            false
        }
    }

    // ---- Ubicacion ----
    fun chooseLocation(loc: GeoLocation) {
        location = loc
        store.putString(K_LOCATION, ApiJson.encodeToString(loc))
    }

    fun chooseLocation(a: AddressDto) {
        if (a.latitude != null && a.longitude != null) chooseLocation(GeoLocation(a.latitude, a.longitude, a.address.orEmpty()))
    }

    // ---- Carrito ----
    fun addToCart(line: CartLine): AddResult {
        val r = CartRules.add(cart.lines, line)
        if (r is AddResult.Added) updateCart(cart.copy(lines = r.lines))
        return r
    }

    fun updateCart(next: CartState) {
        cart = if (next.lines.isEmpty()) CartState() else next
        store.putString(K_CART, ApiJson.encodeToString(cart))
    }

    fun clearCart() = updateCart(CartState())

    companion object {
        const val K_TOKEN = "token"
        const val K_USER = "user"
        const val K_LOCATION = "location"
        const val K_CART = "cart"
        const val K_LANG = "lang"
    }
}
