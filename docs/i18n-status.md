# Interface translation coverage

Mindustry Club supports English, Russian, Japanese, and Simplified Chinese. Its user-facing discussion create/edit, reply, resource submit/edit/comments, attachment upload, feedback, bookmarks, submitted-resource management, blocked-user settings, challenge, account, and common community workflows use locale catalogs. The locale switcher and server preference resolution expose all four locales.

## Remaining untranslated surfaces

- The MDTBBS administration console’s page bodies, especially user management, moderation, categories, resource review, and system settings.
- MDTBBS-only phone verification, LanLink, EasyManager, and server-application management screens.
- Several public/server-rendered surfaces still use Simplified Chinese copy: the Club home page, some post/resource detail and history states, groups, leaderboard, legal/about/links pages, and error/loading states.
- Friend management and other legacy account pages that are not enabled for the Club profile.
- Older backend validation messages that return prose rather than a stable API error code.
- User-created names and descriptions, which remain in the language their authors entered.

The remaining administration/integration pages are domestic MDTBBS operations or low-frequency surfaces; user-provided titles, reasons, descriptions, and category names are intentionally kept in their author-entered language. New stable API errors should be localized by code in the frontend catalogs.
