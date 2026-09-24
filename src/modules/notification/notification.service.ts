import { v4 as uuidv4 } from 'uuid';
import { db, DatabaseClient } from '../../database/connection.js';
import { NotificationChannel } from '../../common/types.js';

export interface QueueNotificationParams {
  userId: string;
  type: string;
  channel?: NotificationChannel;
  referenceType?: string;
  referenceId?: string;
  client?: DatabaseClient;
}

export class NotificationService {
  public static async queueNotification(params: QueueNotificationParams) {
    const id = uuidv4();
    const channel = params.channel || 'SMS';
    const now = new Date().toISOString();
    const client = params.client || db;

    try {
      await client.query(
        `INSERT INTO notifications (id, user_id, type, channel, status, reference_type, reference_id, provider_message_id, created_at, sent_at)
         VALUES ($1, $2, $3, $4, 'SENT', $5, $6, $7, $8, $8)`,
        [
          id,
          params.userId,
          params.type,
          channel,
          params.referenceType || null,
          params.referenceId || null,
          `msg_${Date.now()}`,
          now,
        ]
      );
    } catch (err) {
      console.error('[NotificationService] Failed to queue notification:', err);
    }
  }

  public static async getUserNotifications(userId: string) {
    const res = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    return res.rows;
  }
}
