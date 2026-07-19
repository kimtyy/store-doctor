import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 py-16 px-6 sm:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="border-b border-slate-800 pb-6">
          <Link href="/" className="text-sm text-sky-400 hover:underline flex items-center gap-1 mb-4">
            <span>←</span> 홈으로 돌아가기
          </Link>
          <h1 className="text-3xl font-bold text-slate-100">매장닥터 개인정보처리방침</h1>
          <p className="text-slate-500 text-xs mt-2">시행일: 2026년 8월 1일</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed">
          <p>
            허브스마트(이하 &quot;회사&quot;)는 「개인정보 보호법」 등 관련 법령을 준수하며, 매장닥터 서비스(store-doctor.com, 이하 &quot;서비스&quot;) 이용자의 개인정보를 안전하게 보호하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제1조 (수집하는 개인정보의 항목 및 수집 방법)</h2>
            <p>회사는 다음의 개인정보를 수집합니다.</p>
            
            <div className="space-y-3 mt-2">
              <div>
                <p className="font-semibold text-slate-200">1. 회원 가입 시 (Google 소셜 로그인)</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>이메일 주소, 이름, 프로필 사진(선택적으로 제공되는 경우)</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-slate-200">2. 서비스 이용 과정에서 이용자가 직접 입력하는 정보</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>매장 정보: 매장명, 업종, 지역</li>
                  <li>매장 운영 데이터: 매출 내역, 매입 내역, 메뉴 정보, 거래처 정보, 고정비 정보</li>
                  <li>영수증 이미지: 이용자가 촬영·업로드하는 POS 정산서 및 매입 영수증 사진</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-slate-200">3. 결제 시</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>결제 승인 정보(주문번호, 결제수단 종류, 결제 금액, 결제 일시)</li>
                  <li className="text-slate-400 text-xs">※ 카드번호 등 결제수단 상세 정보는 전자결제대행사(토스페이먼츠)가 직접 처리하며, 회사는 저장하지 않습니다.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-slate-200">4. 서비스 이용 과정에서 자동으로 생성·수집되는 정보</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>접속 기록, 서비스 이용 기록, 기기 정보(브라우저 종류 등), 쿠키</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제2조 (개인정보의 수집 및 이용 목적)</h2>
            <p>회사는 수집한 개인정보를 다음의 목적으로만 이용합니다.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회원 식별, 가입 및 탈퇴 처리, 계정 관리</li>
              <li>매출·매입 데이터 기록, 분석, 경영 진단 등 서비스 핵심 기능 제공</li>
              <li>영수증 이미지의 AI 문자인식(OCR) 처리를 통한 데이터 자동 입력</li>
              <li>구독 결제 처리, 환불, 구독 기간 관리</li>
              <li>고객 문의 응대 및 공지사항 전달</li>
              <li>서비스 개선 및 신규 기능 개발(개인을 식별할 수 없는 통계 형태로 활용)</li>
              <li>관련 법령에 따른 의무 이행</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제3조 (개인정보의 보유 및 이용 기간)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사는 회원 탈퇴 시 수집된 개인정보를 지체 없이 파기합니다. 다만, 다음의 경우에는 명시한 기간 동안 보관합니다.</li>
              <li>관련 법령에 따른 보존:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)</li>
                  <li>대금결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래법)</li>
                  <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)</li>
                  <li>서비스 접속에 관한 로그기록: 3개월 (통신비밀보호법)</li>
                </ul>
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제4조 (개인정보 처리의 위탁 및 국외 이전)</h2>
            <p>
              회사는 서비스 제공을 위해 다음과 같이 개인정보 처리를 위탁하고 있으며, 일부 수탁자는 국외에 소재합니다. 회사는 위탁계약 시 개인정보가 안전하게 관리될 수 있도록 필요한 사항을 규정하고 있습니다.
            </p>
            
            <div className="overflow-x-auto border border-slate-800 rounded-xl mt-3">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-200">
                    <th className="p-3 font-semibold">수탁자</th>
                    <th className="p-3 font-semibold">위탁 업무</th>
                    <th className="p-3 font-semibold">이전 국가</th>
                    <th className="p-3 font-semibold">보유 기간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  <tr>
                    <td className="p-3 font-medium text-slate-200">Supabase Inc.</td>
                    <td className="p-3">데이터베이스 및 인증 인프라 운영(회원 정보, 매장 데이터 저장)</td>
                    <td className="p-3">미국 등 클라우드 리전 소재지</td>
                    <td className="p-3">회원 탈퇴 또는 위탁계약 종료 시까지</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-slate-200">Vercel Inc.</td>
                    <td className="p-3">웹 서비스 호스팅</td>
                    <td className="p-3">미국</td>
                    <td className="p-3">서비스 제공 기간</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-slate-200">Anthropic PBC.</td>
                    <td className="p-3">영수증 이미지의 AI 문자인식(OCR) 및 AI 분석 처리</td>
                    <td className="p-3">미국</td>
                    <td className="p-3">처리 완료 후 지체 없이(학습에 사용하지 않는 API 정책 적용)</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-slate-200">토스페이먼츠(주)</td>
                    <td className="p-3">전자결제 처리</td>
                    <td className="p-3">대한민국</td>
                    <td className="p-3">관련 법령에 따른 기간</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-slate-200">Google LLC</td>
                    <td className="p-3">소셜 로그인 인증</td>
                    <td className="p-3">미국</td>
                    <td className="p-3">회원 탈퇴 시까지</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              ※ 국외 이전을 원하지 않는 경우 회원 가입을 하지 않을 수 있으나, 이 경우 서비스 이용이 불가능합니다. 국외 이전 관련 문의는 아래 개인정보 보호책임자에게 연락해 주시기 바랍니다.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제5조 (개인정보의 제3자 제공)</h2>
            <p>회사는 이용자의 개인정보를 제1조와 제2조에서 고지한 범위를 넘어 제3자에게 제공하지 않습니다. 다만, 다음의 경우는 예외로 합니다.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>이용자가 사전에 동의한 경우</li>
              <li>법령의 규정에 의하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제6조 (개인정보의 파기 절차 및 방법)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사는 개인정보 보유기간의 경과, 처리 목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.</li>
              <li>전자적 파일 형태의 정보는 복구할 수 없는 방법으로 영구 삭제하며, 종이 문서는 분쇄하거나 소각하여 파기합니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제7조 (이용자의 권리와 행사 방법)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.</li>
              <li>권리 행사는 서비스 내 설정 메뉴 또는 개인정보 보호책임자에게 서면, 이메일 등을 통해 할 수 있으며, 회사는 지체 없이 조치합니다.</li>
              <li>이용자가 개인정보의 오류에 대한 정정을 요청한 경우, 정정을 완료하기 전까지 해당 개인정보를 이용하거나 제공하지 않습니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제8조 (개인정보의 안전성 확보 조치)</h2>
            <p>회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>개인정보에 대한 접근 권한의 제한(데이터베이스 행 수준 보안 적용, 본인 데이터만 접근 가능)</li>
              <li>개인정보의 암호화(전송 구간 암호화 HTTPS 적용)</li>
              <li>접속기록의 보관 및 위·변조 방지</li>
              <li>보안 프로그램의 설치 및 주기적 점검</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제9조 (쿠키의 사용)</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>회사는 로그인 상태 유지 등 서비스 제공을 위해 쿠키를 사용합니다.</li>
              <li>이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 로그인이 필요한 서비스 이용에 제한이 있을 수 있습니다.</li>
            </ol>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제10조 (개인정보 보호책임자)</h2>
            <p>개인정보 처리에 관한 문의, 불만처리, 피해구제 등은 아래 개인정보 보호책임자에게 연락해 주시기 바랍니다.</p>
            
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>개인정보 보호책임자</strong>: 김태영 (대표)</li>
              <li>이메일: <a href="mailto:kimtyy@naver.com" className="text-sky-400 hover:underline">kimtyy@naver.com</a></li>
              <li>전화: 031-5175-8887</li>
            </ul>

            <div className="text-xs text-slate-400 mt-4 space-y-1">
              <p>기타 개인정보 침해에 대한 신고나 상담이 필요한 경우 아래 기관에 문의하실 수 있습니다.</p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li>개인정보침해신고센터 (privacy.kisa.or.kr / 국번없이 118)</li>
                <li>개인정보분쟁조정위원회 (kopico.go.kr / 1833-6972)</li>
                <li>대검찰청 사이버수사과 (spo.go.kr / 국번없이 1301)</li>
                <li>경찰청 사이버수사국 (ecrm.police.go.kr / 국번없이 182)</li>
              </ul>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">제11조 (개인정보처리방침의 변경)</h2>
            <p>이 개인정보처리방침의 내용이 추가, 삭제 또는 수정되는 경우 개정 최소 7일 전부터 서비스 내 공지사항을 통해 고지합니다. 이용자에게 불리한 변경의 경우 30일 전에 고지합니다.</p>
          </section>

          <section className="border-t border-slate-800 pt-6 space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">부칙</h2>
            <p>이 방침은 2026년 8월 1일부터 시행합니다.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
