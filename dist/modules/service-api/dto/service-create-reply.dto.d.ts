import { ServiceAccountSelectorDto } from './service-account-selector.dto';
export declare class ServiceCreateReplyDto extends ServiceAccountSelectorDto {
    content: string;
    parent_reply_id?: number;
}
