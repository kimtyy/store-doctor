/**
 * lib/billingOutcome.ts
 * 토스 결제 청구 응답 및 주문 조회 결과에 대한 단일 판정 공통 모듈
 */

export type BillingOutcome = 'SUCCESS' | 'FAILURE' | 'UNCONFIRMED' | 'SYSTEM_ERROR';
export type ChargeCategory = 'SUCCESS' | 'A' | 'B' | 'RATE_LIMIT' | 'DUPLICATE' | 'SYSTEM';

export interface ChargeResponseInput {
  ok?: boolean;
  status?: number;
  data?: any;
  error?: any;
  parseError?: boolean;
}

export interface LookupResponseInput {
  ok?: boolean;
  status?: number;
  data?: any;
  error?: any;
}

export interface BillingOutcomeResult {
  outcome: BillingOutcome;
  paymentKey: string | null;
  approvedAt: string | null;
  errorMessage: string | null;
  unconfirmedReason: string | null;
  chargeCategory: ChargeCategory;
  lookupStatus: string | null;
}

/**
 * 청구 응답 분류:
 * - SYSTEM: HTTP 401, 403 및 토스 키·인증·상점 설정 오류 코드 (5xx 제외)
 * - SUCCESS: 200 OK + 본문 status === 'DONE'
 * - RATE_LIMIT: 429 Too Many Requests
 * - DUPLICATE: 중복 주문번호 오류 (ALREADY_PROCESSED_PAYMENT, DUPLICATED_ORDER_ID)
 * - A (명확한 거절): 401·403·408·429·SYSTEM·중복을 제외한 4xx 이고 응답 본문 파싱 성공
 * - B (처리 중일 수 있음): 2xx 응답이지만 status !== 'DONE', 5xx(상태 코드 무관), FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING, 네트워크 예외, 타임아웃, 408, 응답 본문 파싱 실패
 */
export const TOSS_SYSTEM_ERROR_CODES = [
  'UNAUTHORIZED_KEY',
  'FORBIDDEN_REQUEST',
  'INCORRECT_BASIC_AUTH_FORMAT',
  'INVALID_API_KEY',
  'NOT_FOUND_MERCHANT',
] as const;

export function classifyChargeResponse(charge: ChargeResponseInput): ChargeCategory {
  const errorCode = charge.data?.code;

  // 1. 5xx 에러는 코드와 관계없이 무조건 B(처리 중일 수 있음, 주문 조회 경로)로 분류
  if (
    charge.error ||
    charge.parseError ||
    charge.status === 408 ||
    (charge.status && charge.status >= 500)
  ) {
    return 'B';
  }

  // 2. FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING은 상태 코드 무관 B로 분류
  if (errorCode === 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING') {
    return 'B';
  }

  // 3. 2xx 응답 검증: 본문 status가 DONE이어야만 SUCCESS, 그 외(IN_PROGRESS 등)는 B로 분류해 조회
  if (charge.ok && charge.data) {
    if (charge.data.status === 'DONE') {
      return 'SUCCESS';
    }
    return 'B';
  }

  // 4. 429 Rate limit
  if (charge.status === 429) {
    return 'RATE_LIMIT';
  }

  // 5. SYSTEM 오류: HTTP 401, 403 또는 명시된 시스템 에러 코드 5개 (5xx는 이미 위에서 B로 처리됨)
  const isSystemErrorCode = Boolean(
    errorCode && (TOSS_SYSTEM_ERROR_CODES as readonly string[]).includes(errorCode)
  );
  if (charge.status === 401 || charge.status === 403 || isSystemErrorCode) {
    return 'SYSTEM';
  }

  // 6. 중복 주문번호 오류인지 확인
  const isDuplicateError =
    errorCode === 'ALREADY_PROCESSED_PAYMENT' ||
    errorCode === 'DUPLICATED_ORDER_ID';

  if (isDuplicateError) {
    return 'DUPLICATE';
  }

  // 7. 본문 데이터가 없는 경우 B
  if (!charge.data) {
    return 'B';
  }

  // 8. A: 401·403·408·429·SYSTEM·중복을 제외한 4xx 이고 응답 본문 파싱 성공
  // (NOT_SUPPORTED_METHOD, NOT_AVAILABLE_PAYMENT_METHOD 등 일반 4xx는 A로 분류)
  if (charge.status && charge.status >= 400 && charge.status < 500) {
    return 'A';
  }

  return 'B';
}

/**
 * 청구 응답 + 주문 조회 결과를 조합하여 최종 결과 판정
 *
 * | 청구 응답 | 조회 DONE | 조회 404 NOT_FOUND_PAYMENT | 조회 200 + ABORTED/EXPIRED | 그 외(조회 실패, IN_PROGRESS 등) |
 * | A         | SUCCESS   | FAILURE                    | FAILURE                    | UNCONFIRMED |
 * | B         | SUCCESS   | UNCONFIRMED                | FAILURE                    | UNCONFIRMED |
 */
export function determineBillingOutcome(
  charge: ChargeResponseInput,
  lookup?: LookupResponseInput | null
): BillingOutcomeResult {
  const category = classifyChargeResponse(charge);

  // 0. SYSTEM 오류: 조회 없이 즉시 SYSTEM_ERROR 반환
  if (category === 'SYSTEM') {
    const codeStr = charge.data?.code ? ` [${charge.data.code}]` : '';
    return {
      outcome: 'SYSTEM_ERROR',
      paymentKey: null,
      approvedAt: null,
      errorMessage: charge.data?.message
        ? `${charge.data.message}${codeStr}`
        : `결제 시스템 인증/설정 오류 (HTTP ${charge.status || 0}${codeStr})`,
      unconfirmedReason: null,
      chargeCategory: 'SYSTEM',
      lookupStatus: null,
    };
  }

  // 1. 첫 청구 자체가 200 성공인 경우 (status === 'DONE')
  if (category === 'SUCCESS') {
    return {
      outcome: 'SUCCESS',
      paymentKey: charge.data?.paymentKey || null,
      approvedAt: charge.data?.approvedAt || null,
      errorMessage: null,
      unconfirmedReason: null,
      chargeCategory: 'SUCCESS',
      lookupStatus: null,
    };
  }

  // 2. 429 Rate limit: 조회 없이 즉시 UNCONFIRMED
  if (category === 'RATE_LIMIT') {
    return {
      outcome: 'UNCONFIRMED',
      paymentKey: null,
      approvedAt: null,
      errorMessage: charge.data?.message || '요청 제한',
      unconfirmedReason: '토스 API 요청 제한 (HTTP 429 Too Many Requests)',
      chargeCategory: 'RATE_LIMIT',
      lookupStatus: null,
    };
  }

  // 조회 결과 분류
  const lookupData = lookup?.data;
  const isLookupDone = Boolean(lookup?.ok && lookupData?.status === 'DONE');
  const isLookupNotFound = Boolean(lookup?.status === 404 && lookupData?.code === 'NOT_FOUND_PAYMENT');
  const isLookupAbortedOrExpired = Boolean(
    lookup?.ok && (lookupData?.status === 'ABORTED' || lookupData?.status === 'EXPIRED')
  );

  const paymentKey = isLookupDone ? lookupData?.paymentKey || null : null;
  const approvedAt = isLookupDone ? lookupData?.approvedAt || null : null;
  const lookupStatusStr = lookup
    ? `HTTP ${lookup.status || 0}${lookupData?.status ? `/${lookupData.status}` : ''}${lookupData?.code ? `/${lookupData.code}` : ''}`
    : 'NO_LOOKUP';

  // 3. 중복 orderId 응답 (ALREADY_PROCESSED_PAYMENT, DUPLICATED_ORDER_ID)
  // 규칙: DONE → SUCCESS, 나머지 → UNCONFIRMED
  if (category === 'DUPLICATE') {
    if (isLookupDone) {
      return {
        outcome: 'SUCCESS',
        paymentKey,
        approvedAt,
        errorMessage: null,
        unconfirmedReason: null,
        chargeCategory: 'DUPLICATE',
        lookupStatus: lookupStatusStr,
      };
    }
    return {
      outcome: 'UNCONFIRMED',
      paymentKey: null,
      approvedAt: null,
      errorMessage: charge.data?.message || '중복 결제 응답',
      unconfirmedReason: `중복 주문 오류 후 조회 미완료 (${lookupStatusStr})`,
      chargeCategory: 'DUPLICATE',
      lookupStatus: lookupStatusStr,
    };
  }

  // 4. Category A: 명확한 거절 (4xx 파싱 성공)
  if (category === 'A') {
    const errorMsg = charge.data?.message || `결제 거절 (HTTP ${charge.status})`;

    if (isLookupDone) {
      return {
        outcome: 'SUCCESS',
        paymentKey,
        approvedAt,
        errorMessage: null,
        unconfirmedReason: null,
        chargeCategory: 'A',
        lookupStatus: lookupStatusStr,
      };
    }

    if (isLookupNotFound || isLookupAbortedOrExpired) {
      return {
        outcome: 'FAILURE',
        paymentKey: null,
        approvedAt: null,
        errorMessage: isLookupAbortedOrExpired
          ? `토스 결제 중단/만료 (${lookupData?.status})`
          : errorMsg,
        unconfirmedReason: null,
        chargeCategory: 'A',
        lookupStatus: lookupStatusStr,
      };
    }

    return {
      outcome: 'UNCONFIRMED',
      paymentKey: null,
      approvedAt: null,
      errorMessage: errorMsg,
      unconfirmedReason: `명확한 거절 후 주문 조회 불확실 (${lookupStatusStr})`,
      chargeCategory: 'A',
      lookupStatus: lookupStatusStr,
    };
  }

  // 5. Category B: 처리 중일 수 있음 (네트워크 예외, 타임아웃, 408, 5xx, 파싱 실패)
  const baseErrMsg =
    charge.error?.message ||
    charge.data?.message ||
    (charge.status ? `HTTP ${charge.status}` : '네트워크 오류');

  if (isLookupDone) {
    return {
      outcome: 'SUCCESS',
      paymentKey,
      approvedAt,
      errorMessage: null,
      unconfirmedReason: null,
      chargeCategory: 'B',
      lookupStatus: lookupStatusStr,
    };
  }

  if (isLookupAbortedOrExpired) {
    return {
      outcome: 'FAILURE',
      paymentKey: null,
      approvedAt: null,
      errorMessage: `토스 결제 중단/만료 (${lookupData?.status})`,
      unconfirmedReason: null,
      chargeCategory: 'B',
      lookupStatus: lookupStatusStr,
    };
  }

  return {
    outcome: 'UNCONFIRMED',
    paymentKey: null,
    approvedAt: null,
    errorMessage: baseErrMsg,
    unconfirmedReason: isLookupNotFound
      ? `승인 요청 불확실 후 결제 정보 없음 (지연 가능성, ${lookupStatusStr})`
      : `승인 요청 불확실 및 주문 조회 불확실 (${lookupStatusStr})`,
    chargeCategory: 'B',
    lookupStatus: lookupStatusStr,
  };
}

/**
 * 편의 함수: charge 정보와 lookup 비동기 조회 함수를 받아 outcome 도출
 */
export async function resolveBillingOutcome({
  charge,
  fetchLookup,
}: {
  charge: ChargeResponseInput;
  fetchLookup?: () => Promise<LookupResponseInput>;
}): Promise<BillingOutcomeResult> {
  const category = classifyChargeResponse(charge);

  // SUCCESS, RATE_LIMIT 또는 SYSTEM은 주문 조회가 불필요함
  if (category === 'SUCCESS' || category === 'RATE_LIMIT' || category === 'SYSTEM' || !fetchLookup) {
    return determineBillingOutcome(charge, null);
  }

  try {
    const lookup = await fetchLookup();
    return determineBillingOutcome(charge, lookup);
  } catch (lookupErr: any) {
    return determineBillingOutcome(charge, {
      ok: false,
      status: 0,
      error: lookupErr?.message || String(lookupErr),
    });
  }
}

