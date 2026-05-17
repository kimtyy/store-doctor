'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_QUESTIONS = [
  '이번달 매출 어때요?',
  '요일별로 언제 제일 잘 되나요?',
  '잘 팔리는 메뉴 알려줘요',
  '매출 추세가 좋은가요?',
  '원가 관리 잘 되고 있나요?',
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages([...newMessages, { role: 'assistant', content: `오류가 발생했습니다: ${data.error}` }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: data.content }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const showQuickQuestions = messages.length === 0 && !loading;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 pb-40">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3">
        <h1 className="text-base font-semibold text-white">🤖 AI 상담</h1>
        <p className="text-xs text-slate-400 mt-0.5">매장 데이터를 분석해 드립니다</p>
      </div>

      {/* Messages */}
      <div className="flex-1 px-4 py-4 space-y-3">
        {/* Welcome */}
        {showQuickQuestions && (
          <div className="mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-sm flex-shrink-0">AI</div>
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 max-w-xs">
                <p className="text-sm text-slate-200 leading-relaxed">
                  안녕하세요, 사장님! 설맥(현리점) AI 경영 컨설턴트입니다.{'\n\n'}매출, 매입, 메뉴 분석 등 궁금한 점을 물어보세요. 최근 30일 데이터를 바탕으로 답변드릴게요.
                </p>
              </div>
            </div>
            <div className="ml-11">
              <p className="text-xs text-slate-500 mb-2">빠른 질문</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-300 hover:border-sky-500 hover:text-sky-400 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-xs flex-shrink-0 mb-0.5">AI</div>
            )}
            <div
              className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === 'user'
                  ? 'bg-sky-600 text-white rounded-br-sm'
                  : 'bg-slate-800 text-slate-200 rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-xs flex-shrink-0 mb-0.5">AI</div>
            <div className="bg-slate-800 rounded-2xl rounded-bl-sm">
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="fixed bottom-[72px] left-0 right-0 bg-slate-900 border-t border-slate-800 px-3 py-2">
        <div className="mx-auto max-w-2xl flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder="질문을 입력하세요..."
            disabled={loading}
            className="flex-1 bg-slate-800 text-white placeholder-slate-500 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 min-h-[38px] max-h-[120px]"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-sky-500 transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
