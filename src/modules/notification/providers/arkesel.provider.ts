import { NotificationProvider, SendMessageInput, SendMessageResult, normalizeGhanaPhone } from './base.provider.js';

export class ArkeselSmsProvider implements NotificationProvider {
  readonly providerName = 'arkesel';
  readonly channel = 'SMS' as const;

  constructor(
    private apiKey: string = process.env.ARKESEL_API_KEY || 'mock_arkesel_key',
    private senderId: string = process.env.ARKESEL_SENDER_ID || 'PharmaLink'
  ) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const recipient = normalizeGhanaPhone(input.recipientPhone);
    const sender = input.senderId || this.senderId;

    if (!recipient) {
      throw new Error(`Invalid Ghana phone number for SMS dispatch: "${input.recipientPhone}"`);
    }

    // If in test or without live API key, simulate success
    if (process.env.NODE_ENV === 'test' || this.apiKey.startsWith('mock_')) {
      const mockMsgId = `ark_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      return {
        providerMessageId: mockMsgId,
        status: 'SENT',
        rawResponse: { status: 'success', message: 'Message sent successfully (Simulated)', id: mockMsgId },
      };
    }

    try {
      const response = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify({
          sender: sender.slice(0, 11), // Ghana telecom sender ID max 11 chars
          message: input.message,
          recipients: [recipient],
        }),
      });

      const data: any = await response.json().catch(() => ({}));
      if (!response.ok || (data.status && data.status !== 'success')) {
        throw new Error(data.message || `Arkesel SMS API failed with HTTP ${response.status}`);
      }

      return {
        providerMessageId: data.data?.id || `ark_${Date.now()}`,
        status: 'SENT',
        rawResponse: data,
      };
    } catch (err: any) {
      throw new Error(`Arkesel SMS delivery error: ${err.message}`);
    }
  }
}
