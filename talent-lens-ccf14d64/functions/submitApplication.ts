import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Check authentication
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized - please log in' }, { status: 401 });
    }

    const { share_code, name, email, portfolio_url, partner_portfolio_url, linkedin_url, worked_with_company_before, check_only } = await req.json();

    console.log('Received share_code:', share_code);

    if (!share_code) {
      return Response.json({ error: 'Share code is required' }, { status: 400 });
    }

    // Find job by share code (using service role since this is public)
    const jobs = await base44.asServiceRole.entities.Job.filter({ share_code });
    console.log('Found jobs:', jobs.length, jobs.map(j => ({ id: j.id, title: j.title, share_code: j.share_code })));
    const job = jobs[0];

    if (!job) {
      console.error('No job found with share_code:', share_code);
      return Response.json({ error: 'Invalid application link' }, { status: 404 });
    }

    // If just checking job validity, return job info
    if (check_only) {
      return Response.json({ 
        title: job.title,
        client_name: job.client_name,
        status: job.status
      });
    }

    if (!name || !email || !portfolio_url) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (job.status !== 'open') {
      return Response.json({ error: 'Applications are closed for this position' }, { status: 400 });
    }

    // Check for duplicate application from this user
    const existingApplicants = await base44.asServiceRole.entities.Applicant.filter({ 
      job_id: job.id,
      user_id: user.id 
    });
    if (existingApplicants.length > 0) {
      return Response.json({ error: 'You have already applied to this position' }, { status: 400 });
    }

    // Create applicant with analyzing status
    const applicant = await base44.asServiceRole.entities.Applicant.create({
      user_id: user.id,
      job_id: job.id,
      name: user.full_name,
      email: user.email,
      portfolio_url,
      partner_portfolio_url: partner_portfolio_url || '',
      linkedin_url: linkedin_url || '',
      worked_with_company_before: worked_with_company_before || false,
      status: 'analyzing',
    });

    // Kick off pipeline: Stage 1 returns immediately after uploading videos to Twelve Labs.
    // If videos are processing, we poll every 30s until ready, then run Stage 2 + 3.
    const runPipeline = async () => {
      try {
        // Stage 1: crawl + browse + upload videos to TL (returns immediately)
        const s1 = await base44.asServiceRole.functions.invoke('analyzeStage1', {
          applicant_id: applicant.id,
          portfolio_url,
          role_type: job.role_type
        });
        if (s1.data?.error === 'SITE_INACCESSIBLE') return;

        // If videos are still processing, poll checkVideoStatus every 30s until ready
        if (s1.data?.status === 'videos_processing') {
          const maxAttempts = 20; // 10 min max
          for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 30000));
            const check = await base44.asServiceRole.functions.invoke('checkVideoStatus', {
              applicant_id: applicant.id
            });
            if (check.data?.ready) break;
            if (i === maxAttempts - 1) {
              console.warn('Video polling timed out — proceeding without full video analysis');
            }
          }
        }

        // Stage 2: vision analysis (reads TL results from stage1_data)
        await base44.asServiceRole.functions.invoke('analyzeStage2', {
          applicant_id: applicant.id
        });

        // Stage 3: scoring
        await base44.asServiceRole.functions.invoke('analyzeStage3', {
          applicant_id: applicant.id,
          job_brief: job.brief,
          public_summary: job.public_summary,
          criteria: job.criteria,
          role_type: job.role_type,
          client_name: job.client_name,
          industry: job.industry
        });
      } catch (error) {
        console.error('Pipeline failed:', error);
        await base44.asServiceRole.entities.Applicant.update(applicant.id, {
          status: 'pending',
          analysis_stage: null,
          portfolio_summary: '⚠️ Analysis failed — please re-analyze manually.'
        });
      }
    };
    runPipeline();

    return Response.json({ 
      success: true, 
      job: {
        title: job.title,
        client_name: job.client_name
      }
    });
  } catch (error) {
    console.error('Application submission error:', error);
    return Response.json({ error: 'Failed to submit application' }, { status: 500 });
  }
});