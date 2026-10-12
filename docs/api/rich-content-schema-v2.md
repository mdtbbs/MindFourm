# 富文本格式 V2

新客户端提交正文时，应同时发送 `content_schema_version: 2` 和 `content_json`。`content_json` 是规范内容；Markdown 字段 `content` 为搜索、通知、RSS、摘要和纯文本场景保留。只提交 Markdown 的旧请求仍可由服务端转换为 V2 文档。

```json
{
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [
      { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "标题" }] },
      { "type": "paragraph", "content": [{ "type": "text", "text": "重点内容", "marks": [{ "type": "bold" }] }] },
      { "type": "bulletList", "attrs": { "tight": true }, "content": [{ "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "列表项" }] }] }] }
    ]
  }
}
```

## 节点与文本样式

块级节点包括 `doc`、`paragraph`、`heading`、`blockquote`、`bulletList`、`orderedList`、`listItem`、`taskList`、`taskItem`、`codeBlock`、`horizontalRule`、`table`、`tableRow`、`tableHeader`、`tableCell`、`spoiler`、`video`、`attachment`、`postQuote`、`replyQuote` 和 `htmlBlock`。行内节点包括 `text`、`hardBreak`、`image`、`mention` 和 `customEmoji`。

文本样式（marks）包括 `bold`、`italic`、`strike`、`underline`、`code`、`link`、`textColor`、`highlight`、`fontSize`、`fontFamily`、`superscript` 和 `subscript`。颜色只接受 HEX，并规范为大写 `#RRGGBB` 或 `#RRGGBBAA`；高亮、字号和字体只能使用预设值。

`paragraph` 和 `heading` 支持块级对齐：可选属性 `align`，取值为 `left`、`center`、`right`、`justify` 或 `null`。`left` 与 `null` 等价（默认左对齐即不写属性）。表格单元格的 `align` 只接受 `left`、`center`、`right`。两种对齐都只影响文本水平位置，服务端渲染为 `data-align` 属性并在 `content_html` 中同时给出 `text-align` 声明；不接受其他 CSS 属性或任意样式值。

## HTML 区块（`htmlBlock`，仅管理团队）

`htmlBlock` 是唯一的受信 HTML 节点，用于资源介绍、公告一类需要卡片、分栏或图文混排排版的场景。它只保存一个属性：

```json
{ "type": "htmlBlock", "attrs": { "html": "<div style=\"display:flex;gap:12px\"><img src=\"/uploads/a.png\" alt=\"图\"><p>说明</p></div>" } }
```

写入权限：只有版主及以上角色（`moderator`、`admin`、`super_admin`）可以提交含 `htmlBlock` 的正文。普通成员提交时返回 `403`，错误码为 `HTML_BLOCK_FORBIDDEN`。权限按**作者角色**判定；服务端在读取、重渲染和回填时不会重新校验，以免历史内容因角色变更而失效。

`attrs.html` 的长度上限为 200000 字符，每篇内容最多 5 个区块；`attrs.text` 是服务端派生字段（清洗后的纯文本），客户端提交的值会被忽略。清洗后为空的区块会被拒绝。

HTML 区块支持两种呈现方式：

- 旧式 HTML 片段继续使用标签、属性和内联 CSS 白名单渲染。
- 带 `<!doctype html>`、`<html>` 或 `<style>` 的完整文档在隔离 iframe 中显示。保留样式表、`class`、`id`、CSS 变量、媒体查询和伪元素，支持 Grid/Flex 图文排版及 `details` 折叠。样式只作用于该文档，不影响论坛页面；前端随图片加载、折叠和宽度变化自动调整高度。

文档写入时移除脚本、事件、表单、嵌套 iframe、外部样式表、`base`、跳转 `meta`、SVG 和 MathML。iframe 不启用脚本或表单权限，并强制限制 CSP；不支持需要 JavaScript 的交互、外部字体和外部 CSS 加载。完整文档的图片只允许从站内加载，链接支持 HTTP(S)，文档内部 `#id` 锚点可用。

编辑器支持粘贴源码或导入最大 8MB 的 HTML 文件。内嵌 Base64 PNG/JPEG/GIF/WebP 图片和外站图片在插入时通过现有图片接口上传并替换为 URL（每张最大 2MB，最多 100 张，相同图片只上传一次）。API 正文仍不接受 `data:` 图片 URL，第三方客户端需先上传图片。上传后 HTML 必须满足 200000 字符限制，每篇最多 5 个区块。

`content_html` 对完整文档输出带 CSP 和 sandbox 的 iframe `srcdoc`，旧式片段维持原来的输出。直接消费 HTML 的客户端也必须保留这些隔离属性，不能取出文档样式注入宿主页面。HTML 缓存字段扩容迁移为 `HtmlDocumentProjection1720000370000`，需随部署执行并验收。

清洗是幂等的：同一片段重复清洗结果不变，因此 `content_html` 重新生成不会改写已存内容。Markdown 投影与 `content_text` 使用区块的纯文本（纯图片区块则使用图片 `alt`），保证搜索与摘要有内容可用。

## 校验与安全规则

每种节点和样式只允许指定属性。未知节点、样式或属性，无效 URL、不支持的站点视频来源以及超出范围的值都会被拒绝。错误详情会指出 JSON 路径、节点或样式、属性和数据结构版本，不会包含内部堆栈。

资源说明使用同一格式，但不接受 `video`、`attachment`、`postQuote` 和 `replyQuote`；`htmlBlock` 同样可用。附件节点必须引用当前用户拥有的草稿令牌，或已绑定到同一内容对象的附件；上传文件会先进入隔离区并经过审核。提及节点使用用户 ID，每篇内容最多包含 20 个不同用户；服务端会将其规范为用户当前名称。提及通知会去重并遵循用户屏蔽设置。引用只保存对象 ID，读写时都会检查可见性。

## 视频来源与部署迁移

视频来源由部署使用的站点配置决定。MDTBBS 支持 Bilibili、抖音和 HTTPS MP4/WebM；Mindustry Club 支持 YouTube、Bilibili 和 HTTPS MP4/WebM。第三方播放器只会在读者主动打开视频卡片后加载。

当前 V1 写入接口接受 Schema V2 的结构化正文；新客户端应发送 `content_schema_version: 2` 和 `content_json`。旧 Markdown-only 请求仍通过兼容路径转换为 V2 JSON。已有历史记录的批量回填由 `src/scripts/content-json-backfill.ts` 处理，部署环境是否已执行回填应以该环境的迁移/运维记录为准。

## HTML 图片导入

在 HTML 区块编辑器中插入内容时，外站 `img src` 及样式表/内联样式中的 `url(...)` 图片由服务端下载，内嵌 Base64 图片通过现有上传接口存储；地址统一替换为 `/uploads/public-images/...`。重复地址在一次导入中只下载一次，站内地址不重复下载；支持 HTML 的 `base` 地址和相对图片路径。每张最多 2MB，每次最多导入 100 张，仅支持 PNG、JPEG、GIF、WebP。下载失败阻止插入并显示失败地址，不保留外站回退链接。完整文档 CSP 限制图片只能从站内加载。

服务端远程导入仅向管理团队开放，验证真实图片格式和尺寸，拒绝内网、保留地址、带凭据或非标准端口的 URL，每次重定向重新验证并固定 DNS 解析地址。图片引用清理同时识别结构化正文、HTML 投影和资源版本，避免已保存图片被当作孤立文件删除。
