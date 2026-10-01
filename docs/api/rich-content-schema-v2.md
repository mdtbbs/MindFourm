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

块级节点包括 `doc`、`paragraph`、`heading`、`blockquote`、`bulletList`、`orderedList`、`listItem`、`taskList`、`taskItem`、`codeBlock`、`horizontalRule`、`table`、`tableRow`、`tableHeader`、`tableCell`、`spoiler`、`video`、`attachment`、`postQuote` 和 `replyQuote`。行内节点包括 `text`、`hardBreak`、`image`、`mention` 和 `customEmoji`。

文本样式（marks）包括 `bold`、`italic`、`strike`、`underline`、`code`、`link`、`textColor`、`highlight`、`fontSize`、`fontFamily`、`superscript` 和 `subscript`。颜色只接受 HEX，并规范为大写 `#RRGGBB` 或 `#RRGGBBAA`；高亮、字号和字体只能使用预设值。

## 校验与安全规则

每种节点和样式只允许指定属性。未知节点、样式或属性，无效 URL、不支持的站点视频来源以及超出范围的值都会被拒绝。错误详情会指出 JSON 路径、节点或样式、属性和 Schema 版本，不会包含内部堆栈。

资源说明使用同一格式，但不接受 `video`、`attachment`、`postQuote` 和 `replyQuote`。附件节点必须引用当前用户拥有的草稿令牌，或已绑定到同一内容对象的附件；上传文件会先进入隔离区并经过审核。提及节点使用用户 ID，每篇内容最多包含 20 个不同用户；服务端会将其规范为用户当前名称。提及通知会去重并遵循用户屏蔽设置。引用只保存对象 ID，读写时都会检查可见性。

## 视频来源与部署迁移

视频来源由部署使用的站点配置决定。MDTBBS 支持 Bilibili、抖音和 HTTPS MP4/WebM；Mindustry Club 支持 YouTube、Bilibili 和 HTTPS MP4/WebM。第三方播放器只会在读者主动打开视频卡片后加载。

数据库迁移会新增 `content_schema_version`、分批转换旧 Markdown、创建自定义表情数据表，并增加附件草稿生命周期所需的字段和索引。迁移会保留有效 JSON，也不会改写原 Markdown。部署启用 V2 写入前，先应用该迁移。
