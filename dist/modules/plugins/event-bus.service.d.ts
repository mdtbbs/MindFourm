export type HookFn = (context: any) => any | Promise<any>;
export declare class EventBusService {
    private readonly logger;
    private hooks;
    register(hookName: string, pluginSlug: string, fn: HookFn, priority?: number): void;
    unregister(pluginSlug: string): void;
    execute<T>(hookName: string, context: T): Promise<T>;
    getRegisteredHooks(): {
        hookName: string;
        count: number;
    }[];
    getPluginHooks(pluginSlug: string): string[];
    clear(): void;
}
