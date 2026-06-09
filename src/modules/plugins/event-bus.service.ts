import { Injectable, Logger } from '@nestjs/common';

export type HookFn = (context: any) => any | Promise<any>;

interface HookRegistration {
  pluginSlug: string;
  fn: HookFn;
  priority: number;
}

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private hooks = new Map<string, HookRegistration[]>();

  /**
   * Register a hook function
   */
  register(hookName: string, pluginSlug: string, fn: HookFn, priority: number = 0): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    const registrations = this.hooks.get(hookName)!;
    registrations.push({ pluginSlug, fn, priority });
    // Sort by priority (lower = first)
    registrations.sort((a, b) => a.priority - b.priority);
    this.logger.debug(`Hook registered: ${hookName} (plugin: ${pluginSlug}, priority: ${priority})`);
  }

  /**
   * Unregister all hooks for a plugin
   */
  unregister(pluginSlug: string): void {
    for (const [hookName, registrations] of this.hooks.entries()) {
      const filtered = registrations.filter(r => r.pluginSlug !== pluginSlug);
      if (filtered.length !== registrations.length) {
        this.hooks.set(hookName, filtered);
        this.logger.debug(`Unregistered ${registrations.length - filtered.length} hook(s) for plugin: ${pluginSlug}`);
      }
    }
  }

  /**
   * Execute all registered hooks for a given event
   * Returns the final context after all hooks have been executed
   */
  async execute<T>(hookName: string, context: T): Promise<T> {
    const registrations = this.hooks.get(hookName) || [];
    let result: any = context;

    for (const registration of registrations) {
      try {
        const hookResult = await registration.fn(result);
        // For filter hooks, use the returned value; for before/after, use original context
        if (hookResult !== undefined && hookResult !== null) {
          result = hookResult;
        }
      } catch (error) {
        this.logger.error(`Hook execution failed: ${hookName} (plugin: ${registration.pluginSlug})`, error);
        // Continue with next hook even if one fails
      }
    }

    return result as T;
  }

  /**
   * Get all registered hooks (for monitoring)
   */
  getRegisteredHooks(): { hookName: string; count: number }[] {
    const result: { hookName: string; count: number }[] = [];
    for (const [hookName, registrations] of this.hooks.entries()) {
      result.push({ hookName, count: registrations.length });
    }
    return result;
  }

  /**
   * Get hooks for a specific plugin
   */
  getPluginHooks(pluginSlug: string): string[] {
    const hookNames: string[] = [];
    for (const [hookName, registrations] of this.hooks.entries()) {
      if (registrations.some(r => r.pluginSlug === pluginSlug)) {
        hookNames.push(hookName);
      }
    }
    return hookNames;
  }

  /**
   * Clear all hooks (for testing)
   */
  clear(): void {
    this.hooks.clear();
  }
}
