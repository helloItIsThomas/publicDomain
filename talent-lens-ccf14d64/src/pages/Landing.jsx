import React from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Layers, Briefcase, Palette, ArrowRight } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Brand */}
        <div className="text-center mb-12">
          <div className="relative inline-block mb-5">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl blur-sm opacity-60"></div>
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-600 to-amber-600 flex items-center justify-center shadow-lg mx-auto">
              <Layers className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="brand-font text-4xl font-bold text-slate-900 mb-2">Resourceful</h1>
          <p className="text-slate-500">AI-powered portfolio analysis for the creative industry</p>
        </div>

        {/* Role Selection */}
        <p className="text-center text-sm font-medium text-slate-400 uppercase tracking-widest mb-6">I am a…</p>
        <div className="grid md:grid-cols-2 gap-5">
          {/* Recruiter */}
          <button
            onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
            className="group bg-white rounded-2xl p-8 shadow-md border border-slate-100 hover:border-orange-200 hover:shadow-xl transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center mb-5 group-hover:from-orange-500 group-hover:to-amber-500 transition-all">
              <Briefcase className="w-6 h-6 text-orange-600 group-hover:text-white transition-colors" />
            </div>
            <h2 className="brand-font text-xl font-bold text-slate-900 mb-1">Recruiter</h2>
            <p className="text-sm text-slate-500 mb-6">Post roles, analyze portfolios, and find the best creative talent</p>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-600">
              Go to recruiter dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Creative / Applicant */}
          <button
            onClick={() => base44.auth.redirectToLogin(createPageUrl('ApplicantDashboard'))}
            className="group bg-white rounded-2xl p-8 shadow-md border border-slate-100 hover:border-purple-200 hover:shadow-xl transition-all text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mb-5 group-hover:from-purple-500 group-hover:to-blue-500 transition-all">
              <Palette className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
            </div>
            <h2 className="brand-font text-xl font-bold text-slate-900 mb-1">Creative</h2>
            <p className="text-sm text-slate-500 mb-6">Track your applications, scores, and feedback in one place</p>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-purple-600">
              Go to my applications
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}