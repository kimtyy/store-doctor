export interface AdminNotificationPayload {
  subject: string;
  text: string;
}

export interface NotificationResult {
  channel: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  messageId?: string;
}

type NotificationChannel = (payload: AdminNotificationPayload) => Promise<NotificationResult>;

/**
 * 1. Resend REST API 이메일 채널 (SDK 없이 fetch 직접 호출)
 */
async function sendEmailNotification(payload: AdminNotificationPayload): Promise<NotificationResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;

  if (!apiKey || !to) {
    console.warn('[Notify] RESEND_API_KEY 또는 ALERT_EMAIL_TO 환경변수가 설정되지 않아 이메일 발송을 건너뜁니다.');
    return {
      channel: 'email',
      success: false,
      error: 'RESEND_API_KEY 또는 ALERT_EMAIL_TO 환경변수 부재',
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [to.trim()],
        subject: payload.subject,
        text: payload.text,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error(`[Notify] Resend email send failed: HTTP ${res.status}: ${data?.message || 'Unknown error'}`);
      return {
        channel: 'email',
        success: false,
        statusCode: res.status,
        error: data?.message || `HTTP ${res.status}`,
      };
    }

    console.log('[Notify] Resend email sent successfully:', res.status, data?.id);
    return {
      channel: 'email',
      success: true,
      statusCode: res.status,
      messageId: data?.id,
    };
  } catch (err: any) {
    console.error(`[Notify] Resend email request exception: ${err?.name || 'Error'}: ${err?.message || String(err)}`);
    return {
      channel: 'email',
      success: false,
      error: err?.message || 'Network exception',
    };
  }
}

/**
 * 2. 텔레그램 채널 (빈 틀 / stub)
 * TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID가 모두 있을 때만 동작 (현재 미구현)
 */
async function sendTelegramNotification(payload: AdminNotificationPayload): Promise<NotificationResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return {
      channel: 'telegram',
      success: false,
      error: 'TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 부재로 스킵',
    };
  }

  // TODO: 추후 텔레그램 Bot API 구현
  console.log('[Notify] Telegram notification stub called (not implemented yet)');
  return {
    channel: 'telegram',
    success: false,
    error: 'Telegram notification stub (not implemented yet)',
  };
}

// 등록된 알림 채널 목록
const CHANNELS: NotificationChannel[] = [
  sendEmailNotification,
  sendTelegramNotification,
];

/**
 * 관리자 알림 전송 (이메일 및 향후 추가 채널 순회)
 * 환경변수 부재 또는 발송 실패 시에도 예외를 던지지 않고 발송 성공 여부(true/false)를 반환하며 로그만 남깁니다.
 */
export async function notifyAdmin(payload: AdminNotificationPayload): Promise<boolean> {
  const results: NotificationResult[] = [];

  for (const channel of CHANNELS) {
    try {
      const result = await channel(payload);
      results.push(result);
    } catch (err: any) {
      console.error(`[Notify] Channel execution error: ${err?.name || 'Error'}: ${err?.message || String(err)}`);
      results.push({
        channel: 'unknown',
        success: false,
        error: err?.message || String(err),
      });
    }
  }

  const isSuccess = results.some((r) => r.success);
  return isSuccess;
}

