import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Plus, Briefcase, Users, Clock, Trash2, Copy, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import OnboardingModal from '../components/recruiter/OnboardingModal';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('onboarding_dismissed');
    base44.auth.me().then(u => {
      setUser(u);
      // Admins (platform owners) skip onboarding — it's only for agency recruiters
      if (u && u.role !== 'admin' && !u.agency_name && !dismissed) setShowOnboarding(true);
    }).catch(() => {
      // Not logged in — redirect to recruiter login
      window.location.href = createPageUrl('RecruiterLogin');
    });
  }, []);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', user?.email, user?.role],
    queryFn: async () => {
      const allJobs = await base44.entities.Job.list('-created_date');
      // admin and agency_admin see all jobs; regular users see their own only
      if (user?.role === 'admin' || user?.role === 'agency_admin') return allJobs;
      return allJobs.filter(j => j.created_by === user?.email);
    },
    enabled: !!user,
  });

  const { data: applicants = [] } = useQuery({
    queryKey: ['applicants'],
    queryFn: () => base44.entities.Applicant.list(),
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId) => {
      // Delete all applicants for this job first
      const jobApplicants = applicants.filter(a => a.job_id === jobId);
      await Promise.all(jobApplicants.map(a => base44.entities.Applicant.delete(a.id)));
      // Then delete the job
      await base44.entities.Job.delete(jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['jobs']);
      queryClient.invalidateQueries(['applicants']);
      toast.success('Position deleted successfully');
    },
  });

  const fixShareCodesMutation = useMutation({
    mutationFn: () => base44.functions.invoke('generateMissingShareCodes'),
    onSuccess: (response) => {
      toast.success(`Fixed ${response.data.updated} positions`);
      queryClient.invalidateQueries(['jobs']);
    },
  });

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const copyShareLink = (job) => {
    const url = `${window.location.origin}${window.location.pathname}#/Apply?code=${job.share_code}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied!');
  };

  const stats = {
    activeJobs: jobs.filter(j => j.status === 'open').length,
    totalApplicants: applicants.length,
    pendingReview: applicants.filter(a => a.status === 'pending').length,
    shortlisted: applicants.filter(a => a.status === 'shortlisted').length,
  };

  const statusColors = {
    draft: 'bg-slate-100 text-slate-700',
    open: 'bg-emerald-100 text-emerald-700',
    reviewing: 'bg-amber-100 text-amber-700',
    closed: 'bg-slate-100 text-slate-500',
  };

  const searchLower = search.toLowerCase();
  const filteredJobs = jobs
    .filter(j => statusFilter === 'all' || j.status === statusFilter)
    .filter(j => {
      if (!search) return true;
      const jobMatch = (j.title || '').toLowerCase().includes(searchLower) || 
        (j.client_name || '').toLowerCase().includes(searchLower) ||
        (j.brief || '').toLowerCase().includes(searchLower);
      const jobApplicants = applicants.filter(a => a.job_id === j.id);
      const applicantMatch = jobApplicants.some(a =>
        (a.name || '').toLowerCase().includes(searchLower) ||
        (a.email || '').toLowerCase().includes(searchLower) ||
        (a.notable_clients || []).some(c => c.toLowerCase().includes(searchLower))
      );
      return jobMatch || applicantMatch;
    });

  const needsAttention = (job) => {
    const jobApplicants = applicants.filter(a => a.job_id === job.id);
    const unreviewed = jobApplicants.filter(a => a.status === 'scored');
    if (unreviewed.length === 0) return false;
    const oldest = unreviewed.reduce((min, a) => {
      const d = new Date(a.updated_date);
      return d < min ? d : min;
    }, new Date());
    return differenceInDays(new Date(), oldest) >= 3;
  };


  return (
    <div className="min-h-screen bg-[#fafaf8]">
      {showOnboarding && user && (
        <OnboardingModal user={user} onComplete={(updatedUser) => {
          setShowOnboarding(false);
          if (updatedUser) setUser(updatedUser);
          else base44.auth.me().then(setUser);
        }} />
      )}

      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h1 className="brand-font text-3xl font-bold text-slate-900">Find your next creative star.</h1>
          </div>
          <div className="flex gap-3">
            {jobs.some(j => !j.share_code) && (
              <Button
                onClick={() => fixShareCodesMutation.mutate()}
                disabled={fixShareCodesMutation.isPending}
                variant="outline"
                className="rounded-xl px-5 h-11 border-stone-200 text-stone-600 hover:bg-stone-50 text-sm"
              >
                {fixShareCodesMutation.isPending ? 'Fixing...' : 'Fix Share Links'}
              </Button>
            )}
            <Link to={createPageUrl('CreateJob')}>
              <Button className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl px-6 h-11 font-medium text-sm shadow-sm">
                <Plus className="w-4 h-4 mr-1.5" />
                New Position
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
          {[
            { label: 'Active Positions', value: stats.activeJobs, icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Applicants', value: stats.totalApplicants, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
            { label: 'Pending Review', value: stats.pendingReview, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
              <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
                <stat.icon className={`w-4.5 h-4.5 ${stat.color}`} strokeWidth={2} size={18} />
              </div>
              <p className="brand-font text-3xl font-bold text-slate-900 leading-none mb-1">{stat.value}</p>
              <p className="text-xs text-slate-400 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Positions */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <h2 className="brand-font text-sm font-semibold text-slate-400 uppercase tracking-widest">Positions</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 px-3 rounded-lg border border-stone-200 text-sm text-slate-700 bg-white placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-300 w-40"
              />
              <div className="flex bg-stone-100 rounded-lg p-0.5 gap-0.5">
                {[
                  { value: 'all', label: 'All Jobs' },
                  { value: 'open', label: 'Open' },
                  { value: 'draft', label: 'Drafts' },
                  { value: 'closed', label: 'Closed' },
                ].map(s => (
                  <button
                    key={s.value}
                    onClick={() => setStatusFilter(s.value)}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${statusFilter === s.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-stone-100 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-5">
                <Briefcase className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="brand-font text-xl font-bold text-slate-900 mb-2">No positions yet</h3>
              <p className="text-slate-500 text-sm mb-7 max-w-xs mx-auto">Create your first role to start collecting and AI-scoring creative portfolios</p>
              <Link to={createPageUrl('CreateJob')}>
                <Button className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl px-7 h-11 text-sm font-medium shadow-sm">
                  Create Position
                </Button>
              </Link>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center">
              <p className="text-slate-400 text-sm">No positions match your filters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredJobs.map(job => {
                const jobApplicants = applicants.filter(a => a.job_id === job.id);
                const analyzed = jobApplicants.filter(a => a.status === 'scored' || a.status === 'shortlisted').length;
                const attention = needsAttention(job);
                return (
                  <div key={job.id} className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all group ${attention ? 'border-amber-200' : 'border-stone-100 hover:border-orange-200'}`}>
                    <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <Link to={createPageUrl(`JobDetails?id=${job.id}`)} className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          <h3 className="brand-font text-lg font-bold text-slate-900 group-hover:text-orange-600 transition-colors truncate">
                            {job.title}
                          </h3>
                          <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 ${statusColors[job.status]}`}>
                            {job.status}
                          </span>
                          {attention && (
                            <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 shrink-0">
                              <AlertTriangle className="w-3 h-3" />
                              Needs review
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-400">
                          {[job.client_name, job.application_deadline && `Due ${format(new Date(job.application_deadline), 'MMM d')}`].filter(Boolean).join(' · ')}
                        </p>
                      </Link>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-center">
                          <p className="brand-font text-xl font-bold text-slate-800">{jobApplicants.length}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Applied</p>
                        </div>
                        <div className="w-px h-8 bg-stone-100" />
                        <div className="text-center">
                          <p className="brand-font text-xl font-bold text-orange-500">{analyzed}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Scored</p>
                        </div>
                        {job.share_code && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); copyShareLink(job); }}
                            className="text-stone-300 hover:text-orange-500 hover:bg-orange-50 w-8 h-8 rounded-lg"
                            title="Copy share link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this position? This will also delete all applicants.')) {
                              deleteJobMutation.mutate(job.id);
                            }
                          }}
                          className="text-stone-200 hover:text-red-400 hover:bg-red-50 w-8 h-8 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}