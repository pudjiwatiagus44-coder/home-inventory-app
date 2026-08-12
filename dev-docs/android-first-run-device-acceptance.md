# Android 新用户引导真机验收清单

> 适用范围：Android 内测版 0.5.31 / code 37。验收前请先安装最新 APK，并准备好一个可注册的新邮箱账号。

## 准备

1. 手机开启“开发者选项”和“USB 调试”，用 USB 连接电脑，确认 `adb devices` 能列出设备。
2. 安装最新 APK：

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb install -r "C:\Users\Administrator\Desktop\home-inventory-app\android\app\build\outputs\apk\debug\app-debug.apk"
```

3. 若要让引导重新出现，可在安装后清空应用数据再启动：

```powershell
& $adb shell pm clear com.homeinventory.app.internal
& $adb shell am start -n com.homeinventory.app.internal/.MainActivity
```

## 验收步骤

1. 注册新账号并进入清单页，应看到欢迎介绍卡片，右上角有「✕」。
2. 点「开始使用」，引导应出现箭头指向右下角「+ 新增」；点「+ 新增」后自动进入下一步。
3. 物品表单内应出现引导箭头指向「识别名称」；点开后选择「拍照」，拍照后名称/备注自动回填或显示识别中。
4. 引导应指向「所属区域」：选择已有区域，或点「＋ 新增区域」在输入框填名称（如“厨房”）并点「添加」，新区域立即出现在列表并自动选中。
5. 引导应指向「位置」：选择已有位置，或点「＋ 新增位置」填名称（如“第一层”）并点「添加」，新位置立即出现且自动匹配刚选的区域。
6. 引导应提示「存入草稿箱」或「保存」：识别中可点「存入草稿箱」；识别完成也可直接「保存」。
7. 保存/存入草稿后，引导应指向顶部「草稿」；打开草稿箱能看到刚保存的草稿。
8. 任意一步点右上角「✕」后引导立即消失；杀掉 App 重新打开，引导不应再次自动弹出。

## 截图记录

每完成一步可截图保存到 `_tmp/acceptance/`：

```powershell
New-Item -ItemType Directory -Force -Path "C:\Users\Administrator\Desktop\home-inventory-app\_tmp\acceptance" | Out-Null
& $adb exec-out screencap -p > "C:\Users\Administrator\Desktop\home-inventory-app\_tmp\acceptance\01-welcome.png"
```

验收完成后把截图和结论记录到 `dev-docs/acceptance.md`。
