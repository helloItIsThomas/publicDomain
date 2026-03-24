import React from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Palette, Target, Sparkles, Eye, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ApplicantLogin() {
  const handleLogin = () => {
    base44.auth.redirectToLogin(createPageUrl('ApplicantDashboard'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-500 rounded-3xl blur-xl opacity-40"></div>
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mx-auto shadow-2xl">
              <Palette className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="brand-font text-5xl font-bold text-slate-900 mb-3">
            Resourceful for Creatives
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Your portfolio speaks for itself. Get evaluated on your work, not your resume.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">AI Portfolio Analysis</h3>
              <p className="text-sm text-slate-600">
                Your work is analyzed objectively using advanced AI to evaluate craft and creativity
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mx-auto mb-4">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">Fair Evaluation</h3>
              <p className="text-sm text-slate-600">
                No bias, no gatekeeping. Your portfolio quality determines your score
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mx-auto mb-4">
                <Eye className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">Track Your Status</h3>
              <p className="text-sm text-slate-600">
                View all your applications, scores, and feedback in one dashboard
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-2xl bg-gradient-to-br from-white to-slate-50 backdrop-blur">
          <CardContent className="p-12 text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              Ready to showcase your work?
            </h2>
            <p className="text-slate-600 mb-8">
              Log in to view your application status, scores, and track opportunities from top agencies.
            </p>
            <Button
              onClick={handleLogin}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-2xl px-10 h-14 text-base font-semibold shadow-xl shadow-purple-200/50"
            >
              Log In as Creative
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}