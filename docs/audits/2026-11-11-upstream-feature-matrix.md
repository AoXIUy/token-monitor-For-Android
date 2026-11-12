# 主线功能 → Android 适配审计与测试清单（2026-11-11）

**结论：没有全部适配。** 当前工程是现有 Hub 的 Android 只读客户端，主要覆盖统计查看、会话元数据、额度消费与本机额度历史。不能将“认识工具 ID”“能显示通用百分比”“已有回归全部通过”写成全部功能已移植。

- 审计主线：[`f280297` / 0.90.0](https://github.com/Javis603/token-monitor/commit/f2802979ee69930cd946e728db92bc981af0fc40)。本地 Android 已同步的功能提交仍是 `82e0051`；其后的最新 macOS 面板材质修复按平台项 V13 评估，不声称安卓已同步该源提交。
- Android：`codex/android-upstream-20261110`，HEAD `76972ee492b24c1e546ecf7494c093571586c420`，源码版本 **1.7.0 / versionCode 18**。v0.90 适配在审计期间由另一发布任务提交并推送；本审计仅新增报告与证据，**不修改产品实现、不触发发布**。
- 发布快照（北京时间 2026-11-11 00:22）：GitHub latest 指向 [v1.6.0](https://github.com/AoXIUy/token-monitor-For-Android/releases/tag/v1.6.0)，versionCode 17，目标 `655bf27`。1.7.0 的 [Android CI](https://github.com/AoXIUy/token-monitor-For-Android/actions/runs/42852101678) 已成功，含原生 WebView/认证步骤；尚不将 CI 或提交标题当作公开 Release。下表 APK 列**固定对照 v1.6.0**，不承诺以后仍是 latest。
- 清单口径：101 个功能验收项、README 中 54 类产品、42 个 usage client、35 个 limits provider、7 条接口探针。注册表共有 60 个不同机器 ID；这不等于 60 个产品，因 `droid/factory`、`zcode/zai/zaiteam` 等命名空间不同。
- “全部功能”按主线 README、配置、API、内置注册表和相应代码的用户可见能力审计；不将每个内部函数、所有社区插件或此前开发计划中的建议冒充主线现有功能。

## 1. 状态和验收口径

`已`：本表明确限定的消费/展示能力存在；不是本机采集、provider 登录、生产解析或真机验收全部通过。`部分`：只覆盖子集或存在具体差异。`未`：没有实现；平台/产品边界项明确标注，不自动算成应复制 Electron 的缺陷。

| 证据码 | 含义 |
| --- | --- |
| R | 存在相关现有回归，本次 portable 整套通过；右侧完整验收场景仍须按需补齐，本地设备用例本轮未执行；新提交的 CI WebView 步骤已成功。 |
| P | 只执行通用模型/名称探针；不证明 provider 生产 API、真实账户或 WebView 已验收。 |
| G | 本次独立只读探针已复现与主线规则的差异；现有 107 项回归不覆盖/不阻止这些差异。 |
| S | 源码审计，未执行该完整场景。 |
| W | 没有对应实现，验收目标当前阻塞。 |
| B | 需要先补原生接口/数据合同或上游能力，不能只加前端页面。 |
| E | Android 只读/生产端边界，扩大能力须单独改变产品范围。 |
| 平台 | 桌面操作系统专用，无直接 Android 验收项；不计普通客户端缺陷。 |
| 设备 | 必须用专用设备/模拟器验收，本次未执行。 |

功能项分类：已 38，部分 19，未 44。这些是本清单的验收粒度计数，不构成功能完成百分比。

## 2. 已适配 / 部分适配 / 未适配功能测试清单

### 用量、模型、项目与费用

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| U01 | 今日 / 本月 / 累计 Token、费用 | 已 | 已 | R | 对比同一 Hub 三个周期；总量、零费用、缺失费用与未定价小计不混淆。 | [UM] [AM] [OV] [TM] |
| U02 | 全部设备 / 单设备筛选 | 已 | 已 | R | 两台同名不同 ID 设备分别筛选；删除所选设备不得回退成全设备总量。 | [UA] [AM] [DV] [TM] |
| U03 | 输入、输出、缓存读写与推理 Token | 已 | 已 | R | 输入已知、缺失及部分组件；未知保持未知，缓存与推理量不重复累加。 | [UM] [AM] [SD] [TD] |
| U04 | 按工具 / 模型 / 项目汇总 | 已 | 已 | R | 三个维度与 Hub 汇总对应，项目不完整和未定价要有提示。 | [UM] [AM] [OV] [TM] |
| U05 | 超过 30 个项目 / 模型 / 工具的完整列表 | 部分 | 部分 | S | 输入 31 项：当前仅列前 30 项并提示截断；完整浏览 / 分页入口尚无。 | [OV] |
| U06 | 工具 / 模型 / 项目下钻与专属详情 | 部分 | 部分 | S | 总览可切维度，session 可看模型组成；主线独立工具、模型、项目详情及范围分析未实现。 | [UM] [OV] [SD] |
| U07 | 模型厂商图标 / 厂商色与 Inkling 品牌识别 | 部分 | 部分 | S | 模型原始名字可显示；没有主线厂商图标体系、品牌色设置或品牌分类视图。 | [UM] [VEND] [OV] |
| U08 | 显示货币 USD / TWD / HKD / CNY、汇率 | 部分 | 部分 | S | 用量费用固定 USD；账户余额与订阅保持原币种；无自动汇率、手动覆盖或显示币种切换。 | [UC] [OV] [QV] |
| U09 | 实时生成速率 tok/s、消耗速率 tok/min | 未 | 未 | W | 当前详情仅有累计匹配计时的平均 tok/s；无实时计数差分采样和 burn 模式。 | [UM] [RATE] [AM] [SD] |
| U10 | 近五分钟速率趋势 / boost 显示 | 未 | 未 | W | 主线临时速率历史未移植；不得用累计均速补造实时曲线。 | [RATE] [SD] |
| U11 | 累计匹配计时的平均输出速度 | 已 | 已 | R | 已知 timedOutputTokens / timedDurationMs 算均速；无耗时不估算。 | [AM] [SD] [TD] |
| U12 | 缺失 / 未定价 / 明细被省略提示 | 已 | 已 | R | 检查 unpricedTokens、projectsIncomplete 和 sessionDetailsOmitted，不能把完整总量当完整明细。 | [OV] [SV] [TD] |

### 会话、状态与缓存

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| S01 | 今日 / 本月会话列表、搜索与加载更多 | 已 | 已 | R | 按标题、项目、工具、模型搜索；分页不得漏掉匹配家族。 | [UM] [AM] [SV] [TG] |
| S02 | 按工具与运行 / 等待 / 结束状态筛选 | 已 | 已 | R | unknown / idle / archived 不计为 ended；工具筛选保留整组用量。 | [AM] [SV] [TS] [T85] |
| S03 | 父子代理、跨工具父链接、续接会话分组 | 已 | 已 | R | 跨工具父链接、16 子代理、同一原生线程续接；不得按同标题合并或重复计量。 | [AM] [SV] [TG] |
| S04 | 设备来源、硬件类型与同名机器区分 | 已 | 已 | R | 同名两台设备均列出 ID；未知 deviceKind 使用通用图标，不从 OS 猜硬件。 | [AM] [DV] [SV] [T85] |
| S05 | Token / 模型组成、费用、上下文、父子详情 | 已 | 已 | R | 详情采用该会话自己的快照，模型组件仅展示已观测覆盖，缺失显示未知。 | [AM] [SD] [TD] |
| S06 | 原生活动租约与推断活动的区分 | 已 | 已 | R | 30 秒租约边界、来源机器过期、未来时钟、断网与后台；不能借别台在线状态续租。 | [AM] [TS] |
| S07 | 推理强度与推理 Token 分开显示 | 已 | 已 | R | high 等设置与 reasoningTokens 分开；未知 / 清空不得继承老设置。 | [AM] [SD] [T84] |
| S08 | Claude 提示缓存到期估计 | 已 | 已 | R | Claude 有效租约可见；旧 Codex 同名字段不得当 Claude 缓存显示。 | [AM] [SD] [TD] |
| S09 | 最近使用模型 latestModel | 已 | 未 | R | 最新主会话模型优先，不取最大用量或新子代理；null / 缺失回退数量；历史模型桶不被改写。 | [UA] [AM] [SV] [SD] [T90] |
| S10 | 逐提问 / 逐回复 Token、工具调用、正文 | 未 | 未 | B | 主线仅在本机按需读 transcript / DB；现有 Hub 不传这些数据，需先评审数据协议与隐私边界。 | [UM] [UPR] [UA] [SD] |
| S11 | 在原工具打开 / 恢复会话、切本地账号 | 未 | 未 | E | Android 不持有电脑端路径或登录状态；无本机工具跳转和 Codex 活跃账号切换。 | [UM] [UC] [SV] |
| S12 | 会话标题同步的显示与管理 | 部分 | 部分 | S | 可显示 Hub 允许发送的 title；不提供生产端同意开关、标题编辑或跨设备设置写入。 | [UA] [AM] [SV] [CN] |
| S13 | 累计会话 / 完整历史会话归档浏览 | 部分 | 部分 | S | 可读今日 / 本月中已上传归档标记；累计会话页明确不可用，无本机 transcript 归档器。 | [UM] [SV] [AM] |
| C01 | 当前周期输入缓存命中率 | 已 | 部分 | R | 缓存读为命中，输入与缓存写为未命中；输出及未分类排除。公开 APK 只有缓存读 / 总 Token 占比。 | [AM] [OV] [T90] |
| C02 | 全部已测量会话缓存明细 | 已 | 未 | R | 包含完成会话、零命中和超过 6 行；无遥测不显示伪 0%，不依赖活动租约。 | [AM] [OV] [T90] |
| C03 | 工具 / 模型维度缓存命中拆分 | 部分 | 部分 | S | 会话及其模型已有组件；总览工具 / 模型列表没有主线独立组件下钻。 | [UM] [OV] [SD] |

### 用量历史与仪表板

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| H01 | 最近 14 个有记录日的趋势与数值表 | 已 | 已 | R | 真实日期排序，缺失日不补零；选中日期在刷新后保留。 | [AM] [OV] [HH] [TM] [ST] |
| H02 | 固定本周 / 近 7 天 / 近 30 天范围 | 未 | 未 | W | 页面仅 today / month / allTime；原生微件的近 7 日小计不等于页面完整日期范围功能。 | [UM] [TY] [CN] |
| H03 | 自定义历史范围 / 年份 / 完整历史读取 | 未 | 未 | B | GET /api/history 被原生路径白名单拒绝；没有历史范围选择或 revision 缓存。 | [UA] [CN] [AM] |
| H04 | 活跃热力图、连续天数、年度仪表板 | 未 | 未 | W | 只有短期总量趋势；无 heatmap、streak 或独立年度 Dashboard。 | [UM] [OV] [HH] |
| H05 | 按工具 / 模型堆叠历史、K 线 | 未 | 未 | W | 短期图仅总 Token / 费用；未消费 perClient / perModel 的历史组件。 | [UM] [HH] [OV] |
| H06 | 单设备完整历史 | 部分 | 部分 | S | 支持单设备当前周期汇总；未访问设备历史端点，趋势不提供完整单设备历史。 | [UA] [DV] [CN] |
| H07 | 累计活跃天数完整性标记 | 已 | 未 | R | 只有 activeDaysComplete=true 才叫累计；混合版本 / 缺失标记时仅统计所示日期去重天数。 | [UA] [AM] [OV] [T90] |
| H08 | 活跃时长 activeTimeMs 分析 | 未 | 未 | W | Hub 可提供该字段；Android 无活跃时长图或汇总，不能用输出耗时替代。 | [UA] [TY] [OV] |
| H09 | 保留已删除 session 的用量 | 部分 | 部分 | E | 能显示生产端保留的累计统计；不在 Android 扫描、归档或重建已删的电脑日志。 | [UM] [UARCH] [AM] |

### 额度、账户与本地额度历史

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| L01 | 35 个 provider 的通用百分比 / 余额读取 | 部分 | 部分 | P | 所有注册 ID 可通过通用模型；专用文案、积分与附加字段须按后面的 35 行单独验收。 | [UPRO] [AM] [QV] [TP] |
| L02 | 多账户 / 工作区 / 来源身份隔离 | 已 | 已 | R | 同邮箱不同 accountKey、匿名来源及不同工作区不混合；同账户镜像保持稳定身份。 | [AM] [QV] [TL] [T86] |
| L03 | 百分比、现金、积分、未知与零余额 | 已 | 已 | R | 不把积分写成 USD；明确零与缺失不同；showMeter=false 无假进度条。 | [AM] [BAL] [TL] [TM] |
| L04 | Muse / MiniMax / MiMo 产品边界 | 已 | 已 | R | Muse web/CLI、MiniMax Code/API/Token Plan、MiMo Console/Desktop 保持各自身份、读数与状态。 | [AM] [QV] [T84] [T87] [T88] |
| L05 | MiniMax 已验证账户标题关联 | 已 | 已 | R | 只在同区且 relatedAccountKey 确认时分标题组；不合并额度、币种或历史。 | [AM] [T87] |
| L06 | MiniMax 现金周期、Video 与无限额 | 已 | 已 | R | 今日/近7天/月/累计现金保留零与未知；Video 无明确时长不推定周周期；无限额不造历史。 | [AM] [T87] [LH] |
| L07 | MiMo 赠送 / 现金余额明细 | 已 | 已 | R | 总额直接采用快照；组成保留零，缺失不补零，不二次相加。 | [AM] [QV] [T88] |
| L08 | Mistral 订阅额度与独立钱包 | 已 | 已 | R | API / Vibe 金额及纯百分比各自保留；钱包无假比例，匿名读数按来源隔离。 | [AM] [T88] |
| L09 | Hark 日 / 月 / 功能额度与 Top-up | 已 | 部分 | R | 源码绝对数量与美元消费分开；公开 APK 只有通用百分比 / spend 读取。 | [AM] [T90] |
| L10 | Qoder 个人 / 团队独立积分池 | 已 | 部分 | R | Credits 与 Team credits 保留独立分母、重置时间和历史；公开 APK 缺绝对数量补充。 | [AM] [T90] [LH] |
| L11 | 消费预算上限与所有提供方现金周期 | 部分 | 部分 | G | G01：spend 的 limit 丢失；G08：第三方 API 周期支出未展示，不能据现有钱包判定完整适配。 | [AM] [QV] [UW] |
| L12 | Kiro / Zed / GLM / Kimi 专用读数 | 部分 | 部分 | G | G02-G07：超额金额、绝对积分/次数/Token 与组成文案缺失，详见复现表。 | [AM] [UW] [TP] |
| L13 | 额度绝对重置时间与倒计时 | 部分 | 部分 | S | 日期 / expiry 标签已显示；没有主线完整倒计时与用户显示模式切换。 | [QV] [UW] |
| L14 | Claude / Codex 重置券及到期详情 | 未 | 未 | W | Hub 的 resetCredits / grant 字段未由页面消费；应单独展示数量、到期，不计成可用额度。 | [UW] [QV] [TY] |
| L15 | Codex 第三方重置预测 | 未 | 未 | W | 无 codex-resets.com 预测入口 / 预测信息页，不能以普通 resetsAt 冒充预测。 | [UM] [UW] [QV] |
| L16 | TypeSafe / Claude 赠款 tranches、usageSummary | 部分 | 部分 | S | 通用余额可读；赠款到期分层、请求数与详细 Token/费用补充未展示。 | [UW] [TY] [QV] |
| L17 | 本机 SQLite 额度趋势与日净变化 | 已 | 已 | R | 工作区隔离、重开持久化、采样空档、冲突、额度变化、跨日与未知读数；180/730 日保留规则。 | [ULH] [LH] [QH] [T86] |
| L18 | 来源接管与冲突 guard | 已 | 已 | R | guard=2 兼容接管可续算，guard=1 保持真实冲突，旧数据不被重写或误当消费。 | [LH] [LP] [T88] |
| L19 | 额度历史跨 local / Hub / iCloud 模式迁移 | 未 | 未 | E | Android 只保留连接指纹内历史；无桌面模式 / 旧源索引迁移，不应直接混并不同 Hub。 | [ULH] [LH] |
| L20 | 额度账户搜索、排序、隐藏周期、显示已用/剩余开关 | 部分 | 部分 | S | 全部账户按现有页面显示；缺主线的搜索、可见项偏好、排序和统一显示模式设置。 | [UC] [QV] |
| L21 | provider 登录、多账号增删、凭据管理与主动采集 | 未 | 未 | E | 只在采集端管理；手机刷新读取已有 Hub 结果，不登录 provider、不读取电脑凭据。 | [UC] [CN] [MA] |
| L22 | 可选 provider、固定 / 自适应额度采集刷新 | 未 | 未 | E | 手机轮询频率不代表 provider 采样配置；没有生产端启用列表和自适应探测器。 | [UC] [MA] |

### 订阅与共享设置

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| B01 | 读取共享订阅与充值账本 | 已 | 已 | R | 固定币种与 minor 单位转换，周期订阅和 top-up 记录分开；失败保留旧数据。 | [UA] [QV] [AM] [TM] |
| B02 | 新增 / 修改 / 删除订阅 | 未 | 未 | E | 只读客户端无 PUT；若未来扩大范围，必须实现 baseUpdatedAt 并发冲突保护。 | [UA] [CN] [HC] |
| B03 | 续费日期、订阅时长、回本倍数 ROI | 部分 | 部分 | S | 显示起止日、周期与手工 nextRenewalOverride；不计算主线完整续费/时长/回本指标。 | [UM] [QV] |
| B04 | 共享订阅更新发现 | 已 | 已 | R | subscriptionsUpdatedAt 改变时重新 GET；失败提示与手动重试独立于用量。 | [UA] [MA] [NS] |
| B05 | 模型别名 / 自定义定价编辑与共享同步 | 未 | 未 | B | 未访问 /api/sync/settings；可显示 Hub 已计算费用，但不等于拥有别名/定价管理功能。 | [UC] [UA] [CN] [OV] |

### 连接、采集与服务端能力

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| N01 | 连接 Node Hub / Worker Hub | 已 | 已 | R | HTTPS、显式 HTTP、路径前缀、Bearer、401/403/404、响应上限与重定向拒绝。 | [UA] [CN] [HC] [ST] |
| N02 | SSE 完整帧、freshness / 增量协议 | 未 | 未 | B | 仅 5 秒 GET 轮询，无 stream 连接或补丁基线；不能称为 SSE 同步。 | [UA] [CN] [MA] |
| N03 | 手机本机独立采集、不依赖 Hub | 未 | 未 | E | 未包含 tokscale / 电脑日志扫描器，不能把已知 42 个名称等价于 42 种本地采集。 | [UC] [AG] [MA] |
| N04 | Host Hub / Node CLI Hub / Cloudflare Worker 部署 | 未 | 未 | E | Android 只消费已部署服务；无 Hub 监听端口、上传接收或 Worker 部署功能。 | [UM] [UC] [AG] |
| N05 | Headless agent、SSH / Linux 服务器采集 | 未 | 未 | E | 生产端独立运行；手机显示其上传结果，不是手机运行 Agent。 | [UM] [UAG] [AG] |
| N06 | WSL 扫描、扫描路径、重扫与收集开关 | 未 | 未 | E | Android 无 Windows/WSL 路径；不提供本机扫描管理，主线修复由采集端升级生效。 | [UC] [UAG] [AG] |
| N07 | iCloud Drive 同步 | 未 | 未 | E | 无 iCloud 模式和文件同步实现；当前连接指纹不能充当 iCloud 身份。 | [UM] [UPR] [CN] |
| N08 | 设备列表查看与状态 | 已 | 已 | R | 从 stats.devices 读取机器名/ID/硬件/近期上报；过期周期不作为当前数据。 | [UA] [DV] [AM] [T85] |
| N09 | 删除远端设备 / 服务端维护 | 未 | 未 | E | 无 DELETE /api/devices；测试应确认只读边界，而不是把入口缺失当权限绕过任务。 | [UA] [CN] [HC] |
| N10 | 工具来源健康详情 / 重新探测 | 未 | 未 | W | 额度状态和机器新鲜度已有；未展示 clientHealth 的逐工具错误与主线重扫操作。 | [UC] [UA] [SV] |
| N11 | 本地代理配置 / Provider 网络传输设置 | 未 | 未 | E | 安卓使用系统网络及原生 Hub 连接；没有桌面 provider 代理、Cookie 或 RPC 管理。 | [UC] [HC] |

### 导出、服务状态与诊断

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | 手动导出 CSV + 完整 JSON | 未 | 未 | W | 无 snapshot/daily/daily-models/export.json 保存入口；完整历史导出还受历史接口限制。 | [UE] [CN] [TY] |
| E02 | 自动导出到目录 / Obsidian / Grafana 文件工作流 | 未 | 未 | E | 无自动文件写入与周期导出任务；应用更新 APK 下载不属于使用数据导出。 | [UE] [AG] |
| E03 | Claude / OpenAI / Cursor / DeepSeek 服务状态视图 | 未 | 未 | W | provider 额度状态不等于上游服务状态页；无独立服务状态读取与周期检查。 | [UM] [USERVICE] [TY] |
| E04 | 脱敏诊断报告 / 原始设置文件入口 | 未 | 未 | W | 无主线诊断导出面板；有连接错误提示不等于可附到 issue 的诊断文件。 | [UC] [UDIAG] [TY] |

### 界面、平台呈现与插件

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| V01 | macOS 刘海 / 胶囊面板 | 未 | 未 | 平台 | 平台专用；Android 不存在刘海旁桌面窗口，原生微件另外评估。 | [UM] [AG] |
| V02 | Edge Dock 停靠 / 悬浮胶囊 / 多显示器位置 | 未 | 未 | 平台 | 无侧边悬浮窗或系统覆盖层；不能把 App 底部导航称为 Edge Dock。 | [UM] [UC] [MAN] |
| V03 | 菜单栏 / 系统托盘与自定义布局 | 未 | 未 | 平台 | Android 无桌面托盘；不复制托盘字体、账号/周期选择和拖动排版。 | [UM] [UC] [MAN] |
| V04 | 浮窗模式、窗口置顶 / 贴桌面 / 隐藏 Dock 图标 | 未 | 未 | 平台 | 没有对应的 Android overlay/window 模式；仅正常 Activity 和系统桌面微件。 | [UM] [UC] [MAN] |
| V05 | 原生系统小部件 | 部分 | 部分 | R | Android 有四类 RemoteViews 与响应式尺寸；未复制 macOS 热力图、完整模型/额度细节和所有内容配置。 | [UM] [WS] [WG] [TW] |
| V06 | 42 工具在原生微件中的名称区分 | 部分 | 部分 | G | 主界面 42/42 规范名称；原生白名单仅区分 14/42，28 个归其他；senpi 仍显示旧名 Senpi。 | [CAT] [WP] [WS] |
| V07 | 工具隐藏 / 置顶 / 拖动排序 | 未 | 未 | W | 没有主线工具列表偏好编辑；筛选某工具不是修改列表顺序或隐藏偏好。 | [UC] [OV] [SV] |
| V08 | 主页模块选择 / 顺序、自定义字体 / 厂商色 | 未 | 未 | W | 页面模块和字体样式固定，无自定义布局或颜色设置。 | [UC] [CSS] [TY] |
| V09 | 浅色主题 / 多主题 / 玻璃透明度 | 未 | 未 | W | 当前 CSS 固定深色；无系统浅色跟随、玻璃/透明窗口与主线外观面板。 | [UC] [CSS] |
| V10 | 多语言（含新增西班牙语） | 未 | 未 | W | 界面中文固定，工具/模型名可原样显示，但无主线语言包切换。 | [UC] [TY] |
| V11 | 全局显示/隐藏快捷键 | 未 | 未 | 平台 | 桌面全局键盘功能无 Android 对等实现。 | [UM] [UC] [MAN] |
| V12 | Discord Rich Presence | 未 | 未 | 平台 | 不向 Discord 广播今日数据，无客户端/IPC 集成。 | [UM] [UC] [MAN] |
| V13 | macOS / Windows / Wayland 材质与位置修复 | 未 | 未 | 平台 | 最新 f280297 黑底修复属于 Electron 面板；Android 不包含这些窗口，不是漏移植 bug。 | [UM] [UC] [AG] |
| P01 | 插件目录发现、安装 / 更新 / 卸载与信任管理 | 未 | 未 | E | 安卓无插件管理器；不加载社区或本地插件。 | [UPL] [TY] [AG] |
| P02 | 插件自定义页面 / 设置 / 多桌面挂载 | 未 | 未 | E | 不存在插件 UI 容器、快捷卡片、主题或后台生命周期 API。 | [UPL] [TY] |
| P03 | 插件 Node 后端、资源 / 通知 / 数据接口 | 未 | 未 | E | 没有 Node 后端进程或 host.call 接口；Android 原生桥不能被当通用插件桥。 | [UPL] [AG] |
| P04 | 插件原生额度与 OpenAI API credit 插件 | 未 | 未 | B | 主线插件额度仍不进入 DeviceRecord / Hub/Worker，先有协议才可能做远端只读展示。 | [UPQ] [UA] [CN] |

### Android 等价能力与平台验收

| ID | 主线功能 / 对照能力 | 当前源码 | 公开1.6.0 | 证据 | 测试场景及验收要求 | 入口/用例 |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | GitHub 应用更新检查 / 提示 | 已 | 已 | R | 固定安卓仓库稳定版，自动/手动、关闭自动后手动、节流与迟到结果；与 Hub 凭据隔离。 | [UPDATES] [UPOL] [TUP] |
| A02 | 应用内下载、哈希/签名校验与系统安装确认 | 已 | 已 | R | 错误包名、代码未增加、摘要/证书不符、取消/重建和系统授权均应检查；本轮不实际安装。 | [UPDATES] [APK] [TDL] |
| A03 | 后台完成监控、去重与通知跳转 | 已 | 已 | R | Android 扩展：先见活动再见明确结束；首次/推断/失联不补发，停止与点击跳转不串连接。 | [MON] [COMPLETE] [TC] |
| A04 | Keystore、只读网络、离线旧读数与资源隔离 | 已 | 已 | R | secret 不回传网页，连接切换清旧状态，WebView 只读 APK 资源；留存旧页面不宣称冷启动离线档案。 | [STORE] [CN] [LOCAL] [HC] [NS] |
| A05 | 旋转 / 刘海 / 键盘 Insets / 大字体可访问性 | 部分 | 部分 | 设备 | 有 Insets、图表文本替代和既有仪器用例；本次未验 200% 字体、TalkBack、不同启动器/系统。 | [MA] [ST] [TW] [CSS] |

## 3. 54 类产品逐项清单

统一边界：下列用量“可读”只表示 Hub 已上传的归一化汇总/会话元数据可由 Android 消费；42 种工具均**不在手机本机采集**。主线表中的“session 明细”是本机逐提问/回复/工具调用，Android 对这些项均未移植（S10）。额度核心状态及其验收见下一节。工具级在线联调与各厂商真实账户均未在本轮测试。

测试 `I01-I54`：向同一合成 Hub 快照分别放入该产品的 client/provider 数据，核对 ID、名称、统计总量、未知值、账户身份和手机端无越权采集；有主线逐消息能力的产品额外确认“仅元数据，不显示虚构正文”。本次名称探针覆盖 42/42；不声称这 54 条完整场景均已在 UI/设备执行。

| 测试ID | 主线产品 | 主线用量/额度/逐消息 | 安卓聚合用量 | 额度核心 | 安卓本机逐消息 | 原生用量微件名称 |
| --- | --- | --- | --- | --- | --- | --- |
| I01 | Claude Code | ✅ / ✅ / ✅ | 可读 `claude` | claude：部分 | 未 | Claude |
| I02 | Codex | ✅ / ✅ / ✅ | 可读 `codex` | codex：部分 | 未 | Codex |
| I03 | OpenCode | ✅ / ✅ / ✅ | 可读 `opencode` | opencode：已 | 未 | OpenCode |
| I04 | Hermes Agent | ✅ / — / — | 可读 `hermes` | — | —（主线无此项） | 其他 |
| I05 | OpenClaw | ✅ / — / — | 可读 `openclaw` | — | —（主线无此项） | 其他 |
| I06 | Cursor IDE / Cursor CLI / Grok Bot | ✅ / ✅ / — | 可读 `cursor` | cursor：部分 | —（主线无此项） | Cursor |
| I07 | Antigravity | ✅ / ✅ / — | 可读 `antigravity` | antigravity：已 | —（主线无此项） | Antigravity |
| I08 | Gemini CLI | ✅ / — / — | 可读 `gemini` | — | —（主线无此项） | Gemini CLI |
| I09 | Cline | ✅ / ✅ / — | 可读 `cline` | cline：已 | —（主线无此项） | 其他 |
| I10 | Amp | ✅ / — / — | 可读 `amp` | — | —（主线无此项） | 其他 |
| I11 | Factory Droid | ✅ / ✅ / — | 可读 `droid` | factory：已 | —（主线无此项） | 其他 |
| I12 | Kimi CLI / Kimi Code / Kimi Work | ✅ / ✅ / — | 可读 `kimi` | kimi：部分 | —（主线无此项） | 其他 |
| I13 | Qwen CLI | ✅ / — / — | 可读 `qwen` | — | —（主线无此项） | 其他 |
| I14 | Grok Build | ✅ / ✅ / — | 可读 `grok` | grok：已 | —（主线无此项） | 其他 |
| I15 | GitHub Copilot | ✅ / ✅ / — | 可读 `copilot` | copilot：已 | —（主线无此项） | Copilot |
| I16 | Pi | ✅ / — / ✅ | 可读 `pi` | — | 未 | 其他 |
| I17 | Oh My Pi | ✅ / — / ✅ | 可读 `omp` | — | 未 | 其他 |
| I18 | OmO Native | ✅ / — / ✅ | 可读 `senpi` | — | 未 | Senpi（旧名） |
| I19 | Goose | ✅ / — / — | 可读 `goose` | — | —（主线无此项） | 其他 |
| I20 | Zed | ✅ / ✅ / — | 可读 `zed` | zed：部分 | —（主线无此项） | 其他 |
| I21 | Kilo | ✅ / — / — | 可读 `kilo` | — | —（主线无此项） | 其他 |
| I22 | Command Code | ✅ / ✅ / — | 可读 `commandcode` | commandcode：已 | —（主线无此项） | 其他 |
| I23 | MiMo Code / MiMo Desktop | ✅ / ✅ / — | 可读 `mimo` | mimo：已 | —（主线无此项） | MiMo |
| I24 | Muse / Muse Code | ✅ / ✅ / — | 可读 `muse` | muse：已 | —（主线无此项） | Muse Code |
| I25 | ZCode / GLM | ✅ / ✅ / — | 可读 `zcode` | zai：部分 / zaiteam：部分 | —（主线无此项） | 其他 |
| I26 | Kiro | ✅ / ✅ / — | 可读 `kiro` | kiro：部分 | —（主线无此项） | 其他 |
| I27 | CodeBuddy | ✅ / — / ✅ | 可读 `codebuddy` | — | 未 | 其他 |
| I28 | WorkBuddy | ✅ / ✅ / ✅ | 可读 `workbuddy` | workbuddy：部分 | 未 | 其他 |
| I29 | Proma | ✅ / — / — | 可读 `proma` | — | —（主线无此项） | 其他 |
| I30 | CatPaw | ✅ / — / — | 可读 `catpaw` | — | —（主线无此项） | 其他 |
| I31 | Qoder | ✅ / ✅ / — | 可读 `qodercn` | qoder：已 | —（主线无此项） | 其他 |
| I32 | Reasonix | ✅ / — / — | 可读 `reasonix` | — | —（主线无此项） | 其他 |
| I33 | DeepSeek / DeepSeek Harness | ✅ / ✅ / ✅ | 可读 `dsh` | deepseek：已 | 未 | 其他 |
| I34 | Cherry Studio | ✅ / — / — | 可读 `cherrystudio` | — | —（主线无此项） | 其他 |
| I35 | LM Studio | ✅ / — / — | 可读 `lmstudio` | — | —（主线无此项） | 其他 |
| I36 | Unsloth Studio | ✅ / — / — | 可读 `unsloth` | — | —（主线无此项） | 其他 |
| I37 | Devin CLI / Devin Desktop | ✅ / ✅ / — | 可读 `devin` | devin：已 | —（主线无此项） | 其他 |
| I38 | fx | ✅ / — / — | 可读 `fx` | — | —（主线无此项） | 其他 |
| I39 | MiniMax / MiniMax Code | ✅ / ✅ / — | 可读 `mcode` | minimax：已 | —（主线无此项） | MiniMax Code |
| I40 | Mistral Vibe | ✅ / ✅ / — | 可读 `mistral` | mistral：已 | —（主线无此项） | Mistral Vibe |
| I41 | Prime Agent | ✅ / — / — | 可读 `prime-agent` | — | —（主线无此项） | Prime Agent |
| I42 | Jcode | ✅ / — / — | 可读 `jcode` | — | —（主线无此项） | Jcode |
| I43 | TypeSafe | — / ✅ / — | —（主线无usage） | typesafe：部分 | —（主线无此项） | — |
| I44 | OpenRouter | — / ✅ / — | —（主线无usage） | openrouter：部分 | —（主线无此项） | — |
| I45 | Volcengine | — / ✅ / — | —（主线无usage） | volcengine：已 | —（主线无此项） | — |
| I46 | Ollama | — / ✅ / — | —（主线无usage） | ollama：已 | —（主线无此项） | — |
| I47 | Trae CN | — / ✅ / — | —（主线无usage） | trae：已 | —（主线无此项） | — |
| I48 | Alibaba Cloud | — / ✅ / — | —（主线无usage） | alibaba：已 | —（主线无此项） | — |
| I49 | StepFun | — / ✅ / — | —（主线无usage） | stepfun：已 | —（主线无此项） | — |
| I50 | Notion AI | — / ✅ / — | —（主线无usage） | notion：已 | —（主线无此项） | — |
| I51 | Manus | — / ✅ / — | —（主线无usage） | manus：已 | —（主线无此项） | — |
| I52 | Hark | — / ✅ / — | —（主线无usage） | hark：已 | —（主线无此项） | — |
| I53 | OpenDesign | — / ✅ / — | —（主线无usage） | opendesign：已 | —（主线无此项） | — |
| I54 | 第三方 API | — / ✅ / — | —（主线无usage） | thirdparty：部分 | —（主线无此项） | — |

原生微件 14 个可区分名称、28 个“其他”是静态白名单的实际结果；“其他”仍保留汇总数值，但会合并名称桶。App 主界面 42 个 client 名称均与主线目录一致。不能以白名单保护隐私为由宣称已逐工具区分，也不应为修复名称而持久化任意 Hub 字符串。

## 4. 全部 35 个额度 provider 核心读数清单

共同测试：同一 provider 两个账户、同名不同 key、来源变化、stale/unauthorized/缺失/零、多个同 kind 窗口、余额币种、重置与到期边界。35/35 的通用 30% 模型探针通过；只有部分有专门归一化 fixture，**没有逐厂商在线解析/登录验收**。账户增删、登录和凭据配置均按 L21 为未适配，不重复算进每行。已 = 该行核心读数可表达，不代表该厂商所有附加能力齐全。

| 测试ID | provider | 源码核心 | 公开1.6.0 | 适配边界 / 缺口 | 专用测试要求 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| Q01 | claude | 部分 | 部分 | resetCredits、prepaid tranches 未展示 | 给重置券和赠款到期；须保留数量、币种、每笔到期。 | [TL] [ST] |
| Q02 | codex | 部分 | 部分 | 重置券 / 第三方预测未适配 | 带 resetCredits 与预测资料；不能把它们写入普通额度读数。 | [T84] [ST] |
| Q03 | opencode | 已 | 已 | Go / Zen 窗口与钱包可按身份显示 | 同工作区不同产品、不同 key、负/零钱包分别核对；旧键别名由 Hub 负责。 | [TL] [AM] |
| Q04 | cursor | 部分 | 部分 | 有上限的 spend 丢掉上限（G01） | 2.35/20 USD 必须保留分母；缺上限才只显示实际消费。 | [AM] [UW] |
| Q05 | antigravity | 已 | 已 | 通用多窗口额度与来源 | 多账号 session/weekly 的已知百分比与过期状态不得互相覆盖。 | [TL] [TS] |
| Q06 | cline | 已 | 已 | 通用百分比 / 余额 | 配额、余额、未知、零与失败旧快照分别验收。 | [AM] [TM] |
| Q07 | factory | 已 | 已 | Standard / Core / Billing 窗口可逐行保留 | 同种类多个窗口、additional 标记与独立余额不得丢失或相加。 | [AM] [QV] |
| Q08 | kimi | 部分 | 部分 | Kimi/Code 组成 detail 缺失（G07） | 同一会员池占用率及组成说明同时可读，不另造两个分母。 | [AM] [UW] |
| Q09 | grok | 已 | 已 | Monthly 额度与稳定 accountKey 消费 | 换 token 后同一新稳定 key 续读；不从邮箱猜旧 key 的历史。 | [AM] [QV] |
| Q10 | copilot | 已 | 已 | 多个 billing 池通用显示 | 不同额度桶、原始 label、零/缺失和 sourceRateLimited 独立。 | [AM] [QV] |
| Q11 | zed | 部分 | 部分 | 绝对编辑预测次数缺失（G04） | 120/500 次、美元消费、Unlimited 互不混淆。 | [AM] [UW] |
| Q12 | commandcode | 已 | 已 | 月赠款 / Top-up / 5h / weekly 分离 | 赠款有明确 used/limit 时比例正确；47.42/70 与充值池不合计。 | [AM] [BAL] |
| Q13 | mimo | 已 | 已 | Console/Desktop 与余额组成 | gift=0、cash=30、总额采用原值，套餐与产品名称分开。 | [T88] |
| Q14 | muse | 已 | 已 | web / CLI 与额外 Token | 同设备 / 跨设备身份，钱包币种与 Token 文案分别显示。 | [T84] [TL] |
| Q15 | zai | 部分 | 部分 | Daily / 模型池绝对 Token 缺失（G05） | 400/1000 Token 与 40% 同时展示；MCP 不冒充 Token 池。 | [AM] [UW] |
| Q16 | zaiteam | 部分 | 部分 | 独立模型 Token 池绝对量缺失（G06） | limitId 窗口互不覆盖，补齐真实数量而非重算未知总量。 | [AM] [UW] |
| Q17 | kiro | 部分 | 部分 | Overage 变暂无读数、绝对积分缺失（G02/G03） | 14 credits 与估价 $0.56 一并展示；Bonus 到期区别于 Reset。 | [AM] [UW] |
| Q18 | workbuddy | 部分 | 部分 | usageSummary 等专用明细未显示 | 账户池可读；完整月请求/Token/费用详情仍需补充用例与页面。 | [QV] [TY] [UW] |
| Q19 | qoder | 已 | 部分 | 源码有个人 / 团队绝对积分；公开版仅通用显示 | 20/100 与 10/50 各自重置；服务部分失败不将一个池补进另一个池。 | [T90] [ST] |
| Q20 | deepseek | 已 | 已 | 原币种余额 | CNY/其他原币种保留；明确零与未配置不同。 | [AM] [BAL] |
| Q21 | devin | 已 | 已 | 日 / 周额度与额外余额 | 保留窗口标签和币种，原始余额不并入百分比额度。 | [AM] [BAL] |
| Q22 | minimax | 已 | 已 | Code / API / Token Plan 与现金周期 | 同区已验证标题关联、独立异常、Video / Unlimited、现金零和未知全部核对。 | [T87] [ST] |
| Q23 | mistral | 已 | 已 | API / Vibe 与独立钱包 | 纯百分比不补金额，负余额保留，匿名来源隔离。 | [T88] [ST] |
| Q24 | typesafe | 部分 | 部分 | 钱包可见，usageSummary / tranches 不全 | 独立 billing 余额与 usage 估价不互代；逐笔到期和请求/Token 明细未适配。 | [TY] [QV] [UW] |
| Q25 | openrouter | 部分 | 部分 | 余额可读，专用消费/额度补充不全 | 账户余额、key 限额、实际消费与无 meter 文案分别核对。 | [AM] [UW] |
| Q26 | volcengine | 已 | 已 | session / daily / weekly / billing 通用窗口 | 同类多个窗口与计划标签保留，不把产品积分当美元。 | [AM] [QV] |
| Q27 | ollama | 已 | 已 | included allowance / 钱包 / spend 分开 | 52.5/60 额度、18.25 独立钱包和 4.5 消费分别显示。 | [TL] |
| Q28 | trae | 已 | 已 | 归一化额度窗口 | quota 账户身份、原币种及已知/未知比例按归一化快照显示。 | [AM] [QV] |
| Q29 | alibaba | 已 | 已 | Token Plan / Team 等窗口 | billing 与滚动窗口按各自标签 / 单位显示，不能跨产品加总。 | [AM] [QV] |
| Q30 | stepfun | 已 | 已 | 归一化窗口和余额 | 余额与 Token Plan 窗口保持各自单位，无分母不制造占用率。 | [AM] [BAL] |
| Q31 | notion | 已 | 已 | 账户/工作区身份与额度 | 同 workspace 不同用户的已验证 key 不能因同名而合并。 | [AM] [TL] |
| Q32 | manus | 已 | 已 | CREDITS 积分 | 积分数值不加美元符号，未知与零值不混淆。 | [T84] [ST] |
| Q33 | hark | 已 | 部分 | 源码有绝对日/月数量与 Top-up | 125/100 超额数量保留，Top-up $1.25 无条；无用量工具/会话数据。 | [T90] [ST] |
| Q34 | opendesign | 已 | 已 | 工作区额度与本机历史 | 不同 workspace、失败旧读数、真实零、五小时边界和历史保存。 | [T86] [ST] |
| Q35 | thirdparty | 部分 | 部分 | 余额可读，New API 周期支出缺失（G08） | Today/Week/Month/All-time 零与未知保留；usage、group、tranches 需另补。 | [AM] [QV] [UW] |

## 5. 已复现的具体差异（不是单纯缺少测试）

以下输入均先通过固定主线的 `normalizeLimitProvider` 归一化，再对照主线 `limitWindowText` 与 Android `MonitorModel.quota`；G08 比较主线第三方消费明细代码与 Android `limitSpend`。没有 provider 网络请求或真实凭据。

| ID | provider | 主线预期 | 安卓展示模型实际输出 | 结果 | 差异 | 精确代码位置 |
| --- | --- | --- | --- | --- | --- | --- |
| G01 | cursor | $2.35 / $20.00 | $2.35；无补充明细 | 已复现 | 消费上限金额缺失 | [USPN] [AQ] |
| G02 | kiro | 14 credits · $0.56 | 暂无读数；无补充明细 | 已复现 | 超额积分与估价未显示 | [UKIRO] [AQ] |
| G03 | kiro | 120/500 | 24% 已用；无补充明细 | 已复现 | 绝对积分数量缺失 | [UKIRO] [AQ] |
| G04 | zed | 120/500 | 24% 已用；无补充明细 | 已复现 | 编辑预测绝对次数缺失 | [UZED] [AQ] |
| G05 | zai | 400 / 1K | 40% 已用；无补充明细 | 已复现 | 每日 Token 池绝对数量缺失 | [UZAI] [AQ] |
| G06 | zaiteam | 400 / 1K | 40% 已用；无补充明细 | 已复现 | 模型独立 Token 池绝对数量缺失 | [UZAI] [AQ] |
| G07 | kimi | Kimi 40% · Code 60% | 70% 已用；无补充明细 | 已复现 | Kimi 与 Code 组成说明缺失 | [UKIMI] [AQ] |
| G08 | thirdparty | Today/Week/Month/All-time 已知支出 | limitSpend 返回 [] | 已复现 | 第三方 API 现金周期未展示 | [UTHIRD] [ASP] |

G01/G02 应优先修正为金额/单位语义问题；G03-G08 补齐专用信息，避免将“通用读数可见”当作完整适配。另有 V06 的 28 个微件工具名称归并，以及 L14/L16 的 resetCredits / tranches / usageSummary 未消费（后者为源码审计，不冒充执行过的 UI 测试）。

正向对照：Qoder Team credits 为 `10/50`，Hark 超额数量为 `125 / 100`（归一化百分比可截为100），Mistral 为 `$25.00 / $100.00`，Command Code 正常含 used 的赠款正确保留 `$47.42` 与 `$22.58/$70.00`。不将不同排版本身认定为缺失。

## 6. 原生接口范围核对

| 只读路径 | 当前结果 | 功能影响 |
| --- | --- | --- |
| /api/stats | 允许 | 汇总、设备快照、额度和短预览 |
| /api/subscriptions | 允许 | 只读共享订阅 |
| /api/history | 拒绝 | 完整用量历史不可用 |
| /api/devices | 拒绝 | 完整设备/设备历史接口不可用（stats.devices 仍可看） |
| /api/stats/stream | 拒绝 | 无 SSE |
| /api/sync/content | 拒绝 | 无标题/共享设置能力协商 |
| /api/sync/settings/modelAliases | 拒绝 | 无别名设置读取/写入 |

另外：PUT /api/subscriptions、DELETE /api/devices、POST /api/ingest、PUT /api/sync/titles 和 PUT /api/sync/settings 没有客户端调用入口；`HubClient` 只发 GET。允许 `/api/subscriptions` 这个路径不等于实现 PUT。APK 更新网络另有固定 GitHub 白名单，不是任意 Hub 接口代理。

## 7. 本轮验证记录与发布边界

- 本审计在 `76972ee` 提交后再次执行 `npm run verify`：107 项 Node 回归通过，前端类型与生产构建通过；Java 连接14、完成24、更新19、APK25、微件90、历史策略14全部通过。
- 独立探针：42/42 App 工具标签匹配；35/35 通用 provider 百分比可读；42 个原生微件名称有14个独立名称、28个其他；7个接口路径中2个允许、5个拒绝；8个专用展示差异复现，4个正向对照成立。
- 上一适配阶段的本地 `assembleDebug assembleDebugAndroidTest lint` 已通过，lint 0错误/36警告。本审计没有重复本地 APK 构建；同期新 HEAD 的 Android CI 已成功，其中原生 WebView/认证步骤也为 success，不能将这理解成所有厂商和所有设备场景都已验收。
- 本轮不运行 `connectedDebugAndroidTest`：当前没有专用设备授权/运行结果；该命令会清空连接配置。上一阶段执行申请曾因无专用设备被自动审批拒绝，本审计没有重试或绕过。
- 对照 v1.6.0 的 [Android CI](https://github.com/AoXIUy/token-monitor-For-Android/actions/runs/42556373345) 和 [Release workflow](https://github.com/AoXIUy/token-monitor-For-Android/actions/runs/42557080252) 均为 success，对应 `655bf27`。当前 `76972ee` 另有成功的 [Android CI](https://github.com/AoXIUy/token-monitor-For-Android/actions/runs/42852101678)；本轮逐一核实了 HEAD 和原生 WebView 步骤，不以旧提交的 CI 替代新提交。
- 本轮没有实际 provider 登录/计费接口、真实 Hub 跨设备在线联调、系统安装、物理机/启动器/省电/可访问性验收；相关清单均保持待验。

## 8. 补齐顺序建议

| 顺序 | 范围 | 退出条件 |
| --- | --- | --- |
| 1 | G01-G08、V06、L14/L16 | 先补金额/单位和已有 Hub 字段消费，添加失败变通过的回归；不用新接口即可改善大部分专用读数。 |
| 2 | 1.7.0 发布与后续真实设备验收 | 新提交 CI 已通过；继续独立核对公开 Release/资产，并对物理设备、真实 Hub/厂商账户补做验收，不覆盖旧版本资产。 |
| 3 | 完整历史、固定范围、模型/项目下钻、手动导出 | 原生只读路径按合同扩展；旧 Hub 可降级，日期/时区/完整性和未知值均有回归。 |
| 4 | 实时匹配速率/SSE、服务状态、显示偏好 | 实时采样与平均值严格区分，连接/前后台/丢帧/回退及凭据边界通过验证。 |
| 需单独决策 | provider账号管理、Hub写入、插件与逐消息 | 这些突破只读产品或现有传输边界，不能当普通前端补丁直接加入。 |
| 不强求复制 | macOS/Windows/Wayland专用窗口、托盘和全局键 | 保留平台边界，以Android原生能力独立定义验收。 |

## 9. 证据索引

下列工作区链接包含当前真实行号；上游链接固定到本次审计 SHA，避免主线滚动改变依据。

- **UM**：[主线功能目录](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/README.zh-CN.md#L159)
- **UC**：[主线配置目录](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/configuration.md#L12)
- **UA**：[主线 API](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/API.md#L361)
- **UPR**：[主线隐私与同步边界](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/privacy.md#L18)
- **UE**：[主线导出](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/export.md#L8)
- **ULH**：[主线额度历史](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/limits-history.md#L25)
- **UPL**：[主线插件 API](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/plugins/README.md#L17)
- **UPQ**：[插件额度未进入 Hub 的合同](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/plugins/author-limits.md#L147)
- **UPRO**：[主线 provider 注册表](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/providers.js#L35)
- **UARCH**：[主线 usage 归档](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/archive-replay.md#L1)
- **UAG**：[主线 Headless Agent](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/headless-agent.md#L5)
- **RATE**：[主线实时速率](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/renderer/tokenRatePresentation.js#L91)
- **VEND**：[主线厂商模型识别](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/renderer/usageCharts.js#L472)
- **UW**：[主线专用额度展示](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/renderer/limits/windowsView.js#L764)
- **USPN**：[主线消费金额与上限](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L95)
- **UKIRO**：[主线 Kiro 超额/积分](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L161)
- **UZED**：[主线 Zed 绝对数量](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L170)
- **UZAI**：[主线 GLM Token 池](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L176)
- **UKIMI**：[主线 Kimi 组成](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L193)
- **UTHIRD**：[主线第三方现金明细](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/renderer/limits/windowsView.js#L643)
- **USERVICE**：[主线服务状态](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/serviceStatus.js#L1)
- **UDIAG**：[主线诊断](https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/diagnostics.js#L1)
- **AG**：[Android 工程边界](/home/cloud/code/token-monitor-For-Android/AGENTS.md:3)
- **AM**：[Android 展示模型](/home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js:42)
- **AQ**：[Android 额度具体计算入口](/home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js:315)
- **ASP**：[Android 现金周期过滤入口](/home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js:275)
- **OV**：[总览与截断提示](/home/cloud/code/token-monitor-For-Android/ui/src/components/OverviewView.tsx:54)
- **DV**：[设备视图](/home/cloud/code/token-monitor-For-Android/ui/src/components/DevicesView.tsx:13)
- **SV**：[会话视图](/home/cloud/code/token-monitor-For-Android/ui/src/components/SessionsView.tsx:75)
- **SD**：[会话详情](/home/cloud/code/token-monitor-For-Android/ui/src/components/SessionDetailView.tsx:40)
- **HH**：[短期历史图](/home/cloud/code/token-monitor-For-Android/ui/src/components/HistoryChart.tsx:6)
- **TY**：[页面和数据类型](/home/cloud/code/token-monitor-For-Android/ui/src/types/monitor.ts:1)
- **QV**：[额度与共享订阅页面](/home/cloud/code/token-monitor-For-Android/ui/src/components/LimitsView.tsx:21)
- **CN**：[只读接口白名单](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/ConnectionSpec.java:41)
- **HC**：[Hub GET 客户端](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/HubClient.java:26)
- **MA**：[原生轮询与生命周期](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/MainActivity.java:273)
- **BAL**：[共享钱包与币种计算](/home/cloud/code/token-monitor-For-Android/src/shared/limits/balanceDisplay.js:49)
- **LH**：[本机额度 SQLite](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/LimitsHistoryStore.java:20)
- **LP**：[历史接管策略](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/LimitsHistoryPolicy.java:7)
- **QH**：[额度历史预览](/home/cloud/code/token-monitor-For-Android/ui/src/components/QuotaHistoryPreview.tsx:11)
- **CAT**：[42 工具名称目录](/home/cloud/code/token-monitor-For-Android/src/shared/clientCatalog.js:50)
- **WP**：[原生微件名称白名单](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/WidgetLayoutPolicy.java:54)
- **WS**：[原生微件数据摘要](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetSnapshot.java:15)
- **WG**：[四类微件预览](/home/cloud/code/token-monitor-For-Android/ui/src/components/WidgetGalleryCard.tsx:15)
- **CSS**：[固定深色样式](/home/cloud/code/token-monitor-For-Android/ui/src/index.css:5)
- **MAN**：[Android Manifest](/home/cloud/code/token-monitor-For-Android/app/src/main/AndroidManifest.xml:2)
- **UPDATES**：[Android 更新管理](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/AppUpdates.java:16)
- **UPOL**：[更新版本策略](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/AppUpdatePolicy.java:4)
- **APK**：[APK 校验策略](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/ApkUpdatePolicy.java:11)
- **MON**：[Android 后台监控](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/SessionMonitorService.java:18)
- **COMPLETE**：[完成信号策略](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/SessionCompletionTracker.java:11)
- **STORE**：[Keystore 连接存储](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/ConnectionStore.java:16)
- **LOCAL**：[WebView 资源白名单](/home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/LocalContentClient.java:16)
- **NS**：[原生消息状态](/home/cloud/code/token-monitor-For-Android/ui/src/nativeState.js:30)
- **TM**：[基础模型回归](/home/cloud/code/token-monitor-For-Android/tests/android/model.test.js:3)
- **TD**：[会话详情回归](/home/cloud/code/token-monitor-For-Android/tests/android/sessionDetail.test.js:3)
- **TG**：[家族分组回归](/home/cloud/code/token-monitor-For-Android/tests/android/sessionGroups.test.js:3)
- **TS**：[活动状态回归](/home/cloud/code/token-monitor-For-Android/tests/android/sessionStatus.test.js:3)
- **TL**：[账户/钱包回归](/home/cloud/code/token-monitor-For-Android/tests/android/upstreamLimits.test.js:3)
- **T84**：[v0.84 回归](/home/cloud/code/token-monitor-For-Android/tests/android/upstream84.test.js:3)
- **T85**：[v0.85 回归](/home/cloud/code/token-monitor-For-Android/tests/android/upstream85.test.js:3)
- **T86**：[v0.86 历史回归](/home/cloud/code/token-monitor-For-Android/tests/android/upstream86.test.js:3)
- **T87**：[MiniMax 回归](/home/cloud/code/token-monitor-For-Android/tests/android/upstream87.test.js:3)
- **T88**：[v0.88 回归](/home/cloud/code/token-monitor-For-Android/tests/android/upstream88.test.js:3)
- **T90**：[v0.90 回归](/home/cloud/code/token-monitor-For-Android/tests/android/upstream90.test.js:3)
- **TP**：[共享窗口文字规则](/home/cloud/code/token-monitor-For-Android/src/shared/limits/windowText.js:127)
- **ST**：[WebView/认证/界面仪器用例](/home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/StartupTest.java:40)
- **TW**：[微件仪器用例](/home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/UsageWidgetTest.java:18)
- **TUP**：[更新仪器用例](/home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/AppUpdatesTest.java:22)
- **TDL**：[下载与安装交接仪器用例](/home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/AppUpdateDownloadsTest.java:28)
- **TC**：[完成投影仪器用例](/home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/CompletionProjectionTest.java:13)

## 10. 机器可读审计证据

见 [2026-11-11-upstream-feature-evidence.json](2026-11-11-upstream-feature-evidence.json)：功能状态、54产品映射、35provider条目、归一化探针输入/输出、微件标签与接口决定。文件仅含合成测试数据与公开源码信息。

[UM]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/README.zh-CN.md#L159 "主线功能目录"
[UC]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/configuration.md#L12 "主线配置目录"
[UA]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/API.md#L361 "主线 API"
[UPR]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/privacy.md#L18 "主线隐私与同步边界"
[UE]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/export.md#L8 "主线导出"
[ULH]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/limits-history.md#L25 "主线额度历史"
[UPL]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/plugins/README.md#L17 "主线插件 API"
[UPQ]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/plugins/author-limits.md#L147 "插件额度未进入 Hub 的合同"
[UPRO]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/providers.js#L35 "主线 provider 注册表"
[UARCH]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/archive-replay.md#L1 "主线 usage 归档"
[UAG]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/docs/headless-agent.md#L5 "主线 Headless Agent"
[RATE]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/renderer/tokenRatePresentation.js#L91 "主线实时速率"
[VEND]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/renderer/usageCharts.js#L472 "主线厂商模型识别"
[UW]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/renderer/limits/windowsView.js#L764 "主线专用额度展示"
[USPN]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L95 "主线消费金额与上限"
[UKIRO]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L161 "主线 Kiro 超额/积分"
[UZED]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L170 "主线 Zed 绝对数量"
[UZAI]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L176 "主线 GLM Token 池"
[UKIMI]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/shared/limits/windowText.js#L193 "主线 Kimi 组成"
[UTHIRD]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/renderer/limits/windowsView.js#L643 "主线第三方现金明细"
[USERVICE]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/serviceStatus.js#L1 "主线服务状态"
[UDIAG]: https://github.com/Javis603/token-monitor/blob/f2802979ee69930cd946e728db92bc981af0fc40/src/electron/diagnostics.js#L1 "主线诊断"
[AG]: /home/cloud/code/token-monitor-For-Android/AGENTS.md:3 "Android 工程边界"
[AM]: /home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js:42 "Android 展示模型"
[AQ]: /home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js:315 "Android 额度具体计算入口"
[ASP]: /home/cloud/code/token-monitor-For-Android/app/src/main/assets/model.js:275 "Android 现金周期过滤入口"
[OV]: /home/cloud/code/token-monitor-For-Android/ui/src/components/OverviewView.tsx:54 "总览与截断提示"
[DV]: /home/cloud/code/token-monitor-For-Android/ui/src/components/DevicesView.tsx:13 "设备视图"
[SV]: /home/cloud/code/token-monitor-For-Android/ui/src/components/SessionsView.tsx:75 "会话视图"
[SD]: /home/cloud/code/token-monitor-For-Android/ui/src/components/SessionDetailView.tsx:40 "会话详情"
[HH]: /home/cloud/code/token-monitor-For-Android/ui/src/components/HistoryChart.tsx:6 "短期历史图"
[TY]: /home/cloud/code/token-monitor-For-Android/ui/src/types/monitor.ts:1 "页面和数据类型"
[QV]: /home/cloud/code/token-monitor-For-Android/ui/src/components/LimitsView.tsx:21 "额度与共享订阅页面"
[CN]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/ConnectionSpec.java:41 "只读接口白名单"
[HC]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/HubClient.java:26 "Hub GET 客户端"
[MA]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/MainActivity.java:273 "原生轮询与生命周期"
[BAL]: /home/cloud/code/token-monitor-For-Android/src/shared/limits/balanceDisplay.js:49 "共享钱包与币种计算"
[LH]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/LimitsHistoryStore.java:20 "本机额度 SQLite"
[LP]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/LimitsHistoryPolicy.java:7 "历史接管策略"
[QH]: /home/cloud/code/token-monitor-For-Android/ui/src/components/QuotaHistoryPreview.tsx:11 "额度历史预览"
[CAT]: /home/cloud/code/token-monitor-For-Android/src/shared/clientCatalog.js:50 "42 工具名称目录"
[WP]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/WidgetLayoutPolicy.java:54 "原生微件名称白名单"
[WS]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/UsageWidgetSnapshot.java:15 "原生微件数据摘要"
[WG]: /home/cloud/code/token-monitor-For-Android/ui/src/components/WidgetGalleryCard.tsx:15 "四类微件预览"
[CSS]: /home/cloud/code/token-monitor-For-Android/ui/src/index.css:5 "固定深色样式"
[MAN]: /home/cloud/code/token-monitor-For-Android/app/src/main/AndroidManifest.xml:2 "Android Manifest"
[UPDATES]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/AppUpdates.java:16 "Android 更新管理"
[UPOL]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/AppUpdatePolicy.java:4 "更新版本策略"
[APK]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/ApkUpdatePolicy.java:11 "APK 校验策略"
[MON]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/SessionMonitorService.java:18 "Android 后台监控"
[COMPLETE]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/SessionCompletionTracker.java:11 "完成信号策略"
[STORE]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/ConnectionStore.java:16 "Keystore 连接存储"
[LOCAL]: /home/cloud/code/token-monitor-For-Android/app/src/main/java/com/tokenmonitor/android/LocalContentClient.java:16 "WebView 资源白名单"
[NS]: /home/cloud/code/token-monitor-For-Android/ui/src/nativeState.js:30 "原生消息状态"
[TM]: /home/cloud/code/token-monitor-For-Android/tests/android/model.test.js:3 "基础模型回归"
[TD]: /home/cloud/code/token-monitor-For-Android/tests/android/sessionDetail.test.js:3 "会话详情回归"
[TG]: /home/cloud/code/token-monitor-For-Android/tests/android/sessionGroups.test.js:3 "家族分组回归"
[TS]: /home/cloud/code/token-monitor-For-Android/tests/android/sessionStatus.test.js:3 "活动状态回归"
[TL]: /home/cloud/code/token-monitor-For-Android/tests/android/upstreamLimits.test.js:3 "账户/钱包回归"
[T84]: /home/cloud/code/token-monitor-For-Android/tests/android/upstream84.test.js:3 "v0.84 回归"
[T85]: /home/cloud/code/token-monitor-For-Android/tests/android/upstream85.test.js:3 "v0.85 回归"
[T86]: /home/cloud/code/token-monitor-For-Android/tests/android/upstream86.test.js:3 "v0.86 历史回归"
[T87]: /home/cloud/code/token-monitor-For-Android/tests/android/upstream87.test.js:3 "MiniMax 回归"
[T88]: /home/cloud/code/token-monitor-For-Android/tests/android/upstream88.test.js:3 "v0.88 回归"
[T90]: /home/cloud/code/token-monitor-For-Android/tests/android/upstream90.test.js:3 "v0.90 回归"
[TP]: /home/cloud/code/token-monitor-For-Android/src/shared/limits/windowText.js:127 "共享窗口文字规则"
[ST]: /home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/StartupTest.java:40 "WebView/认证/界面仪器用例"
[TW]: /home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/UsageWidgetTest.java:18 "微件仪器用例"
[TUP]: /home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/AppUpdatesTest.java:22 "更新仪器用例"
[TDL]: /home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/AppUpdateDownloadsTest.java:28 "下载与安装交接仪器用例"
[TC]: /home/cloud/code/token-monitor-For-Android/app/src/androidTest/java/com/tokenmonitor/android/CompletionProjectionTest.java:13 "完成投影仪器用例"