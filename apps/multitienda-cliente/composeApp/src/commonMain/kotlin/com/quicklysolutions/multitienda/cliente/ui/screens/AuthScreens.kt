package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.AppState
import com.quicklysolutions.multitienda.cliente.Screen
import com.quicklysolutions.multitienda.cliente.data.AuthResult
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.ErrorText
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val EMAIL_RE = Regex("""^[^@\s]+@[^@\s]+\.[^@\s]+$""")
const val MIN_PASSWORD = 8

private suspend fun finishAuth(app: AppState, r: AuthResult, setError: (String?) -> Unit) {
    when (r) {
        is AuthResult.Ok -> {
            if (r.user.authToken.isNullOrBlank()) { setError("El servidor no devolvió la sesión"); return }
            app.onLoggedIn(r.user)
            app.afterLogin()
            val authScreens = setOf<Screen>(Screen.Login, Screen.LoginOtp, Screen.Register, Screen.ForgotPassword)
            while (app.nav.current in authScreens && app.nav.pop()) Unit
        }
        is AuthResult.Fail -> setError(r.message)
        AuthResult.EmailOrPhoneUsed -> setError("El correo o el teléfono ya están registrados")
    }
}

@Composable
private fun AuthScaffold(title: String, content: @Composable () -> Unit) {
    val app = LocalApp.current
    Column(Modifier.fillMaxSize()) {
        AppBar(title, onBack = { app.nav.pop() })
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
    }
}

@Composable
fun LoginScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AuthScaffold("Iniciar sesión") {
        Text(app.t("loginLoginTitle", "Bienvenido"), fontSize = 20.sp)
        Text(app.t("loginLoginSubTitle", "Inicia sesión para continuar"), color = Color.Gray, fontSize = 13.sp)
        Field(email, { email = it.trim() }, app.t("loginLoginEmailLabel", "Correo"), keyboard = KeyboardType.Email)
        Field(password, { password = it }, app.t("loginLoginPasswordLabel", "Contraseña"), password = true)
        ErrorText(error)
        Button(
            enabled = !busy && EMAIL_RE.matches(email) && password.isNotEmpty(), modifier = Modifier.fillMaxWidth(),
            onClick = {
                scope.launch {
                    busy = true; error = null
                    try { finishAuth(app, app.api.login(email, password)) { error = it } }
                    catch (e: CancellationException) { throw e }
                    catch (e: Exception) { error = e.userMessage() }
                    busy = false
                }
            },
        ) { Text(if (busy) "Cargando..." else "Iniciar sesión") }
        TextButton(onClick = { app.nav.push(Screen.LoginOtp) }) { Text("Ingresar con código por correo") }
        TextButton(onClick = { app.nav.push(Screen.ForgotPassword) }) { Text(app.t("forgotPasswordLinkText", "Olvidé mi contraseña")) }
        Row { Text(app.t("loginDontHaveAccount", "¿No tienes cuenta?"), Modifier.padding(top = 12.dp)); TextButton(onClick = { app.nav.push(Screen.Register) }) { Text("Regístrate") } }
    }
}

@Composable
fun LoginOtpScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AuthScaffold("Ingresar con código") {
        Text("Te enviaremos un código de un solo uso al correo de tu cuenta.", color = Color.Gray, fontSize = 13.sp)
        Field(phone, { phone = it.trim() }, app.t("loginLoginPhoneLabel", "Teléfono"), keyboard = KeyboardType.Phone, enabled = !sent)
        Field(email, { email = it.trim() }, "Correo (solo si aún no tienes cuenta)", keyboard = KeyboardType.Email)
        if (sent) {
            Field(code, { code = it.trim() }, "Código recibido", keyboard = KeyboardType.Number)
            Field(name, { name = it }, "Nombre (solo si es tu primera vez)")
        }
        ErrorText(error)
        Button(
            enabled = !busy && phone.length >= 6 && (!sent || code.isNotEmpty()), modifier = Modifier.fillMaxWidth(),
            onClick = {
                scope.launch {
                    busy = true; error = null
                    try {
                        if (!sent) {
                            if (app.api.generateOtpForLogin(phone, email.takeIf { EMAIL_RE.matches(it) })) sent = true
                            else error = "No se pudo enviar el código"
                        } else finishAuth(app, app.api.loginWithOtp(phone, code, name, email.takeIf { EMAIL_RE.matches(it) })) { error = it }
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) { error = e.userMessage() }
                    busy = false
                }
            },
        ) { Text(if (busy) "Enviando..." else if (sent) "Ingresar" else "Enviar código") }
    }
}

@Composable
fun RegisterScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var otpSent by remember { mutableStateOf(false) }
    var otp by remember { mutableStateOf("") }
    var verified by remember { mutableStateOf(false) }

    AuthScaffold(app.t("registerRegisterTitle", "Crear cuenta")) {
        Field(name, { name = it }, app.t("loginLoginNameLabel", "Nombre"))
        Field(email, { email = it.trim() }, app.t("loginLoginEmailLabel", "Correo"), keyboard = KeyboardType.Email)
        Field(phone, { phone = it.trim(); verified = false; otpSent = false }, app.t("loginLoginPhoneLabel", "Teléfono"), keyboard = KeyboardType.Phone)
        Field(password, { password = it }, "Contraseña (mínimo $MIN_PASSWORD caracteres)", password = true)

        // Verificacion opcional del telefono: /send-otp (codigo por correo) y /verify-otp.
        if (verified) Text("Teléfono verificado", color = Color(0xFF2E7D32), fontSize = 13.sp)
        else if (!otpSent) TextButton(
            enabled = !busy && phone.length >= 6 && EMAIL_RE.matches(email),
            onClick = {
                scope.launch {
                    busy = true; error = null
                    try { if (app.api.sendOtp(phone, email)) otpSent = true else error = "No se pudo enviar el código" }
                    catch (e: CancellationException) { throw e }
                    catch (e: Exception) { error = e.userMessage() }
                    busy = false
                }
            },
        ) { Text("Verificar mi teléfono (opcional)") }
        else Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Field(otp, { otp = it.trim() }, "Código recibido por correo", Modifier.weight(1f), KeyboardType.Number)
            TextButton(
                enabled = !busy && otp.isNotEmpty(),
                onClick = {
                    scope.launch {
                        busy = true; error = null
                        try {
                            val r = app.api.verifyOtp(phone, otp)
                            if (r.success) { verified = true; otpSent = false } else error = r.message ?: "Código inválido"
                        } catch (e: CancellationException) { throw e }
                        catch (e: Exception) { error = e.userMessage() }
                        busy = false
                    }
                },
            ) { Text("Verificar") }
        }

        ErrorText(error)
        Button(
            enabled = !busy && name.isNotBlank() && EMAIL_RE.matches(email) && phone.length >= 6 && password.length >= MIN_PASSWORD,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                scope.launch {
                    busy = true; error = null
                    try { finishAuth(app, app.api.register(name.trim(), email, phone, password)) { error = it } }
                    catch (e: CancellationException) { throw e }
                    catch (e: Exception) { error = e.userMessage() }
                    busy = false
                }
            },
        ) { Text(if (busy) "Creando..." else "Crear cuenta") }
    }
}

@Composable
fun ForgotPasswordScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(1) }
    var email by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AuthScaffold("Recuperar contraseña") {
        when (step) {
            1 -> {
                Text("Ingresa tu correo y te enviaremos un código para restablecer tu contraseña.", color = Color.Gray, fontSize = 13.sp)
                Field(email, { email = it.trim() }, "Correo", keyboard = KeyboardType.Email)
            }
            2 -> {
                Text("Ingresa el código enviado a $email", color = Color.Gray, fontSize = 13.sp)
                Field(code, { code = it.trim() }, "Código", keyboard = KeyboardType.Number)
            }
            else -> {
                Text("Ingresa tu nueva contraseña", color = Color.Gray, fontSize = 13.sp)
                Field(password, { password = it }, "Nueva contraseña (mínimo $MIN_PASSWORD caracteres)", password = true)
            }
        }
        ErrorText(error)
        Button(
            modifier = Modifier.fillMaxWidth(),
            enabled = !busy && when (step) { 1 -> EMAIL_RE.matches(email); 2 -> code.isNotEmpty(); else -> password.length >= MIN_PASSWORD },
            onClick = {
                scope.launch {
                    busy = true; error = null
                    try {
                        when (step) {
                            1 -> if (app.api.sendPasswordResetMail(email)) step = 2 else error = "No se pudo enviar el código"
                            2 -> { val r = app.api.verifyPasswordResetOtp(email, code); if (r.success) step = 3 else error = r.message ?: "Código inválido" }
                            else -> {
                                val r = app.api.changePassword(email, code, password)
                                if (r.success) { app.message = "Contraseña cambiada. Inicia sesión."; app.nav.pop() } else error = r.message ?: "No se pudo cambiar la contraseña"
                            }
                        }
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) { error = e.userMessage() }
                    busy = false
                }
            },
        ) { Text(if (busy) "Procesando..." else when (step) { 1 -> "Enviar código"; 2 -> "Verificar"; else -> "Cambiar contraseña" }) }
    }
}
