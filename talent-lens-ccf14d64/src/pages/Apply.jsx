import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Briefcase, Link2, Send, CheckCircle, Loader2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Apply() {
  const [searchParams] = useSearchParams();
  const shareCode = searchParams.get('code');
  
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    portfolio_url: '',
    partner_portfolio_url: '',
    linkedin_url: '',
    worked_with_company_before: false,
  });
  const [job, setJob] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  // Check authentication and auto-verify link on mount
  React.useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        // Pre-fill form with user data
        setFormData(prev => ({
          ...prev,
          name: currentUser.full_name || '',
          email: currentUser.email || ''
        }));
        
        // Auto-verify link if share code exists
        if (shareCode) {
          setVerifying(true);
          try {
            const { data } = await base44.functions.invoke('submitApplication', { 
              share_code: shareCode,
              check_only: true 
            });
            
            if (data && data.title) {
              setJob(data);
            } else {
              setError('Invalid or expired application link');
            }
          } catch (err) {
            console.error('Verification error:', err);
            setError('Failed to verify link. Please check the URL and try again.');
          } finally {
            setVerifying(false);
          }
        }
      } catch (err) {
        // Not logged in - redirect to login with return URL
        const returnUrl = window.location.href;
        base44.auth.redirectToLogin(returnUrl);
      } finally {
        setLoadingUser(false);
      }
    };
    checkAuth();
  }, [shareCode]);

  const handleVerifyLink = async () => {
    if (!shareCode) {
      setError('No application code provided');
      return;
    }

    setVerifying(true);
    setError(null);
    
    try {
      const { data } = await base44.functions.invoke('submitApplication', { 
        share_code: shareCode,
        check_only: true 
      });
      
      if (data && data.title) {
        setJob(data);
      } else {
        setError('Invalid or expired application link');
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError('Failed to verify link. Please check the URL and try again.');
    } finally {
      setVerifying(false);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const { data: result } = await base44.functions.invoke('submitApplication', {
        share_code: shareCode,
        ...data,
      });
      return result;
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      setError('Failed to submit application. Please try again.');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    submitMutation.mutate(formData);
  };

  // Loading authentication or verifying link
  if (loadingUser || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <Card className="border-0 shadow-lg max-w-md w-full">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 text-orange-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-500">{loadingUser ? 'Loading...' : 'Verifying application link...'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No share code in URL
  if (!shareCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <Card className="border-0 shadow-lg max-w-md w-full">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-medium text-slate-900 mb-2">Missing Link Code</h2>
            <p className="text-slate-500">No application code was provided in the URL.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verification failed - show error and retry button
  if (!job && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <Card className="border-0 shadow-lg max-w-md w-full">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
              <Link2 className="w-8 h-8 text-orange-600" />
            </div>
            <h2 className="text-xl font-medium text-slate-900 mb-2">Verify Application Link</h2>
            <p className="text-slate-500 mb-6">Click the button below to verify and load this job application.</p>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            
            <Button
              onClick={handleVerifyLink}
              disabled={verifying}
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-2xl px-8 h-12 shadow-xl shadow-orange-200/50"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Link'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Job not accepting applications
  if (job.status !== 'open') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <Card className="border-0 shadow-lg max-w-md w-full">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-xl font-medium text-slate-900 mb-2">Applications Closed</h2>
            <p className="text-slate-500">This position is no longer accepting applications.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Application submitted successfully
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
        <Card className="border-0 shadow-lg max-w-md w-full">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-light text-slate-900 mb-3">Application Submitted!</h2>
            <p className="text-slate-500 leading-relaxed mb-6">
              Thank you for applying to <strong className="text-slate-700">{job.title}</strong>
              {job.client_name && <> at <strong className="text-slate-700">{job.client_name}</strong></>}.
              Your portfolio will be reviewed using our AI-powered evaluation system.
            </p>
            <Button
              asChild
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-2xl shadow-lg"
            >
              <Link to={createPageUrl('ApplicantDashboard')}>
                View My Applications
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Application form
  return (
    <div className="min-h-screen py-12 px-6 bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl blur-xl opacity-40"></div>
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-orange-600 to-amber-600 flex items-center justify-center mx-auto shadow-2xl">
              <Briefcase className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-slate-900 mb-3">{job.title}</h1>
          {job.client_name && (
            <p className="text-slate-600 text-xl font-medium">{job.client_name}</p>
          )}
        </div>

        {/* AI Info Banner */}
        <Card className="border-0 shadow-xl mb-10 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 border-2 border-orange-100">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-orange-600" />
            </div>
            <p className="text-sm font-medium text-slate-700 leading-relaxed">
              Your portfolio will be analyzed using AI to ensure fair and objective evaluation based on your work, not your resume.
            </p>
          </CardContent>
        </Card>

        {/* Application Form */}
        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur">
          <CardHeader className="pb-2 border-b border-orange-100/50">
            <CardTitle className="text-2xl font-bold text-slate-900">Submit Your Portfolio</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label className="text-slate-700 mb-2 block">Full Name</Label>
                <Input
                  required
                  placeholder="Jane Smith"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="h-12 rounded-xl border-slate-200 bg-slate-50"
                  disabled
                />
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">Email</Label>
                <Input
                  required
                  type="email"
                  placeholder="jane@example.com"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="h-12 rounded-xl border-slate-200 bg-slate-50"
                  disabled
                />
              </div>

              <div>
                <Label className="text-slate-700 mb-2 block">
                  {job.role_type === 'team' ? 'Portfolio URL (Person 1)' : 'Portfolio URL'}
                </Label>
                <div className="relative">
                  <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    required
                    type="text"
                    placeholder="your-portfolio.com"
                    value={formData.portfolio_url}
                    onChange={e => setFormData(prev => ({ ...prev, portfolio_url: e.target.value }))}
                    className="h-12 rounded-xl border-slate-200 pl-10"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Your personal website, Behance, Dribbble, or any portfolio site
                </p>
              </div>

              {job.role_type === 'team' && (
                <div>
                  <Label className="text-slate-700 mb-2 block">Portfolio URL (Person 2)</Label>
                  <div className="relative">
                    <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      required
                      type="text"
                      placeholder="partner-portfolio.com"
                      value={formData.partner_portfolio_url}
                      onChange={e => setFormData(prev => ({ ...prev, partner_portfolio_url: e.target.value }))}
                      className="h-12 rounded-xl border-slate-200 pl-10"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Your creative partner's portfolio
                  </p>
                </div>
              )}

              <div>
                <Label className="text-slate-700 mb-2 block">LinkedIn (Optional)</Label>
                <Input
                  type="text"
                  placeholder="linkedin.com/in/username"
                  value={formData.linkedin_url}
                  onChange={e => setFormData(prev => ({ ...prev, linkedin_url: e.target.value }))}
                  className="h-12 rounded-xl border-slate-200"
                />
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <Switch
                  checked={formData.worked_with_company_before}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, worked_with_company_before: checked }))}
                />
                <Label className="text-slate-700 cursor-pointer">
                  I have worked with {job.client_name || 'this company'} before
                </Label>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={submitMutation.isPending}
                className="w-full h-14 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-2xl text-base font-semibold shadow-xl shadow-orange-200/50"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Send className="w-5 h-5 mr-2" />
                )}
                Submit Application
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-6">
          Your portfolio will only be reviewed by the hiring team for this role.
        </p>
      </div>
    </div>
  );
}