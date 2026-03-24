import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all jobs
    const jobs = await base44.asServiceRole.entities.Job.list();
    
    // Find jobs without share codes
    const jobsNeedingCodes = jobs.filter(job => !job.share_code);
    
    if (jobsNeedingCodes.length === 0) {
      return Response.json({ message: 'All jobs already have share codes', updated: 0 });
    }

    // Generate share codes for jobs that need them
    const updates = await Promise.all(
      jobsNeedingCodes.map(job => {
        const shareCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        return base44.asServiceRole.entities.Job.update(job.id, { share_code: shareCode });
      })
    );

    return Response.json({ 
      message: 'Share codes generated successfully',
      updated: updates.length 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});