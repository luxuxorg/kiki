import { KikiConfig } from '../config.js';
export declare function runWizard(targetPath: string): Promise<KikiConfig>;
export declare function applyPathSetup(targetPath: string, config: KikiConfig, changelogStatus: string, decisionsStatus: string, knowledgeStatus: string): void;
export declare function init(targetPath: string, options?: {
    wizard?: boolean;
}): Promise<void>;
//# sourceMappingURL=init.d.ts.map