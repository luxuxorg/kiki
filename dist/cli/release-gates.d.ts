import { type Candidate, type CommandRunner } from './release-candidate.js';
export interface GateResult {
    name: 'build' | 'test' | 'typecheck' | 'lint' | 'security' | 'invariants';
    status: 'passed' | 'failed' | 'incomplete';
    detail: string;
}
export declare function createAuditInvocation(root: string, runRoot: string, ambient: NodeJS.ProcessEnv): Promise<{
    file: 'npm';
    args: string[];
    options: {
        cwd: string;
        env: NodeJS.ProcessEnv;
    };
}>;
export declare function runCandidateGates(candidate: Candidate, next: string, date: string, runner: CommandRunner, securityException?: string): Promise<GateResult[]>;
export declare function validateCandidate(candidate: Candidate, next: string, date: string): Promise<void>;
//# sourceMappingURL=release-gates.d.ts.map