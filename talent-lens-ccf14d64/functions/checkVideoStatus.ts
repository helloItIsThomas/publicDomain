// Checks Twelve Labs task status for a videos_processing applicant.
// Called by the frontend every 30s.
// When ALL tasks are "ready", fetches video analysis results and advances to stage2.
// If no videos / all failed, also advances to stage2 (skipping video analysis).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { applicant_id } = await req.json();

        if (!applicant_id) {
            return Response.json({ error: 'applicant_id is required' }, { status: 400 });
        }

        const applicants = await base44.asServiceRole.entities.Applicant.filter({ id: applicant_id });
        const applicant = applicants[0];
        if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });

        // Only process if still waiting for videos
        if (applicant.status !== 'videos_processing') {
            return Response.json({ status: applicant.status, ready: true });
        }

        const stage1 = applicant.stage1_data;
        const tasks = stage1?.twelve_labs_tasks || [];

        if (tasks.length === 0) {
            // No tasks — advance directly
            await base44.asServiceRole.entities.Applicant.update(applicant_id, {
                status: 'stage1_complete',
                analysis_stage: 'Portfolio crawled. Starting visual analysis...'
            });
            return Response.json({ status: 'stage1_complete', ready: true });
        }

        const apiKey = Deno.env.get('TWELVE_LABS_API_KEY');
        if (!apiKey) {
            // No API key — skip video analysis and advance
            await base44.asServiceRole.entities.Applicant.update(applicant_id, {
                status: 'stage1_complete',
                analysis_stage: 'Portfolio crawled. Starting visual analysis...'
            });
            return Response.json({ status: 'stage1_complete', ready: true });
        }

        // Check status of each task
        const taskStatuses = await Promise.allSettled(
            tasks.map(async (task) => {
                const res = await fetch(`https://api.twelvelabs.io/v1.2/tasks/${task.task_id}`, {
                    headers: { 'x-api-key': apiKey }
                });
                const data = await res.json();
                return { ...task, tl_status: data.status, video_id: data.video_id || task.video_id };
            })
        );

        const updatedTasks = taskStatuses.map((r, i) =>
            r.status === 'fulfilled' ? r.value : { ...tasks[i], tl_status: 'unknown' }
        );

        const allDone = updatedTasks.every(t => t.tl_status === 'ready' || t.tl_status === 'failed' || t.tl_status === 'error');
        const pendingCount = updatedTasks.filter(t => !['ready', 'failed', 'error'].includes(t.tl_status)).length;

        console.log(`Video status check: ${updatedTasks.length} tasks, ${pendingCount} still pending`);
        updatedTasks.forEach(t => console.log(`  ${t.task_id}: ${t.tl_status}`));

        if (!allDone) {
            // Still processing — update stage message and return not-ready
            await base44.asServiceRole.entities.Applicant.update(applicant_id, {
                analysis_stage: `Analyzing ${pendingCount} video${pendingCount > 1 ? 's' : ''} (this takes a few minutes)...`
            });
            return Response.json({ status: 'videos_processing', ready: false, pending: pendingCount, total: updatedTasks.length });
        }

        // All done — fetch analysis for ready videos
        console.log('All Twelve Labs tasks complete. Fetching analysis results...');
        const videoResults = await Promise.allSettled(
            updatedTasks.map(async (task) => {
                if (task.tl_status !== 'ready' || !task.video_id) {
                    return { video_url: task.video_url, success: false, error: `Task status: ${task.tl_status}` };
                }
                return fetchTwelveLabsAnalysis(apiKey, task.video_id, task.video_url);
            })
        );

        const analysisResults = videoResults.map((r, i) =>
            r.status === 'fulfilled' ? r.value : { video_url: updatedTasks[i].video_url, success: false, error: r.reason?.message }
        );

        const successCount = analysisResults.filter(v => v.success).length;
        console.log(`Video analysis fetched: ${successCount}/${analysisResults.length} succeeded`);

        // Save completed video results to stage1_data and advance status
        await base44.asServiceRole.entities.Applicant.update(applicant_id, {
            status: 'stage1_complete',
            analysis_stage: 'Video analysis complete. Starting visual analysis...',
            stage1_data: {
                ...stage1,
                twelve_labs_tasks: updatedTasks,
                twelve_labs_results: analysisResults  // Stage 2 will read this
            }
        });

        return Response.json({ status: 'stage1_complete', ready: true, videos_analyzed: successCount });

    } catch (error) {
        console.error('checkVideoStatus failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

async function fetchTwelveLabsAnalysis(apiKey, videoId, videoUrl) {
    try {
        const analysisRes = await fetch('https://api.twelvelabs.io/v1.2/generate', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: videoId,
                prompt: `Evaluate this video from a creative portfolio as a senior creative director and cinematographer.

Score each 0-100:
- color_grading: deliberate grade? filmic? serves emotional tone?
- lighting_quality: motivated, purposeful, creates depth/mood?
- cinematography: camera movements, shot variety, focus control
- image_quality: resolution, dynamic range, sensor quality
- editing_pacing: cuts feel motivated? rhythm matches content?
- production_design: locations, wardrobe, props, visual world
- sound_design: music choice, SFX, VO quality
- concept_strength: clear single-minded idea? original? platform-right?
- overall_craft_score: holistic judgment 0-100

Also extract: production_company, director, dop, agency, client, medium, budget_tier (micro/low/mid/high/tentpole), on_screen_copy`,
                temperature: 0.2
            })
        });
        const data = await analysisRes.json();
        return { video_url: videoUrl, video_id: videoId, production_analysis: data.data, success: true };
    } catch (err) {
        console.error(`Analysis fetch failed for video ${videoId}:`, err.message);
        return { video_url: videoUrl, video_id: videoId, success: false, error: err.message };
    }
}