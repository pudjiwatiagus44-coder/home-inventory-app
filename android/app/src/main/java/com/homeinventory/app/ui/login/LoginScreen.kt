package com.homeinventory.app.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

private val EMAIL_PATTERN = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

@Composable
fun LoginScreen(
    email: String,
    password: String,
    serverUrl: String,
    isLoading: Boolean,
    errorMessage: String?,
    rememberEmail: Boolean,
    onRememberEmailChange: (Boolean) -> Unit,
    forgotPasswordNotice: String?,
    onClearForgotPasswordNotice: () -> Unit,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onLogin: () -> Unit,
    onRegister: () -> Unit,
    onForgotPassword: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var isSignUp by remember { mutableStateOf(false) }
    var confirmPassword by remember { mutableStateOf("") }
    var formError by remember { mutableStateOf<String?>(null) }
    var showForgotPassword by remember { mutableStateOf(false) }

    fun switchMode() {
        isSignUp = !isSignUp
        confirmPassword = ""
        formError = null
    }

    fun submit() {
        formError = null

        if (isSignUp) {
            if (!EMAIL_PATTERN.matches(email.trim())) {
                formError = "请输入有效邮箱"
                return
            }
            if (password.length < 8) {
                formError = "密码至少需要 8 位"
                return
            }
            if (password != confirmPassword) {
                formError = "两次输入的密码不一致"
                return
            }
            onRegister()
        } else {
            onLogin()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "家庭物品",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "登录后同步你的物品清单",
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = "服务器：$serverUrl",
            style = MaterialTheme.typography.bodySmall,
        )

        Spacer(modifier = Modifier.height(28.dp))

        OutlinedTextField(
            value = email,
            onValueChange = onEmailChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("邮箱") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = password,
            onValueChange = onPasswordChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("密码") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )

        if (isSignUp) {
            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = confirmPassword,
                onValueChange = { confirmPassword = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("确认密码") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
        }

        val displayError = formError ?: errorMessage
        if (displayError != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = displayError,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        if (!isSignUp) {
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = { showForgotPassword = true }) {
                    Text("忘记密码？")
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Button(
            onClick = ::submit,
            enabled = !isLoading &&
                email.isNotBlank() &&
                password.isNotBlank() &&
                (!isSignUp || confirmPassword.isNotBlank()),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                when {
                    isLoading -> "处理中..."
                    isSignUp -> "注册"
                    else -> "登录"
                },
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Checkbox(
                checked = rememberEmail,
                onCheckedChange = onRememberEmailChange,
            )
            Text(
                text = "记住邮箱",
                style = MaterialTheme.typography.bodyMedium,
            )
        }

        TextButton(
            onClick = ::switchMode,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (isSignUp) "已有账号？登录" else "没有账号？注册")
        }
    }

    if (showForgotPassword) {
        ForgotPasswordDialog(
            notice = forgotPasswordNotice,
            isLoading = isLoading,
            onDismiss = {
                showForgotPassword = false
                onClearForgotPasswordNotice()
            },
            onSubmit = onForgotPassword,
        )
    }
}
