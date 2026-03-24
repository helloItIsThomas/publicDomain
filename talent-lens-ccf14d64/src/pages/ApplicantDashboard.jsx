import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, ExternalLink, TrendingUp, Clock, CheckCircle2, XCircle, Sparkles, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export default function ApplicantDashboard() {
  const [user, setUser] = useState(null);

  // Fetch current user
  React.useEffect(() => {
    const loadUser = async () => {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    };
    loadUser();
  }, []);

  // Fetch applicant's applications
  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['my-applications', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const apps = await base44.entities.Applicant.filter({ user_id: user.id });
      
      // Fetch job details for each application
      const appsWithJobs = await Promise.all(
        apps.map(async (app) => {
          const job = await base44.entities.Job.filter({ id: app.job_id });
          return { ...app, job: job[0] };
        })
      );
      
      return appsWithJobs.sort((a, b) => 
        new Date(b.created_date) - new Date(a.created_date)
      );
    },
    enabled: !!user,
  });

  const statusConfig = {
    pending: { 
      icon: Clock, 
      color: 'bg-slate-100 text-slate-700 border-slate-200',
      label: 'Pending',
      description: 'Waiting to be reviewed'
    },
    analyzing: { 
      icon: Loader2, 
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      label: 'Analyzing',
      description: 'AI is reviewing your portfolio',
      spin: true
    },
    scored: { 
      icon: Award, 
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      label: 'Reviewed',
      description: 'Portfolio has been analyzed'
    },
    shortlisted: { 
      icon: CheckCircle2, 
      color: 'bg-green-100 text-green-700 border-green-200',
      label: 'Shortlisted',
      description: 'You made the shortlist!'
    },
    rejected: { 
      icon: XCircle, 
      color: 'bg-red-100 text-red-700 border-red-200',
      label: 'Not Selected',
      description: 'Not moving forward'
    },
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 border border-purple-200 mb-4">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">Your Application Journey</span>
            </div>
            <h1 className="brand-font text-5xl font-bold text-slate-900 mb-3">My Applications</h1>
            <p className="text-lg text-slate-600">Track where you stand in the creative talent pipeline</p>
          </div>

          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur">
            <CardContent className="p-16 text-center">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10 text-purple-600" />
              </div>
              <h3 className="brand-font text-2xl font-bold text-slate-900 mb-2">Ready to Apply?</h3>
              <p className="text-slate-600 text-lg">You haven't submitted any applications yet. When you do, you'll see them here with real-time status updates.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 border border-purple-200 mb-4">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-700">Your Application Journey</span>
          </div>
          <h1 className="brand-font text-5xl font-bold text-slate-900 mb-3">My Applications</h1>
          <p className="text-lg text-slate-600">Track where you stand in the creative talent pipeline</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur hover:shadow-2xl transition-all">
            <CardContent className="p-6 text-center">
              <div className="text-4xl font-bold bg-gradient-to-br from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                {applications.length}
              </div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur hover:shadow-2xl transition-all">
            <CardContent className="p-6 text-center">
              <div className="text-4xl font-bold bg-gradient-to-br from-indigo-600 to-blue-600 bg-clip-text text-transparent mb-2">
                {applications.filter(a => a.status === 'analyzing' || a.status === 'pending').length}
              </div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">In Review</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur hover:shadow-2xl transition-all">
            <CardContent className="p-6 text-center">
              <div className="text-4xl font-bold bg-gradient-to-br from-emerald-600 to-teal-600 bg-clip-text text-transparent mb-2">
                {applications.filter(a => a.status === 'shortlisted').length}
              </div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Shortlisted</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur hover:shadow-2xl transition-all">
            <CardContent className="p-6 text-center">
              <div className="text-4xl font-bold bg-gradient-to-br from-violet-600 to-purple-600 bg-clip-text text-transparent mb-2">
                {applications.filter(a => a.overall_score).length > 0
                  ? Math.round(
                      applications.filter(a => a.overall_score).reduce((sum, a) => sum + a.overall_score, 0) /
                      applications.filter(a => a.overall_score).length
                    )
                  : '—'}
              </div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Score</div>
            </CardContent>
          </Card>
        </div>

        {/* Applications List */}
        <div className="space-y-5">
          {applications.map((application) => {
            const status = statusConfig[application.status] || statusConfig.pending;
            const StatusIcon = status.icon;

            return (
              <Card key={application.id} className="border-0 shadow-xl bg-white/90 backdrop-blur hover:shadow-2xl transition-all overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500" />
                <CardHeader className="border-b border-slate-100 pb-5 pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <CardTitle className="brand-font text-2xl text-slate-900">{application.job?.title}</CardTitle>
                        {application.job?.client_name && (
                          <span className="text-slate-500 text-base font-medium">· {application.job.client_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Clock className="w-4 h-4" />
                        <span>
                          Applied {new Date(application.created_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                      </div>
                    </div>
                    <Badge className={`${status.color} border px-4 py-2 text-sm font-semibold whitespace-nowrap`}>
                      <StatusIcon className={`w-4 h-4 mr-2 ${status.spin ? 'animate-spin' : ''}`} />
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-6 pb-8">
                  <div className="space-y-6">
                    {/* Status Banner */}
                    <div className="bg-gradient-to-r from-slate-50 to-indigo-50 rounded-xl p-4 border border-slate-200">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl ${status.color} flex items-center justify-center flex-shrink-0`}>
                          <StatusIcon className={`w-5 h-5 ${status.spin ? 'animate-spin' : ''}`} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900 mb-1">{status.label}</h4>
                          <p className="text-sm text-slate-600">{status.description}</p>
                        </div>
                      </div>
                    </div>

                    {/* Score Section */}
                    {application.overall_score && (
                      <div className="bg-white rounded-xl p-6 border border-purple-100 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-purple-600" />
                            <h4 className="font-semibold text-slate-900">Portfolio Score</h4>
                          </div>
                          <span className={`text-3xl font-bold ${getScoreColor(application.overall_score)}`}>
                            {application.overall_score}
                          </span>
                        </div>
                        <Progress value={application.overall_score} className="h-3 bg-purple-100" />
                      </div>
                    )}

                    {/* Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {application.detected_role && (
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Role Match</h4>
                          <Badge variant="outline" className="capitalize font-semibold">
                            {application.detected_role.replace('_', ' ')}
                          </Badge>
                        </div>
                      )}

                      <div className="bg-white rounded-xl p-4 border border-slate-200">
                        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Portfolio Link</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          className="w-full bg-purple-50 hover:bg-purple-100 border-purple-200"
                        >
                          <a href={application.portfolio_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View Portfolio
                          </a>
                        </Button>
                      </div>
                    </div>

                    {/* Notable Clients */}
                    {application.notable_clients && application.notable_clients.length > 0 && (
                      <div className="bg-white rounded-xl p-4 border border-slate-200">
                        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Notable Clients</h4>
                        <div className="flex flex-wrap gap-2">
                          {application.notable_clients.slice(0, 6).map((client, idx) => (
                            <Badge key={idx} variant="outline" className="bg-slate-50 font-medium">
                              {client}
                            </Badge>
                          ))}
                          {application.notable_clients.length > 6 && (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              +{application.notable_clients.length - 6} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {application.portfolio_summary && (
                    <div className="mt-6 pt-6 border-t border-slate-200">
                      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Portfolio Analysis</h4>
                      <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-4">
                        {application.portfolio_summary}
                      </p>
                    </div>
                  )}

                  {application.strengths && application.strengths.length > 0 && (
                    <div className="mt-6 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-5 border border-emerald-200">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <h4 className="font-semibold text-emerald-900">Key Strengths</h4>
                      </div>
                      <ul className="space-y-2">
                        {application.strengths.map((strength, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex items-start">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 mr-2 flex-shrink-0" />
                            {strength}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}