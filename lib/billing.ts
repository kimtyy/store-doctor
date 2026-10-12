import crypto from 'crypto';

export const BILLING_PLANS = {
  basic: { name: 'Basic', price: 9900, description: '1인 매장 및 기초 장부 자동화' },
  pro: { name: 'Pro', price: 19900, description: '복수 매장 통합 및 정밀 손익 보고서' },
  premium: { name: 'Premium', price: 29900, description: 'AI 심화 경영 진단 및 맞춤 리포트' },
} as const;

export type PlanKey = keyof typeof BILLING_PLANS;

/**
 * Supabase user id 기반의 추측 불가능한 customerKey 생성
 * Toss 규격: 영문 대소문자, 숫자, -, _, =, ., @ (2~50자)
 */
export function generateCustomerKey(userId: string): string {
  if (!userId) throw new Error('userId is required to generate customerKey');
  // SHA-256 해시로 추측 불가능한 고유 키 생성 (37자)
  const hash = crypto
    .createHash('sha256')
    .update(`store_doctor_cust_${userId}`)
    .digest('hex')
    .slice(0, 32);
  return `cust_${hash}`;
}

function getEncryptionKey(): Buffer {
  const secret = process.env.BILLING_ENCRYPTION_KEY;
  if (!secret || !secret.trim()) {
    throw new Error('BILLING_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  }
  const trimmed = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  return crypto.createHash('sha256').update(trimmed).digest();
}

/**
 * billingKey 암호화 (AES-256-GCM)
 */
export function encryptBillingKey(billingKey: string): string {
  if (!billingKey) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(billingKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * billingKey 복호화 (AES-256-GCM)
 */
export function decryptBillingKey(encryptedData: string): string {
  if (!encryptedData) return '';
  // iv:tag:content 포맷이 아닌 경우(평문 저장 등 대비)
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    return encryptedData;
  }
  const [ivHex, tagHex, contentHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(contentHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
