"use client";

/**
 * Deprecated compatibility shim.
 * The Project Contract Management module has been removed from SCMH.
 * Kept temporarily so existing imports from persisted/legacy builds do not
 * break while the main application is migrated away from this module.
 */
export type ProjectContractWorkspace = {
  projects: never[];
};

export default function ProjectContractManagement() {
  return null;
}
