// Stage 2: LLM content analysis (using raw crawl data from Stage 1) + vision analysis of project pages
// Also reads completed Twelve Labs results from stage1_data
// Saves stage2_data, sets status = stage2_complete

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

        const stage1 = applicant.stage1_data;
        if (!stage1) return Response.json({ error: 'Stage 1 data missing' }, { status: 400 });

        await base44.asServiceRole.entities.Applicant.update(applicant_id, {
            analysis_stage: 'Analyzing portfolio content...'
        });

        const projectUrls = (stage1.project_urls_for_vision || []).slice(0, 5);
        const rawContent = stage1.raw_content || '';
        const normalizedUrl = stage1.normalized_url || '';

        // Read pre-fetched Twelve Labs results (already in stage1_data from checkVideoStatus)
        const videoResults = stage1.twelve_labs_results || [];

        console.log(`Stage 2 start — project pages: ${projectUrls.length}, video results pre-loaded: ${videoResults.length}, raw content chars: ${rawContent.length}`);

        // ALWAYS run a live web browse of the full site to extract awards, press, projects properly
        // This is the most reliable source for JS-rendered portfolio sites
        console.log('Stage 2: running live web browse of portfolio...');
        const livePromise = base44.asServiceRole.integrations.Core.InvokeLLM({
            add_context_from_internet: true,
            prompt: `Visit this creative portfolio website and THOROUGHLY extract ALL content. The URL is: ${normalizedUrl}

🚨 ANTI-HALLUCINATION RULES — NEVER BREAK THESE:
1. NEVER use placeholder names like "Client A", "Client B", "Client C", "Partner X", "Project 1" etc. If you don't know the real name, leave that field EMPTY ("").
2. NEVER invent or guess client names, award names, press outlets, or KPIs. Only use names you actually READ on the page.
3. If a page is empty or you can't access it, return empty arrays. Do NOT fill in plausible-sounding data.
4. ONLY extract content from ${normalizedUrl} and its sub-pages. Do NOT pull data from any other website.

INSTRUCTIONS:
1. Visit the HOMEPAGE first and note all client names, press links, and nav links
2. Visit ${normalizedUrl.replace(/\/$/, '')}/2/ — this is typically the ABOUT/INFO/AWARDS page
3. Visit each numbered sub-page: /3/, /4/, /5/, /6/, /7/, /8/, /9/, /10/ etc.
4. Each numbered page is a different project — visit them all

ONLY content from the domain ${new URL(normalizedUrl).hostname} counts. Ignore all other domains.

Press links on the homepage (like CNN, Fast Company, AdAge) are REAL press mentions — include them.
On each project page, look for "FEATURED IN:" followed by outlet names — those are press mentions for that project.
Award text like "AWARDS: 1x Cannes Lion, 2x LIA" on a project page = real awards — copy them verbatim.

EXTRACT EVERYTHING YOU FIND from ${new URL(normalizedUrl).hostname} ONLY:
- PROJECTS: Every piece of work — use the REAL project/client name you see on the page (NEVER "Client A" etc.)
- AWARDS: Copy the exact text (e.g. "1x Cannes Lion, 2x LIA", "Gold Clio", "Bronze Lion")
- PRESS: Every media outlet listed under "FEATURED IN" on any project page
- CLIENTS: Every brand or organisation mentioned as a client (REAL names only — NEVER "Client A" etc.)
- RESULTS/KPIs: Any metrics like impressions, reach, conversions`,
            response_json_schema: {
                type: 'object',
                properties: {
                    projects: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                client: { type: 'string' },
                                medium: { type: 'string' },
                                press_mentions: { type: 'array', items: { type: 'string' } },
                                awards: { type: 'array', items: { type: 'string' } },
                                production_partners: { type: 'array', items: { type: 'string' } },
                                page_url: { type: 'string' },
                                video_urls: { type: 'array', items: { type: 'string' } },
                                kpi_results: { type: 'array', items: { type: 'string' } },
                                notes: { type: 'string' }
                            }
                        }
                    },
                    all_press_found: { type: 'array', items: { type: 'string' } },
                    all_awards_found: { type: 'array', items: { type: 'string' } },
                    all_clients_found: { type: 'array', items: { type: 'string' } },
                    about_page_notes: { type: 'string' },
                    site_copy_notes: { type: 'string' },
                    video_urls_found: { type: 'array', items: { type: 'string' } }
                }
            }
        }).catch(err => {
            console.error('Live web browse failed:', err.message);
            return null;
        });

        // Also run text-based LLM analysis if we have enough raw content
        let textResult = null;
        if (rawContent.length > 500) {
            console.log(`Stage 2: also running text LLM on ${rawContent.length} chars of raw content`);
            try {
                const CHUNK_SIZE = 25000;
                const chunks = [];
                for (let i = 0; i < Math.min(rawContent.length, 75000); i += CHUNK_SIZE) {
                    chunks.push(rawContent.substring(i, i + CHUNK_SIZE));
                }

                const chunkResults = await Promise.all(chunks.map((chunk, idx) =>
                    base44.asServiceRole.integrations.Core.InvokeLLM({
                        add_context_from_internet: false,
                        prompt: `You are extracting facts from a creative portfolio. This is chunk ${idx + 1} of ${chunks.length}.

🚨 ANTI-HALLUCINATION: NEVER use placeholder names like "Client A", "Project 1", "Partner X". Only use REAL names you can read in the text below. If a field is unknown, leave it empty ("").

PORTFOLIO URL: ${normalizedUrl}

TEXT CONTENT:
${chunk}

EXTRACT EVERYTHING. Be maximally inclusive.

PROJECTS: ANY work shown — use the REAL name from the text, never placeholders.
AWARDS: ANY mention of Cannes, D&AD, One Show, Clio, LIA, Effie, ADC, Shorty, Webby, Emmy, Spikes, or words like "winner", "shortlist", "finalist", "gold", "silver", "bronze" near a show name. Include ALL of them.
PRESS: ANY media outlet or phrases like "as seen in", "featured in", "covered by".
CLIENTS: ANY brand, company or organisation mentioned as client or collaborator — REAL names only.

Output every single thing you find.`,
                        response_json_schema: {
                            type: 'object',
                            properties: {
                                projects: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string' },
                                            client: { type: 'string' },
                                            medium: { type: 'string' },
                                            press_mentions: { type: 'array', items: { type: 'string' } },
                                            awards: { type: 'array', items: { type: 'string' } },
                                            production_partners: { type: 'array', items: { type: 'string' } },
                                            page_url: { type: 'string' },
                                            video_urls: { type: 'array', items: { type: 'string' } },
                                            notes: { type: 'string' }
                                        }
                                    }
                                },
                                all_press_found: { type: 'array', items: { type: 'string' } },
                                all_awards_found: { type: 'array', items: { type: 'string' } },
                                all_clients_found: { type: 'array', items: { type: 'string' } },
                                about_page_notes: { type: 'string' },
                                site_copy_notes: { type: 'string' },
                                video_urls_found: { type: 'array', items: { type: 'string' } }
                            }
                        }
                    }).catch(err => { console.error(`Text chunk ${idx + 1} failed:`, err.message); return null; })
                ));

                const validChunks = chunkResults.filter(Boolean);
                textResult = {
                    projects: validChunks.flatMap(r => r.projects || []),
                    all_press_found: [...new Set(validChunks.flatMap(r => r.all_press_found || []))],
                    all_awards_found: [...new Set(validChunks.flatMap(r => r.all_awards_found || []))],
                    all_clients_found: [...new Set(validChunks.flatMap(r => r.all_clients_found || []))],
                    about_page_notes: validChunks.map(r => r.about_page_notes).filter(Boolean).join(' | '),
                    site_copy_notes: validChunks.map(r => r.site_copy_notes).filter(Boolean).join(' | '),
                    video_urls_found: [...new Set(validChunks.flatMap(r => r.video_urls_found || []))]
                };
                console.log(`Text LLM result — projects: ${textResult.projects.length}, awards: ${textResult.all_awards_found.length}, press: ${textResult.all_press_found.length}`);
            } catch (err) {
                console.error('Text LLM analysis failed:', err.message);
            }
        }

        // Wait for live browse
        const liveResult = await livePromise;
        console.log(`Live browse result — projects: ${liveResult?.projects?.length || 0}, awards: ${liveResult?.all_awards_found?.length || 0}, press: ${liveResult?.all_press_found?.length || 0}`);

        // Merge live + text results (live browse takes precedence, text adds extra)
        const browseResult = {
            projects: mergeProjects(liveResult?.projects || [], textResult?.projects || []),
            all_press_found: [...new Set([...(liveResult?.all_press_found || []), ...(textResult?.all_press_found || [])])].filter(Boolean),
            all_awards_found: [...new Set([...(liveResult?.all_awards_found || []), ...(textResult?.all_awards_found || [])])].filter(Boolean),
            all_clients_found: [...new Set([...(liveResult?.all_clients_found || []), ...(textResult?.all_clients_found || [])])].filter(Boolean),
            about_page_notes: [liveResult?.about_page_notes, textResult?.about_page_notes].filter(Boolean).join(' | '),
            site_copy_notes: [liveResult?.site_copy_notes, textResult?.site_copy_notes].filter(Boolean).join(' | '),
            video_urls_found: [...new Set([...(liveResult?.video_urls_found || []), ...(textResult?.video_urls_found || [])])]
        };

        console.log(`Stage 2 merged result — projects: ${browseResult.projects.length}, awards: ${browseResult.all_awards_found.length}, press: ${browseResult.all_press_found.length}, clients: ${browseResult.all_clients_found.length}`);

        await base44.asServiceRole.entities.Applicant.update(applicant_id, {
            analysis_stage: 'Analyzing project visuals...'
        });

        // Build numeric sub-pages (/2/ through /10/) for screenshot-based vision analysis
        // These are the only reliable way to read JS-rendered SPA portfolio sites
        const baseClean = normalizedUrl.replace(/\/$/, '');
        const numericPageUrls = Array.from({ length: 9 }, (_, i) => `${baseClean}/${i + 2}/`);

        // Combine: project URLs from stage1 + all numeric sub-pages
        const visionUrls = [...new Set([...projectUrls, ...numericPageUrls])].slice(0, 15);
        console.log(`Vision URLs to analyze (screenshot mode): ${visionUrls.join(', ')}`);

        const visionResults = visionUrls.length > 0
            ? await analyzeProjectImages(base44, visionUrls)
            : [];

        // Build summaries
        const visionSummary = visionResults.length > 0
            ? visionResults.map((r, i) => {
                try {
                    const a = typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis;
                    return `Page ${i + 1} (${r.page_url}): Copy=${a.copy_quality_score} Design=${a.design_quality_score} Concept=${a.concept_strength_score} Prod=${a.production_value_score} Awards=[${(a.awards_visible||[]).join('; ')}] Press=[${(a.press_visible||[]).join('; ')}]`;
                } catch (_) { return `Page ${i + 1}: parse failed`; }
            }).join('\n')
            : 'No vision analysis';

        const videoSummary = videoResults.length > 0
            ? videoResults.map((v, i) => v.success ? `Video ${i + 1}: analysis available` : `Video ${i + 1}: failed`).join(' | ')
            : 'No video analysis';

        // Extract press/awards found by vision
        const visionPressFound = visionResults.flatMap(r => {
            try {
                const a = typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis;
                return a.press_visible || [];
            } catch (_) { return []; }
        });
        const visionAwardsFound = visionResults.flatMap(r => {
            try {
                const a = typeof r.analysis === 'string' ? JSON.parse(r.analysis) : r.analysis;
                return a.awards_visible || [];
            } catch (_) { return []; }
        });

        console.log(`Stage 2 complete — vision pages: ${visionResults.length}, vision awards: ${visionAwardsFound.length}, vision press: ${visionPressFound.length}`);

        await base44.asServiceRole.entities.Applicant.update(applicant_id, {
            status: 'stage2_complete',
            analysis_stage: 'Visual analysis done. Scoring portfolio...',
            stage2_data: {
                browse_result: browseResult,
                vision_results: visionResults,
                video_results: videoResults,
                vision_summary: visionSummary,
                video_summary: videoSummary,
                vision_press_found: visionPressFound,
                vision_awards_found: visionAwardsFound
            }
        });

        return Response.json({ success: true, applicant_id, stage: 2 });

    } catch (error) {
        console.error('Stage 2 failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// Merge two project arrays, deduplicating by client name
function mergeProjects(primary, secondary) {
    const merged = [...primary];
    for (const proj of secondary) {
        const exists = merged.some(p =>
            p.client?.toLowerCase() === proj.client?.toLowerCase() ||
            p.name?.toLowerCase() === proj.name?.toLowerCase()
        );
        if (!exists) merged.push(proj);
    }
    return merged;
}

async function analyzeProjectImages(base44, projectUrls) {
    const results = [];
    console.log(`analyzeProjectImages called with ${projectUrls.length} URLs:`, projectUrls);

    await Promise.allSettled(projectUrls.map(async (pageUrl) => {
        try {
            console.log(`Vision/screenshot analysis starting for: ${pageUrl}`);

            // Take a screenshot using htmlcsstoimage.com (free tier, no API key needed for basic use)
            // or fall back to thum.io which renders JS SPAs
            let screenshotFileUrl = null;

            // Try to capture a screenshot via a public headless render service
            const screenshotApiUrl = `https://image.thum.io/get/width/1440/crop/900/noanimate/png/${encodeURIComponent(pageUrl)}`;
            const fetchScreenshot = await fetch(screenshotApiUrl, {
                signal: AbortSignal.timeout(15000)
            }).catch(err => { console.warn(`Screenshot fetch failed for ${pageUrl}:`, err.message); return null; });

            if (fetchScreenshot?.ok) {
                const contentType = fetchScreenshot.headers.get('content-type') || 'image/png';
                const arrayBuffer = await fetchScreenshot.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                // Only treat as valid image if it's at least 10KB (avoids error pages)
                if (bytes.length > 10000) {
                    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: bytes }).catch(() => null);
                    screenshotFileUrl = uploadResult?.file_url || null;
                    if (screenshotFileUrl) {
                        console.log(`Screenshot uploaded for ${pageUrl}: ${bytes.length} bytes → ${screenshotFileUrl}`);
                    }
                } else {
                    console.warn(`Screenshot too small for ${pageUrl}: ${bytes.length} bytes — likely an error page`);
                }
            }

            const promptText = screenshotFileUrl
                ? `You are a creative director evaluating a portfolio page screenshot. The page URL is ${pageUrl} and its screenshot is attached.

YOUR GOAL: Be GENEROUS and INCLUSIVE — extract everything visible in the screenshot.

EXTRACT from the screenshot:
- Project name and what it is
- Client or brand name
- Any copy, headlines, taglines, or slogans (quote them exactly)
- Results, stats, metrics (e.g. "450 Million Impressions")
- AWARDS: ANY award logos or text — Cannes Lions, Clio, D&AD, One Show, LIA, Webby, Emmy. Note the metal level (Gold/Silver/Bronze) and which project.
- PRESS: ANY media outlet logos or names visible (CNN, NYT, Fast Company, AdAge, AdWeek etc.) or text like "featured in"
- Production credits (director, production company, agency)
- Vimeo or YouTube URLs visible

SCORES (0-100): Give meaningful scores — a mid-range score (40-60) is better than 0 if you can see real work.`
                : `You are a creative director evaluating a portfolio page. Visit this URL: ${pageUrl}

YOUR GOAL: Be GENEROUS and INCLUSIVE. When in doubt, include it.

EXTRACT:
- Project name and what it is
- Client or brand
- Any copy, headlines, taglines, or slogans (quote them exactly)
- Results, stats, metrics (e.g. "450 Million Impressions")
- AWARDS: ANY award — Cannes Lions, Clio, D&AD, One Show, LIA, Webby, Emmy. Note the metal level (Gold/Silver/Bronze) and which project. Award logos/bugs count too.
- PRESS: ANY media outlet logos or names visible (CNN, NYT, Fast Company, AdAge, AdWeek etc.) or text like "featured in"
- Production credits (director, production company, agency)
- Vimeo or YouTube URLs

SCORES (0-100): Give meaningful scores — a mid-range score (40-60) is better than 0 if you can see real work.

If you cannot access the page or it is empty, return 0 scores and empty arrays.`;

            const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
                add_context_from_internet: !screenshotFileUrl,
                prompt: promptText,
                file_urls: screenshotFileUrl ? [screenshotFileUrl] : undefined,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        page_url: { type: 'string' },
                        copy_and_headlines: { type: 'array', items: { type: 'string' } },
                        kpi_results: { type: 'array', items: { type: 'string' } },
                        awards_visible: { type: 'array', items: { type: 'string' } },
                        press_visible: { type: 'array', items: { type: 'string' } },
                        production_credits: { type: 'array', items: { type: 'string' } },
                        video_urls: { type: 'array', items: { type: 'string' } },
                        copy_quality_score: { type: 'number' },
                        copy_quality_reasoning: { type: 'string' },
                        design_quality_score: { type: 'number' },
                        design_quality_reasoning: { type: 'string' },
                        concept_strength_score: { type: 'number' },
                        concept_strength_reasoning: { type: 'string' },
                        production_value_score: { type: 'number' },
                        production_value_reasoning: { type: 'string' },
                        overall_page_assessment: { type: 'string' }
                    }
                }
            });

            console.log(`Vision result for ${pageUrl}: copy=${analysis?.copy_quality_score}, design=${analysis?.design_quality_score}, awards=${JSON.stringify(analysis?.awards_visible)}, press=${JSON.stringify(analysis?.press_visible)}, screenshot=${screenshotFileUrl ? 'yes' : 'no (browse fallback)'}`);
            results.push({ page_url: pageUrl, analysis: JSON.stringify(analysis), used_screenshot: !!screenshotFileUrl });
        } catch (err) {
            console.error(`Vision failed for ${pageUrl}:`, err.message);
        }
    }));
    return results;
}