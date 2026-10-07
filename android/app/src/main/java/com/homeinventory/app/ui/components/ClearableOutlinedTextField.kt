package com.homeinventory.app.ui.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.VisualTransformation

@Composable
fun ClearInputButton(enabled: Boolean = true, onClick: () -> Unit) {
    IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.semantics { contentDescription = "清空输入" }) {
        Text("×", style = MaterialTheme.typography.titleLarge)
    }
}

/** Existing trailing content is retained; clear is always at the far right. */
@Composable
fun ClearableOutlinedTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    label: (@Composable () -> Unit)? = null,
    placeholder: (@Composable () -> Unit)? = null,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    singleLine: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    shape: Shape = OutlinedTextFieldDefaults.shape,
    colors: TextFieldColors = OutlinedTextFieldDefaults.colors(),
    textStyle: TextStyle = androidx.compose.ui.text.TextStyle.Default,
) {
    OutlinedTextField(value = value, onValueChange = onValueChange, modifier = modifier, enabled = enabled,
        readOnly = readOnly, label = label, placeholder = placeholder, leadingIcon = leadingIcon,
        trailingIcon = if (trailingIcon != null || (!readOnly && value.isNotEmpty())) { {
            Row {
                trailingIcon?.invoke()
                if (!readOnly && value.isNotEmpty()) ClearInputButton(enabled) { onValueChange("") }
            }
        } } else null,
        singleLine = singleLine, visualTransformation = visualTransformation, keyboardOptions = keyboardOptions,
        shape = shape, colors = colors, textStyle = textStyle,
    )
}
