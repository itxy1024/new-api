# 本仓库定制功能保留约定

本文件由用户要求建立，供后续 agent 在处理 `itxy1024/new-api` 时直接读取。根目录 `AGENTS.md` 将本文件列为必读约定。它保护既有功能和数据，不要求在无关任务中修改这些功能。

## 盘点范围与使用方法

- 盘点日期：2026-11-09。功能基线：`040e4a3a1ca8b2dfe253effa11411a6597a29bea`；已合并上游基线：`8faf1d45e8c101974dc7483324d3d91c8a462ffe`。
- 已核对这两个版本之间的全部 403 个差异路径，并追溯本地独有提交。下列清单按业务能力登记；`web/src/features/creative/reference/` 整个集成目录及其资源、测试、第三方许可均在保护范围内。
- 清单不是允许删除未列出代码的白名单。后续新增功能，以及被上游吸收后不再显示为差异的既有定制，同样必须保留。提交号用于查证来源，不是要求将未来代码回退到旧版本。
- 不能把已经由用户明确移除或被新实现替代的历史控件重新恢复；以现行行为及用户最新明确要求为准。
- 改动下列功能前先阅读相应实现与现有测试。涉及认证、数据库、计费、前端的修改仍须遵守根目录和 `web/AGENTS.md` 的对应规则。

## 一、管理员与日志可见范围

### 1. 日志渠道单独授权

- 普通管理员默认不能查看日志渠道；超级管理员单独授予 `log.channel_view`（「查看日志渠道」）后才可查看，撤销后应重新隐藏。超级管理员保留查看能力。
- 限制覆盖使用日志、绘图记录、任务记录中的渠道编号、名称、重试链、渠道列与筛选，以及使用日志导出。未授权时不能靠伪造渠道查询参数取得渠道信息。
- 必须由后端过滤返回字段，并同步前端显示；不能仅隐藏表头或按钮。授权后的列表与详情应一致。
- 实现：`service/authz/resources_log.go`、`controller/log.go`、`controller/midjourney.go`、`controller/task.go`、`model/log.go`、`web/src/lib/admin-permissions.ts`、`web/src/hooks/use-admin.ts`、`web/src/features/usage-logs/`。

### 2. 请求输入采集与超级管理员专享查看

- 保留原始请求输入的排查能力：只记录本次请求最后一条用户文本，排除系统、开发者、助手、工具内容和多媒体，按 UTF-8 字节限制为 10 KiB，并保留截断标记。
- 仅超级管理员可读取请求输入；普通管理员即使获得渠道权限也不可读取。后端列表与导出都要过滤，详情页也要限制显示；兼容历史顶层字段、嵌套 `admin_info` 及异常格式，不能泄露旧数据。
- 超级管理员详情保留默认折叠、展开、复制及截断提示。字段过滤不能损坏其他可见元数据或大整数精度。
- 实现：`relay/common/request_input.go`、`relay/common/relay_info.go`、`service/log_info_generate.go`、`model/log_other.go`、`web/src/features/usage-logs/components/dialogs/request-input-section.tsx`、同目录 `request-input-state.ts` 与 `details-dialog.tsx`。
- 关键回归：`relay/common/request_input_test.go`、`model/log_format_test.go`、`controller/log_export_test.go` 中 `TestLogSensitiveFieldsFollowViewerPermissions`、前端 `request-input-details.test.tsx` 与 `request-input-state.test.ts`。

### 3. 普通管理员不能查看超级管理员的日志和任务

- 保留查询时排除全部超级管理员用户 ID 的逻辑，列表、搜索条件和计数须使用一致范围；不能只在前端过滤结果。
- 覆盖使用日志、Midjourney 绘图与通用任务。用户自己的记录查询仍按归属隔离。
- 实现：`model/user.go` 的 `GetRootUserIds`、`model/log.go`、`model/midjourney.go`、`model/task.go` 及对应控制器。
- 关键回归：`model/log_admin_visibility_test.go` 及相关任务权限测试。`GetRootUser` 等本地调用所需兼容入口也不能在合并时误删。

### 4. 管理员展示渠道与真实路由隔离

- 普通管理员只能访问 `admin_visible=true` 的展示渠道，不能通过已知 ID 绕过列表范围。
- 展示渠道不参与真实请求分发、模型可用性、优先级选择或渠道缓存路由；`admin_visible=false` 的真实渠道继续承担转发。
- `admin_visible` 只由数据库维护：新增接口不能创建展示渠道，编辑接口不能覆盖原值。不能因为字段名包含 visible 就把它解释为普通渠道的通用展示开关。
- 实现：`model/channel.go` 的 `ApplyChannelAdminScope`、`model/ability.go`、`model/channel_cache.go`、`controller/channel.go`、`controller/channel_authz.go`、`middleware/auth.go` 的 `RequireVisibleChannel`、`router/channel-router.go`。
- 关键回归：`model/channel_visibility_test.go`。

### 5. 仪表盘流向图的渠道权限

- 无渠道权限时，流向数据不能带出渠道维度，前端也不能显示渠道节点；有权限时保留渠道聚合和名称。用户自己的查询不暴露渠道。
- 保留接口 `channel_visible` 与前端联动，不能只隐藏流向图的一列而保留敏感返回数据。
- 实现：`controller/usedata.go`、`model/usedata_flow.go`、`web/src/features/dashboard/api.ts`、`web/src/features/dashboard/components/flow/flow-charts.tsx`。

## 二、API Key 与分组操作

### 6. 聚合分组、旧令牌兼容与缓存

- 保留令牌 `groups`、`group_aggregation_enabled` 及旧 `group` 字段兼容；`GetGroups()` 优先读取新列表，旧数据回退到单分组。
- 保留分组去重与校验、聚合开关、顺序以及按模型匹配所选分组的分发逻辑；不能把聚合分组误改成单选或等同于 `auto` 分组。
- 创建、编辑、列表、模型列表、认证上下文、分发和缓存须完整传递分组。保留 `auto_groups` 顺序编辑及与既有跨组重试的兼容规则。
- 聚合分组必须继续受到上游缓存签名和有效性检查保护；旧缓存重建不得覆盖已经预扣的额度，也不能丢失 `allow_user_quota_query` 等现有权限字段。
- 实现：`model/token.go`、`model/token_cache.go`、`controller/token.go`、`controller/model.go`、`constant/context_key.go`、`middleware/auth.go`、`middleware/distributor.go`、`web/src/features/keys/`。
- 关键回归：`controller/token_test.go`、`model/token_auto_groups_cache_test.go`、前端 `api-key-form.test.ts`、`auto-group-form.test.ts`、`api-key-group-combobox.test.tsx`、`api-key-listing.test.tsx`、`api-keys-mutate-drawer.test.tsx`。

### 7. API Key 与渠道快捷切换分组

- 保留列表内直接切换分组的入口、当前值回显、保存与失败反馈，不能以恢复上游表格为由移除。
- API Key 快捷编辑必须保留聚合开关和其他令牌属性；渠道快捷编辑保留多分组选择、已有分组选项及非空限制。
- 实现：`web/src/features/keys/components/api-key-quick-group-switch.tsx`、同目录 `api-key-group-combobox.tsx`、`auto-group-order-editor.tsx`、`web/src/features/keys/lib/api-key-form.ts`、`web/src/features/channels/components/channel-quick-group-switch.tsx`、同目录 `channels-columns.tsx`、`channels-table.tsx`、`web/src/features/channels/lib/channel-utils.ts`。

## 三、创作中心

### 8. 图片与视频页面、入口及账号集成

- 保留 `/creative/image`、`/creative/video` 路由、侧边栏入口和后台模块显示开关，不能只保留页面文件却丢失访问入口。
- 使用当前登录用户自己的 API Key ID、可用分组和模型进行生成；保留 API Key/分组/模型的联合选择、可用余额信息、选择状态及当前中转站名称。浏览器不应为此取得原始 API Key。
- 后端继续校验令牌归属、有效性、模型与分组权限，复用既有 relay、限流和分发流程。
- 实现：`router/api-router.go` 的 `/api/creative` 路由、`controller/creative.go`、`web/src/routes/_authenticated/creative/`、`web/src/features/creative/index.tsx`、`web/src/features/creative/reference/NewApiSelection.tsx` 及其 `lib/newApiSelection.ts`。

### 9. 图片画廊与完整创作交互

- `web/src/features/creative/reference/` 是实际集成的创作界面，不能因目录名为 reference 将其当作示例、死代码或临时文件删除。
- 保留图片生成与编辑、参考图、遮罩和涂鸦编辑、标注、任务网格、详情与灯箱、历史、搜索筛选、收藏及收藏集、复用参数、下载导出、草稿与本地状态等现有接入能力。
- 保留已接入的 Agent 工作区和相关状态处理；不能用简单生图表单替换整套画廊，或将目录内所有能力一律视为未使用。是否启用某个能力以实际调用、现行设置和用户要求为准。
- 保留界面 CSS 作用域隔离，避免创作页样式影响全站侧边栏；保留模型选择器打开时的定位与无动画行为、尺寸选择和当前参数布局。
- 图片输入栏的模型标签与选择器采用内联布局，并与尺寸、质量、数量、更多参数垂直居中；选择器与参数胶囊保持相同高度，不得恢复为模型标签独占上方一行的布局。
- 实现：该目录的 `App.tsx`、`store.ts`、`components/`、`hooks/`、`lib/`、`index.css`，以及 `web/src/features/creative/CreativeDetailModal.tsx`、`CreativeLightbox.tsx`、`SizePickerModal.tsx`、`size.ts`、`web/src/components/model-group-selector.tsx`。
- 第三方 MIT 许可、版权与资源声明必须一起保留：`reference/THIRD_PARTY_LICENSES/`、`reference/assets/third-party-notices.txt`。

### 10. 图片多张生成与扩展参数

- 保留多张生成的实际请求拆分/并发、结果合并、部分成功和预览关联，不能退化为只显示数量但仍只生成一张。不同接口按既有实现处理，不能无条件复制同一种多张请求方式。
- 保留本地 GPT Image 版本适配、生成与编辑、Images/Responses 等现有请求路径及自定义服务商兼容；模型是否支持参数应继续按现有能力判断。
- 图片参数 `complexity`、`frame_count`、`frame_duration_ms`、`svg`、`markup`、格式/尺寸/质量及其他现有参数必须从界面到请求序列化完整保留。与上游同义字段整合时不能产生重复 JSON 字段或丢失显式零值。
- 实现：`web/src/features/creative/reference/lib/openaiCompatibleImageApi.ts`、`imageApiShared.ts`、`imageModels.ts`、`paramCompatibility.ts`、`reference/types.ts`、`controller/creative.go`、`relaykit/dto/openai_image.go`。
- 关键回归：`controller/creative_test.go`、`reference/lib/gptImage26.test.ts`、`reference/lib/api.test.ts`、`reference/__tests__/independent-task-submission.test.ts`。参数数量校验和计费仍受 `.agents/rules/billing.md` 约束。

### 11. 视频生成、轮询与内容访问

- 保留按选中账号/模型发起视频任务、查询任务状态、读取视频内容和任务产物的流程，继续复用宿主任务插件端点与供应商适配。
- 保留视频任务到创作记录的关联、完成后持久化和视频代理优先读取已存储产物的行为；不能使旧任务失去内容访问能力。
- 实现：`controller/creative.go`、`controller/creative_video_persistence.go`、`controller/video_proxy.go`、`router/api-router.go`、`web/src/features/creative/index.tsx`。

### 12. 服务端创作历史与数据迁移

- 保留 `CreativeGeneration`、`CreativeAsset` 及图片/视频生成记录、参数、状态、耗时、产物关联；刷新、重启或更换浏览器后仍能读取服务端记录。
- 查询、内容访问、删除操作必须按用户归属隔离。保留按 `client_task_id` 关联/处理记录、分页和前端同步，不得删除旧表或丢失历史记录。
- 保留创作时间、Unix 秒到时间类型的历史迁移、时区处理及 MySQL 时区规范化；后续 schema 变更仍须按三数据库迁移矩阵验证。
- 实现：`controller/creative_persistence.go`、`controller/creative_video_persistence.go`、`model/creative_generation.go`、`model/creative_generation_migration.go`、`model/creative_time.go`、`model/main.go`、`web/src/features/creative/reference/lib/creativeStorage.ts`、`db.ts`、`dbIndexedDb.ts`、`imageCache.ts`、`persistedState.ts`。
- 关键回归：`model/creative_generation_test.go`、`model/creative_generation_migration_test.go`、`reference/lib/__tests__/creative-storage.test.ts`。

### 13. 创作存储配置与 S3/OSS 产物持久化

- 保留创作页存储设置、配置读取/更新/连通性测试接口，以及与 S3 兼容存储的集成；界面只返回凭据是否配置，不能返回可用密钥。
- 保留 endpoint、bucket、region、prefix、path-style、有效期和现有环境变量/数据库选项兼容，以及存储重载、图片/视频上传、内容读取、URL 和删除流程。
- 禁用存储或处于上游模式时应保留原转发能力，不能为保留定制而强制所有用户配置 OSS，也不能把现有 S3 实现恢复为上游占位实现。
- 实现：`controller/creative_storage.go`、`service/task_artifact_store.go`、`setting/system_setting/task_artifact_store.go`、`web/src/features/creative/reference/components/OssSettingsDialog.tsx`、`reference/lib/creativeStorage.ts`。
- 关键回归：`service/task_artifact_store_s3_test.go`、`service/task_artifact_store_test.go`、`setting/system_setting/task_artifact_store_test.go`、`reference/__tests__/oss-settings-dialog.test.tsx`。

## 四、其他页面与运营功能

### 14. 智商雷达

- 保留 `/iq-radar` 的内嵌页面、导航、独立模块开关、翻译和 iframe 安全限制。现行默认来源为 `https://iq-radar.pages.dev/`，不得在上游同步时替换或移除该入口。
- 实现：`web/src/features/iq-radar/index.tsx`、`web/src/routes/_authenticated/iq-radar.tsx`、`web/src/hooks/use-sidebar-data.ts`、`use-sidebar-config.ts`、`web/src/features/system-settings/maintenance/`。

### 15. 全局客服悬浮窗

- 保留全局客服入口、现行二维码来源、点击弹窗、拖动与点击区分、窗口变化后的边界定位、悬停与收起等交互。
- 不得通过删除根路由挂载而使组件文件仍在但入口失效。
- 实现：`web/src/components/customer-service-float.tsx`、`web/src/routes/__root.tsx`；回归：`web/src/components/customer-service-float/__tests__/interaction.test.tsx`。

### 16. 充值返佣与额度设置接线

- 保留 `TopUpCommissionRatio` 设置及 0–100 范围校验。被邀请用户在线充值成功后，按实际入账额度给邀请人发放返佣，写入推广余额与累计收益。
- 保留已接入支付渠道的返佣流程、支付合规开关、事务一致性、重复通知不重复发放、后台手动完成充值不返佣和返佣日志。不能恢复为只按注册奖励，也不能把钱包文案方向当作计算逻辑依据。
- 保留后台表单、默认值、接口选项映射与钱包展示；同时保留本地 `PreConsumedQuota` 设置接线，不能以新版设置分区为由丢失已有配置。
- 实现：`model/topup.go`、`common/constants.go`、`model/option.go`、`controller/option.go`、`web/src/features/system-settings/types.ts`、`web/src/features/system-settings/billing/index.tsx`、`web/src/features/system-settings/billing/section-registry.tsx`、`web/src/features/system-settings/general/quota-settings-section.tsx`、`web/src/features/wallet/components/affiliate-rewards-card.tsx`。
- 关键回归：`model/topup_commission_test.go`、`web/src/features/system-settings/general/__tests__/pre-consume-settings.test.tsx`。

### 17. Responses 历史消息 ID 兼容

- 保留对历史 `type=message` 条目中非法 message ID 的清理，兼容普通序列化及透传请求体；内容、工具关联字段、其他类型 ID 和未知顶层字段必须保留。
- 不能因合并上游 Responses 请求重构而漏掉透传分支的清理。
- 实现：`relay/helper/responses_input_ids.go`、`relay/responses_request.go`；回归：`relay/helper/responses_input_ids_test.go`。

### 18. 定制镜像构建与版本展示

- 保留 `.github/workflows/build-image.yml`：`main` 推送及手动运行构建本仓库定制镜像，镜像名称从当前仓库生成小写 GHCR 路径，保留 `latest`、运行编号和提交 SHA 标签。
- 保留 `scripts/resolve-build-version.sh`、Docker 构建参数、后端版本注入与环境变量覆盖。只能用已包含在当前历史中的官方发布版作为比较基线，不能把尚未同步的发布版标成当前版本。
- 创作界面的 `__APP_VERSION__` 与网关版本分开维护；不能在合并时删除 `web/rsbuild.config.ts` 中创作页需要的定义。
- 实现还包括 `Dockerfile`、`Dockerfile.dev`、`common/constants.go`、`common/init.go`。推送源码、构建镜像、容器部署是不同阶段，必须分别报告真实结果。

### 19. 定制功能的配套集成

- 保留上述功能需要的后端/前端依赖、锁文件、路由声明与生成入口、七语言翻译、侧边栏默认值与配置映射、共享选择器及筛选器扩展和回归测试。
- 保留分组选项的原始名称显示（`translate: false`）、图标/数量显示与已有筛选行为；不能把用户配置的分组名当作翻译键改写。
- 重点路径：`go.mod`、`go.sum`、`web/package.json`、`web/bun.lock`、`web/src/i18n/locales/`、`web/src/routeTree.gen.ts`、`web/src/styles/index.css`、`web/src/components/data-table/toolbar/`、`web/src/components/model-group-selector.tsx`。
- `volc.html` 等本地辅助文件也不得仅因上游不存在或未列为业务页面而顺手删除；是否清理应以用户要求和实际使用证据为依据。

## 上游同步与交付检查

1. 记录当前提交、分支、远程及工作区状态；保护用户未提交修改，创建可恢复的备份后再合并。
2. 比较本地独有提交和文件差异，检查本文件全部 19 项，不只看最近一次修复。可使用 `git log --no-merges upstream/main..HEAD`、`git diff --name-status upstream/main...HEAD`；上游 ref 是否已刷新要明确说明。
3. 基线查证可使用 `git diff 8faf1d45e8c101974dc7483324d3d91c8a462ffe 040e4a3a1ca8b2dfe253effa11411a6597a29bea -- <相关路径>`；不要把当时的全部差异机械应用到未来版本。
4. 冲突按业务行为整合；上游等价实现可以替换旧实现，但必须保留原用户能力、权限边界、接口和数据兼容，并说明映射。不得用删除本地测试来消除回归失败。
5. 验证相关功能的实际行为。尤其检查管理员默认/授权/撤销/超级管理员、请求输入的列表与导出、真实路由与展示渠道隔离、聚合分组缓存、多张图片、历史记录、存储和返佣。根据涉及范围执行项目要求的数据库矩阵与子模块独立构建。
6. 区分历史失败、本次回归和环境限制；没有执行的线上、供应商、浏览器或数据库验证必须明确说明。文件存在、符号存在、构建通过都不能单独证明定制功能完整保留。
7. 最终列出新增/修改/删除文件、各项定制保留情况、实际检查及未验证项；用户原有或无关改动单独列出。新增或调整定制时同步更新本文件，不能无说明删减登记项。

本次建立约定仅盘点代码与历史，未重新执行上述业务回归，也不把历史测试结果当作本次验证结果。
