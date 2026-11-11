/**
 * lib/billingOutcome.ts
 * 토스 결제 청구 응답 및 주문 조회 결과에 대한 단일 판정 공통 모듈
 */

export type BillingOutcome = 'SUCCESS' | 'FAILURE' | 'UNCONFIRMED';
export type ChargeCategory = 'SUCCESS' | 'A' | 'B' | 'RATE_LIMIT' | 'DUPLICATE';

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
 * - SUCCESS: 200 OK + 본문 파싱 성공
 * - RATE_LIMIT: 429 Too Many Requests
 * - DUPLICATE: 중복 주문번호 오류 (ALREADY_PROCESSED_PAYMENT, DUPLICATED_ORDER_ID)
 * - A (명확한 거절): 408·429·중복을 제외한 4xx 이고 응답 본문 파싱 성공
 * - B (처리 중일 수 있음): 네트워크 예외, 타임아웃, 408, 5xx, 응답 본문 파싱 실패(상태 코드 무관)
 */
export function classifyChargeResponse(charge: ChargeResponseInput): ChargeCategory {
  if (charge.ok && charge.data) {
    return 'SUCCESS';
  }

  if (charge.status === 429) {
    return 'RATE_LIMIT';
  }

  // 중복 주문번호 오류인지 확인
  const errorCode = charge.data?.code;
  const isDuplicateError =
    errorCode === 'ALREADY_PROCESSED_PAYMENT' ||
    errorCode === 'DUPLICATED_ORDER_ID';

  if (isDuplicateError) {
    return 'DUPLICATE';
  }

  // B: 네트워크 예외, 타임아웃, 408, 5xx, 응답 본문 파싱 실패
  if (
    charge.error ||
    charge.parseError ||
    charge.status === 408 ||
    (charge.status && charge.status >= 500) ||
    !charge.data
  ) {
    return 'B';
  }

  // A: 408·429·중복을 제외한 4xx 이고 응답 본문 파싱 성공
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

  // 1. 첫 청구 자체가 200 성공인 경우
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

  // SUCCESS 또는 RATE_LIMIT는 주문 조회가 불필요함
  if (category === 'SUCCESS' || category === 'RATE_LIMIT' || !fetchLookup) {
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
