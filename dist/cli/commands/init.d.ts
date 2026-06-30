import { KikiConfig } from '../config.js';
export declare function runWizard(targetPath: string): Promise<KikiConfig>;
export declare function applyPathSetup(targetPath: string, config: KikiConfig, changelogStatus: string, decisionsStatus: string, knowledgeStatus: string): void;
/**
 * Backward-compatible init: supports both string path and args array.
 * When wizard=false, writes defaults directly without interactive prompt.
 */
export declare function init(args: string[] | string, options?: {
    wizard?: boolean;
}): Promise<void>;
//# sourceMappingURL=init.d.ts.map