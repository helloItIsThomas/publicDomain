import React from 'react';
import { X, ExternalLink, Star, AlertCircle, CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';


export default function ApplicantDetailModal({ applicant, criteria, onClose, onStatusChange }) {
  if (!applicant) return null;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600 bg-emerald-50';
    if (score >= 60) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getProgressColor = (score) => {
    if (score >= 80) return '[&>div]:bg-emerald-500';
    if (score >= 60) return '[&>div]:bg-amber-500';
    return '[&>div]:bg-red-500';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-xl font-medium text-slate-900">{applicant.name}</h2>
            <p className="text-slate-500">{applicant.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Score Overview */}
            {applicant.overall_score !== undefined && (
              <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-2xl">
                <div className={`w-24 h-24 rounded-2xl flex items-center justify-center ${getScoreColor(applicant.overall_score)}`}>
                  <span className="text-4xl font-light">{applicant.overall_score}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-500 mb-1">Overall Score</p>
                  <Progress 
                    value={applicant.overall_score} 
                    className={`h-3 ${getProgressColor(applicant.overall_score)}`}
                  />
                </div>
              </div>
            )}

            {/* Portfolio Link */}
            <div className="flex gap-3">
              <a
                href={applicant.portfolio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 p-4 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Portfolio
              </a>
              {applicant.linkedin_url && (
                <a
                  href={applicant.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  LinkedIn
                </a>
              )}
            </div>

            {/* Job Match Analysis */}
            {applicant.job_fit_score !== undefined && (
              <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-slate-900">Job Match Analysis</h3>
                  <span className={`text-2xl font-bold ${getScoreColor(applicant.job_fit_score)}`}>
                    {applicant.job_fit_score}%
                  </span>
                </div>
                <Progress value={applicant.job_fit_score} className={`h-2 mb-3 ${getProgressColor(applicant.job_fit_score)}`} />
                
                {applicant.hiring_recommendation && (
                  <div className="mb-3">
                    <Badge className={`${
                      applicant.hiring_recommendation === 'strong_yes' ? 'bg-emerald-500' :
                      applicant.hiring_recommendation === 'yes' ? 'bg-emerald-400' :
                      applicant.hiring_recommendation === 'maybe' ? 'bg-amber-400' :
                      applicant.hiring_recommendation === 'no' ? 'bg-red-400' :
                      'bg-red-500'
                    } text-white border-0`}>
                      {applicant.hiring_recommendation.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  </div>
                )}
                
                {applicant.recommendation_summary && (
                  <p className="text-slate-700 font-medium mb-3">{applicant.recommendation_summary}</p>
                )}
                
                {applicant.job_fit_reasoning && (
                  <p className="text-sm text-slate-600">{applicant.job_fit_reasoning}</p>
                )}
              </div>
            )}

            {/* Match Highlights & Concerns */}
            <div className="grid md:grid-cols-2 gap-4">
              {applicant.match_highlights?.length > 0 && (
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-medium text-emerald-900">Match Highlights</h3>
                  </div>
                  <ul className="space-y-2">
                    {applicant.match_highlights.map((h, i) => (
                      <li key={i} className="text-sm text-emerald-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {applicant.potential_concerns?.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <h3 className="font-medium text-amber-900">Potential Concerns</h3>
                  </div>
                  <ul className="space-y-2">
                    {applicant.potential_concerns.map((c, i) => (
                      <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Red Flags */}
            {applicant.red_flags?.length > 0 && (
              <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <h3 className="font-medium text-red-900">Critical Issues</h3>
                </div>
                <ul className="space-y-2">
                  {applicant.red_flags.map((flag, i) => (
                    <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Skills & Experience */}
            <div className="grid md:grid-cols-2 gap-4">
              {applicant.key_skills?.length > 0 && (
                <div>
                  <h3 className="font-medium text-slate-900 mb-3">Key Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {applicant.key_skills.map((skill, i) => (
                      <Badge key={i} className="bg-blue-100 text-blue-700 border-0">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {applicant.experience_highlights?.length > 0 && (
                <div>
                  <h3 className="font-medium text-slate-900 mb-3">Experience Highlights</h3>
                  <ul className="space-y-1.5">
                    {applicant.experience_highlights.map((exp, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        {exp}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Portfolio Summary */}
            {applicant.portfolio_summary && (
              <div className="p-5 bg-gradient-to-br from-violet-50 to-blue-50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  <h3 className="font-medium text-slate-900">Portfolio Summary</h3>
                </div>
                <p className="text-slate-600 leading-relaxed">{applicant.portfolio_summary}</p>
              </div>
            )}

            {/* Notable Clients */}
            {applicant.notable_clients?.length > 0 && (
              <div>
                <h3 className="font-medium text-slate-900 mb-3">Notable Clients</h3>
                <div className="flex flex-wrap gap-2">
                  {applicant.notable_clients.map((client, i) => (
                    <Badge key={i} variant="outline" className="px-3 py-1 border-slate-200">
                      {client}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Production Partners */}
            {applicant.production_partners?.length > 0 && (
              <div>
                <h3 className="font-medium text-slate-900 mb-3">Production Partners</h3>
                <div className="space-y-2">
                  {applicant.production_partners.map((partner, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
                        {partner.role}
                      </Badge>
                      <div>
                        <span className="font-medium text-slate-900">{partner.name}</span>
                        {partner.project && (
                          <span className="text-slate-500"> • {partner.project}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Criteria Scores */}
            {applicant.criteria_scores?.length > 0 && (
              <div>
                <h3 className="font-medium text-slate-900 mb-4">Evaluation Breakdown</h3>
                <div className="space-y-4">
                  {applicant.criteria_scores.map((cs, i) => {
                    const criterion = criteria?.find(c => c.name === cs.criterion_name);
                    return (
                      <div key={i} className="p-4 bg-slate-50 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{cs.criterion_name}</span>
                            {criterion?.weight && (
                              <span className="text-xs text-slate-400">({criterion.weight}% weight)</span>
                            )}
                          </div>
                          <span className={`text-lg font-medium ${
                            cs.score >= 80 ? 'text-emerald-600' : cs.score >= 60 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {cs.score}
                          </span>
                        </div>
                        <Progress 
                          value={cs.score} 
                          className={`h-2 mb-3 ${getProgressColor(cs.score)}`}
                        />
                        <p className="text-sm text-slate-600">{cs.reasoning}</p>
                        {cs.evidence?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-xs text-slate-400 mb-1">Evidence:</p>
                            <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
                              {cs.evidence.map((e, j) => (
                                <li key={j}>{e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Strengths & Concerns */}
            <div className="grid md:grid-cols-2 gap-4">
              {applicant.strengths?.length > 0 && (
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-medium text-emerald-900">Strengths</h3>
                  </div>
                  <ul className="space-y-2">
                    {applicant.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-emerald-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {applicant.areas_of_concern?.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <h3 className="font-medium text-amber-900">Areas of Concern</h3>
                  </div>
                  <ul className="space-y-2">
                    {applicant.areas_of_concern.map((c, i) => (
                      <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex justify-between">
          <Button
            variant="outline"
            onClick={() => onStatusChange('rejected')}
            className={`rounded-full ${applicant.status === 'rejected' ? 'bg-red-50 border-red-200 text-red-700' : ''}`}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
          <Button
            onClick={() => onStatusChange('shortlisted')}
            className={`rounded-full ${
              applicant.status === 'shortlisted' 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            <Star className="w-4 h-4 mr-2" />
            {applicant.status === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}
          </Button>
        </div>
      </div>
    </div>
  );
}