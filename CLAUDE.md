# 매장닥터 (MaejangDoctor) — CLAUDE.md

> 이 문서는 Claude Code가 프로젝트를 시작할 때 가장 먼저 읽어야 하는 인수인계 문서입니다.
> 모든 개발 결정은 이 문서의 방향을 기준으로 합니다.

---

## 1. 프로젝트 정체성

### 한 줄 정의
> **"POS와 캐시노트가 답하지 못하는 단 하나의 질문 — '내 가게 잘 가고 있나?'에 매일 답하는 매장 손익 진단 앱"**

### 이름
- 서비스명: **매장닥터**
- 영문: MaejangDoctor
- 슬로건: "매일 마감 후 30초, 내 가게의 건강을 확인하세요"

### 핵심 철학
- 사용자는 매출을 이미 알고 있다 (POS 앱에서 매일 확인)
- 사용자가 모르는 것은 **"매입과 매출을 합쳤을 때 진짜 얼마가 남는가"**
- 그리고 **"지금 잘 가고 있는가, 아니면 위험한가"**
- 이 두 질문에 답하는 것이 매장닥터의 전부다
- **진단(Diagnosis)**이 핵심 은유. 의사가 환자를 진단하듯 매장의 건강 상태를 매일 진단한다

### 절대 금기
- 광고 배너 없음
- 보험·대출·식자재 마켓 같은 끼워팔기 없음
- 정부 지원금 안내 없음
- 리뷰 관리 없음
- 캐시노트가 하는 것 따라하지 않음
- **오직 손익 분석과 진단에만 집중**

---

## 2. 타겟 페르소나

### "데이터 욕망형 사장님"

| 항목 | 내용 |
|---|---|
| 나이/구성 | 40~55세, 1인 또는 부부 운영 |
| 업종 | 맥주집·치킨집·고깃집·카페 등 식음료 소매업 |
| 규모 | 월 매출 1,500만~5,000만 원, 직원 0~3명 |
| 현재 도구 | POS 앱(매출 확인) + 캐시노트 무료 + 세무사 위탁 |
| 핵심 고통 1 | 캐시노트가 복잡하고 광고가 많아 정작 필요한 정보가 깊숙이 묻힘 |
| 핵심 고통 2 | 매출은 POS에서 보는데, 매입을 합쳐서 분석해주는 도구가 없어 진짜 손익을 모름 |
| 핵심 욕구 | 단순함이 아닌 **정돈된 깊이** — 주식 HTS처럼 정보가 많아도 한눈에 잡히는 것 |
| 현금 비중 | 현금 결제가 40~60%인 지역 상권 사장님 포함 (캐시노트가 못 잡는 영역) |

### 실제 모델 매장 (개발 기준 참조)
- 매장명: 설맥(현리점)
- 업종: 맥주집·한식주점
- 영업: 18:00~익일 00:00
- 테이블: 25개
- 월 매출: 약 1,340만 원 (일평균 약 45만 원)
- 결제: 현금 60% / 카드 40%

---

## 3. 시장 포지셔닝

### 경쟁사 분석

| 경쟁사 | 강점 | 약점 |
|---|---|---|
| 캐시노트 (140만 사업장) | 카드매출 자동연동, 배달 정산 | 매입 분석 없음, 복잡함, 광고 많음, 현금 못 잡음 |
| POS 앱 (자체) | 메뉴별·시간대별 매출 정확 | 매입 없음, 미래 예측 없음, 진단 없음 |
| Scanomy, 영수증 스캐너 등 | 영수증 OCR | 매출과 연결 없음, F&B 전문화 없음 |

### 우리의 자리
- 캐시노트와 **정면 대결 금지** (카드매출 인프라 없음)
- **"캐시노트는 들어오는 돈, 매장닥터는 나가는 돈과 진단"**
- 캐시노트의 보완재로 포지셔닝
- 타겟: POS + 캐시노트를 이미 쓰지만 "진짜 손익"을 모르는 사장님

---

## 4. 기술 스택

```
Frontend:   Next.js 14+ (App Router)
Backend:    Next.js API Routes (Serverless)
Database:   Supabase (PostgreSQL + Auth)
Storage:    Supabase Storage (영수증 이미지)
AI/Vision:  Anthropic Claude Sonnet 4.6 (영수증 OCR + 진단 분석)
날씨 API:  기상청 단기예보 API (무료)
Hosting:    Vercel
Style:      Tailwind CSS
Charts:     Recharts
```

### 절대 금지 기술 선택
- localStorage를 주 데이터 저장소로 사용 금지 (이전 v8.2.20의 핵심 실패)
- Vanilla JS 단일 파일 구조 금지
- 정규식 기반 영수증 파싱 금지 (Claude Vision 사용)
- 프레임워크 없는 순수 HTML/JS 금지

---

## 5. 데이터 모델

### 매출 데이터 (DailySales)

실제 POS 마감 영수증 기준으로 설계:

```typescript
interface DailySales {
  id: string
  storeId: string
  date: string                    // "2026-05-11" (영업일 기준)

  // 포스마감정산서에서 추출
  totalRevenue: number            // 총매출금액: 224,500
  discount: number                // 할인금액: 0
  serviceCharge: number           // 서비스금액: 0
  tax: number                     // 부가세: 20,407
  netRevenue: number              // 순매출금액: 204,093

  // 결제수단별
  cashCount: number               // 현금 건수: 5
  cashAmount: number              // 현금 금액: 131,800
  cardCount: number               // 카드 건수: 1
  cardAmount: number              // 카드 금액: 92,700

  // 운영 현황
  tablesUsed: number              // 사용 테이블: 6
  guestCount: number              // 고객수: 6
  avgSpend: number                // 객단가: 37,416
  openTime: string                // 개점: "18:17"
  closeTime: string               // 마감: "00:03"
  firstOrderTime: string          // 첫주문: "21:09"

  // 메뉴별매출내역에서 추출
  menuItems: SalesMenuItem[]

  // 메타
  inputMethod: 'receipt_photo' | 'screen_capture' | 'excel_upload' | 'manual'
  receiptImageUrl?: string
  createdAt: string
}

interface SalesMenuItem {
  name: string                    // "설맥치킨"
  quantity: number                // 1
  amount: number                  // 18,900
  category?: string               // "치킨" (분류별매출에서)
  menuId?: string                 // 나중에 원가 매핑용
}
```

### 매입 데이터 (PurchaseRecord)

```typescript
interface PurchaseRecord {
  id: string
  storeId: string
  date: string                    // "2026-05-11"

  // 영수증 기본 정보
  vendorName: string              // "홈플러스" / "현대카드" 등
  totalAmount: number             // 영수증 합계
  taxAmount: number               // 부가세 (VAT 포함 여부 주의)
  netAmount: number               // 공급가액

  // 분류
  category: PurchaseCategory
  items: PurchaseItem[]

  // 입력 방식
  inputMethod: 'receipt_photo' | 'manual' | 'auto_fixed'
  receiptImageUrl?: string
  note?: string                   // "영수증 없는 현금 거래"

  createdAt: string
}

type PurchaseCategory =
  | 'food_ingredients'    // 식자재
  | 'alcohol'             // 주류
  | 'consumables'         // 소모품
  | 'labor'               // 인건비
  | 'rent'                // 임대료
  | 'electricity'         // 전기요금
  | 'gas'                 // 가스요금
  | 'water'               // 수도요금
  | 'telecom'             // 통신비
  | 'pos_fee'             // POS 사용료
  | 'insurance'           // 보험료
  | 'other'               // 기타
```

### 고정비 자동 등록 (FixedCost)

```typescript
interface FixedCost {
  id: string
  storeId: string
  name: string                    // "임대료"
  amount: number                  // 2,300,000
  category: PurchaseCategory
  billingDay: number              // 매월 몇 일 (1~31)
  isActive: boolean
}
```

---

## 6. 입력 경로 설계

### 매출 입력 (3가지 경로)

#### 경로 1: 종이 영수증 사진 (PRIMARY — 대부분의 사장님)
```
마감 버튼 클릭 → POS 자동 출력 → 사진 2장 촬영 → 앱 업로드
  ① 포스마감정산서 (하루 요약)
  ② 메뉴별매출내역 (메뉴 분석)
```
- Claude Vision이 2장을 읽어서 DailySales 객체 생성
- 정확도 목표: 98%+
- 소요 시간: 30초 이내

#### 경로 2: 앱 화면 캡처 (SECONDARY — POS 앱 사용자)
```
POS 앱 스크린샷 최대 5장 → 업로드 → Claude Vision 파싱
```

#### 경로 3: 엑셀 업로드 (ADVANCED — 할 줄 아는 사용자)
```
POS 백오피스 → 엑셀 다운로드 → 앱 업로드 → 자동 파싱
```

### 매입 입력 (4가지 경로)

#### 경로 1: 영수증 사진 (기본)
```
영수증 촬영 → Claude Vision 추출 → 1초 확인 → 저장
```

#### 경로 2: 빠른 수동 입력 (영수증 없는 현금 거래)
```
금액 + 카테고리 선택 + 메모 → 3탭 → 저장
```
- 예: "오늘 시장에서 생물 5만원" → 식자재 / 50,000 / "재래시장"

#### 경로 3: 고정비 자동 등록 (SET & FORGET)
```
고정비 한 번 등록 → 매월 자동 반영
```
- 임대료, 전기·가스·수도·통신, POS 사용료, 보험료 등
- "매월 1일 임대료 230만원" 같은 형식으로 1회 등록

#### 경로 4: 통장/카드 내역 업로드 (선택)
- 나중 단계에서 추가

---

## 7. 핵심 기능 (MVP 범위)

### Phase 1 — 본인 사용 (지금 만들 것)

#### ① 매출 입력 & 파싱
- 사진 업로드 UI (드래그&드롭 또는 카메라)
- Claude Vision으로 포스마감정산서 파싱
- Claude Vision으로 메뉴별매출내역 파싱
- 파싱 결과 확인/수정 화면 (1회)
- Supabase 저장

#### ② 매입 입력
- 영수증 사진 촬영 → Claude Vision 파싱 → 확인 → 저장
- 빠른 수동 입력 (영수증 없는 매입)
- 고정비 등록 (월세, 공과금 등)

#### ③ 메인 진단 화면 (가장 중요)
```
┌─────────────────────────────────┐
│  📊 오늘의 진단  2026.05.11 (월) │
│                                  │
│  ⚡ 성장 중    ▲ +8.3%           │
│  (5일 이평선이 20일선 위)        │
│                                  │
│  ⚠️  주의: 원가율 3주 연속 상승  │
│  → 식자재 발주 점검 필요         │
│                                  │
│  오늘 순이익: +84,093원          │
│  (매출 204,093 - 매입 120,000)  │
└─────────────────────────────────┘

[ 상세 보기 ▼ ]
 · 매출 5일선 / 20일선 / 60일선 / 120일선
 · 원가율 추세
 · 날씨 보정 성과
 · 요일별 패턴
 · 이번 달 부가세 누적 예상
```

#### ④ 이평선 차트
- 매출: 5일 / 20일 / 60일 / 120일 이동평균선
- 매입(원가율): 5일 / 20일 / 60일 이동평균선
- 골든크로스 감지 → 알림
- 날씨 보정 표시 (기상청 API)

#### ⑤ 메뉴별 마진 분석 (핵심 차별화)
- 메뉴별 원가 1회 등록 (예: "참이슬 한 병 원가 2,500원")
- 메뉴별 마진율 자동 계산
- 마진 하락 메뉴 경고
- "이번 달 가장 돈 된 메뉴 TOP 3"

### Phase 2 — 베타 (나중에)
- 로그인 / 멀티테넌트 (다른 매장 사장님들)
- 결제 시스템
- 사용량 제한

---

## 8. Claude Vision 파싱 지침

### 포스마감정산서 파싱 프롬프트 구조
```
이미지는 한국 식당 POS 시스템의 마감 정산서입니다.
다음 정보를 JSON으로 추출해주세요:
- 매장명
- 영업일자
- 총매출금액, 할인금액, 서비스금액, 부가세, 순매출금액
- 현금 건수/금액, 신용카드 건수/금액
- 사용테이블, 고객수, 객단가
- 개점시간, 마감시간, 첫주문시간

부가세 처리 주의사항:
- 정산서에 이미 부가세가 명시되어 있으면 그대로 사용
- 절대로 금액에 1.1을 곱해서 부가세를 추가하지 말 것
- 순매출금액 = 매출금액 - 부가세
```

### 메뉴별매출내역 파싱 프롬프트 구조
```
이미지는 한국 식당 POS의 메뉴별 매출 내역입니다.
메뉴명, 수량, 금액을 JSON 배열로 추출해주세요.
합계 행([합계], [부가세])은 별도 필드로 추출하세요.
메뉴명에 코드가 포함된 경우 ([0121] 등) 코드와 이름을 분리하세요.
```

### 일반 영수증 파싱 프롬프트 구조
```
이미지는 한국 소매점 또는 도매상의 영수증입니다.
다음을 JSON으로 추출하세요:
- 상호명 (vendor)
- 날짜 (date, YYYY-MM-DD)
- 품목 목록 (items: [{name, quantity, unitPrice, amount}])
- 공급가액 (supplyAmount)
- 부가세 (taxAmount)
- 합계 (totalAmount)

주의: 카드 영수증은 이미 부가세 포함 금액이므로 추가 계산 금지
```

---

## 9. 이동평균선 계산 로직

```typescript
function calculateMA(data: number[], period: number): (number | null)[] {
  return data.map((_, index) => {
    if (index < period - 1) return null  // 데이터 부족시 null
    const slice = data.slice(index - period + 1, index + 1)
    return slice.reduce((a, b) => a + b, 0) / period
  })
}

// 골든크로스 감지
function detectGoldenCross(ma5: number[], ma20: number[]): boolean {
  const len = ma5.length
  if (len < 2) return false
  const yesterday = ma5[len-2] <= ma20[len-2]
  const today = ma5[len-1] > ma20[len-1]
  return yesterday && today
}

// 원가율 계산
function costRatio(totalRevenue: number, totalCost: number): number {
  return totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0
}
```

---

## 10. 과거 실패 분석 (절대 반복 금지)

v8.2.20 (pub-ai-elite) 에서 배운 것들:

| 실패 | 원인 | 해결책 |
|---|---|---|
| OCR 정확도 참담 | 정규식으로 영수증 파싱 시도 | Claude Vision으로 LLM 직접 처리 |
| 부가세 이중 계산 | amount × 1.1 강제 적용 | 정산서의 부가세 그대로 사용 |
| 파일 충돌·손상 | 멀티에이전트 동시 파일 수정 | 단일 에이전트, 순차 작업 |
| 데이터 유실 위험 | localStorage 전용 저장 | Supabase 클라우드 저장 |
| 확장 불가 구조 | Vanilla JS 단일 App 객체 | Next.js + 컴포넌트 구조 |
| 60일 이평선 누락 | 실수 | 반드시 5/20/60/120 모두 구현 |
| 부가 기능 우선 | 코다리부장·날씨위젯 먼저 | 핵심 OCR + 손익 계산 먼저 |
| API 키 노출 | .env.txt 깃허브 커밋 | 반드시 .gitignore 확인, Vercel 환경변수만 사용 |

---

## 11. 프로젝트 구조

```
store-doctor/                    # github.com/kimtyy/store-doctor
├── CLAUDE.md                    # 이 파일
├── .env.local                   # 절대 깃허브에 올리지 말 것
├── .gitignore                   # .env* 반드시 포함
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # 메인 진단 화면
│   │   ├── sales/
│   │   │   ├── page.tsx         # 매출 입력
│   │   │   └── upload/page.tsx  # 사진 업로드
│   │   ├── purchases/
│   │   │   ├── page.tsx         # 매입 내역
│   │   │   ├── scan/page.tsx    # 영수증 스캔
│   │   │   ├── manual/page.tsx  # 수동 입력
│   │   │   └── fixed/page.tsx   # 고정비 관리
│   │   ├── analytics/
│   │   │   ├── page.tsx         # 이평선 차트
│   │   │   └── menu/page.tsx    # 메뉴별 마진
│   │   └── settings/page.tsx
│   └── api/
│       ├── parse/
│       │   ├── pos-receipt/route.ts    # POS 영수증 파싱
│       │   ├── menu-sales/route.ts     # 메뉴별 매출 파싱
│       │   └── purchase/route.ts       # 매입 영수증 파싱
│       ├── sales/route.ts
│       ├── purchases/route.ts
│       └── analytics/route.ts
├── components/
│   ├── diagnosis/
│   │   ├── DiagnosisCard.tsx    # 메인 진단 카드
│   │   └── AlertBadge.tsx       # 경고 배지
│   ├── charts/
│   │   ├── MAChart.tsx          # 이동평균선 차트
│   │   └── CostRatioChart.tsx   # 원가율 차트
│   ├── upload/
│   │   ├── PhotoUpload.tsx      # 사진 업로드
│   │   └── VerifyModal.tsx      # 파싱 결과 확인
│   └── ui/                      # 공통 UI 컴포넌트
├── lib/
│   ├── supabase.ts
│   ├── claude.ts                # Claude API 호출
│   ├── parsers/
│   │   ├── posReceipt.ts        # POS 정산서 파서
│   │   ├── menuSales.ts         # 메뉴별 매출 파서
│   │   └── purchase.ts          # 매입 영수증 파서
│   └── analytics/
│       ├── movingAverage.ts     # 이평선 계산
│       ├── diagnosis.ts         # 진단 로직
│       └── costRatio.ts         # 원가율 분석
└── types/
    ├── sales.ts
    ├── purchase.ts
    └── analytics.ts
```

---

## 12. 환경 변수 (.env.local)

```
# Anthropic
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 기상청 API
KMA_API_KEY=

# 매장 기본 위치 (날씨 API용)
STORE_LATITUDE=
STORE_LONGITUDE=
```

**⚠️ .env.local은 절대 git에 커밋하지 말 것**
**.gitignore에 반드시 `.env*` 포함 확인**

---

## 13. 개발 원칙

1. **핵심 먼저**: OCR 파싱 → 손익 계산 → 이평선 → 진단. 이 순서로. 부가 기능은 나중에.
2. **실제 데이터로 테스트**: 개발 중 사용할 샘플 데이터는 실제 POS 영수증 기반으로.
3. **파싱 결과 항상 확인 UI 제공**: AI가 틀릴 수 있다. 사용자가 1초에 확인·수정 가능하게.
4. **한국어 우선**: 모든 UI 텍스트, 에러 메시지, 분류명은 한국어로.
5. **모바일 퍼스트**: 사용자는 마감 직후 스마트폰으로 접속. 모바일 UX가 1순위.
6. **속도**: 사진 업로드 → 파싱 완료까지 3초 이내 목표.
7. **에러 처리**: API 실패 시 사용자에게 명확한 안내 + 수동 입력 fallback 제공.
8. **타입 안전**: TypeScript strict mode 사용.

---

## 14. MVP 첫 번째 작업 순서

Claude Code는 다음 순서로 작업하세요:

```
Step 1: 프로젝트 초기 설정
  - Next.js 14 + TypeScript + Tailwind 설치
  - Supabase 연결 설정
  - .gitignore 설정 (.env* 포함 확인)
  - 기본 폴더 구조 생성

Step 2: Supabase 스키마 생성
  - stores, daily_sales, sales_menu_items, purchase_records, fixed_costs 테이블
  - RLS (Row Level Security) 설정

Step 3: Claude Vision 파싱 API
  - /api/parse/pos-receipt (포스마감정산서)
  - /api/parse/menu-sales (메뉴별매출내역)
  - /api/parse/purchase (매입 영수증)
  - 실제 영수증 샘플로 테스트

Step 4: 매출 입력 화면
  - 사진 업로드 UI
  - 파싱 결과 확인 모달
  - Supabase 저장

Step 5: 매입 입력 화면
  - 영수증 스캔
  - 수동 입력 (빠른 UI)
  - 고정비 등록

Step 6: 이평선 계산 로직
  - movingAverage.ts 구현
  - 골든크로스 감지
  - 원가율 이평선

Step 7: 메인 진단 화면
  - DiagnosisCard 컴포넌트
  - 이평선 차트 (Recharts)
  - 날씨 API 연동 (기상청)

Step 8: 배포
  - Vercel 배포
  - 환경변수 설정
```

---

## 15. 참고 데이터 (실제 POS 샘플)

### 포스마감정산서 추출 데이터 예시
```json
{
  "storeName": "설맥(현리점)",
  "date": "2026-05-11",
  "totalRevenue": 224500,
  "discount": 0,
  "serviceCharge": 0,
  "tax": 20407,
  "netRevenue": 204093,
  "cashCount": 5,
  "cashAmount": 131800,
  "cardCount": 1,
  "cardAmount": 92700,
  "tablesUsed": 6,
  "guestCount": 6,
  "avgSpend": 37416,
  "openTime": "18:17",
  "closeTime": "00:03",
  "firstOrderTime": "21:09"
}
```

### 메뉴별매출내역 추출 데이터 예시
```json
{
  "date": "2026-05-11",
  "menuItems": [
    {"name": "설맥치킨", "quantity": 1, "amount": 18900},
    {"name": "손살양념치킨", "quantity": 1, "amount": 10900},
    {"name": "고르곤졸라피자", "quantity": 1, "amount": 13900},
    {"name": "골뱅이무침", "quantity": 2, "amount": 37800},
    {"name": "과일빙수", "quantity": 2, "amount": 29800},
    {"name": "오레오빙수", "quantity": 1, "amount": 14900},
    {"name": "케이준 샐러드", "quantity": 2, "amount": 21800},
    {"name": "계란찜", "quantity": 1, "amount": 5000},
    {"name": "물만두", "quantity": 1, "amount": 5000},
    {"name": "상상페일(에일)", "quantity": 3, "amount": 21000},
    {"name": "생맥주(카스)", "quantity": 2, "amount": 9000},
    {"name": "생맥주(테라)", "quantity": 7, "amount": 31500},
    {"name": "진로", "quantity": 1, "amount": 5000}
  ],
  "tax": 20401,
  "total": 224500
}
```

---

*최종 업데이트: 2026-05-13*
*작성: 매장닥터 기획 세션 (Claude + 사장님 공동 작성)*
---

## 16. 구현 완료 현황 (2026-06-21 기준)

> Phase 1 MVP를 넘어 다음 기능까지 구현 완료 상태

### OCR & 데이터 입력
- [x] Claude Vision OCR — POS 마감정산서 / 메뉴별매출내역 파싱
- [x] 일별 매출 및 sales_menu_items Supabase 저장
- [x] 매입 기록 파싱, 저장, 수동 입력 (자동완성)
- [x] 3단계 OCR 자동보정 파이프라인 (화이트리스트 → 드롭다운 → 수동 자동완성)

### 마스터 관리
- [x] 메뉴 마스터 (별칭/OCR 보정, 카테고리 일괄 지정)
- [x] 매입처 마스터 관리
- [x] 세트메뉴 카테고리 (보라색), 보증금 반환 음수 입력

### 분석 & 차트
- [x] 매입처별 컬러코딩 원가율
- [x] 이동평균선 차트 (매출/매입/손익/원가율, 5/20/60/120일, 라인별 토글)
- [x] 대시보드 — 같은 요일 비교, 날씨 데이터 연동

### 월별 보고서
- [x] 매출/매입 요약, 손익계산서
- [x] 매출 TOP10 메뉴 / 매입처 TOP5
- [x] 요일별 평균 매출
- [x] 손익분기점(BEP) 분석
- [x] 기간 비교 분석 (전월 대비, 전년 동월 대비)
- [x] 날씨 상관관계
- [x] 다음달 매출 예측
- [x] AI 한줄 진단 (Claude API)
- [x] PDF 저장 / 엑셀 다운로드

### AI
- [x] AI 상담 채팅 탭 (실시간 매장 데이터 컨텍스트 포함)

---

## 17. 다음 마일스톤 — 베타테스트 오픈 준비

현재 설맥 현리점 단독 사용 중 → 지역 상인회 회원 대상 베타 확장 예정

### ① 로그인/회원가입 (필수)
- 이메일 + 비밀번호
- Supabase Auth 연동 (기존 설정 활용)
- RLS 정책으로 본인 데이터만 접근

### ② 매장 정보 등록 (필수)
- 매장명, 업종 (F&B/카페/분식/기타), 지역
- stores 테이블에 user_id 연결
- 편의점 제외 (본사 관리 구조)

### ③ 베타테스터 초대 코드 (선택)
- 초대 코드 없으면 가입 불가
- 관리자 페이지에서 코드 생성/관리

### ④ 온보딩 화면 (중요)
- 가입 완료 후 자동 진입
- 매장 설정 안내 → 데이터 입력 방법 가이드
- "처음 30일 무료" 안내
- 완료 후 대시보드 이동

### 우선순위

---

## 18. 향후 로드맵

- **이벤트 장부 모듈:** 외부 행사(군부대 체육대회 등) 별도 수익성 추적
- **OCR 정확도 개선:** 반복 품목 인식 실패 이슈 해결
- **소상공인 AI 운영 자동화 확장:** SNS 자동 응대, 카카오채널 연동 (매장닥터 v2 방향)
- **B2B 확장:** 프랜차이즈 본사 대상 장기 방향

---

*업데이트: 2026-06-21*
*맥락: Claude Code 웹 세션에서 신규 아이디어 탐색 후 매장닥터 집중 결정*
