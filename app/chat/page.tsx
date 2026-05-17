'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_QUESTIONS = [
  '이번달 매출 어때요?',
  '요일별로 언제 제일 잘 되나요?',
  '이번달 잘 팔리는 메뉴 알려줘요',
  '지난달이랑 이번달 비교해줘요',
  '매출 추세가 좋은가요?',
];

// ── Markdown renderer ──────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
      : part
  );
}

function parseTableLines(lines: string[]): React.ReactNode {
  const rows = lines.map(l =>
    l.trim().split('|').slice(1, -1).map(c => c.trim())
  );
  const isSep = (row: string[]) => row.every(c => /^[-: ]+$/.test(c));

  const headerRow = rows[0] ?? [];
  const bodyRows = rows.slice(1).filter(r => !isSep(r));

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-700/60">
            {headerRow.map((cell, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-slate-200 whitespace-nowrap">
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-slate-700/20'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-slate-300 whitespace-nowrap">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table block
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<div key={`t${i}`}>{parseTableLines(tableLines)}</div>);
      continue;
    }

    // ## heading
    if (/^#{1,3} /.test(line)) {
      const level = (line.match(/^#+/) ?? [''])[0].length;
      const content = line.replace(/^#+\s*/, '');
      const cls = level === 1
        ? 'font-bold text-white text-base mt-3 mb-1'
        : level === 2
          ? 'font-bold text-white mt-2.5 mb-1'
          : 'font-semibold text-slate-200 mt-2 mb-0.5';
      elements.push(<p key={i} className={cls}>{renderInline(content)}</p>);
      i++;
      continue;
    }

    // Bullet list item
    if (/^[-*] /.test(line)) {
      elements.push(
        <div key={i} className="flex gap-1.5 leading-relaxed">
          <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-500 flex-shrink-0" />
          <span>{renderInline(line.replace(/^[-*] /, ''))}</span>
        </div>
      );
      i++;
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const num = (line.match(/^\d+/) ?? [''])[0];
      elements.push(
        <div key={i} className="flex gap-2 leading-relaxed">
          <span className="text-slate-500 flex-shrink-0 w-4 text-right">{num}.</span>
          <span>{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </div>
      );
      i++;
      continue;
    }

    // Empty line → small gap
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    // Regular line
    elements.push(
      <p key={i} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

// ── Components ─────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────

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
                  안녕하세요, 사장님! 설맥(현리점) AI 경영 컨설턴트입니다.{'\n\n'}매출, 매입, 메뉴 분석 등 궁금한 점을 물어보세요. 이번달·지난달 데이터를 바탕으로 답변드릴게요.
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
              className={`rounded-2xl text-sm ${
                msg.role === 'user'
                  ? 'max-w-[75%] px-4 py-3 bg-sky-600 text-white rounded-br-sm'
                  : 'w-full max-w-[88%] px-4 py-3 bg-slate-800 text-slate-200 rounded-bl-sm'
              }`}
            >
              {msg.role === 'user'
                ? <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                : renderMarkdown(msg.content)
              }
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
