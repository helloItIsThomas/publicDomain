import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function OnboardingModal({ user, onComplete }) {
  const [form, setForm] = useState({ full_name: user?.full_name || '', agency_name: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.agency_name.trim()) return;
    setSaving(true);
    await base44.auth.updateMe({ agency_name: form.agency_name.trim() });
    sessionStorage.setItem('onboarding_dismissed', '1');
    const updatedUser = await base44.auth.me();
    setSaving(false);
    onComplete(updatedUser);
  };

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md border-0 shadow-2xl p-0 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-orange-500 to-amber-500" />
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-amber-600 flex items-center justify-center shadow-lg">
              <Layers className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="brand-font text-xl font-bold text-slate-900">Welcome to Resourceful</h2>
              <p className="text-sm text-slate-500">Just a couple of details to get you set up</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Your name</label>
              <Input
                value={form.full_name}
                disabled
                className="bg-slate-50 text-slate-500"
              />
              <p className="text-xs text-slate-400 mt-1">Set when you created your account</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Agency / Company <span className="text-orange-500">*</span></label>
              <Input
                placeholder="e.g. Wieden+Kennedy, Ogilvy, FCB..."
                value={form.agency_name}
                onChange={(e) => setForm(f => ({ ...f, agency_name: e.target.value }))}
                required
                autoFocus
                className="border-slate-200 focus:border-orange-400 focus:ring-orange-400"
              />
            </div>

            <Button
              type="submit"
              disabled={saving || !form.agency_name.trim()}
              className="w-full bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white h-12 rounded-xl font-semibold shadow-lg shadow-orange-200/50 mt-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Enter Dashboard <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}