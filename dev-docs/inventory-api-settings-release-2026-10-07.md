# 个人 API 设置发布准备

## 状态

2026-10-07 用户回复“确定”，明确授权备份服务器、更新服务端、发布 0.5.35 APK并重启服务。按下列已确认清单实施；不使用真实个人 Key、照片或用户正文做 smoke，不打印环境秘密。

## 发布内容

- 本地功能提交 `68a40f9`，验收记录修正 `28c85f3`：Android 设置与个人 DeepSeek 凭据管理、库存 DeepSeek 识别、输入清除和草稿重试。
- 公网只读 `https://homestorag.xyz/apk/version.json` 返回当前 0.5.34 / code 40；待发布 APK 定为 0.5.35 / code 41，避免手机将新包判作降级。
- Next.js 独立 `tsconfig.build.json` 保持严格检查业务源码和生成的路由类型；单元测试继续由 Vitest/JUnit 独立执行，全仓测试类型错误仍保留在原 tsconfig 检查结果中，不配置 ignoreBuildErrors。
- 本轮没有 schema 迁移；复用已经部署的 DeepSeek 托管表及既有主密钥。授权后若检查发现必要表/主密钥未配置，停止切换并报告，不临时修改密钥或 schema。

## 本地发布验证（已完成）

- `npm run build` 成功，包含 Next.js 编译、严格 TypeScript 检查、静态页面生成；Build ID 为 `HNKiG34BR5mGfHevgWXsJ`。
- 0.5.35/code 41 APK 重新构建成功，92 项 Android 单元测试通过。
- 本机生产模式 smoke：`GET /login` 为 200；未登录 `GET /api/recognition`、`GET /api/bookkeeping/deepseek-credential`、`GET /api/mobile/inventory/snapshot` 和 `POST /api/recognition?provider=DEEPSEEK` 均为 401。
- 发布材料位于忽略目录 `exports/releases/inventory-api-settings-20261007/`：APK、version.json、服务端 tar.gz、manifest.json。服务端包不含环境文件、私钥、数据库、照片、node_modules 或 Git 元数据；不覆盖服务器原有 public/、data/。
- 代码提交 `a79784c`；产物清单记录 SHA-256 和大小。服务器包需要沿用 Linux 运行依赖，不能把 Windows node_modules 上传。

## 已授权的执行清单

服务器预检发现本地缺少已上线的四处记账兼容修复：重新识别允许省略 categories；DeepSeek 文本/图像 provider 使用非思考模式。当前发布必须保留这四处线上行为，先将服务器现有代码同步到本地并重新验证、构建和打包，避免本次库存功能发布造成记账回归。此处保留线上原状，不接入新服务或扩大产品范围。

1. 检查服务器当前版本与服务状态，记录版本/路由，不读取或打印用户 Key、环境文件内容或数据库密码。
2. 在服务器本地备份现有应用目录、数据库及 latest APK/version.json；备份不下载至仓库。
3. 在本机完成构建后上传服务端产物，在 staging 目录准备；保留原 `data/`、`public/`、APK、运行账号与环境配置。
4. 切换应用后重启 `home-inventory-app.service`；无登录 smoke 检查登录页面、识别能力 GET 的 401、凭据接口 401 与既有接口。
5. 上传 0.5.35 APK 与 UTF-8 无 BOM version.json，确认版本 code 41、APK hash/size 正确。
6. 检查失败恢复旧应用目录及 APK/version.json，并重启恢复；不执行数据库恢复，因为本轮没有数据库结构修改。

## 发布限制

Windows 上的 Next.js 构建需确认运行依赖可以在 Linux 服务端使用，不能直接上传 Windows node_modules。不在小内存服务器重复构建；服务端依赖准备沿用已确认路线。

真实 Key 连通性与真机操作由用户在设置内主动验证，本轮发布 smoke 不使用真实个人 Key 或物品照片。
