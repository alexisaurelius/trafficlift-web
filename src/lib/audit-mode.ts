export type AuditType = "seo" | "cro";

export const CRO_AUDIT_KEYWORD = "__cro_audit__";

export function isCroAuditKeyword(targetKeyword: string) {
  return targetKeyword.trim().toLowerCase() === CRO_AUDIT_KEYWORD;
}

export function auditTypeFromKeyword(targetKeyword: string): AuditType {
  return isCroAuditKeyword(targetKeyword) ? "cro" : "seo";
}
