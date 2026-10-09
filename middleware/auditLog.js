import { AuditLog } from '../models/index.js';

export async function logAudit(userId, action, targetUserId = null, description = '', ipAddress = 'unknown') {
  try {
    await AuditLog.create({
      user_id: userId,
      action,
      target_user_id: targetUserId,
      description,
      ip_address: ipAddress
    });
  } catch (error) {
    console.error('Error logging audit:', error.message);
  }
}
