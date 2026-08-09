import { IsOptional, IsString } from 'class-validator';
import {
  normalizeSidebarNavigation,
  validateSidebarNavigation,
} from '@common/utils/sidebar-navigation.util';

/**
 * DTO for updating sidebar navigation configuration.
 *
 * Accepts a JSON string representing an array of navigation items.
 * The JSON is normalized and validated on demand via the sidebar-navigation
 * utility — class-validator only checks that the raw value is a string.
 *
 * Call `parseAndValidate()` after construction to get structured validation.
 */
export class UpdateSidebarNavigationDto {
  @IsOptional()
  @IsString()
  sidebar_navigation?: string;

  /**
   * Parse the raw JSON string and validate the resulting navigation items.
   * Returns null if the field is not set (nothing to validate).
   * Throws if validation fails.
   */
  parseAndValidate(): import('@common/utils/sidebar-navigation.util').SidebarNavigationItem[] | null {
    if (this.sidebar_navigation === undefined || this.sidebar_navigation === null) {
      return null;
    }

    const items = normalizeSidebarNavigation(this.sidebar_navigation);
    const result = validateSidebarNavigation(items);

    if (!result.valid) {
      throw new Error(`Invalid sidebar navigation: ${result.errors.join('; ')}`);
    }

    return items;
  }
}
