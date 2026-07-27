# 阿里云测试环境部署清单

> 适用范围：阿里云轻量应用服务器测试环境。本文不代表生产上线完成，不写入真实密码、私钥、数据库连接串或真实用户数据。

## 基本信息

- 环境名称：`aliyun-test`
- 云平台：阿里云轻量应用服务器
- 实例 ID：`806c7092e1e2481c8a6b0ed3c7fcb0be`
- 实例名称：`Ubuntu-fjwh`
- 运行状态：运行中
- 规格族：通用型
- 地域：华南 1（深圳）
- 服务器公网 IP：`120.24.93.226`
- 服务器私有 IP：`172.17.13.25`
- 操作系统：Ubuntu 24.04 LTS
- DDoS 攻击状态：正常
- 创建时间：2026-07-06 19:58:37
- 到期时间：2027-07-06 23:59:59
- SSH 密钥对：已创建密钥对 `serverkey`，创建时间 2026-07-07 19:42:32；公钥已由用户提供但不写入仓库文档。
- SSH 私钥文件：用户本机已保存 `serverkey.pem`，文件存在性已确认；Windows ACL 已收紧为仅 `Administrator` 可读；私钥内容禁止写入仓库、聊天或截图。
- SSH 密钥绑定状态：`serverkey` 已绑定到实例；SSH 登录已通过。
- SSH 登录证据：2026-07-07 21:00 CST，使用 `serverkey.pem` 以 `root@120.24.93.226` 登录成功，进入提示符 `root@iZwz90hcgtczgr22a0oro9Z:~#`。
- 服务器登录后系统信息：Ubuntu 24.04.2 LTS，内核 `6.8.0-63-generic`，私有网卡 IP `172.17.13.25`，根分区已用 6.8% / 39.01GB，内存使用 15%，系统提示 57 个更新可应用。
- 标签：未绑定
- 访问方式：测试阶段已完成域名 `homestorag.xyz` / `www.homestorag.xyz` 解析，Nginx 已启用 HTTPS；服务器 IP 直接访问会因 Nginx `server_name` 限制返回 404。
- 项目目录建议：`/opt/home-inventory-app`
- 部署用户建议：`deploy`

## 运行版本

- Node.js：已安装 Node.js `v24.18.0`。
- npm：已安装 npm `11.16.0`。
- PostgreSQL：已安装 PostgreSQL `16.14`，仅监听 `127.0.0.1:5432`。
- Nginx：已安装 Nginx `1.24.0`，监听公网 `80` 并反向代理到 `127.0.0.1:3000`。
- 应用框架：Next.js，项目脚本以 `package.json` 为准：
  - 构建：`npm run build`
  - 启动：`npm start`
  - 测试：`npm test`
  - PostgreSQL 集成测试：`npm run test:postgres`

## PostgreSQL 初始化方式

测试环境先使用服务器本机 PostgreSQL，初始化一个空测试库，再执行仓库内 SQL：

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

在 `psql` 中执行：

```sql
create user home_inventory_app with password '替换为强密码';
create database home_inventory_test owner home_inventory_app;
\q
```

执行项目 schema：

```bash
cd /opt/home-inventory-app
psql "postgresql://home_inventory_app:替换为强密码@127.0.0.1:5432/home_inventory_test" \
  -f dev-docs/sql/mainland_initial_schema.sql
```

初始化验证：

```bash
pg_isready -h 127.0.0.1 -p 5432
psql "postgresql://home_inventory_app:替换为强密码@127.0.0.1:5432/home_inventory_test" -c "\dt"
```

安全边界：

- 测试库名必须清楚包含 `test`。
- 不把生产数据导入测试库。
- 不把数据库密码写入 Git、聊天记录截图或前端 `NEXT_PUBLIC_` 变量。
- 当前 SQL 是大陆版自有认证/自有 PostgreSQL 草案；正式生产前还需要单独评审 migration、备份、恢复和权限负例。

## 应用部署方式

推荐测试环境使用 `systemd` 管理 Next.js 进程。PM2 可用，但本项目先优先 `systemd`，因为它是 Ubuntu 自带能力，便于开机自启、日志查看和回滚。

### systemd 服务

创建环境变量文件：

```bash
sudo mkdir -p /etc/home-inventory-app
sudo nano /etc/home-inventory-app/app.env
```

`/etc/home-inventory-app/app.env` 内容模板：

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://home_inventory_app:替换为强密码@127.0.0.1:5432/home_inventory_test
SESSION_SECRET=替换为至少32字节的随机长字符串
AUTH_COOKIE_SECURE=false
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

创建服务：

```bash
sudo nano /etc/systemd/system/home-inventory-app.service
```

服务模板：

```ini
[Unit]
Description=Home Inventory App
After=network.target postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/home-inventory-app
EnvironmentFile=/etc/home-inventory-app/app.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动与查看日志：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now home-inventory-app
sudo systemctl status home-inventory-app
journalctl -u home-inventory-app -n 100 --no-pager
```

### PM2 备选

仅在你明确选择 PM2 时使用：

```bash
sudo npm install -g pm2
pm2 start npm --name home-inventory-app -- start
pm2 save
pm2 startup systemd
```

PM2 方案也必须使用服务器环境变量或 `/etc/home-inventory-app/app.env` 注入密钥，不把真实值提交到仓库。

## Nginx

Nginx 已配置为监听公网 `443` 提供 HTTPS，并将 HTTP（80）301 重定向到 HTTPS；反向代理到本机 `3000`。

证书由 Let's Encrypt / Certbot 颁发，证书域名：`homestorag.xyz`、`www.homestorag.xyz`；证书有效期：2026-07-27 至 2026-10-25。

当前生效配置 `/etc/nginx/sites-available/home-inventory-app`（由 Certbot 管理部分已保留注释）：

```nginx
server {
  server_name homestorag.xyz www.homestorag.xyz;

  client_max_body_size 1m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  listen [::]:443 ssl ipv6only=on;
  listen 443 ssl;
  ssl_certificate /etc/letsencrypt/live/homestorag.xyz/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/homestorag.xyz/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
  listen 80;
  listen [::]:80;
  server_name homestorag.xyz www.homestorag.xyz;
  return 301 https://$host$request_uri;
}
```

历史 HTTP 测试配置已备份为 `/etc/nginx/sites-available/home-inventory-app.bak.20260727_171323`。

启用/重载配置：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

测试访问：

```bash
curl -I https://homestorag.xyz/login
curl -I https://www.homestorag.xyz/login
curl -I http://homestorag.xyz/login   # 应返回 301 重定向到 HTTPS
curl -I http://120.24.93.226/login    # 应返回 404（未匹配 server_name）
```

## 端口与安全组

阿里云安全组入方向：

| 端口 | 协议 | 来源 | 用途 |
| --- | --- | --- | --- |
| 22 | TCP | 优先限制为你的固定公网 IP；临时可用 `0.0.0.0/0` | SSH 管理 |
| 80 | TCP | `0.0.0.0/0` | HTTP（已配置 301 重定向到 HTTPS） |
| 443 | TCP | `0.0.0.0/0` | HTTPS 正式访问 |
| 3000 | TCP | 不对公网开放 | Next.js 本机监听 |
| 5432 | TCP | 不对公网开放 | PostgreSQL 本机访问 |

用户已确认阿里云控制台安全组当前状态与上述测试环境规则一致：`22/tcp` 用于 SSH，`80/tcp` 用于 HTTP 重定向，`443/tcp` 用于 HTTPS 访问，`3000/tcp` 和 `5432/tcp` 不对公网开放。

服务器防火墙建议：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

## 环境变量

必须配置在服务器环境变量文件或云平台密钥管理中，不提交到 Git：

- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL`
- `SESSION_SECRET`
- `AUTH_COOKIE_SECURE=false`：仅用于当前 IP + HTTP 测试环境，避免浏览器拒绝回传 `Secure` session cookie；正式 HTTPS 环境必须移除或改为 `true`。

当前 `.env.example` 中仍保留 Supabase 临时路线变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

阿里云自有 PostgreSQL 测试路线中，上述 Supabase public 变量可以留空；如果某段旧页面仍依赖 Supabase，需要先回到代码与真源确认，不能用 mock 数据冒充真实能力。

生成 session secret 示例：

```bash
openssl rand -base64 48
```

## 部署操作顺序

1. 在阿里云控制台确认服务器公网 IP、Ubuntu 24.04、SSH 登录方式和安全组。
2. SSH 登录服务器，创建 `deploy` 用户，并只给它项目运行权限。
3. 安装 Node.js、npm、PostgreSQL、Nginx、Git。
4. 将代码部署到 `/opt/home-inventory-app`。
5. 执行 `npm ci`。
6. 创建 PostgreSQL 用户和 `home_inventory_test` 数据库。
7. 执行 `dev-docs/sql/mainland_initial_schema.sql`。
8. 在 `/etc/home-inventory-app/app.env` 写入真实环境变量。
9. 执行 `npm run build`。
10. 创建并启动 `systemd` 服务。
11. 配置 Nginx 反向代理。
12. 用 `http://120.24.93.226/` 验证 `/login` 和 `/app`。
13. 执行注册、登录、新增区域/位置/物品、刷新后仍存在、退出登录、未登录访问 `/app` 的测试。
14. 记录测试结果到 `dev-docs/acceptance.md`。

## 备份命令

创建备份目录：

```bash
sudo mkdir -p /var/backups/home-inventory-app
sudo chown postgres:postgres /var/backups/home-inventory-app
```

手动备份：

```bash
sudo -u postgres pg_dump \
  --format=custom \
  --file=/var/backups/home-inventory-app/home_inventory_test_$(date +%Y%m%d_%H%M%S).dump \
  home_inventory_test
```

查看备份：

```bash
sudo ls -lh /var/backups/home-inventory-app
```

恢复到新的测试库验证，不直接覆盖当前库：

```bash
sudo -u postgres createdb home_inventory_restore_test
sudo -u postgres pg_restore \
  --dbname=home_inventory_restore_test \
  /var/backups/home-inventory-app/替换为备份文件.dump
```

验证恢复：

```bash
sudo -u postgres psql home_inventory_restore_test -c "\dt"
```

## 回滚方式

代码回滚：

```bash
cd /opt/home-inventory-app
git log --oneline -5
git switch main
git pull
git checkout 上一个确认可用的commit
npm ci
npm run build
sudo systemctl restart home-inventory-app
journalctl -u home-inventory-app -n 100 --no-pager
```

配置回滚：

```bash
sudo cp /etc/home-inventory-app/app.env /etc/home-inventory-app/app.env.bak.$(date +%Y%m%d_%H%M%S)
sudo nano /etc/home-inventory-app/app.env
sudo systemctl restart home-inventory-app
```

数据库回滚原则：

- 测试环境每次破坏性 schema 变更前先执行 `pg_dump`。
- 不直接在原库上盲目恢复。
- 先恢复到 `home_inventory_restore_test` 验证数据和表结构，再决定是否替换当前测试库。
- 正式生产前必须另写生产级 migration/rollback 方案。

紧急停服：

```bash
sudo systemctl stop home-inventory-app
sudo systemctl reload nginx
```

## 发布前禁止项

- 禁止把服务器 IP 访问测试当成正式上线。
- 禁止把未备案域名解析到正式公开网站。
- 禁止开放 PostgreSQL `5432` 到公网。
- 禁止提交 `.env.local`、`app.env`、数据库 dump、真实密码、私钥、session secret。
- 禁止在未完成邮箱验证、密码重置、隐私政策、用户协议、备份恢复演练前公开推广给真实陌生用户。

## 当前验证状态

已验证：
- 服务器公网 IP：`120.24.93.226`。
- SSH 登录方式：已通过；已创建并绑定密钥对 `serverkey`，本机私钥文件存在且权限已收紧，可通过 SSH 登录 `root@120.24.93.226`。
- SSH 已处理故障：首次登录因 Windows 私钥文件继承了 `CodexSandboxUsers` 读取权限而被 OpenSSH 拒绝，已通过 `icacls` 移除继承并收紧为 `Administrator:(R)`。
- 阿里云账号个人实名认证：用户已确认完成。
- 阿里云控制台安全组：用户已确认当前开放端口与测试环境规则一致（80、443、22）。
- Node.js 实际版本：`v24.18.0`。
- PostgreSQL 实际版本：`16.14`。
- Nginx HTTP 访问验证：已通过，公网 `http://120.24.93.226/login` 和 `/app` 曾返回 200（IP 直接访问现已因启用 `server_name` 返回 404）。
- Nginx HTTPS 访问验证：已通过，公网 `https://homestorag.xyz/login` 和 `https://www.homestorag.xyz/login` 返回 200；HTTP 访问域名会 301 重定向到 HTTPS。
- Let's Encrypt 证书：已获取，证书域名 `homestorag.xyz`、`www.homestorag.xyz`，有效期 2026-07-27 至 2026-10-25。
- 域名解析：`homestorag.xyz` 和 `www.homestorag.xyz` 均解析到 `120.24.93.226`。
- ICP 备案号展示：已在 `src/app/layout.tsx` 页面底部展示 `粤ICP备2026094933号`，链接到 `https://beian.miit.gov.cn/`。
- systemd 启动验证：已通过，`home-inventory-app.service` enabled + active。
- PostgreSQL 备份演练：已通过，备份文件 `/var/backups/home-inventory-app/home_inventory_test_20260707_211902.dump`。
- 公网 API 验证：已通过，注册、dashboard、区域/位置/物品创建 smoke test 成功；测试账号已清理。

仍未验证：
- PostgreSQL 备份恢复到独立 restore 库的演练。
- 浏览器完整登录和 CRUD 验收：未验证。
- HTTPS、域名、ICP 备案和正式公开访问。
