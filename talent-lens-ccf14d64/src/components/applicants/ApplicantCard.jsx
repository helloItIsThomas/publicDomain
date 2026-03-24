import React, { useState } from 'react';
import { ExternalLink, Loader2, Star, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import AnalysisProgress from './AnalysisProgress';

export default function ApplicantCard({ applicant, criteria, onClick }) {
  const statusConfig = {
    pending: { icon: Clock, color: 'bg-slate-100 text-slate-600', label: 'Pending' },
    analyzing: { icon: Loader2, color: 'bg-amber-100 text-amber-700', label: 'Analyzing' },
    stage1_complete: { icon: Loader2, color: 'bg-amber-100 text-amber-700', label: 'Analyzing' },
    stage2_complete: { icon: Loader2, color: 'bg-amber-100 text-amber-700', label: 'Scoring' },
    scored: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', label: 'Scored' },
    shortlisted: { icon: Star, color: 'bg-blue-100 text-blue-700', label: 'Shortlisted' },
    rejected: { icon: AlertCircle, color: 'bg-red-100 text-red-700', label: 'Rejected' },
  };

  const status = statusConfig[applicant.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const [showTooltip, setShowTooltip] = React.useState(false);
  const analysisStartRef = React.useRef(null);
  const isAnalyzing = ['analyzing', 'stage1_complete', 'stage2_complete'].includes(applicant.status);
  if (isAnalyzing && !analysisStartRef.current) {
    analysisStartRef.current = Date.now();
  }
  if (!isAnalyzing) {
    analysisStartRef.current = null;
  }

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Hover Tooltip */}
      {showTooltip && applicant.portfolio_summary && (applicant.status === 'scored' || applicant.status === 'shortlisted') && (
        <div className="absolute bottom-full left-0 right-0 mb-2 z-50 pointer-events-none">
          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl text-sm">
            <p className="font-medium mb-2">Portfolio Summary</p>
            <p className="text-slate-300 leading-relaxed line-clamp-4">{applicant.portfolio_summary}</p>
          </div>
        </div>
      )}

      <Card 
        className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer group bg-white"
        onClick={onClick}
      >
        <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-medium text-slate-900 group-hover:text-slate-700 mb-1">
              {applicant.name}
            </h3>
            <p className="text-sm text-slate-500 truncate">{applicant.email}</p>
          </div>
          <Badge className={`${status.color} border-0 font-normal flex items-center gap-1`}>
            <StatusIcon className={`w-3 h-3 ${applicant.status === 'analyzing' ? 'animate-spin' : ''}`} />
            {status.label}
          </Badge>
        </div>

        {applicant.status === 'scored' || applicant.status === 'shortlisted' || applicant.status === 'rejected' ? (
          <>
            <div className="flex items-end gap-3 mb-4">
              <div className={`text-4xl font-light ${getScoreColor(applicant.overall_score)}`}>
                {applicant.overall_score}
              </div>
              <div className="text-slate-400 mb-1">/ 100</div>
            </div>

            {/* Job Fit Score */}
            {applicant.job_fit_score !== undefined && (
              <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-700">Job Match</span>
                  <span className={`text-sm font-bold ${getScoreColor(applicant.job_fit_score)}`}>
                    {applicant.job_fit_score}%
                  </span>
                </div>
                <Progress value={applicant.job_fit_score} className="h-1.5" />
                {applicant.recommendation_summary && (
                  <p className="text-xs text-slate-600 mt-2">{applicant.recommendation_summary}</p>
                )}
              </div>
            )}

            {/* Match Highlights */}
            {applicant.match_highlights?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-emerald-600 font-medium mb-1.5">✓ Key Matches</p>
                <div className="space-y-1">
                  {applicant.match_highlights.slice(0, 2).map((highlight, i) => (
                    <p key={i} className="text-xs text-slate-600 leading-relaxed">{highlight}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Red Flags */}
            {applicant.red_flags?.length > 0 && (
              <div className="mb-4 p-2 bg-red-50 rounded-lg">
                <p className="text-xs text-red-700 font-medium mb-1">⚠ Red Flags</p>
                {applicant.red_flags.slice(0, 2).map((flag, i) => (
                  <p key={i} className="text-xs text-red-600">{flag}</p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {applicant.criteria_scores?.slice(0, 3).map((cs, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-24 truncate">{cs.criterion_name}</span>
                  <Progress value={cs.score} className="h-1.5 flex-1" />
                  <span className="text-xs font-medium text-slate-600 w-8">{cs.score}</span>
                </div>
              ))}
            </div>
          </>
        ) : isAnalyzing ? (
          <AnalysisProgress startedAt={analysisStartRef.current} analysisStage={applicant.analysis_stage} />
        ) : (
          <div className="py-8 text-center">
            <Clock className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Pending analysis</p>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
          <a
            href={applicant.portfolio_url && !applicant.portfolio_url.startsWith('http') ? 'https://' + applicant.portfolio_url : applicant.portfolio_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            View Portfolio
          </a>
          {applicant.linkedin_url && (
            <a
              href={applicant.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              LinkedIn
            </a>
          )}
        </div>
        </CardContent>
      </Card>
    </div>
  );
}