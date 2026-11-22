package com.quicklysolutions.multitienda.cliente.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quicklysolutions.multitienda.cliente.ui.AppBar
import com.quicklysolutions.multitienda.cliente.ui.EmptyBox
import com.quicklysolutions.multitienda.cliente.ui.ErrorText
import com.quicklysolutions.multitienda.cliente.ui.Field
import com.quicklysolutions.multitienda.cliente.ui.LoadView
import com.quicklysolutions.multitienda.cliente.ui.LocalApp
import com.quicklysolutions.multitienda.cliente.ui.rememberLoad
import kotlinx.coroutines.launch

@Composable
fun RateScreen(orderId: Int) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val load = rememberLoad(orderId) { app.api.ratableOrder(orderId) }
    var store by remember { mutableStateOf(0) }
    var delivery by remember { mutableStateOf(0) }
    var comment by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize()) {
        AppBar("Calificar pedido", onBack = { app.nav.pop() })
        LoadView(load) { ratable ->
            if (ratable == null) { EmptyBox("Este pedido no se puede calificar (ya fue calificado o no fue entregado)"); return@LoadView }
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("¿Cómo fue tu experiencia?", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Spacer(Modifier.height(20.dp))
                Text("Comercio", color = Color.Gray)
                Stars(store) { store = it }
                Spacer(Modifier.height(16.dp))
                Text("Repartidor (opcional)", color = Color.Gray)
                Stars(delivery) { delivery = it }
                Spacer(Modifier.height(16.dp))
                Field(comment, { comment = it }, "Comentario (opcional)", singleLine = false)
                ErrorText(error)
                Spacer(Modifier.height(16.dp))
                Button(
                    enabled = store in 1..5 && !busy,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        scope.launch {
                            busy = true; error = null
                            val r = runCatching { app.api.rateOrder(orderId, store, delivery, comment.trim()) }.getOrNull()
                            if (r?.success == true) { app.message = "¡Gracias por tu calificación!"; app.nav.pop() }
                            else error = r?.message ?: "No se pudo enviar la calificación"
                            busy = false
                        }
                    },
                ) { Text(if (busy) "Enviando..." else "Enviar calificación") }
            }
        }
    }
}

@Composable
private fun Stars(value: Int, onChange: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.Center) {
        for (i in 1..5) {
            IconButton(onClick = { onChange(if (value == i) 0 else i) }) {
                Icon(Icons.Default.Star, "$i", Modifier.size(34.dp), tint = if (i <= value) Color(0xFFFFC107) else Color(0xFFDDDDDD))
            }
        }
    }
}
