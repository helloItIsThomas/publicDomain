import React, { useState, useEffect } from 'react';
import { CheckCircle, Circle, Loader2 } from 'lucide-react';

// Map analysis_stage string → step index (0-based, out of STEPS)
const STAGES = [
  { key: 'Starting analysis',                          stepIndex: 0 },
  { key: 'Crawling portfolio',                         stepIndex: 0 },
  { key: 'Uploading',                                  stepIndex: 0 },
  { key: 'Submitting',                                 stepIndex: 1 },
  { key: 'video',                                      stepIndex: 1 },
  { key: 'Videos submitted',                           stepIndex: 1 },
  { key: 'Portfolio crawled. Starting content',        stepIndex: 2 },
  { key: 'Analyzing portfolio content',                stepIndex: 2 },
  { key: 'Analyzing project visuals',                  stepIndex: 3 },
  { key: 'Visual analysis done',                       stepIndex: 3 },
  { key: 'Scoring portfolio',                          stepIndex: 4 },
];

const STEPS = [
  { id: 'crawl',    label: 'Crawling portfolio pages & links' },
  { id: 'video',    label: 'Analyzing videos (Vimeo, YouTube & hosted)' },
  { id: 'content',  label: 'Extracting content & data' },
  { id: 'vision',   label: 'Visual analysis of project pages' },
  { id: 'score',    label: 'Scoring against job criteria' },
];

export default function AnalysisProgress({ startedAt, analysisStage }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = startedAt || Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // Determine active step from the analysisStage string
  const matched = STAGES.find(s => analysisStage?.includes(s.key));
  const activeIndex = matched?.stepIndex ?? 0;
  const displayIndex = activeIndex;
  // If no videos submitted, skip step 1 visually (jump straight to content)
  const noVideo = analysisStage?.includes('Portfolio crawled') || analysisStage?.includes('Starting content');
  const effectiveIndex = noVideo && activeIndex <= 1 ? 2 : activeIndex;
  const pct = Math.min(99, Math.round(((effectiveIndex + 0.5) / STEPS.length) * 100));

  return (
    <div className="py-4 px-1">
      {/* Circular progress ring */}
      <div className="flex flex-col items-center mb-4">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke="#f1f5f9" strokeWidth="6" />
            <circle
              cx="32" cy="32" r="26"
              fill="none"
              stroke="#f97316"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 26}`}
              strokeDashoffset={`${2 * Math.PI * 26 * (1 - pct / 100)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold text-slate-700">{pct}%</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">{elapsed}s elapsed</p>
      </div>

      {/* Stage label */}
      {analysisStage && (
        <p className="text-xs text-center text-orange-600 font-medium mb-3">{analysisStage}</p>
      )}

      {/* Step list */}
      <div className="space-y-2">
        {STEPS.map((step, i) => {
          const done = i < displayIndex;
          const active = i === displayIndex;
          return (
            <div key={step.id} className={`flex items-center gap-2 transition-opacity ${i > activeIndex ? 'opacity-30' : 'opacity-100'}`}>
              {done ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : active ? (
                <Loader2 className="w-3.5 h-3.5 text-orange-500 animate-spin shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              )}
              <span className={`text-xs ${active ? 'text-slate-800 font-medium' : done ? 'text-slate-400 line-through' : 'text-slate-400'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}