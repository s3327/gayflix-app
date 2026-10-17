import { requireAdmin } from "@/lib/session";
import {
  canManageCatalog,
  canManageUsers,
  canManageSettings,
  canManageJobs,
} from "@/lib/admin-roles";

export const FORBIDDEN_CATALOG = "Forbidden: you do not have permission to manage the catalog.";
export const FORBIDDEN_USERS = "Forbidden: you do not have permission to moderate users or reports.";
export const FORBIDDEN_SETTINGS = "Forbidden: you do not have permission to manage site settings.";
export const FORBIDDEN_JOBS = "Forbidden: you do not have permission to manage background jobs.";

/**
 * Ensures the caller has staff access and catalog management permissions (owner, admin, editor).
 */
export async function catalogSession() {
  const session = await requireAdmin();
  return { session, allowed: canManageCatalog(session.user.role) };
}

/**
 * Ensures the caller has staff access and moderation permissions (owner, admin, moderator).
 */
export async function moderationSession() {
  const session = await requireAdmin();
  return { session, allowed: canManageUsers(session.user.role) };
}

/**
 * Ensures the caller has staff access and settings permissions (owner, admin).
 */
export async function settingsSession() {
  const session = await requireAdmin();
  return { session, allowed: canManageSettings(session.user.role) };
}

/**
 * Ensures the caller has staff access and background job permissions (owner, admin).
 */
export async function jobsSession() {
  const session = await requireAdmin();
  return { session, allowed: canManageJobs(session.user.role) };
}
