import { Module } from '@nestjs/common';
import { BookmarksModule } from '../bookmarks.module';
import { BookmarksV1Controller } from './bookmarks-v1.controller';

/** Keeps first-party V1 documentation free from the legacy bookmark routes. */
@Module({
  imports: [BookmarksModule],
  controllers: [BookmarksV1Controller],
})
export class BookmarksV1Module {}
