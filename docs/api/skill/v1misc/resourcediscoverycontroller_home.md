# ResourceDiscoveryController_home

> GET /api/v1/resources/discovery/home · 契约：openapi-public-v1.json

读取资源发现榜单

匿名访问可用；携带 MindAuth Bearer 时需要 resource.read。返回精选、趋势、近 7 日上升、评分榜与最新榜；每个榜单返回稳定 algorithm 版本标识、score 与 reasons。排序公式与隐私边界见 /api/v1/docs/resources。排除删除、未审核、私有和停用主题资源；候选窗口达到上限时可能仍有未扫描结果。

## 认证与权限

- 认证：可选。匿名可读取；带 Bearer 时按账号权限返回。
- 带 Bearer 时需要的权限范围：`resource.read`。
- 缺少 scope 或站点策略不允许时返回 `403`；令牌无效或过期返回 `401`。
- 限流：60 次 / 60 秒（按账号 / 会话 / 来源 IP）；超限返回 `429`，按 `Retry-After` 等待。

## 请求

**方法：** `GET`

**地址：** `$FORUM_BASE_URL/api/v1/resources/discovery/home`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `kind` | 字符串 | 否 | 按资源类型筛选；可选值：mod / schematic / map / other |
| `limit` | 整数 | 否 | 每个榜单返回条数；最小 1；最大 20 |
| `page` | 整数 | 否 | 一基页码，按每个榜单的排序结果分页；最小 1；最大 400 |

## 响应

HTTP 状态码：

| 状态 | 说明 |
| --- | --- |
| `200` | - |
| `400` | kind、limit 或 page 不符合契约。 |
| `401` | 提交了无法验证的登录凭证。 |
| `403` | 携带 MindAuth Bearer 时需要 scope：resource.read |
| `default` | Public V1 error envelope（公开 V1 错误响应结构；见 [errors-v1.md](../errors-v1.md)） |

**响应结构：** ResourceDiscoveryHomeEnvelopeDto

```json
{
  "data": {
    "generated_at": "string",
    "sections": {
      "featured": {
        "algorithm": "string", // Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.
        "items": [{
          "reasons": ["string"], // Stable reason codes: editor_pick, trending, recent_views, recent_downloads, quality_signals, top_rated, newest, top_downloaded, same_kind, same_category, shared_tags:<tags>, kind:<kind>, category, tags:<tags>, featured, popular_now.
          "recent_downloads": 0.0, // Completed downloads during the last seven days; present for rising results.
          "recent_views": 0.0, // Views during the last seven days; present for rising results.
          "resource": {
            "avatar_url": "string",
            "category_icon": "string",
            "category_id": 0.0,
            "category_name": "string",
            "comment_count": 0.0,
            "content_hash": "string",
            "content_language": "string",
            "created_at": "string",
            "description": "string",
            "discussion_thread_id": 0.0,
            "download_count": 0.0,
            "external_url": "string",
            "favorite_count": 0.0,
            "file_name": "string",
            "file_size": 0.0,
            "homepage_url": "string",
            "id": 0.0,
            "is_favorited": false,
            "is_featured": 0.0,
            "is_liked": false,
            "is_public": false,
            "is_subscribed": false,
            "latest_published_version_id": 0.0,
            "license": "string",
            "like_count": 0.0,
            "metadata": {},
            "mime_type": "string",
            "origin_resource_id": 0.0,
            "origin_site": "string",
            "origin_url": "string",
            "preview_url": "string",
            "public_id": "string",
            "published_at": "string", // When the resource first became publicly visible. This is the author-facing date.
            "rating_average": 0.0,
            "rating_count": 0.0,
            "rating_sum": 0.0,
            "renderer_error_code": "string",
            "renderer_parser_version": "string",
            "renderer_status": "string",
            "renderer_summary": {
              "build": 0.0,
              "height": 0.0,
              "width": 0.0
            },
            "resource_kind": "string",
            "resource_type": "string",
            "slug": "string",
            "source_url": "string",
            "status": "string",
            "summary": "string",
            "title": "string",
            "trending_score": 0.0,
            "updated_at": "string", // Operational write timestamp; moved by unrelated writes such as view and download counting. Do not present this as the publication date.
            "use_mfl": false,
            "user": {
              "avatar_url": "string",
              "id": 0.0,
              "role": "string",
              "username": "string"
            },
            "user_id": 0.0,
            "username": "string",
            "version": "string",
            "view_count": 0.0,
            "visibility": "string"
          },
          "score": 0.0 // Ranking score rounded to three decimals. Compare only within the same algorithm identifier; this is not a quality guarantee.
        }],
        "pagination": {
          "candidate_window_size": 0.0, // Maximum number of candidates considered by this ranking query.
          "candidate_window_truncated": false, // True when the source query hit its candidate cap; further candidates may exist.
          "items_in_window": 0.0, // Number of ranked entries available in this bounded candidate window.
          "limit": 0.0,
          "more_in_window": false, // Whether another page is available within the current candidate window.
          "page": 0.0
        }
      }, // Featured resources ranked by popularity.
      "newest": {
        "algorithm": "string", // Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.
        "items": [{
          "reasons": ["string"], // Stable reason codes: editor_pick, trending, recent_views, recent_downloads, quality_signals, top_rated, newest, top_downloaded, same_kind, same_category, shared_tags:<tags>, kind:<kind>, category, tags:<tags>, featured, popular_now.
          "recent_downloads": 0.0, // Completed downloads during the last seven days; present for rising results.
          "recent_views": 0.0, // Views during the last seven days; present for rising results.
          "resource": {
            "avatar_url": "string",
            "category_icon": "string",
            "category_id": 0.0,
            "category_name": "string",
            "comment_count": 0.0,
            "content_hash": "string",
            "content_language": "string",
            "created_at": "string",
            "description": "string",
            "discussion_thread_id": 0.0,
            "download_count": 0.0,
            "external_url": "string",
            "favorite_count": 0.0,
            "file_name": "string",
            "file_size": 0.0,
            "homepage_url": "string",
            "id": 0.0,
            "is_favorited": false,
            "is_featured": 0.0,
            "is_liked": false,
            "is_public": false,
            "is_subscribed": false,
            "latest_published_version_id": 0.0,
            "license": "string",
            "like_count": 0.0,
            "metadata": {},
            "mime_type": "string",
            "origin_resource_id": 0.0,
            "origin_site": "string",
            "origin_url": "string",
            "preview_url": "string",
            "public_id": "string",
            "published_at": "string", // When the resource first became publicly visible. This is the author-facing date.
            "rating_average": 0.0,
            "rating_count": 0.0,
            "rating_sum": 0.0,
            "renderer_error_code": "string",
            "renderer_parser_version": "string",
            "renderer_status": "string",
            "renderer_summary": {
              "build": 0.0,
              "height": 0.0,
              "width": 0.0
            },
            "resource_kind": "string",
            "resource_type": "string",
            "slug": "string",
            "source_url": "string",
            "status": "string",
            "summary": "string",
            "title": "string",
            "trending_score": 0.0,
            "updated_at": "string", // Operational write timestamp; moved by unrelated writes such as view and download counting. Do not present this as the publication date.
            "use_mfl": false,
            "user": {
              "avatar_url": "string",
              "id": 0.0,
              "role": "string",
              "username": "string"
            },
            "user_id": 0.0,
            "username": "string",
            "version": "string",
            "view_count": 0.0,
            "visibility": "string"
          },
          "score": 0.0 // Ranking score rounded to three decimals. Compare only within the same algorithm identifier; this is not a quality guarantee.
        }],
        "pagination": {
          "candidate_window_size": 0.0, // Maximum number of candidates considered by this ranking query.
          "candidate_window_truncated": false, // True when the source query hit its candidate cap; further candidates may exist.
          "items_in_window": 0.0, // Number of ranked entries available in this bounded candidate window.
          "limit": 0.0,
          "more_in_window": false, // Whether another page is available within the current candidate window.
          "page": 0.0
        }
      }, // Newest currently visible resources.
      "rising": {
        "algorithm": "string", // Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.
        "items": [{
          "reasons": ["string"], // Stable reason codes: editor_pick, trending, recent_views, recent_downloads, quality_signals, top_rated, newest, top_downloaded, same_kind, same_category, shared_tags:<tags>, kind:<kind>, category, tags:<tags>, featured, popular_now.
          "recent_downloads": 0.0, // Completed downloads during the last seven days; present for rising results.
          "recent_views": 0.0, // Views during the last seven days; present for rising results.
          "resource": {
            "avatar_url": "string",
            "category_icon": "string",
            "category_id": 0.0,
            "category_name": "string",
            "comment_count": 0.0,
            "content_hash": "string",
            "content_language": "string",
            "created_at": "string",
            "description": "string",
            "discussion_thread_id": 0.0,
            "download_count": 0.0,
            "external_url": "string",
            "favorite_count": 0.0,
            "file_name": "string",
            "file_size": 0.0,
            "homepage_url": "string",
            "id": 0.0,
            "is_favorited": false,
            "is_featured": 0.0,
            "is_liked": false,
            "is_public": false,
            "is_subscribed": false,
            "latest_published_version_id": 0.0,
            "license": "string",
            "like_count": 0.0,
            "metadata": {},
            "mime_type": "string",
            "origin_resource_id": 0.0,
            "origin_site": "string",
            "origin_url": "string",
            "preview_url": "string",
            "public_id": "string",
            "published_at": "string", // When the resource first became publicly visible. This is the author-facing date.
            "rating_average": 0.0,
            "rating_count": 0.0,
            "rating_sum": 0.0,
            "renderer_error_code": "string",
            "renderer_parser_version": "string",
            "renderer_status": "string",
            "renderer_summary": {
              "build": 0.0,
              "height": 0.0,
              "width": 0.0
            },
            "resource_kind": "string",
            "resource_type": "string",
            "slug": "string",
            "source_url": "string",
            "status": "string",
            "summary": "string",
            "title": "string",
            "trending_score": 0.0,
            "updated_at": "string", // Operational write timestamp; moved by unrelated writes such as view and download counting. Do not present this as the publication date.
            "use_mfl": false,
            "user": {
              "avatar_url": "string",
              "id": 0.0,
              "role": "string",
              "username": "string"
            },
            "user_id": 0.0,
            "username": "string",
            "version": "string",
            "view_count": 0.0,
            "visibility": "string"
          },
          "score": 0.0 // Ranking score rounded to three decimals. Compare only within the same algorithm identifier; this is not a quality guarantee.
        }],
        "pagination": {
          "candidate_window_size": 0.0, // Maximum number of candidates considered by this ranking query.
          "candidate_window_truncated": false, // True when the source query hit its candidate cap; further candidates may exist.
          "items_in_window": 0.0, // Number of ranked entries available in this bounded candidate window.
          "limit": 0.0,
          "more_in_window": false, // Whether another page is available within the current candidate window.
          "page": 0.0
        }
      }, // Resources ranked by quality plus seven-day view and completed-download signals.
      "top_rated": {
        "algorithm": "string", // Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.
        "items": [{
          "reasons": ["string"], // Stable reason codes: editor_pick, trending, recent_views, recent_downloads, quality_signals, top_rated, newest, top_downloaded, same_kind, same_category, shared_tags:<tags>, kind:<kind>, category, tags:<tags>, featured, popular_now.
          "recent_downloads": 0.0, // Completed downloads during the last seven days; present for rising results.
          "recent_views": 0.0, // Views during the last seven days; present for rising results.
          "resource": {
            "avatar_url": "string",
            "category_icon": "string",
            "category_id": 0.0,
            "category_name": "string",
            "comment_count": 0.0,
            "content_hash": "string",
            "content_language": "string",
            "created_at": "string",
            "description": "string",
            "discussion_thread_id": 0.0,
            "download_count": 0.0,
            "external_url": "string",
            "favorite_count": 0.0,
            "file_name": "string",
            "file_size": 0.0,
            "homepage_url": "string",
            "id": 0.0,
            "is_favorited": false,
            "is_featured": 0.0,
            "is_liked": false,
            "is_public": false,
            "is_subscribed": false,
            "latest_published_version_id": 0.0,
            "license": "string",
            "like_count": 0.0,
            "metadata": {},
            "mime_type": "string",
            "origin_resource_id": 0.0,
            "origin_site": "string",
            "origin_url": "string",
            "preview_url": "string",
            "public_id": "string",
            "published_at": "string", // When the resource first became publicly visible. This is the author-facing date.
            "rating_average": 0.0,
            "rating_count": 0.0,
            "rating_sum": 0.0,
            "renderer_error_code": "string",
            "renderer_parser_version": "string",
            "renderer_status": "string",
            "renderer_summary": {
              "build": 0.0,
              "height": 0.0,
              "width": 0.0
            },
            "resource_kind": "string",
            "resource_type": "string",
            "slug": "string",
            "source_url": "string",
            "status": "string",
            "summary": "string",
            "title": "string",
            "trending_score": 0.0,
            "updated_at": "string", // Operational write timestamp; moved by unrelated writes such as view and download counting. Do not present this as the publication date.
            "use_mfl": false,
            "user": {
              "avatar_url": "string",
              "id": 0.0,
              "role": "string",
              "username": "string"
            },
            "user_id": 0.0,
            "username": "string",
            "version": "string",
            "view_count": 0.0,
            "visibility": "string"
          },
          "score": 0.0 // Ranking score rounded to three decimals. Compare only within the same algorithm identifier; this is not a quality guarantee.
        }],
        "pagination": {
          "candidate_window_size": 0.0, // Maximum number of candidates considered by this ranking query.
          "candidate_window_truncated": false, // True when the source query hit its candidate cap; further candidates may exist.
          "items_in_window": 0.0, // Number of ranked entries available in this bounded candidate window.
          "limit": 0.0,
          "more_in_window": false, // Whether another page is available within the current candidate window.
          "page": 0.0
        }
      }, // Rated resources ranked by Bayesian-smoothed rating.
      "trending": {
        "algorithm": "string", // Versioned ranking algorithm. Formula and input definitions are published in /api/v1/docs/resources.
        "items": [{
          "reasons": ["string"], // Stable reason codes: editor_pick, trending, recent_views, recent_downloads, quality_signals, top_rated, newest, top_downloaded, same_kind, same_category, shared_tags:<tags>, kind:<kind>, category, tags:<tags>, featured, popular_now.
          "recent_downloads": 0.0, // Completed downloads during the last seven days; present for rising results.
          "recent_views": 0.0, // Views during the last seven days; present for rising results.
          "resource": {
            "avatar_url": "string",
            "category_icon": "string",
            "category_id": 0.0,
            "category_name": "string",
            "comment_count": 0.0,
            "content_hash": "string",
            "content_language": "string",
            "created_at": "string",
            "description": "string",
            "discussion_thread_id": 0.0,
            "download_count": 0.0,
            "external_url": "string",
            "favorite_count": 0.0,
            "file_name": "string",
            "file_size": 0.0,
            "homepage_url": "string",
            "id": 0.0,
            "is_favorited": false,
            "is_featured": 0.0,
            "is_liked": false,
            "is_public": false,
            "is_subscribed": false,
            "latest_published_version_id": 0.0,
            "license": "string",
            "like_count": 0.0,
            "metadata": {},
            "mime_type": "string",
            "origin_resource_id": 0.0,
            "origin_site": "string",
            "origin_url": "string",
            "preview_url": "string",
            "public_id": "string",
            "published_at": "string", // When the resource first became publicly visible. This is the author-facing date.
            "rating_average": 0.0,
            "rating_count": 0.0,
            "rating_sum": 0.0,
            "renderer_error_code": "string",
            "renderer_parser_version": "string",
            "renderer_status": "string",
            "renderer_summary": {
              "build": 0.0,
              "height": 0.0,
              "width": 0.0
            },
            "resource_kind": "string",
            "resource_type": "string",
            "slug": "string",
            "source_url": "string",
            "status": "string",
            "summary": "string",
            "title": "string",
            "trending_score": 0.0,
            "updated_at": "string", // Operational write timestamp; moved by unrelated writes such as view and download counting. Do not present this as the publication date.
            "use_mfl": false,
            "user": {
              "avatar_url": "string",
              "id": 0.0,
              "role": "string",
              "username": "string"
            },
            "user_id": 0.0,
            "username": "string",
            "version": "string",
            "view_count": 0.0,
            "visibility": "string"
          },
          "score": 0.0 // Ranking score rounded to three decimals. Compare only within the same algorithm identifier; this is not a quality guarantee.
        }],
        "pagination": {
          "candidate_window_size": 0.0, // Maximum number of candidates considered by this ranking query.
          "candidate_window_truncated": false, // True when the source query hit its candidate cap; further candidates may exist.
          "items_in_window": 0.0, // Number of ranked entries available in this bounded candidate window.
          "limit": 0.0,
          "more_in_window": false, // Whether another page is available within the current candidate window.
          "page": 0.0
        }
      } // Resources ranked by quality signals plus an update-recency bonus.
    }
  },
  "meta": {
    "request_id": "string"
  }
}
```

## 调用示例

```bash
# 可选：带上 Bearer 时按账号权限返回
curl --fail-with-body \
  "$FORUM_BASE_URL/api/v1/resources/discovery/home?kind=<kind>&limit=<limit>&page=<page>" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```
