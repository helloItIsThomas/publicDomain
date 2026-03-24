import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft, Link2, Copy, Check, Users, Clock, BarChart3,
  Play, Loader2, ExternalLink, Star, AlertCircle, ChevronDown, Linkedin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import ApplicantCard from '@/components/applicants/ApplicantCard';
import ApplicantDetailModal from '@/components/applicants/ApplicantDetailModal';

export default function JobDetails() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const jobId = urlParams.get('id');
  
  const [copied, setCopied] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [sortBy, setSortBy] = useState('score');

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => base44.entities.Job.filter({ id: jobId }),
    select: data => data[0],
    enabled: !!jobId,
  });

  const { data: applicants = [], isLoading: applicantsLoading } = useQuery({
    queryKey: ['applicants', jobId],
    queryFn: () => base44.entities.Applicant.filter({ job_id: jobId }),
    enabled: !!jobId,
    refetchInterval: 5000, // Auto-refresh every 5s to show analysis progress
  });

  const analyzeApplicant = async (applicant) => {
    try {
      await base44.entities.Applicant.update(applicant.id, { status: 'analyzing', analysis_stage: 'Starting analysis...' });
      queryClient.invalidateQueries(['applicants', jobId]);

      // Stage 1: crawl + LLM browse + upload videos to Twelve Labs (returns immediately)
      const { data: s1 } = await base44.functions.invoke('analyzeStage1', {
        applicant_id: applicant.id,
        portfolio_url: applicant.portfolio_url,
        role_type: job.role_type
      });
      if (s1?.error === 'SITE_INACCESSIBLE') {
        queryClient.invalidateQueries(['applicants', jobId]);
        toast.error(`Could not access portfolio for ${applicant.name}`);
        return;
      }

      // If videos are processing, poll until they're ready (checkVideoStatus advances status when done)
      if (s1?.status === 'videos_processing') {
        await pollUntilVideosReady(applicant.id);
      }

      // Stage 2: vision analysis (reads completed TL results from stage1_data)
      await base44.functions.invoke('analyzeStage2', { applicant_id: applicant.id });

      // Stage 3: scoring
      await base44.functions.invoke('analyzeStage3', {
        applicant_id: applicant.id,
        job_brief: job.brief,
        public_summary: job.public_summary,
        criteria: job.criteria,
        role_type: job.role_type,
        client_name: job.client_name,
        industry: job.industry
      });

      queryClient.invalidateQueries(['applicants', jobId]);
      toast.success(`${applicant.name} analyzed successfully!`);

    } catch (error) {
      console.error('Analysis failed:', error);
      await base44.entities.Applicant.update(applicant.id, { status: 'pending', analysis_stage: null });
      queryClient.invalidateQueries(['applicants', jobId]);
      toast.error(`Failed to analyze ${applicant.name}: ${error.message}`);
    }
  };

  // Poll checkVideoStatus every 30s until videos are ready or timeout (10 min)
  const pollUntilVideosReady = async (applicantId) => {
    const maxAttempts = 20; // 20 x 30s = 10 min max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 30000));
      queryClient.invalidateQueries(['applicants', jobId]);
      const { data } = await base44.functions.invoke('checkVideoStatus', { applicant_id: applicantId });
      if (data?.ready) return;
    }
    // Timeout — advance anyway (stage2 will run without video results)
    console.warn('Video polling timed out — proceeding without video analysis');
  };

  const analyzeAllPending = async () => {
    setIsAnalyzing(true);
    const pending = applicants.filter(a => a.status === 'pending');
    
    for (const applicant of pending) {
      await analyzeApplicant(applicant);
      queryClient.invalidateQueries(['applicants', jobId]);
    }
    
    setIsAnalyzing(false);
    toast.success('All portfolios analyzed!');
  };

  const copyLink = () => {
    const link = `${window.location.origin}${createPageUrl('Apply')}?code=${job?.share_code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard!');
  };

  const shareToLinkedIn = () => {
    const applyLink = `${window.location.origin}${createPageUrl('Apply')}?code=${job?.share_code}`;
    const text = job.public_summary 
      ? job.public_summary
      : `We're looking for a ${job.title}! Apply here: ${applyLink}`;
    
    // Open LinkedIn share dialog with pre-filled text
    const linkedInUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text + '\n\n' + applyLink)}`;
    window.open(linkedInUrl, '_blank', 'width=600,height=600');
    toast.success('Opening LinkedIn...');
  };

  // Separate into main list and wild cards
  const scoredApplicants = applicants.filter(a => a.status === 'scored' || a.status === 'shortlisted' || a.status === 'rejected');
  const sortedScored = [...scoredApplicants].sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0));
  
  // Wild cards: Scored applicants with interesting qualities but lower overall scores
  const wildCards = sortedScored
    .filter((a, index) => {
      // Not in top performers
      if (index < 5) return false;
      // Has notable clients or strong individual criteria scores
      const hasNotableClients = a.notable_clients?.length > 2;
      const hasStrongCriteria = a.criteria_scores?.some(cs => cs.score >= 80);
      return hasNotableClients || hasStrongCriteria;
    })
    .slice(0, 5);

  const sortedApplicants = [...applicants].sort((a, b) => {
    if (sortBy === 'job_fit') return (b.job_fit_score || 0) - (a.job_fit_score || 0);
    if (sortBy === 'score') return (b.overall_score || 0) - (a.overall_score || 0);
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'date') return new Date(b.created_date) - new Date(a.created_date);
    return 0;
  });

  const isRoleMatch = (applicant) => {
    if (!job?.role_type || job.role_type === 'team') return true;
    const r = applicant.detected_role;
    if (!r || r === 'unclear' || applicant.status === 'pending' || applicant.status === 'analyzing') return true;
    if (job.role_type === 'copywriter') return r === 'copywriter' || r === 'both';
    if (job.role_type === 'art_director') return r === 'art_director' || r === 'both';
    return true;
  };

  const displayApplicants = sortedApplicants.filter(isRoleMatch);
  const wrongRoleApplicants = sortedApplicants.filter(a => !isRoleMatch(a));

  const pendingCount = applicants.filter(a => a.status === 'pending').length;
  const analyzingCount = applicants.filter(a => ['analyzing', 'videos_processing', 'stage1_complete', 'stage2_complete'].includes(a.status)).length;

  if (jobLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Job not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <Link to={createPageUrl('Dashboard')} className="inline-flex items-center text-slate-500 hover:text-slate-900 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-light text-slate-900">{job.title}</h1>
              <Badge className={`
                ${job.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}
                border-0 font-normal
              `}>
                {job.status}
              </Badge>
            </div>
            {job.client_name && (
              <p className="text-slate-500">{job.client_name}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                const url = `${window.location.origin}${createPageUrl('Apply')}?code=${job?.share_code}`;
                window.open(url, '_blank');
              }}
              className="rounded-full border-slate-300"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Preview Apply Page
            </Button>

            <Button
              onClick={shareToLinkedIn}
              className="bg-[#0A66C2] hover:bg-[#004182] text-white rounded-full"
            >
              <Linkedin className="w-4 h-4 mr-2" />
              Share to LinkedIn
            </Button>

            <Button
              variant="outline"
              onClick={copyLink}
              className="rounded-full border-slate-300"
            >
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>

            {analyzingCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-0 px-4 py-2">
                <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                Analyzing {analyzingCount} {analyzingCount === 1 ? 'portfolio' : 'portfolios'}...
              </Badge>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-2xl font-light text-slate-900">{applicants.length}</p>
                  <p className="text-xs text-slate-500">Applicants</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-light text-slate-900">{pendingCount + analyzingCount}</p>
                  <p className="text-xs text-slate-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-light text-slate-900">
                    {applicants.filter(a => a.status === 'scored').length}
                  </p>
                  <p className="text-xs text-slate-500">Analyzed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Star className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-light text-slate-900">
                    {applicants.filter(a => a.status === 'shortlisted').length}
                  </p>
                  <p className="text-xs text-slate-500">Shortlisted</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Application Link Card */}
        <Card className="border-0 shadow-sm mb-8 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-white/60">Share this link on LinkedIn</p>
                  <p className="font-mono text-sm text-white/90">
                    {window.location.origin}{createPageUrl('Apply')}?code={job.share_code}
                  </p>
                </div>
              </div>
              <Button
                onClick={copyLink}
                className="bg-white text-slate-900 hover:bg-white/90 rounded-full"
              >
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                Copy Link
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Applicants List */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium text-slate-900">Applicants</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full border-slate-300">
                Sort by: {sortBy === 'job_fit' ? 'Job Match' : sortBy === 'score' ? 'Score' : sortBy === 'name' ? 'Name' : 'Date'}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortBy('job_fit')}>Job Match (Best First)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('score')}>Score (High to Low)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('name')}>Name (A-Z)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('date')}>Date Applied</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {applicantsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-slate-100 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : applicants.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">No applicants yet</h3>
              <p className="text-slate-500">Share your application link to start receiving portfolios</p>
            </CardContent>
          </Card>
        ) : (
          <>


            {/* Wild Cards Section */}
            {wildCards.length > 0 && (
              <div className="mb-8 p-6 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-100">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-medium text-slate-900">Wild Cards</h3>
                  <Badge className="bg-purple-100 text-purple-700 border-0">
                    {wildCards.length} candidates
                  </Badge>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  These applicants scored lower overall but have notable clients or standout strengths worth reviewing
                </p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {wildCards.map(applicant => (
                    <ApplicantCard
                      key={applicant.id}
                      applicant={applicant}
                      criteria={job.criteria}
                      onClick={() => setSelectedApplicant(applicant)}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {displayApplicants.map(applicant => (
                <div key={applicant.id} className="relative">
                  <ApplicantCard
                    applicant={applicant}
                    criteria={job.criteria}
                    onClick={() => setSelectedApplicant(applicant)}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); analyzeApplicant(applicant); }}
                    disabled={applicant.status === 'analyzing'}
                    className="absolute top-3 right-3 text-xs text-slate-400 hover:text-orange-600 transition-colors disabled:opacity-40"
                    title="Re-analyze portfolio"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Wrong Role Section */}
            {wrongRoleApplicants.length > 0 && (
              <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-slate-400" />
                  <h3 className="text-base font-medium text-slate-600">Wrong Role</h3>
                  <Badge className="bg-slate-200 text-slate-600 border-0">{wrongRoleApplicants.length}</Badge>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  These applicants were detected as a different role than what this position requires
                </p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {wrongRoleApplicants.map(applicant => (
                    <div key={applicant.id} className="relative opacity-60">
                      <ApplicantCard
                        applicant={applicant}
                        criteria={job.criteria}
                        onClick={() => setSelectedApplicant(applicant)}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); analyzeApplicant(applicant); }}
                        disabled={applicant.status === 'analyzing'}
                        className="absolute top-3 right-3 text-xs text-slate-400 hover:text-orange-600 transition-colors disabled:opacity-40"
                        title="Re-analyze portfolio"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Detail Modal */}
        {selectedApplicant && (
          <ApplicantDetailModal
            applicant={selectedApplicant}
            criteria={job.criteria}
            onClose={() => setSelectedApplicant(null)}
            onStatusChange={async (status) => {
              await base44.entities.Applicant.update(selectedApplicant.id, { status });
              queryClient.invalidateQueries(['applicants', jobId]);
              setSelectedApplicant({ ...selectedApplicant, status });
            }}
          />
        )}
      </div>
    </div>
  );
}