# Development Truth Index

本目录是 Home Inventory App 的内部开发真源。后续代码、数据库、界面、部署和验收都必须回到这里对齐。

## 当前真源索引

- `project-brief.md` - 产品边界、MVP、不做什么、第一闭环。
- `technical-selection.md` - 已确认技术路线、备选路线取舍、平台能力判断。
- `architecture.md` - 主推荐架构、owner map、数据和权限边界。
- `database-design.md` - Supabase schema、对象关系、RLS 策略和权限负例。
- `acceptance.md` - 阶段验收门槛、证据记录、停止条件。

## 文档职责

- 产品方向变更先改 `project-brief.md`。
- 技术栈、框架、数据库、部署路线变更先改 `technical-selection.md`。
- 数据模型、RLS、owner 边界、请求生命周期变更先改 `architecture.md`。
- 表结构、字段、索引、RLS 策略和数据库负例变更先改 `database-design.md`。
- 验收标准、证据要求、停止条件变更先改 `acceptance.md`。

## 更新规则

- 聊天里的决定必须写回对应真源文档后才算正式决定。
- 代码实现不能覆盖真源文档；发现冲突时先停下报告。
- 高风险能力包括登录、权限、数据库、支付、上传、部署、第三方服务。
- 阶段状态可以标记为 `未验证`，不能把未验证项包装成已完成。

## 当前阶段

项目处于从零启动阶段。已确认产品方向和技术路线，但尚未创建前端代码、Supabase 项目、数据库迁移或部署环境。

## 进入开发前必须补齐

- 数据库 schema 和 RLS 策略已完成设计草案，并已生成初始 migration，尚未执行 Supabase 验证。
- 第一阶段实施计划。
- 本地启动命令、测试命令、验收路径。
- Supabase 项目创建方式和 `.env.example`。
