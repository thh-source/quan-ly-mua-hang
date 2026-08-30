"use client";

/**
 * Compatibility shim for legacy SCMH state/imports.
 * The Project Contract Management module has been removed from the product.
 */
export type ProjectContractWorkspace = {
  projects: never[];
};

// Remove the legacy navigation entry without touching the shared navigation
// implementation in ProcurementApp. This also handles menus rendered after
// hydration.
if (typeof document !== "undefined") {
  const removeLegacyNav = () => {
    document.querySelectorAll("button, a").forEach((node) => {
      if (node.textContent?.trim() !== "HĐ dự án") return;
      const item = node.closest("li, [role=menuitem], .nav-item") || node;
      (item as HTMLElement).style.display = "none";
    });
  };
  queueMicrotask(removeLegacyNav);
  new MutationObserver(removeLegacyNav).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export default function ProjectContractManagement() {
  return null;
}
