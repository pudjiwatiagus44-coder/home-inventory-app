# 个人 API 设置发布准备

## 状态

2026-10-07 用户要求继续。当前只进行本地发布准备；生产操作确认尚未取得，不连接 SSH、不读取服务器密钥或真实用户数据、不上传、不重启服务。

## 发布内容

- 本地功能提交 `68a40f9`，验收记录修正 `28c85f3`：Android 设置与个人 DeepSeek 凭据管理、库存 DeepSeek 识别、输入清除和草稿重试。
- 公网只读 `https://homestorag.xyz/apk/version.json` 返回当前 0.5.34 / code 40；待发布 APK 定为 0.5.35 / code 41，避免手机将新包判作降级。
- Next.js 独立 `tsconfig.build.json` 保持严格检查业务源码和生成的路由类型；单元测试继续由 Vitest/JUnit 独立执行，全仓测试类型错误仍保留在原 tsconfig 检查结果中，不配置 ignoreBuildErrors。
- 本轮没有 schema 迁移；复用已经部署的 DeepSeek 托管表及既有主密钥。授权后若检查发现必要表/主密钥未配置，停止切换并报告，不临时修改密钥或 schema。

## 生产操作待确认

1. 检查服务器当前版本与服务状态，记录版本/路由，不读取或打印用户 Key、环境文件内容或数据库密码。
2. 在服务器本地备份现有应用目录、数据库及 latest APK/version.json；备份不下载至仓库。
3. 在本机完成构建后上传服务端产物，在 staging 目录准备；保留原 `data/`、`public/`、APK、运行账号与环境配置。
4. 切换应用后重启 `home-inventory-app.service`；无登录 smoke 检查登录页面、识别能力 GET 的 401、凭据接口 401 与既有接口。
5. 上传 0.5.35 APK 与 UTF-8 无 BOM version.json，确认版本 code 41、APK hash/size 正确。
6. 检查失败恢复旧应用目录及 APK/version.json，并重启恢复；不执行数据库恢复，因为本轮没有数据库结构修改。

## 发布限制

Windows 上的 Next.js 构建需确认运行依赖可以在 Linux 服务端使用，不能直接上传 Windows node_modules。不在小内存服务器重复构建；服务端依赖准备沿用已确认路线。

真实 Key 连通性与真机操作由用户在设置内主动验证，本轮发布 smoke 不使用真实个人 Key 或物品照片。
