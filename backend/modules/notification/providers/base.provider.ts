import { NotificationChannel } from '../../../common/types.js';

export interface SendMessageInput {
  notificationId?: string;
  recipientPhone: string;
  recipientName?: string;
  message: string;
  type?: string;
  referenceId?: string;
  senderId?: string;
}

export interface SendMessageResult {
  providerMessageId: string;
  status: 'SENT' | 'FAILED';
  rawResponse?: any;
}

export interface NotificationProvider {
  readonly providerName: string;
  readonly channel: NotificationChannel;
  send(input: SendMessageInput): Promise<SendMessageResult>;
}

/**
 * Normalizes Ghanaian phone numbers into E.164 / International format.
 * Examples:
 * - 0550000006 -> 233550000006 (or +233550000006)
 * - +233550000006 -> 233550000006
 * - 233550000006 -> 233550000006
 */
export function normalizeGhanaPhone(phone: string, includePlus = false): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d+]/g, '').trim();

  if (cleaned.startsWith('+233')) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '233' + cleaned.slice(1);
  } else if (!cleaned.startsWith('233') && cleaned.length === 9) {
    cleaned = '233' + cleaned;
  }

  return includePlus ? '+' + cleaned : cleaned;
}
