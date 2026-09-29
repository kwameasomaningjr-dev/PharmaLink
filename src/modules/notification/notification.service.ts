import { v4 as uuidv4 } from 'uuid';
import { db, DatabaseClient } from '../../database/connection.js';
import { NotificationChannel } from '../../common/types.js';
import { ConflictError, NotFoundError } from '../../common/errors.js';

export interface QueueNotificationParams {
  userId: string;
  type: string;
  channel?: NotificationChannel;
  referenceType?: string;
  referenceId?: string;
  client?: DatabaseClient;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(input: { notificationId: string; userId: string; type: string; referenceId?: string }): Promise<{
    providerMessageId: string;
  }>;
}

class UnavailableNotificationProvider implements NotificationProvider {
  constructor(public readonly channel: NotificationChannel) {}

  async send(): Promise<{ providerMessageId: string }> {
    throw new Error(`No ${this.channel} notification provider is configured.`);
  }
}

export class NotificationService {
  private static providers = new Map<NotificationChannel, NotificationProvider>();

  public static setProvider(provider: NotificationProvider) {
    this.providers.set(provider.channel, provider);
  }

  public static async queueNotification(params: QueueNotificationParams) {
    const id = uuidv4();
    const channel = params.channel || 'SMS';
    const now = new Date().toISOString();
    const client = params.client || db;
    const idempotencyKey = `${params.userId}:${channel}:${params.type}:${params.referenceId || 'none'}`;

    const status = channel === 'IN_APP' ? 'SENT' : 'QUEUED';
    const sentAt = status === 'SENT' ? now : null;
    const inserted = await client.query(
      `INSERT INTO notifications (id, user_id, type, channel, status, reference_type, reference_id, idempotency_key, created_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [id, params.userId, params.type, channel, status, params.referenceType || null, params.referenceId || null,
        idempotencyKey, now, sentAt]
    );

    if (inserted.rowCount > 0) return inserted.rows[0].id;

    const existing = await client.query(
      `SELECT id FROM notifications WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (existing.rowCount === 0) throw new ConflictError('NOTIFICATION_IDEMPOTENCY_ERROR', 'Notification could not be created or recovered.');
    return existing.rows[0].id;
  }

  public static async dispatch(notificationId: string) {
    const res = await db.query(`SELECT * FROM notifications WHERE id = $1`, [notificationId]);
    if (res.rowCount === 0) throw new NotFoundError('Notification');
    const notification = res.rows[0];
    if (notification.status === 'SENT') return notification;

    const provider = this.providers.get(notification.channel) || new UnavailableNotificationProvider(notification.channel);
    try {
      const result = await provider.send({
        notificationId,
        userId: notification.user_id,
        type: notification.type,
        referenceId: notification.reference_id || undefined,
      });
      await db.query(
        `UPDATE notifications SET status = 'SENT', provider_message_id = $1, sent_at = CURRENT_TIMESTAMP,
         attempt_count = attempt_count + 1, last_error = NULL WHERE id = $2`,
        [result.providerMessageId, notificationId]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Notification provider failed.';
      await db.query(
        `UPDATE notifications SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = $1 WHERE id = $2`,
        [message, notificationId]
      );
    }
    return (await db.query(`SELECT * FROM notifications WHERE id = $1`, [notificationId])).rows[0];
  }

  public static async getUserNotifications(userId: string) {
    const res = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    return res.rows;
  }

  public static async getUserPreferences(userId: string) {
    const res = await db.query(
      `SELECT browser_push_enabled, updated_at FROM user_notification_preferences WHERE user_id = $1`,
      [userId]
    );
    return res.rows[0] || { browser_push_enabled: false, updated_at: null };
  }

  public static async updateUserPreferences(userId: string, browserPushEnabled: boolean) {
    const res = await db.query(
      `INSERT INTO user_notification_preferences (user_id, browser_push_enabled, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE
       SET browser_push_enabled = EXCLUDED.browser_push_enabled, updated_at = CURRENT_TIMESTAMP
       RETURNING browser_push_enabled, updated_at`,
      [userId, browserPushEnabled]
    );
    return res.rows[0];
  }

  public static async markAsRead(notificationId: string, userId: string) {
    const res = await db.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );
    if (res.rowCount === 0) {
      throw new NotFoundError('Notification');
    }
    return res.rows[0];
  }

  public static async retryForUser(notificationId: string, userId: string) {
    const owned = await db.query(
      `SELECT id FROM notifications WHERE id = $1 AND user_id = $2 AND status = 'FAILED'`,
      [notificationId, userId]
    );
    if (owned.rowCount === 0) throw new ConflictError('NOTIFICATION_NOT_RETRYABLE', 'Notification is not failed or does not belong to this user.');
    await db.query(`UPDATE notifications SET status = 'QUEUED' WHERE id = $1`, [notificationId]);
    return this.dispatch(notificationId);
  }
}
