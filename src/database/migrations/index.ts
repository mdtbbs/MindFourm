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
import { CreateResourceComments1720000025000 } from './1720000025000-CreateResourceComments';
import { AddResourceVersionContent1720000014000 } from './1720000014000-AddResourceVersionContent';
import { AddResourceRejectReason1720000015000 } from './1720000015000-AddResourceRejectReason';
import { AddResourceIndexes1720000016000 } from './1720000016000-AddResourceIndexes';
import { AddQQAuthTables1720000017000 } from './1720000017000-AddQQAuthTables';
import { RemoveForumQQAuth1720000018000 } from './1720000018000-RemoveForumQQAuth';
import { AddTermsAcceptedToUsers1720000021000 } from './1720000021000-AddTermsAcceptedToUsers';
import { ExpandResourceAggregate1720000026000 } from './1720000026000-ExpandResourceAggregate';
import { CreateMediaAndDownloadDelivery1720000027000 } from './1720000027000-CreateMediaAndDownloadDelivery';
import { CreateOutboxEvents1720000028000 } from './1720000028000-CreateOutboxEvents';
import { CreateResourceInteractions1720000029000 } from './1720000029000-CreateResourceInteractions';
import { CreateGameVersions1720000030000 } from './1720000030000-CreateGameVersions';
import { CreateGameServers1720000031000 } from './1720000031000-CreateGameServers';
import { CreateKnowledge1720000032000 } from './1720000032000-CreateKnowledge';

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
  RemoveForumQQAuth1720000018000,
  AddTermsAcceptedToUsers1720000021000,
  CreateResourceComments1720000025000,
  ExpandResourceAggregate1720000026000,
  CreateMediaAndDownloadDelivery1720000027000,
  CreateOutboxEvents1720000028000,
  CreateResourceInteractions1720000029000,
  CreateGameVersions1720000030000,
  CreateGameServers1720000031000,
  CreateKnowledge1720000032000,
];
