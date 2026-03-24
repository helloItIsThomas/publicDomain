// Stage 3: Scoring — reads stage1 + stage2 data, runs two parallel LLM scoring calls
// Saves final scores to Applicant, sets status = scored
// Expected runtime: ~45-90s

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { applicant_id, job_brief: job_brief_param, public_summary, criteria, role_type, client_name, industry } = await req.json();

        if (!applicant_id || !criteria) {
            return Response.json({ error: 'applicant_id and criteria are required' }, { status: 400 });
        }

        const applicants = await base44.asServiceRole.entities.Applicant.filter({ id: applicant_id });
        const applicant = applicants[0];
        if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });

        const stage1 = applicant.stage1_data;
        const stage2 = applicant.stage2_data;
        if (!stage1) return Response.json({ error: 'Stage 1 data missing' }, { status: 400 });

        // Guard: do not hallucinate scores if Stage 2 extracted nothing
        const browseCheck = stage2?.browse_result || {};
        const hasProjects = (browseCheck.projects || []).length > 0;
        const hasClients = (browseCheck.all_clients_found || []).length > 0;
        const hasAwards = (browseCheck.all_awards_found || []).length > 0;
        const hasPress = (browseCheck.all_press_found || []).length > 0;
        const hasVision = (stage2?.vision_results || []).length > 0;
        if (!hasProjects && !hasClients && !hasAwards && !hasPress && !hasVision) {
            console.warn('Stage 3 aborted: Stage 2 returned no usable data (no projects, clients, awards, press, or vision results).');
            await base44.asServiceRole.entities.Applicant.update(applicant_id, {
                status: 'scored',
                analysis_stage: null,
                overall_score: 0,
                portfolio_summary: 'Portfolio analysis failed — no data could be extracted from the portfolio.',
                hiring_recommendation: 'maybe',
                recommendation_summary: 'Unable to analyze — portfolio content could not be extracted.',
            });
            return Response.json({ success: false, error: 'No portfolio data was extracted - cannot score', applicant_id, overall_score: 0 });
        }

        // If job_brief wasn't passed in the request, fetch it directly from the Job record
        let job_brief = job_brief_param;
        if (!job_brief && applicant.job_id) {
            try {
                const jobs = await base44.asServiceRole.entities.Job.filter({ id: applicant.job_id });
                if (jobs[0]?.brief) {
                    job_brief = jobs[0].brief;
                    console.log('Stage 3: job_brief fetched from Job record, length:', job_brief.length);
                } else {
                    console.warn('Stage 3: job_brief missing from request AND from Job record');
                }
            } catch (err) {
                console.warn('Stage 3: could not fetch Job record:', err.message);
            }
        }

        await base44.asServiceRole.entities.Applicant.update(applicant_id, {
            analysis_stage: 'Scoring portfolio...'
        });

        // browse_result now comes from stage2 (LLM analysis moved there from stage1)
        const browseResult = stage2?.browse_result || stage1.browse_result || {};
        const visionSummary = stage2?.vision_summary || 'No vision analysis';
        const videoSummary = stage2?.video_summary || 'No video analysis';

        console.log(`Stage 3 audit — projects: ${(browseResult.projects || []).length}, awards: ${(browseResult.all_awards_found || []).length}, press: ${(browseResult.all_press_found || []).length}, clients: ${(browseResult.all_clients_found || []).length}, vision pages: ${(stage2?.vision_results || []).length}, video results: ${(stage2?.video_results || []).length}`);

        // Merge press + awards from all sources
        const visionPress = stage2?.vision_press_found || [];
        const visionAwards = stage2?.vision_awards_found || [];
        const projectPress = (browseResult.projects || []).flatMap(p => p.press_mentions || []);
        const projectAwards = (browseResult.projects || []).flatMap(p => p.awards || []);

        const mergedPress = [...new Set([...(browseResult.all_press_found || []), ...projectPress, ...visionPress])].filter(Boolean);
        const mergedAwards = [...new Set([...(browseResult.all_awards_found || []), ...projectAwards, ...visionAwards])].filter(Boolean);

        const verifiedFactSheet = {
            projects: browseResult.projects || [],
            all_press_found: mergedPress,
            all_awards_found: mergedAwards,
            all_clients_found: browseResult.all_clients_found || [],
            about_page_notes: browseResult.about_page_notes || '',
            site_copy_notes: browseResult.site_copy_notes || '',
            image_copy_found: browseResult.image_copy_found || [],
            personal_projects_found: browseResult.personal_projects_found || []
        };

        const roleContext = role_type === 'copywriter'
            ? '\n\nIMPORTANT: Position is for a COPYWRITER. Focus on writing samples, headlines, scripts.'
            : role_type === 'art_director'
            ? '\n\nIMPORTANT: Position is for an ART DIRECTOR. Focus on visual design, art direction, layouts.'
            : '\n\nPosition is for a creative team.';

        const factSheetHeader = `You are a senior creative director scoring a portfolio. Use ONLY the fact sheet below — do not browse or invent.

🚨 ANTI-HALLUCINATION RULES:
1. NEVER invent client names. Only use clients from all_clients_found.
2. NEVER invent awards. If all_awards_found is empty AND vision summary shows no awards → awards score MUST be 0-20.
3. NEVER invent press. If all_press_found is empty AND vision summary shows no press → press score MUST be 0-20.
4. Evidence arrays MUST only contain items from the fact sheet verbatim.
5. ✅ IF awards or press ARE listed in the fact sheet → score them GENEROUSLY and accurately. Do NOT downgrade.
${roleContext}
HIRING COMPANY: ${client_name || 'Not specified'} | INDUSTRY: ${industry || 'Not specified'}

════ FACT SHEET ════
PROJECTS (${verifiedFactSheet.projects.length} total):
${JSON.stringify(verifiedFactSheet.projects, null, 2).substring(0, 8000)}

PRESS FOUND: ${JSON.stringify(verifiedFactSheet.all_press_found)}
AWARDS FOUND: ${JSON.stringify(verifiedFactSheet.all_awards_found)}
CLIENTS FOUND: ${JSON.stringify(verifiedFactSheet.all_clients_found)}
ABOUT PAGE: ${verifiedFactSheet.about_page_notes || 'N/A'}
SITE COPY: ${verifiedFactSheet.site_copy_notes || 'N/A'}
IMAGE COPY: ${JSON.stringify(verifiedFactSheet.image_copy_found).substring(0, 2000)}
VISION ANALYSIS SUMMARY: ${visionSummary}
PERSONAL PROJECTS: ${JSON.stringify(verifiedFactSheet.personal_projects_found)}
VIDEO ANALYSIS SUMMARY: ${videoSummary}`;

        // Two parallel scoring calls
        const [scoreCallA, scoreCallB] = await Promise.all([
            base44.asServiceRole.integrations.Core.InvokeLLM({
                add_context_from_internet: false,
                prompt: `${factSheetHeader}

════ SCORING TASK A: Craft · Awards · Press · Side Hustles ════

CRAFT SCORE (0-100): Score based ONLY on objective production quality:
- Writing quality: clarity, grammar, voice, headline craft, script structure
- Visual production quality: color grading, composition, typography, cinematography
- Technical execution: editing pacing, sound design, production design, image quality

DO NOT judge the concept, idea, or creative strategy. A well-executed ad for a boring product scores the same as a well-executed ad for an exciting one. If production quality is high, score high regardless of concept.
craft_evidence MUST have one entry per project: "[Project] — [medium] — [specific production quality observed]"
Scoring: 0-20 amateur | 21-40 basic | 41-60 decent | 61-80 strong | 81-100 exceptional

AWARDS SCORE (0-100): Use ONLY items in AWARDS FOUND and vision awards in VISION ANALYSIS SUMMARY above.
⚠️ If AWARDS FOUND is empty AND VISION ANALYSIS SUMMARY contains no awards → score MUST be 0.
⚠️ NEVER invent awards. NEVER add awards not explicitly listed in the fact sheet.
⚠️ awards_evidence MUST list awards verbatim from the fact sheet, nothing else.
Award tiers — MEMORIZE THESE:
- Cannes Lions (Gold/Silver/Bronze Lion) = Tier1 WIN. A Bronze Lion is a WIN not a shortlist.
- Clio Awards (Gold/Silver/Bronze Clio) = Tier1 WIN
- LIA (London International Awards) Silver/Bronze = Tier1 WIN
- D&AD, One Show, Effie = Tier1
- Shortlist/Finalist only (no metal) = Tier1 shortlist, NOT a win

SCORING:
0-20 nothing | 21-40 shortlists only, zero metals | 41-60 one Tier1 metal (e.g. one Bronze Lion) | 61-80 multiple Tier1 metals across Lions/Clio/LIA | 81-100 multiple Golds or Grand Prix

⚠️ A Bronze Lion + Gold Clio + Silver Lion + Silver LIA + Bronze LIA x2 = this is a 75-85 score. Score it accordingly.
⚠️ "Shortlisted Lion" ≠ a Bronze Lion. But a "Bronze Lion" IS a win, score ≥ 61.
⚠️ NEVER give 0 if all_awards_found has real metals listed.

PRESS SCORE (0-100): Use ONLY items in PRESS FOUND and vision press in VISION ANALYSIS SUMMARY above.
⚠️ If PRESS FOUND is empty AND VISION ANALYSIS SUMMARY contains no press → score MUST be 0.
⚠️ NEVER invent press outlets. NEVER add outlets not explicitly listed in the fact sheet.
⚠️ press_evidence MUST list outlets verbatim from the fact sheet, nothing else.

TIER DEFINITIONS — THESE ARE ABSOLUTE, DO NOT OVERRIDE:
Tier1 (mainstream consumer media): The New York Times, NYT, CNN, Washington Post, Fast Company, Forbes, Wired, Bloomberg, Vanity Fair, Today Show, BBC, NPR, Time Magazine, ABC News, CBS News, NBC News
Tier2 (trade/industry press): AdAge, AdWeek, Campaign, The Drum, Digiday, Shots, LBBO, MSN
Tier3 (minor): Ads of the World, Facebook Live, personal blogs

⚠️ The New York Times = Tier1. ALWAYS. Never call it Tier2.
⚠️ CNN = Tier1. ALWAYS.
⚠️ Fast Company = Tier1. ALWAYS.
⚠️ NYT + CNN + Fast Company together = minimum 78 press score.
0-20 nothing | 21-40 Tier3 only | 41-60 one/two Tier2 | 61-80 multi-Tier2 or one Tier1 | 81-100 multi-Tier1

SIDE HUSTLES (0-100): ONLY personal_projects_found. Client work = 0.
⚠️ Empty personal_projects_found → 0-20.`,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        detected_role: { type: 'string', enum: ['copywriter', 'art_director', 'both', 'unclear'] },
                        craft_score: { type: 'number' },
                        craft_reasoning: { type: 'string' },
                        craft_evidence: { type: 'array', items: { type: 'string' } },
                        best_pieces: { type: 'array', items: { type: 'string' } },
                        site_copy_quality: { type: 'string' },
                        awards_score: { type: 'number' },
                        awards_reasoning: { type: 'string' },
                        awards_evidence: { type: 'array', items: { type: 'string' } },
                        press_score: { type: 'number' },
                        press_reasoning: { type: 'string' },
                        press_evidence: { type: 'array', items: { type: 'string' } },
                        side_hustles_score: { type: 'number' },
                        side_hustles_reasoning: { type: 'string' },
                        side_hustles_evidence: { type: 'array', items: { type: 'string' } },
                        seniority_experience_level: { type: 'string', enum: ['junior', 'mid', 'senior', 'director', 'executive'] },
                        seniority_reasoning: { type: 'string' },
                        types_of_work: { type: 'array', items: { type: 'string' } },
                        types_of_work_reasoning: { type: 'string' },
                        production_partners: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, project: { type: 'string' } } } },
                        key_skills: { type: 'array', items: { type: 'string' } },
                        strengths: { type: 'array', items: { type: 'string' } }
                    }
                }
            }),

            base44.asServiceRole.integrations.Core.InvokeLLM({
                add_context_from_internet: false,
                prompt: `${factSheetHeader}

JOB REQUIREMENTS: ${job_brief || 'Not provided'}
PUBLIC JOB DESCRIPTION: ${public_summary || 'Not provided'}

════ SCORING TASK B: Past Clients · Job Fit · Recommendation · Summary ════

PAST CLIENTS SCORE (0-100):
Factor 1 — Client Prestige (50%): How impressive is the all_clients_found roster?
Factor 2 — Job Relevance (50%): Do they have clients in ${industry || 'this'} industry or at tier of ${client_name || 'this company'}?
⚠️ clients_reasoning MUST name actual clients and assess each. Never vague.
⚠️ notable_clients = ALL clients from all_clients_found.

JOB FIT SCORE (0-100): Industry match, client similarity, medium experience, level alignment.

HIRING RECOMMENDATION: strong_yes | yes | maybe | no | strong_no

PORTFOLIO SUMMARY (under 150 words): Factual — clients, media types, awards, press, best pieces, copy quality.`,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        clients_score: { type: 'number' },
                        clients_reasoning: { type: 'string' },
                        notable_clients: { type: 'array', items: { type: 'string' } },
                        job_fit_score: { type: 'number' },
                        job_fit_reasoning: { type: 'string' },
                        match_highlights: { type: 'array', items: { type: 'string' } },
                        potential_concerns: { type: 'array', items: { type: 'string' } },
                        red_flags: { type: 'array', items: { type: 'string' } },
                        hiring_recommendation: { type: 'string', enum: ['strong_yes', 'yes', 'maybe', 'no', 'strong_no'] },
                        recommendation_summary: { type: 'string' },
                        portfolio_summary: { type: 'string' },
                        experience_highlights: { type: 'array', items: { type: 'string' } },
                        areas_of_concern: { type: 'array', items: { type: 'string' } }
                    }
                }
            })
        ]);

        const ca = { ...scoreCallA, ...scoreCallB };

        // Validation: strip any invented awards/press evidence not found in source data
        const sourceAwardsLower = mergedAwards.map(a => a.toLowerCase());
        const sourcePressLower = mergedPress.map(p => p.toLowerCase());

        const validatedAwardsEvidence = (ca.awards_evidence || []).filter(e =>
            sourceAwardsLower.some(a => e.toLowerCase().includes(a.substring(0, 10)))
        );
        const validatedPressEvidence = (ca.press_evidence || []).filter(e =>
            sourcePressLower.some(p => e.toLowerCase().includes(p.substring(0, 8)))
        );

        // If LLM invented awards/press not in source, force score to 0
        if (mergedAwards.length === 0 && (ca.awards_score || 0) > 0) {
            console.warn(`Validation: LLM gave awards_score=${ca.awards_score} but mergedAwards is empty. Forcing to 0.`);
            ca.awards_score = 0;
            ca.awards_evidence = [];
        } else {
            ca.awards_evidence = validatedAwardsEvidence.length > 0 ? validatedAwardsEvidence : ca.awards_evidence;
        }

        if (mergedPress.length === 0 && (ca.press_score || 0) > 0) {
            console.warn(`Validation: LLM gave press_score=${ca.press_score} but mergedPress is empty. Forcing to 0.`);
            ca.press_score = 0;
            ca.press_evidence = [];
        } else {
            ca.press_evidence = validatedPressEvidence.length > 0 ? validatedPressEvidence : ca.press_evidence;
        }

        // Map to criteria scores
        const criteriaMapping = {
            'Craft': ca.craft_score,
            'Awards': ca.awards_score,
            'Press': ca.press_score,
            'Personality & Side Hustles': ca.side_hustles_score,
            'Past Clients': ca.clients_score,
            'Types of Work': ca.types_of_work?.length ? Math.min(100, ca.types_of_work.length * 20) : 40,
        };

        const criteria_scores = criteria.map(criterion => {
            let score = criteriaMapping[criterion.name] ?? 0;
            let reasoning = '', evidence = [];
            if (criterion.name === 'Craft') { reasoning = ca.craft_reasoning || ''; evidence = ca.craft_evidence || []; }
            else if (criterion.name === 'Awards') { reasoning = ca.awards_reasoning || ''; evidence = ca.awards_evidence || []; }
            else if (criterion.name === 'Press') { reasoning = ca.press_reasoning || ''; evidence = ca.press_evidence || []; }
            else if (criterion.name === 'Personality & Side Hustles') { reasoning = ca.side_hustles_reasoning || ''; evidence = ca.side_hustles_evidence || []; }
            else if (criterion.name === 'Past Clients') { reasoning = ca.clients_reasoning || ''; evidence = ca.notable_clients || []; }
            else if (criterion.name === 'Types of Work') { reasoning = ca.types_of_work_reasoning || ''; evidence = ca.types_of_work || []; }
            return { criterion_name: criterion.name, score: Math.round(score), reasoning, evidence };
        });

        let totalWeightedScore = 0;
        criteria.forEach(criterion => {
            const cs = criteria_scores.find(s => s.criterion_name === criterion.name);
            if (cs) totalWeightedScore += cs.score * (criterion.weight / 100);
        });

        // Save final results — keep stage1/stage2 data for auditing
        await base44.asServiceRole.entities.Applicant.update(applicant_id, {
            status: 'scored',
            analysis_stage: null,
            overall_score: Math.round(totalWeightedScore),
            detected_role: ca.detected_role || 'unclear',
            criteria_scores,
            portfolio_summary: ca.portfolio_summary || '',
            notable_clients: ca.notable_clients || [],
            production_partners: ca.production_partners || [],
            key_skills: ca.key_skills || [],
            experience_highlights: ca.experience_highlights || [],
            job_fit_score: ca.job_fit_score ?? 0,
            job_fit_reasoning: ca.job_fit_reasoning || '',
            match_highlights: ca.match_highlights || [],
            potential_concerns: ca.potential_concerns || [],
            red_flags: ca.red_flags || [],
            hiring_recommendation: ca.hiring_recommendation || 'maybe',
            recommendation_summary: ca.recommendation_summary || '',
            strengths: ca.strengths || [],
            areas_of_concern: ca.areas_of_concern || [],
        });

        console.log('Stage 3 complete. Score:', Math.round(totalWeightedScore));
        return Response.json({ success: true, applicant_id, stage: 3, overall_score: Math.round(totalWeightedScore) });

    } catch (error) {
        console.error('Stage 3 failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});