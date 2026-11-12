# 桌面端 V0.92.0 → 安卓端 V1.12.0 功能适配审计报告（2026-11-12）

**总结论：尚未完全适配。** 安卓端 `v1.12.0`（`29d3e67`）已对齐桌面端 `v0.92.0`（`67bfc951`）的两项核心分支特性——**Antigravity / Codex 按需在线对话**（`1.8.0`/`1.9.0`）与**Antigravity / Codex 会话实时输出速率及五分钟趋势**（`1.12.0`），并在 `1.10.0`/`1.11.0` 补齐了总览多维扩展（含超 30 项展开、`U05` 已适配）与核心额度速览；但对照 `v0.92.0` 仍存在明确的可消费功能缺口与可复现差异：

1. **桌面 `0.90.0 → 0.92.0` 新增但安卓尚未适配的 Hub 可消费能力**：
   - **Cursor 周期标签与共享模块漂移（`#1447`）**：[windowLabels.js](file:///home/cloud/code/token-monitor-For-Android/src/shared/limits/windowLabels.js) 未同步桌面 `d08a1b09`，且 [model.js](file:///home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js#L345) 直接取 `window.label` 而不调用 `windowLabels.limitWindowLabel()`，导致 Cursor `Included usage` 仍显示原样而非 `Weekly` / `Monthly`。
   - **14 种货币符号、`KRW`/`JPY` 零小数精度与显示货币切换（`#1449`、`#1452`）**：安卓 [balanceDisplay.js](file:///home/cloud/code/token-monitor-For-Android/src/shared/limits/balanceDisplay.js#L10) 仅映射 `CNY`（`¥`）与 `USD`（`$`），其余 12 种货币全部退回 `CODE xx.xx` 两位小数（如 `KRW` 显示 `KRW 29000.00` 而非 `₩29000`，`JPY` 显示 `JPY 29000.00` 而非 `JP¥29000`）；用量费用仍固定 USD。
   - **DeepSeek Search / Fetch 费用明细（`#1442`）**：桌面 `limits/core.js` 与 `windowsView.js` 展示 `balance.searchSpend` / `balance.fetchSpend`，安卓 `model.js` 与 [LimitsView.tsx](file:///home/cloud/code/token-monitor-For-Android/ui/src/components/LimitsView.tsx) 未消费这两个字段。
   - **总览面板直接搜索会话（`#1454`）**：桌面可在总览面板展开搜索会话；安卓在 `OverviewView` 支持工具/模型/项目分布筛选，但会话搜索仍位于独立的会话页（`SessionsView`）。
2. **既有遗留可复现差异仍在 `v1.12.0` 存在**：
   - `G01`–`G08` 额度专用读数差异（[model.js](file:///home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js#L342) 仍将 `windowText.limitWindowText` 限缩在 `['minimax', 'mistral', 'qoder', 'hark']`，`limitSpend` 仅处理 MiniMax API）；
   - `LimitsView` 仅映射 17/35 个 provider 友好名称，其余 18 个直接显示原始 ID（[formatters.ts](file:///home/cloud/code/token-monitor-For-Android/ui/src/utils/formatters.ts#L19-L40)）；
   - 原生桌面微件（`WidgetLayoutPolicy.java`）仍仅区分 14/42 个工具、28 个归入“其他”，且 `senpi` 仍显示旧名 `Senpi`（`V06`）。

---

## 1. 审计基线与验证范围

| 项目 | 桌面端（基准） | 安卓端（被审计版本） |
| --- | --- | --- |
| 仓库 | `AoXIUy/token-monitor` | `AoXIUy/token-monitor-For-Android` |
| 版本 / 标签 | `0.92.0` / `v0.92.0` | `1.12.0` (`versionCode 23`) / `v1.12.0` |
| Git 提交 | `67bfc951e1aa10382c3c7288c8c9703a989a3aff` | `29d3e6737c46f26c1e8ec5464df2711d787cd13e` |
| 相对上次审计变化 | `f280297 (0.90.0)` → `67bfc951 (0.92.0)`（21 个提交） | `76972ee (1.7.0)` → `29d3e67 (1.12.0)`（5 个版本） |

- 机器可读探针与哈希对照已写入 [2026-11-12-v092-adaptation-evidence.json](2026-11-12-v092-adaptation-evidence.json)。
- 口径说明：按 [AGENTS.md](../../AGENTS.md)，安卓端定位为**只读 Hub 客户端**。桌面专属的本机 `tokscale` 扫描、provider 登录/凭据、Hub 写入/管理、Electron 插件宿主及 macOS/Windows/Wayland 桌面窗口归类为**架构/平台边界不适用（非缺陷）**。

---

## 2. 共享模块（`src/shared/`）同步核对

对比安卓 [src/shared/](../../src/shared) 全部 11 个文件与桌面 `v0.92.0`：

| 文件 | 状态 | 说明与证据 |
| --- | --- | --- |
| `src/shared/clientCatalog.js` | **完全一致** | SHA-256 `34bb705e...`；42/42 用量工具名称与桌面一致 |
| `src/shared/compactTokens.js` | **完全一致** | SHA-256 `a61a1adf...` |
| `src/shared/deviceKind.js` | **完全一致** | SHA-256 `8b2f9ed8...` |
| `src/shared/limits/balanceDisplay.js` | **完全一致** | SHA-256 `2d6cd781...`（桌面本身将新增 12 币种放在 `currency.js`，未修改 `balanceDisplay.js`） |
| `src/shared/limits/windowText.js` | **完全一致** | SHA-256 `15fb522d...`（但安卓 `model.js` 只对 4 个 provider 调用） |
| `src/shared/sessionActivityProviders.js` | **完全一致** | SHA-256 `41a5ddf9...` |
| `src/shared/sessionLive.js` | **完全一致** | SHA-256 `6447a824...` |
| `src/shared/sessionRealtime.js` | **完全一致** | SHA-256 `1d74d295...`（`v1.12.0` 逐字节同步自桌面 `4361dd92`） |
| `src/shared/limits/windowLabels.js` | **存在漂移** | 安卓 `9af7313e...` ≠ 桌面 `8b4f99d0...`；缺少 `#1447` Cursor 周期标签规则 |
| `src/shared/limits/historyModel.js` | 安卓适配版 | 基于桌面 `src/electron/renderer/limits/historyModel.js` 调整 `require` 路径（未变） |
| `src/shared/sessionGroups.js` | 安卓独立快照 | 按 [upstream-files.json](../../docs/upstream-files.json) 保留，桌面端无同名文件 |

---

## 3. 桌面 `0.90.0 → 0.92.0` 增量功能逐项核对

| 桌面提交 / PR | 桌面 v0.92.0 能力 | 安卓 v1.12.0 状态 | 核对结果与代码证据 |
| --- | --- | --- | --- |
| `448210b4` / `99a7e8bb` / `54c4f7c3` | 在线会话对话查询（`/api/session-conversations`、Antigravity `<USER_REQUEST>` 与导出元数据分离） | **已完全适配**（`1.8.0`/`1.9.0`） | [ConnectionSpec.java](../../app/src/main/java/com/tokenmonitor/android/ConnectionSpec.java#L48-L60) 允许固定分页查询；[conversationState.js](../../ui/src/conversationState.js#L59-L240) 正确区分 `user` 对话与 `system/context` 事件分组 |
| `4361dd92` | Antigravity / Codex 会话实时输出 `tok/s`、`tok/min` 与 5 分钟阶梯趋势 | **已完全适配**（`1.12.0`） | `sessionRealtime.js` 哈希一致；[SessionRealtime.tsx](../../ui/src/components/SessionRealtime.tsx) 与 `StartupTest` 覆盖多设备选择、离线留空、后台重置；实测同输入下输出完全相等（`30 tok/s`, `1800 tok/min`） |
| `d08a1b09` (`#1447`) | Cursor 隐藏过期自动账户；`Included usage` 按 `weekly`/`billing` 显示周期标签 | **部分适配 / 存在缺口** | 账户隐藏在采集端生效；展示层 `windowLabels.js` 未同步且 [model.js](file:///home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js#L345) 未调用 `windowLabels.limitWindowLabel`，探针复现 Cursor 标签仍为 `Included usage` |
| `da60d159` / `1461f585` (`#1449`, `#1452`) | 支持 14 种显示/订阅货币（含 `KRW` `₩`、`JPY` `JP¥` 整数精度）及汇率换算 | **未适配** | 安卓无 `currency.js`，[balanceDisplay.js](../../src/shared/limits/balanceDisplay.js#L10) 仅识别 `CNY`/`USD`；探针显示 14 种货币中 11 种符号与精度不匹配（如 `KRW` 渲染为 `KRW 29000.00` 而非 `₩29000`），用量页仍固定 USD |
| `1612faaa` (`#1442`) | DeepSeek 控制台可选本月 `Search` / `Fetch` 费用明细 | **未适配** | 桌面 `limits/core.js` 归一化 `balance.searchSpend` / `fetchSpend`；探针确认安卓 `limitSpend` / `limitBalanceDetails` / `quota` 均未消费这两个字段 |
| `c98d7850` (`#1454`) | 桌面 Total 主面板内置展开式会话搜索 | **部分适配** | 安卓 `1.10.0` 在 `OverviewView` 增加了工具/模型/项目分布搜索，会话搜索在 `SessionsView` 可用，但总览主卡本身无直达会话搜索框 |
| `6b90eb72` (`#1450`) | Hub / Worker 上传上限提升至 2 MiB、Worker 存储守卫 7 MiB | **兼容（服务端能力）** | [HubClient.java](../../app/src/main/java/com/tokenmonitor/android/HubClient.java#L27) `/api/stats` 响应上限为 16 MiB，可正常接收更大快照 |
| `0c43c9dd` (`#1456`) | 从额度行单独刷新单个账户 | **只读边界不适用** | 属于桌面采集器触发动作；安卓只读设计禁止主动触发远端采集（[LimitsView.tsx](../../ui/src/components/LimitsView.tsx#L403)） |
| `0b984c83` / `148bb9fa` (`#1459`) | 插件简化更新与可信源自动更新 | **平台边界不适用** | 安卓无 Electron 插件运行环境 |
| `712db170` / `c43b7f6d` / `8e52292f` / `df177ab4` / `67e2866f` / `67bfc951` | macOS 玻璃修复、桌面 OS 文案、语言自称、桌面发布流水线 | **平台边界不适用** | Electron / 桌面打包专用 |

---

## 4. `v0.92.0` 全量功能域四象限总览

### A. 已完全适配（Android `v1.12.0` 与桌面 `v0.92.0` 消费口径一致）
- **核心用量与多设备选择**（`U01`–`U04`、`U11`、`U12`、`N08`）：三周期汇总、全设备/单设备筛选（含过期/零值/缺失区分）、42 个工具目录（42/42 匹配）、未定价/省略提示、历史匹配均速独立标注。
- **超 30 项分布展开与历史交互**（`U05`、`H01`、`H07`）：`1.10.0` 已在 [OverviewView.tsx](../../ui/src/components/OverviewView.tsx#L1343-L1359) 支持展开全部工具/模型/项目，14 日柱状/折线/累计切换，以及 `activeDaysComplete` 完整性门控。
- **会话结构、状态与缓存命中率**（`S01`–`S09`、`C01`–`C02`）：家族父子/续接分组（含跨工具父链与 16 子代理）、30 秒原生租约与推断区分、推理强度、Claude 缓存租约、`latestModel` 归属、输入缓存命中率及全部已测量会话展开。
- **Antigravity / Codex 在线对话与单会话实时速率**（`1.8.0`/`1.9.0`/`1.12.0`）：只读分页对话查看、导出上下文折叠、多设备实时输出 `tok/s` / `tok/min` 与五分钟阶梯趋势。
- **本机 SQLite 额度历史与核心额度边界**（`L02`–`L10`、`L17`–`L18`）：多账户/工作区隔离、Muse/MiniMax/MiMo/Mistral/Hark/Qoder 规则、`guarded=2` 来源接管与 180/730 日保留。
- **Android 专属原生能力**（`A01`–`A04`）：Keystore 加密、WebView 离线资源隔离、完成提醒前台服务、GitHub 应用内更新校验与安装交接。

### B. 部分适配（含已复现差异与增量缺口）
- **35 个额度 provider 展示**（`L01`、`L11`–`L13`、`L16`、`Q01`/`Q02`/`Q04`/`Q08`/`Q11`/`Q15`–`Q18`/`Q24`/`Q25`/`Q35`）：通用 30% 百分比探针 35/35 通过；但 [formatters.ts](../../ui/src/utils/formatters.ts#L19-L40) 缺失 **18 个 provider 友好名称**（`cline`, `factory`, `kimi`, `grok`, `zed`, `commandcode`, `zai`, `zaiteam`, `kiro`, `workbuddy`, `devin`, `typesafe`, `volcengine`, `trae`, `alibaba`, `stepfun`, `notion`, `thirdparty`），且 **`G01`–`G08` 全部 8 项差异在 `v1.12.0` 仍可复现**（见第 5 节），另有 Cursor 周期标签漂移（`#1447`）与 DeepSeek Search/Fetch 费用缺失（`#1442`）。
- **共享订阅与多币种展示**（`B01`、`B03`、`U08`）：可只读展示订阅/充值列表与基础日期；但仅原生支持 `USD`/`CNY` 符号与 2 位小数（11 种货币符号/零小数格式不匹配），不计算续费时长/ROI，也不支持用量币种转换。
- **实时速率与会话下钻**（`U06`、`U09`、`U10`、`S10`）：支持工具跳转会话列表，支持 Antigravity/Codex 单会话实时速率与在线对话；**不含**桌面全局头部实时消耗 `tok/min`（`tokenRatePresentation.js`）、独立模型/项目分析页，以及其他工具的远端逐消息查看（受 Hub 协议限制）。
- **原生桌面微件**（`V05`、`V06`）：4 类 `RemoteViews` 微件可用，但 `WidgetLayoutPolicy.java` 仅区分 **14/42** 个工具名称，28 个工具仍合并为 `其他`，且 `senpi` 仍显示 `Senpi`。

### C. 未适配（桌面已提供 / Hub 或客户端可实现但安卓缺失）
- **Hub 历史与流式同步接口消费**（`N02`、`H02`–`H05`、`H08`、`B05`、`E01`）：[ConnectionSpec.java](../../app/src/main/java/com/tokenmonitor/android/ConnectionSpec.java#L41-L60) 仅放行 `/api/stats`、`/api/subscriptions`、`/api/session-conversations`；桌面 Hub 已提供的 `/api/history`、`/api/devices`、`/api/stats/stream`（SSE）、`/api/sync/content`、`/api/sync/settings/(modelAliases|customPricing)` 均未接入，故无自定义日期范围、热力图/年度视图、活跃时长 `activeTimeMs` 分析及 CSV/JSON 导出。
- **客户端偏好与附加视图**（`L14`、`L15`、`L20`、`N10`、`E03`、`E04`、`V07`–`V10`）：重置券与第三方预测详情、额度搜索/排序/隐藏周期/已用剩余切换、`clientHealth` 逐工具诊断、服务状态页、脱敏诊断导出、浅色/多主题、工具排序隐藏及多语言切换（固定中文）。

### D. 架构与平台边界不适用（非缺陷）
- 本机采集与守护进程（`N03`–`N06`）、iCloud 同步（`N07`）、写入类管理接口（`B02`、`N09`、`L21`–`L22`、`#1456` 单账户刷新）、本地文件打开/切换 Codex 账号（`S11`、`E02`）、桌面系统窗口（`V01`–`V04`、`V11`–`V13`）、Electron 插件体系（`P01`–`P04`、`#1459`）。

---

## 5. 可复现差异实证清单（基于 `v0.92.0` vs `v1.12.0` 探针）

以下全部结果由实跑探针生成并记录在 [2026-11-12-v092-adaptation-evidence.json](2026-11-12-v092-adaptation-evidence.json)：

| 编号 | 类别 | 桌面端 `v0.92.0` 输出 | 安卓端 `v1.12.0` 实际输出 | 位置 |
| --- | --- | --- | --- | --- |
| `D01` | Cursor 周期标签（`#1447`） | `Weekly` / `Monthly` | `Included usage` | [windowLabels.js](../../src/shared/limits/windowLabels.js) / [model.js](../../app/src/main/assets/model.js#L345) |
| `D02` | 多币种符号与零小数（`#1449`/`#1452`） | `₩29000` / `JP¥29000` / `€20.00` 等 14 种 | `KRW 29000.00` / `JPY 29000.00` / `EUR 20.00`（11 种不匹配） | [balanceDisplay.js](../../src/shared/limits/balanceDisplay.js#L10) |
| `D03` | DeepSeek Search / Fetch 费用（`#1442`） | 归一化并展示 `Search ¥1.25`、`Fetch ¥0.45` | `limitSpend=[]`、`limitBalanceDetails=[]`（未消费） | [model.js](../../app/src/main/assets/model.js#L275-L290) |
| `D04` | Provider 友好名称映射 | 35/35 均在 `LIMIT_PROVIDER_CATALOG` 有名称 | 18 个 provider 退回原始 ID（如 `zai`、`thirdparty`） | [formatters.ts](../../ui/src/utils/formatters.ts#L19-L40) |
| `G01` | Cursor 消费上限 | `$2.35 / $20.00` | `$2.35`（丢弃分母上限） | [model.js](../../app/src/main/assets/model.js#L336-L338) |
| `G02` | Kiro 超额 | `14 credits · $0.56` | `暂无读数` | [model.js](../../app/src/main/assets/model.js#L342) |
| `G03` | Kiro 积分绝对量 | 副行 `120/500` | `24% 已用`（无副行） | [model.js](../../app/src/main/assets/model.js#L342) |
| `G04` | Zed 编辑预测次数 | 副行 `120/500` | `24% 已用`（无副行） | [model.js](../../app/src/main/assets/model.js#L342) |
| `G05` | GLM 日 Token 池 | 副行 `400 / 1K` | `40% 已用`（无副行） | [model.js](../../app/src/main/assets/model.js#L342) |
| `G06` | GLM Team 模型池 | 副行 `400 / 1K` | `40% 已用`（无副行） | [model.js](../../app/src/main/assets/model.js#L342) |
| `G07` | Kimi 组成说明 | 副行 `Kimi 40% · Code 60%` | `70% 已用`（无副行） | [model.js](../../app/src/main/assets/model.js#L342) |
| `G08` | 第三方 API 现金周期 | 展示 `Today / Week / Month / All-time` | `limitSpend=[]` | [model.js](../../app/src/main/assets/model.js#L275-L282) |
| `V06` | 微件工具区分度 | 42/42 规范名称 | 14/42 独立显示，28 个归为 `其他`，`senpi` 显示 `Senpi` | [WidgetLayoutPolicy.java](../../app/src/main/java/com/tokenmonitor/android/WidgetLayoutPolicy.java#L54-L100) |

---

## 6. 建议补齐优先级

1. **P0（纯展示/共享脚本同步，无需改动 Hub 接口）**：
   - 同步 `src/shared/limits/windowLabels.js` 与 `src/shared/currency.js`，在 [model.js](../../app/src/main/assets/model.js) 接入 `windowLabels.limitWindowLabel()`、`currency.js`（解决 `D01`、`D02`）及 `searchSpend` / `fetchSpend`（解决 `D03`）；
   - 放开 `model.js` 对 `windowText.limitWindowText()` 与 `limitSpend()` 的白名单限制，补齐 `G01`–`G08` 与 18 个 provider 友好名称（`D04`），并更新 `WidgetLayoutPolicy.java` 白名单（`V06`）。
2. **P1（总览/额度体验补齐）**：
   - 在 `OverviewView` 增加直达会话搜索入口（`#1454`），在 `LimitsView` 增加额度搜索、排序与已用/剩余切换（`L20`），并消费 `resetCredits` / `tranches` / `usageSummary`（`L14`、`L16`）。
3. **P2（需扩展原生 `ConnectionSpec` 只读白名单）**：
   - 按需开放 `/api/history`、`/api/devices`、`/api/stats/stream` 以支持完整历史范围、设备详情与 SSE 低延迟刷新。
