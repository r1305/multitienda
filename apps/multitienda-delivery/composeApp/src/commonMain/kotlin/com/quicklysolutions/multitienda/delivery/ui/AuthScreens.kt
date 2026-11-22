package com.quicklysolutions.multitienda.delivery.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.delivery.state.AppViewModel
import com.quicklysolutions.multitienda.delivery.state.AuthState
import com.quicklysolutions.multitienda.delivery.state.Screen

@Composable
fun LoginScreen(vm: AppViewModel, auth: AuthState) {
    var phone by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    AuthFrame("Inicia sesión como repartidor", auth) {
        OutlinedTextField(phone, { phone = it }, label = { Text("Teléfono") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
        OutlinedTextField(password, { password = it }, label = { Text("Contraseña") }, singleLine = true, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        SubmitButton("Iniciar sesión", auth.loading) { vm.login(phone, password) }
        TextButton({ vm.clearAuthMessages(); vm.push(Screen.Register) }) { Text("¿Quieres ser repartidor? Regístrate") }
    }
}

@Composable
fun RegisterScreen(vm: AppViewModel, auth: AuthState) {
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var vehicle by rememberSaveable { mutableStateOf("") }
    AuthFrame("Solicita tu registro como repartidor", auth) {
        OutlinedTextField(name, { name = it }, label = { Text("Nombre completo") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
        OutlinedTextField(phone, { phone = it }, label = { Text("Teléfono") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone))
        OutlinedTextField(password, { password = it }, label = { Text("Contraseña (mín. 8 caracteres)") }, singleLine = true, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
        OutlinedTextField(vehicle, { vehicle = it }, label = { Text("Número de vehículo (moto/bici)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        SubmitButton("Solicitar registro", auth.loading) { vm.register(name, email, phone, password, vehicle) }
        TextButton({ vm.clearAuthMessages(); vm.back() }) { Text("Ya tengo cuenta, iniciar sesión") }
    }
}

@Composable
private fun AuthFrame(subtitle: String, auth: AuthState, fields: @Composable () -> Unit) {
    Scaffold { pad ->
        Column(
            Modifier.padding(pad).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Delivery", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            Text(subtitle, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            auth.error?.let { ErrorBanner(it) }
            auth.info?.let { InfoBanner(it) }
            fields()
        }
    }
}

@Composable
private fun SubmitButton(label: String, loading: Boolean, onClick: () -> Unit) {
    Button(onClick, enabled = !loading, modifier = Modifier.fillMaxWidth()) {
        if (loading) CircularProgressIndicator(Modifier.padding(2.dp), strokeWidth = 2.dp) else Text(label)
    }
}
