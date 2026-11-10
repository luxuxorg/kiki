export interface DoctorOptions {
    /** Test seam: returns the observed `opencode --version` first line. */
    observeVersion?: () => string;
}
export declare function doctor(targetPath?: string, options?: DoctorOptions): Promise<void>;
//# sourceMappingURL=doctor.d.ts.map