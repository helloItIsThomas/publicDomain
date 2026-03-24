import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { ShieldAlert, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setLoading(false);
      if (u?.role !== 'admin') window.location.href = createPageUrl('Dashboard');
    }).catch(() => {
      setLoading(false);
      base44.auth.redirectToLogin(createPageUrl('AdminDashboard'));
    });
  }, []);

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin',
  });

  const { data: allJobs = [] } = useQuery({
    queryKey: ['all-jobs'],
    queryFn: () => base44.entities.Job.list(),
    enabled: user?.role === 'admin',
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.role !== 'admin') return null;

  const roleColors = {
    admin: 'bg-red-100 text-red-700',
    agency_admin: 'bg-violet-100 text-violet-700',
    user: 'bg-slate-100 text-slate-600',
  };

  const roleLabels = {
    admin: 'Resourceful Admin',
    agency_admin: 'Agency Admin',
    user: 'Recruiter',
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-100 border border-red-200/50 mb-4">
            <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
            <span className="text-sm font-medium text-red-700">Resourceful Admin</span>
          </div>
          <h1 className="brand-font text-4xl font-bold text-slate-900 mb-2">Platform Users</h1>
          <p className="text-slate-500">{allUsers.length} users · {allJobs.length} jobs</p>
        </div>

        <Card className="border-0 shadow-lg bg-white/90">
          <CardContent className="p-0">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <Users className="w-5 h-5 text-slate-400" />
              <span className="font-medium text-slate-700">All Users</span>
            </div>
            <div className="divide-y divide-slate-50">
              {allUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="font-medium text-slate-800">{u.full_name || '—'}</p>
                    <p className="text-sm text-slate-400">{u.email}</p>
                  </div>
                  <Badge className={`${roleColors[u.role] || roleColors.user} border-0`}>
                    {roleLabels[u.role] || u.role}
                  </Badge>
                </div>
              ))}
              {allUsers.length === 0 && (
                <p className="px-6 py-8 text-sm text-slate-400 text-center">No users found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}