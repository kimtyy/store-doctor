import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 py-16 px-6 sm:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="border-b border-slate-800 pb-6">
          <Link href="/" className="text-sm text-sky-400 hover:underline flex items-center gap-1 mb-4">
            <span>←</span> 홈으로 돌아가기
          </Link>
          <h1 className="text-3xl font-bold text-slate-100">매장닥터 이용약관</h1>
          <p className="text-slate-500 text-xs mt-2">시행일: 2026년 8월 1일</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제1조 (목적)</h2>
            <p>
              이 약관은 허브스마트(이하 &quot;회사&quot;)가 제공하는 매장 경영 분석 서비스 &quot;매장닥터&quot;(이하 &quot;서비스&quot;)의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제2조 (정의)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>&quot;서비스&quot;란 회원이 입력하거나 촬영하여 업로드한 매출·매입 정보를 기반으로 손익 분석, 추세 분석, 경영 진단 등의 정보를 제공하는 매장닥터 웹 서비스(store-doctor.com) 일체를 말합니다.</li>
              <li>&quot;회원&quot;이란 이 약관에 동의하고 회사와 서비스 이용계약을 체결한 자를 말합니다.</li>
              <li>&quot;구독&quot;이란 회원이 이용요금을 결제하고 일정 기간 동안 서비스를 이용할 수 있는 권리를 말합니다.</li>
              <li>&quot;매장 데이터&quot;란 회원이 서비스에 입력·업로드한 매출, 매입, 메뉴, 거래처 등 매장 운영과 관련된 일체의 정보를 말합니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제3조 (약관의 게시와 개정)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사는 이 약관의 내용을 회원이 쉽게 알 수 있도록 서비스 초기 화면 하단에 게시합니다.</li>
              <li>회사는 「약관의 규제에 관한 법률」, 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관련 법령을 위배하지 않는 범위에서 이 약관을 개정할 수 있습니다.</li>
              <li>회사가 약관을 개정할 경우에는 적용일자 및 개정사유를 명시하여 적용일자 7일 전부터 서비스 내에 공지합니다. 다만, 회원에게 불리한 변경의 경우에는 30일 전부터 공지하며, 이메일 등으로 개별 통지합니다.</li>
              <li>회원이 개정약관의 적용일까지 거부 의사를 표시하지 않으면 개정약관에 동의한 것으로 봅니다. 회원은 개정약관에 동의하지 않는 경우 이용계약을 해지할 수 있습니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제4조 (이용계약의 체결)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>이용계약은 서비스를 이용하고자 하는 자가 이 약관에 동의하고 회사가 정한 절차에 따라 가입을 신청하며, 회사가 이를 승낙함으로써 체결됩니다.</li>
              <li>회원 가입은 Google 계정 등 회사가 지원하는 소셜 로그인 방식으로 이루어집니다.</li>
              <li>회사는 다음 각 호에 해당하는 신청에 대하여 승낙을 거절하거나 사후에 이용계약을 해지할 수 있습니다.
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>타인의 명의 또는 정보를 도용한 경우</li>
                  <li>허위 정보를 기재한 경우</li>
                  <li>사회의 안녕질서 또는 미풍양속을 저해할 목적으로 신청한 경우</li>
                  <li>기타 회사가 정한 이용신청 요건이 충족되지 않은 경우</li>
                </ul>
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제5조 (서비스의 내용)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사가 제공하는 서비스의 내용은 다음과 같습니다.
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>영수증 촬영 및 인공지능(AI) 기반 문자인식(OCR)을 통한 매출·매입 데이터 기록</li>
                  <li>매출·매입·손익 분석, 이동평균선 등 추세 분석</li>
                  <li>월간 경영 보고서, 손익분기점(BEP) 분석, 매출 예측</li>
                  <li>AI 기반 경영 상담 및 진단</li>
                  <li>기타 회사가 추가로 개발하거나 제공하는 서비스</li>
                </ul>
              </li>
              <li>회사는 서비스의 품질 향상을 위하여 서비스의 내용을 변경할 수 있으며, 중요한 변경이 있는 경우 사전에 공지합니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제6조 (서비스 정보의 성격 및 한계)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>서비스가 제공하는 분석 결과, 진단, 예측 등 일체의 정보는 회원이 입력한 데이터를 기반으로 산출된 <strong>경영 참고용 정보</strong>입니다.</li>
              <li>서비스가 제공하는 정보는 세무사, 회계사, 변호사 등 전문가의 자문을 대체하지 않으며, 세무 신고·회계 처리·법률 판단의 근거 자료로 사용될 수 없습니다.</li>
              <li>AI 문자인식(OCR) 및 AI 분석 결과에는 오류가 포함될 수 있으며, 회원은 입력된 데이터의 정확성을 스스로 확인할 책임이 있습니다.</li>
              <li>회원이 서비스의 정보를 근거로 한 경영상 의사결정의 결과에 대하여 회사는 책임을 지지 않습니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제7조 (유료서비스 및 결제)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>서비스는 유료 구독 방식으로 제공되며, 구독 요금과 기간, 플랜별 제공 기능은 결제 화면에 표시된 내용에 따릅니다.</li>
              <li>결제는 회사가 지정한 전자결제대행사(토스페이먼츠)를 통해 이루어집니다.</li>
              <li>구독 기간은 결제일로부터 결제 화면에 표시된 기간 동안 유효하며, 기간 만료 후 서비스를 계속 이용하려면 재결제가 필요합니다.</li>
              <li>회사는 프로모션, 보상 등의 목적으로 회원의 구독 기간을 무상으로 연장할 수 있습니다.</li>
              <li>요금이 변경되는 경우 회사는 변경 적용일 30일 전까지 공지하며, 이미 결제된 구독 기간에는 변경 전 요금이 적용됩니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제8조 (청약철회 및 환불)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회원은 결제일로부터 7일 이내에 서비스를 이용하지 않은 경우 청약을 철회하고 전액 환불받을 수 있습니다.</li>
              <li>결제 후 서비스를 이용한 경우에는 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관련 법령에 따라, 이용일수에 해당하는 금액을 공제한 잔액을 환불합니다.</li>
              <li>회사의 귀책사유(장기간 서비스 장애 등)로 회원이 서비스를 이용하지 못한 경우, 회사는 해당 기간만큼 구독 기간을 연장하거나 이용하지 못한 기간에 해당하는 금액을 환불합니다.</li>
              <li>환불은 회원이 결제한 수단과 동일한 방법으로 처리하는 것을 원칙으로 하며, 환불 요청은 서비스 내 문의 또는 고객센터(031-5175-8887, kimtyy@naver.com)를 통해 접수합니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제9조 (회원의 의무)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회원은 다음 행위를 하여서는 안 됩니다.
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>타인의 계정 또는 정보를 도용하는 행위</li>
                  <li>서비스의 운영을 방해하거나 서버에 부하를 유발하는 행위</li>
                  <li>서비스를 역설계, 복제, 크롤링하거나 무단으로 상업적으로 이용하는 행위</li>
                  <li>관련 법령 또는 이 약관을 위반하는 행위</li>
                </ul>
              </li>
              <li>회원은 자신의 계정 관리에 대한 책임이 있으며, 계정이 도용된 사실을 알게 된 경우 즉시 회사에 통지하여야 합니다.</li>
              <li>회원은 정확한 매장 데이터를 입력할 책임이 있으며, 타인의 영업 정보를 무단으로 입력해서는 안 됩니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제10조 (매장 데이터의 귀속 및 이용)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회원이 서비스에 입력한 매장 데이터의 권리는 회원에게 귀속됩니다.</li>
              <li>회사는 서비스 제공(저장, 분석, 화면 표시 등)에 필요한 범위에서만 매장 데이터를 처리하며, 회원의 동의 없이 제3자에게 제공하지 않습니다.</li>
              <li>회사는 특정 회원 또는 매장을 식별할 수 없도록 처리된 통계 정보를 서비스 개선 및 연구 목적으로 활용할 수 있습니다.</li>
              <li>회원이 탈퇴하는 경우 매장 데이터는 개인정보처리방침에 따라 파기됩니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제11조 (서비스의 중단)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사는 시스템 점검, 서버 교체, 통신 장애 등의 사유가 있는 경우 서비스 제공을 일시적으로 중단할 수 있으며, 예정된 중단은 사전에 공지합니다.</li>
              <li>천재지변, 정전, 클라우드 사업자의 장애 등 회사가 통제할 수 없는 사유로 서비스가 중단된 경우, 회사는 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제12조 (계약 해지 및 이용 제한)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회원은 언제든지 서비스 내 설정 또는 고객센터를 통해 이용계약 해지(탈퇴)를 신청할 수 있습니다.</li>
              <li>회사는 회원이 이 약관을 위반한 경우 사전 통지 후 서비스 이용을 제한하거나 계약을 해지할 수 있습니다. 다만, 긴급한 경우에는 사후에 통지할 수 있습니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제13조 (손해배상 및 면책)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사 또는 회원이 이 약관을 위반하여 상대방에게 손해를 입힌 경우 그 손해를 배상할 책임이 있습니다.</li>
              <li>회사는 무료로 제공하는 서비스의 이용과 관련하여 회원에게 발생한 손해에 대해서는 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.</li>
              <li>회사의 배상 책임은 회원이 최근 12개월간 회사에 지급한 이용요금 총액을 한도로 합니다. 다만, 회사의 고의 또는 중대한 과실이 있는 경우에는 그러하지 않습니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제14조 (분쟁의 해결)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>이 약관은 대한민국 법령에 따라 해석됩니다.</li>
              <li>서비스 이용과 관련하여 회사와 회원 간에 분쟁이 발생한 경우, 양 당사자는 원만한 해결을 위해 성실히 협의합니다.</li>
              <li>협의가 이루어지지 않는 경우, 관할 법원은 민사소송법에 따라 정합니다.</li>
            </ol>
          </section>

          <section className="border-t border-slate-800 pt-6 space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">부칙</h2>
            <p>이 약관은 2026년 8월 1일부터 시행합니다.</p>
          </section>

          <section className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 mt-8 space-y-2 text-slate-400">
            <p className="font-semibold text-slate-200">사업자 정보</p>
            <ul className="space-y-1 text-xs">
              <li>상호: 허브스마트 | 대표: 김태영</li>
              <li>사업자등록번호: 526-04-00927</li>
              <li>주소: 경기도 가평군 조종면 조종희망로 16-19, 1층</li>
              <li>문의: kimtyy@naver.com | 031-5175-8887</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
