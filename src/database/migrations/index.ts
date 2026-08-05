import { BaselineSchema1720000000000 } from './1720000000000-BaselineSchema';
import { NormalizeReplyStatus1720000001000 } from './1720000001000-NormalizeReplyStatus';
import { AddMissingIndexes1720000002000 } from './1720000002000-AddMissingIndexes';
import { UnifyLikeTables1720000003000 } from './1720000003000-UnifyLikeTables';
import { AddMissingForeignKeys1720000004000 } from './1720000004000-AddMissingForeignKeys';
import { BackfillRejectedPostDeletedAt1720000005000 } from './1720000005000-BackfillRejectedPostDeletedAt';
import { CreateReports1720000006000 } from './1720000006000-CreateReports';
import { CreateBlocksAndReactions1720000009000 } from './1720000009000-CreateBlocksAndReactions';
import { AddPostModerationFields1720000010000 } from './1720000010000-AddPostModerationFields';
import { CreateExternalApiTables1720000011000 } from './1720000011000-CreateExternalApiTables';
import { CreateLanLinkQuickCodes1720000012000 } from './1720000012000-CreateLanLinkQuickCodes';
import { CreateFriendships1720000013000 } from './1720000013000-CreateFriendships';
import { AddResourceVersionContent1720000014000 } from './1720000014000-AddResourceVersionContent';
import { AddResourceRejectReason1720000015000 } from './1720000015000-AddResourceRejectReason';
import { AddResourceIndexes1720000016000 } from './1720000016000-AddResourceIndexes';
import { AddQQAuthTables1720000017000 } from './1720000017000-AddQQAuthTables';

/**
 * Migrations in run order.
 *
 * An explicit array rather than a glob: the same list has to resolve when the app
 * runs from `dist/` and when the TypeORM CLI runs it through ts-node, and a
 * `src/**\/*.ts` glob silently matches nothing in the compiled build.
 */
export const migrations = [
  BaselineSchema1720000000000,
  NormalizeReplyStatus1720000001000,
  AddMissingIndexes1720000002000,
  UnifyLikeTables1720000003000,
  AddMissingForeignKeys1720000004000,
  BackfillRejectedPostDeletedAt1720000005000,
  CreateReports1720000006000,
  CreateBlocksAndReactions1720000009000,
  AddPostModerationFields1720000010000,
  CreateExternalApiTables1720000011000,
  CreateLanLinkQuickCodes1720000012000,
  CreateFriendships1720000013000,
  AddResourceVersionContent1720000014000,
  AddResourceRejectReason1720000015000,
  AddResourceIndexes1720000016000,
  AddQQAuthTables1720000017000,
];
