// ============================================================
// Site Content Configuration — 텍스트/데이터 관리
// ============================================================
// 사이트에 표시되는 모든 텍스트를 여기서 수정할 수 있습니다.
// ============================================================

export const SITE_CONFIG = {
  // 브랜드
  brandName: '매장닥터',
  copyright: '© 2026 매장닥터. All rights reserved.',

  // 히어로 섹션
  hero: {
    titleLeft: ['내 가게', '잘 가고 있나?'],
    titleRight: ['매장', '닥터'],
    watermark: 'MAEJANG DOCTOR',
    description:
      '카메라 촬영 또는 간편 수동입력으로 매입·매출을 기록하고, 실질 손익분석으로 매장 운영의 정확한 지표를 제공합니다.',
  },

  // 시네마틱 텍스트 섹션 (차별화 문구)
  cinematic: {
    text: '현금 영수증, 종이 영수증, 고정 지출까지 모두 기록하여 매장의 진짜 순이익을 한눈에 확인하세요.',
  },

  // 성능 지표 섹션 (지표 정보 교체 및 복구)
  metrics: {
    subtitle: '매장닥터 핵심 지표',
    items: [
      { value: '영수증 ➔ 장부', label: 'AI 자동 파싱' },
      { value: '매입+매출 통합분석', label: '진짜 순이익 확인' },
      { value: '월 9,900원부터', label: '월별 보고서 자동완성' },
    ],
  },

  // 기술 섹션 (기능 소개)
  technology: {
    title: ['스마트한', 'AI 매장 관리'],
    description:
      '카메라 촬영 또는 간편 수동입력으로 매입·매출을 기록하고, 실질 손익분석으로 매장 운영의 정확한 지표를 제공합니다.',
    features: [
      {
        title: '📸 사진 한 장으로 입력',
        desc: '영수증·POS 마감정산서 촬영하면 AI가 자동 파싱',
      },
      {
        title: '✏️ 간편 수동입력',
        desc: '영수증 없는 매입, 고정비도 빠르게 직접 입력',
      },
      {
        title: '📊 실시간 손익 확인',
        desc: '매출·매입·원가율·영업이익 한눈에',
      },
      {
        title: '📋 월별 보고서 자동 완성',
        desc: 'AI 진단·다음달 예측·PDF 저장까지',
      },
    ],
  },

  // 아키텍처 섹션
  architecture: {
    subtitle: '스마트 워크플로우',
    heading: '3단계, 스마트한 AI 매장 관리',
    description:
      '스마트폰으로 사진을 촬영하거나 직접 입력하면 AI가 즉시 분석하고, 최종 완성된 결산 장부와 보고서 인터페이스를 실시간으로 받아보실 수 있습니다.',
    layers: [
      { num: 1, name: '촬영 또는 수동입력 (Capture)' },
      { num: 2, name: 'AI 분석 (Process)' },
      { num: 3, name: '장부 완성 (Interface)' },
    ],
  },

  // 푸터
  footer: {
    tagline:
      '소상공인 사장님들의 경영 파트너. 이제 진짜 순이익을 확인하고 더 스마트하게 매장을 운영하세요.',
  },

  // 네비게이션
  nav: {
    links: [
      { label: '소개', scrollMultiplier: 1 },
      { label: '주요 지표', scrollMultiplier: 2 },
    ],
    downloadLabel: '앱 다운로드',
  },
};
