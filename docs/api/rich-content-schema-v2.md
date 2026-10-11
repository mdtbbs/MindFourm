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

`attrs.html` 的长度上限为 20000 字符，每篇内容最多 5 个区块；`attrs.text` 是服务端派生字段（清洗后的纯文本），客户端提交的值会被忽略。清洗后为空的区块会被拒绝。

清洗规则（服务端为准，客户端渲染按同一张表）：

- 标签白名单为常见排版标签（`div`、`p`、`h1`–`h6`、`ul`/`ol`/`li`、`table` 系列、`figure`、`details`、`img`、`a`、`span` 等）。`script`、`style`、`iframe`、`object`、`embed`、`template`、`form`、`svg`、`math` 不在白名单内，且其文本内容会一并丢弃。
- 属性白名单按标签限定（`a` 的 `href`、`img` 的 `src`/`alt`/`width`/`height`、表格单元格的 `colspan`/`rowspan`/`align` 等）。所有事件属性、`id`、`class` 一律丢弃。外链会自动补 `rel="nofollow noopener noreferrer"` 与 `target="_blank"`，图片补 `loading="lazy"`。
- `style` 只接受属性级白名单内的声明；`position`、`z-index`、`cursor`、自定义属性（`--*`）、`!important`、`url()`、`expression()`、`@import`、视口单位（`vw`/`vh`）都会被丢弃。同一 `style` 里合法的声明不受影响。
- URL 只接受 `http`、`https`、`mailto` 与站内根相对路径；`javascript:`、`data:`、协议相对地址（`//host`）及实体编码变体都会被拒绝。

清洗是幂等的：同一片段重复清洗结果不变，因此 `content_html` 重新生成不会改写已存内容。Markdown 投影与 `content_text` 使用区块的纯文本（纯图片区块则使用图片 `alt`），保证搜索与摘要有内容可用。

## 校验与安全规则

每种节点和样式只允许指定属性。未知节点、样式或属性，无效 URL、不支持的站点视频来源以及超出范围的值都会被拒绝。错误详情会指出 JSON 路径、节点或样式、属性和数据结构版本，不会包含内部堆栈。

资源说明使用同一格式，但不接受 `video`、`attachment`、`postQuote` 和 `replyQuote`；`htmlBlock` 同样可用。附件节点必须引用当前用户拥有的草稿令牌，或已绑定到同一内容对象的附件；上传文件会先进入隔离区并经过审核。提及节点使用用户 ID，每篇内容最多包含 20 个不同用户；服务端会将其规范为用户当前名称。提及通知会去重并遵循用户屏蔽设置。引用只保存对象 ID，读写时都会检查可见性。

## 视频来源与部署迁移

视频来源由部署使用的站点配置决定。MDTBBS 支持 Bilibili、抖音和 HTTPS MP4/WebM；Mindustry Club 支持 YouTube、Bilibili 和 HTTPS MP4/WebM。第三方播放器只会在读者主动打开视频卡片后加载。

当前 V1 写入接口接受 Schema V2 的结构化正文；新客户端应发送 `content_schema_version: 2` 和 `content_json`。旧 Markdown-only 请求仍通过兼容路径转换为 V2 JSON。已有历史记录的批量回填由 `src/scripts/content-json-backfill.ts` 处理，部署环境是否已执行回填应以该环境的迁移/运维记录为准。
