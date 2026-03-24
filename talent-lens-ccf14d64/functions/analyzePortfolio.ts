import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    // Hard 240-second timeout for entire analysis
    const globalTimeout = new AbortController();
    const globalTimeoutId = setTimeout(() => globalTimeout.abort(), 240000);

    try {
        const base44 = createClientFromRequest(req);
        
        // Allow both authenticated users and service role calls
        const user = await base44.auth.me().catch(() => null);

        const { applicant_id, portfolio_url, job_brief, public_summary, criteria, role_type, client_name, industry } = await req.json();

        if (!portfolio_url) {
            return Response.json({ error: 'portfolio_url is required' }, { status: 400 });
        }

        // Normalize URL - add https:// if missing
        let normalizedUrl = portfolio_url.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }

        console.log('Starting deep portfolio analysis for:', normalizedUrl);

        // Step 1: Fetch the actual portfolio website content using web scraping
        console.log('Fetching portfolio content...');
        let portfolioContent = '';

        try {
            const response = await fetch(normalizedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const html = await response.text();

            // Basic HTML to text conversion - remove scripts, styles, and extract text
            portfolioContent = html
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            console.log(`Portfolio content fetched: ${portfolioContent.length} characters`);

            // If content is too thin, the site is likely JS-rendered — we'll still try via LLM browsing
            if (portfolioContent.length < 300) {
                console.warn('Portfolio content too thin — likely JS-rendered site. Will rely on LLM browsing.');
                portfolioContent = '(Site appears to be JavaScript-rendered — no static content could be scraped. Use add_context_from_internet to browse the site directly.)';
            }
        } catch (error) {
            console.error('Failed to fetch portfolio content:', error);
            portfolioContent = '(Static fetch failed — relying on LLM browsing to access the site directly.)';
        }

        // Step 2: Aggressively crawl every internal page and collect ALL text + video URLs
        const crawlResult = await deepCrawlPortfolio(normalizedUrl);
        console.log(`Crawl complete: ${crawlResult.pages.length} pages, ${crawlResult.videoUrls.length} videos, ${crawlResult.combinedText.length} chars of text`);

        // Step 3: Start Twelve Labs video analysis IN PARALLEL with LLM browsing
        const videoUrls = crawlResult.videoUrls;
        console.log(`Found ${videoUrls.length} total video URLs across portfolio`);

        const videoAnalysisPromise = (videoUrls && videoUrls.length > 0)
            ? Promise.all(videoUrls.map(u => analyzeVideosWithTwelveLabs(u)))
            : Promise.resolve([]);

        // Step 4: Use LLM to analyze the portfolio content directly
        const roleContext = role_type === 'copywriter' 
            ? '\n\nIMPORTANT: This position is specifically for a COPYWRITER. Focus heavily on writing samples, headlines, scripts, and verbal creativity.'
            : role_type === 'art_director'
            ? '\n\nIMPORTANT: This position is specifically for an ART DIRECTOR. Focus heavily on visual design, art direction, layouts, and visual storytelling.'
            : '\n\nThis position is for a creative team (both copywriter and art director).';

        // ── PHASE 1: DEEP BROWSE — collect raw facts before any scoring ──
        // Build a rich context from the deep crawl results
        const crawlContext = crawlResult.pages.map(p => 
            `\n--- PAGE: ${p.url} ---\n${p.text}`
        ).join('\n\n');

        // Determine if crawl yielded useful static content or if it's a JS-rendered site
        const crawlIsUseful = crawlResult.combinedText.length > 2000 && crawlResult.pages.length > 1;
        console.log(`Crawl useful: ${crawlIsUseful} (${crawlResult.combinedText.length} chars, ${crawlResult.pages.length} pages)`);

        const browseResult = await base44.integrations.Core.InvokeLLM({
            add_context_from_internet: false,
            prompt: `You are a research assistant extracting facts from a creative portfolio. Do NOT score — just collect facts.

PORTFOLIO URL: ${normalizedUrl}

${crawlIsUseful ? `════════════════════════════════════════════════════════════
STATIC CRAWL DATA (${crawlResult.pages.length} pages, ${crawlResult.combinedText.length} chars)
Use this as supplementary context. ALSO browse the live site directly.
════════════════════════════════════════════════════════════
${crawlContext.length > 20000 ? crawlContext.substring(0, 20000) + '\n...(truncated)' : crawlContext}

` : `NOTE: This site is JavaScript-rendered (Readymag/Cargo/similar) — static crawl returned no useful content.
You MUST use add_context_from_internet to browse the live site directly.

`}════════════════════════════════════════════════════════════
YOUR PRIMARY TASK — browse the LIVE site at ${normalizedUrl}
════════════════════════════════════════════════════════════

Use add_context_from_internet to visit EVERY page of this portfolio:
1. Homepage — read ALL text, ALL links, the full client list, any press or award mentions
2. Every project/work page — click into each one
3. About/Info page — the bio often lists awards and press coverage
4. Any dedicated Press or Awards page

⚠️ THIS SITE MAY USE READYMAG/CARGO (JS-rendered):
- All content is loaded dynamically — you MUST browse it live, not rely on static text
- Scroll down on every page — content loads as you scroll
- The homepage often has a scrolling client ticker (BRAND1 · BRAND2 · BRAND3) — read every brand
- The "PRESS" or "INFO" section may have short anchor links like "FAST CO." "CNN" "ADAGE" — these ARE press mentions

⚠️ PRESS — BE EXHAUSTIVE, MISS NOTHING:
- Visit EVERY page including about/info/press pages — press is often listed there
- Any hyperlink pointing to fastcompany.com, cnn.com, adage.com, adweek.com, nytimes.com, forbes.com, wired.com, thedrum.com, bloomberg.com, time.com, buzzfeed.com, huffpost.com, vice.com, businessinsider.com etc. = PRESS MENTION
- Short anchor text like "FAST CO." "F.CO" "CNN" "NYT" "ADAGE" "TIME" pointing to those domains = PRESS MENTION
- Bio text saying "featured in Fast Company, CNN" = PRESS MENTION
- Press logos embedded on pages = PRESS MENTION
- Record EVERY one: publication name + article title if visible + URL + which page found on
- all_press_found MUST be a COMPLETE list. If you found ANY, do NOT return an empty array. List them ALL.

⚠️ AWARDS — BE EXHAUSTIVE, MISS NOTHING:
- Visit EVERY project page — awards are often listed per project, not just on a central page
- About/Info page bio often lists awards in the bio text — read every sentence
- Per-project pages show award badges, text overlays, or bottom-of-page credits: "Cannes Lions Gold", "D&AD Pencil", etc.
- Any mention of Cannes, D&AD, One Show, Clio, LIA, Effie, ADC, AICP, AICP Next, Shorty, Webby, Emmy, Andy = AWARD
- Record EVERY one: show name + metal/level + project name + which page found on
- Do NOT stop after finding a few — keep reading every project page to the end
- all_awards_found MUST be a COMPLETE list. List every single award found, no matter how minor.

⚠️ PROJECTS — CRITICAL RULES:
- Visit EVERY project page linked from the homepage or work section — do not skip any
- ONLY list projects you actually see on the site RIGHT NOW during this browse session
- DO NOT list projects from your training data or memory — the site may have changed since your training
- DO NOT invent project names from URL slugs alone — you must see the actual project content
- For EACH project page you visit: read ALL text, ALL image captions, ALL award credits, ALL press links
- Note the medium (film, print, OOH, social, branding, interactive, etc.)
- Read copy/headlines visible in work images
- Note any KPIs ("12M views", "#1 trending", "30% lift")
- production_value: high/medium/low
- page_url MUST be a real URL you actually visited during this session — do not fabricate URLs

⚠️ CLIENTS — list ALL brands/clients from the homepage ticker and all project pages.

⚠️ VIDEOS — list ALL Vimeo and YouTube URLs you find anywhere on the site (embedded players, links, iframes). These will be separately analyzed for production quality.

⚠️ PROJECT PAGES — for each project, include its full URL in page_url so we can screenshot and vision-analyze it.

Return a COMPLETE, EXHAUSTIVE inventory. Do not summarize or skip. Every project, every award, every press mention.`,
            response_json_schema: {
                type: 'object',
                properties: {
                    pages_visited: { type: 'array', items: { type: 'string' }, description: 'List of every page URL or page name you visited' },
                    projects: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                client: { type: 'string' },
                                medium: { type: 'string' },
                                press_mentions: { type: 'array', items: { type: 'string' }, description: 'Any press found on this project page' },
                                awards: { type: 'array', items: { type: 'string' }, description: 'Any awards found on this project page' },
                                production_partners: { type: 'array', items: { type: 'string' } },
                                production_value: { type: 'string', enum: ['high', 'medium', 'low'] },
                                page_url: { type: 'string', description: 'The full URL of this project page' },
                                video_urls: { type: 'array', items: { type: 'string' }, description: 'Any Vimeo/YouTube URLs found on this project page' },
                                notes: { type: 'string', description: 'Anything else notable about this project' }
                            }
                        }
                    },
                    all_press_found: { type: 'array', items: { type: 'string' }, description: 'Master list of ALL press mentions found across the entire site, with source page' },
                    all_awards_found: { type: 'array', items: { type: 'string' }, description: 'Master list of ALL awards found across the entire site, with source page' },
                    all_clients_found: { type: 'array', items: { type: 'string' }, description: 'Master list of ALL brands/clients found' },
                    about_page_notes: { type: 'string', description: 'What the about page says — bio, agencies worked at, any press or awards mentioned in bio' },
                    site_copy_notes: { type: 'string', description: 'Quality of the writing on the site — bio, project descriptions, headlines, any notable copy' },
                    image_copy_found: { type: 'array', items: { type: 'string' }, description: 'All notable copy, headlines, taglines, or KPI results read from inside work images (e.g. "Nike ad headline: Just Do It Again", "Stat overlay: 12M impressions")' },
                    personal_projects_found: { type: 'array', items: { type: 'string' }, description: 'Any personal/non-client side projects found' },
                    video_urls_found: { type: 'array', items: { type: 'string' }, description: 'All Vimeo or YouTube URLs found anywhere on the site' }
                }
            }
        });

        // Supplement crawl videos with any video URLs the LLM found while browsing (critical for JS-rendered sites)
        const llmFoundVideos = (browseResult.video_urls_found || []).filter(u => 
            u && (u.includes('vimeo.com') || u.includes('youtube.com') || u.includes('youtu.be'))
        );
        const allVideoUrlsToAnalyze = [...new Set([...crawlResult.videoUrls, ...llmFoundVideos])];
        console.log(`Total videos to analyze: ${allVideoUrlsToAnalyze.length} (${crawlResult.videoUrls.length} from crawl + ${llmFoundVideos.length} from LLM browse)`);

        // Kick off Twelve Labs for any new LLM-found videos (crawl videos already started above)
        const extraVideoPromises = llmFoundVideos
            .filter(u => !crawlResult.videoUrls.includes(u))
            .map(u => analyzeVideosWithTwelveLabs(u));

        // Screenshot + vision analysis for each project page found by the LLM
        const projectUrls = (browseResult.projects || [])
            .map(p => p.page_url)
            .filter(Boolean)
            .slice(0, 8); // cap at 8 pages to avoid timeout

        const imageAnalysisPromise = projectUrls.length > 0
            ? analyzeProjectImages(base44, normalizedUrl, projectUrls)
            : Promise.resolve([]);

        // Wait for all parallel work with timeouts — cap at 120 seconds for videos, 60 for images
        const [videoAnalysisResults, imageAnalysisResults, extraVideoResults] = await Promise.race([
            Promise.all([
                Promise.race([videoAnalysisPromise, new Promise((_, r) => setTimeout(() => r(new Error('Video timeout')), 120000))]).catch(() => []),
                Promise.race([imageAnalysisPromise, new Promise((_, r) => setTimeout(() => r(new Error('Image timeout')), 60000))]).catch(() => []),
                Promise.race([Promise.all(extraVideoPromises), new Promise((_, r) => setTimeout(() => r(new Error('Extra video timeout')), 120000))]).catch(() => [])
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Parallel analysis timeout')), 150000))
        ]);

        const allVideoResults = [...videoAnalysisResults, ...extraVideoResults];
        const videoAnalysis = allVideoResults.length > 0 ? allVideoResults : null;
        console.log(`Video analysis complete: ${allVideoResults.filter(v => v.success).length} succeeded, ${allVideoResults.filter(v => !v.success).length} failed`);
        console.log(`Image analysis complete: ${imageAnalysisResults.length} pages analyzed`);

        console.log('Browse phase complete. Projects found:', browseResult.projects?.length, 'Press found:', browseResult.all_press_found?.length, 'Awards found:', browseResult.all_awards_found?.length);
        console.log('CRAWL STATS: pages=', crawlResult.pages.length, 'chars=', crawlResult.combinedText.length, 'videos=', crawlResult.videoUrls.length);
        console.log('CRAWL PAGES:', crawlResult.pages.map(p => p.url).join(', '));
        console.log('BROWSE RESULT SAMPLE:', JSON.stringify(browseResult).substring(0, 2000));

        // If the browse phase found nothing at all, the site was likely inaccessible or JS-only and the LLM couldn't reach it
        const hasAnyContent = (browseResult.projects?.length > 0) || 
                              (browseResult.all_clients_found?.length > 0) ||
                              (browseResult.about_page_notes && browseResult.about_page_notes.length > 30);

        if (!hasAnyContent) {
            // Try one more time with a simpler, more direct prompt focused purely on getting ANY content
            console.warn('First browse attempt returned no content — retrying with fallback prompt...');
            const retryResult = await base44.integrations.Core.InvokeLLM({
                add_context_from_internet: true,
                prompt: `You are a research assistant. Browse this creative portfolio website and extract every factual detail you can find. Do NOT evaluate — just collect facts.

URL: ${normalizedUrl}

Use add_context_from_internet to visit EVERY page: homepage, every project page, about/info, press page.

On every page, read ALL text AND ALL links. Portfolio sites hyperlink press coverage directly — a link labeled "CNN" or "Fast Company" IS a press mention. A link labeled "Cannes Lions" IS an award. Read every anchor text and record it.

⚠️ IMAGES CONTAIN TEXT — READ IT: Portfolio pages often show work as static images (print ads, OOH, social posts, screenshots, billboards, mockups). These images frequently contain:
- Headlines, taglines, body copy, and slogans written by the creative
- Client/brand logos or names embedded in the image
- KPI results or campaign stats overlaid on the image (e.g. "12M views", "30% sales lift", "#1 trending")
- Award bugs or press logos embedded in the image
Read ALL visible text inside every image on every project page. Do not skip images.

For each project: name, client, medium, all press links (publication name), all awards (show + level), production partners, production value, any copy/text visible in the work images, any KPI results shown.
For the homepage: every brand/client name in any list or copy, all press publications, all award mentions.

Be exhaustive.`,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        pages_visited: { type: 'array', items: { type: 'string' } },
                        projects: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, client: { type: 'string' }, medium: { type: 'string' }, press_mentions: { type: 'array', items: { type: 'string' } }, awards: { type: 'array', items: { type: 'string' } }, production_partners: { type: 'array', items: { type: 'string' } }, production_value: { type: 'string', enum: ['high', 'medium', 'low'] }, notes: { type: 'string' } } } },
                        all_press_found: { type: 'array', items: { type: 'string' }, description: 'ALL press mentions found across the entire site' },
                        all_awards_found: { type: 'array', items: { type: 'string' }, description: 'ALL awards found across the entire site' },
                        all_clients_found: { type: 'array', items: { type: 'string' } },
                        about_page_notes: { type: 'string' },
                        site_copy_notes: { type: 'string' },
                        personal_projects_found: { type: 'array', items: { type: 'string' } }
                    }
                }
            });

            const retryHasContent = (retryResult.projects?.length > 0) ||
                                    (retryResult.all_clients_found?.length > 0) ||
                                    (retryResult.about_page_notes && retryResult.about_page_notes.length > 30);

            if (!retryHasContent) {
                console.warn('Retry browse also returned no content — site inaccessible.');
                return Response.json({
                    error: 'SITE_INACCESSIBLE',
                    message: `Could not retrieve any content from ${normalizedUrl}. The site may require JavaScript to load, or may be blocking automated access. Please verify the URL is correct and publicly accessible, then re-analyze.`
                }, { status: 422 });
            }

            // Use retry result instead
            Object.assign(browseResult, retryResult);
        }

        // ── PHASE 2: SCORING — split into two parallel calls to avoid token truncation ──

        // Validate that the fact sheet has real content before scoring
        const realProjects = (browseResult.projects || []).filter(p => 
            p.client && p.client !== 'Unknown' && !p.client.match(/client\s*\d+/i) &&
            p.name && !p.name.match(/project\s*\d+/i)
        );
        const realClients = (browseResult.all_clients_found || []).filter(c => 
            c && !c.match(/client\s*\d+/i) && c.length > 1
        );
        const realAwards = (browseResult.all_awards_found || []).filter(a =>
            a && !a.match(/award\s*\d+/i) && !a.match(/portfolio night/i) && !a.match(/design awards 20/i) && !a.match(/print excellence/i)
        );

        console.log(`Fact sheet validation: ${realProjects.length} real projects, ${realClients.length} real clients, ${realAwards.length} real awards`);

        // Use filtered data to prevent hallucination — if real content is very thin, log a warning
        if (realProjects.length === 0 && realClients.length === 0) {
            console.warn('WARNING: Fact sheet appears to contain no real portfolio content. Scoring may be unreliable.');
        }

        // Merge press + awards found by vision analysis of project pages back into the fact sheet
        // This is critical — the LLM browse phase may miss press/awards that are only visible in images
        const visionPressFound = imageAnalysisResults.flatMap(r => {
            try { return JSON.parse(r.analysis).press_visible || []; } catch(_) { return []; }
        });
        const visionAwardsFound = imageAnalysisResults.flatMap(r => {
            try { return JSON.parse(r.analysis).awards_visible || []; } catch(_) { return []; }
        });
        // Also merge per-project press/awards from the browse phase
        const projectPressFound = (browseResult.projects || []).flatMap(p => p.press_mentions || []);
        const projectAwardsFound = (browseResult.projects || []).flatMap(p => p.awards || []);

        const mergedPress = [...new Set([
            ...(browseResult.all_press_found || []),
            ...projectPressFound,
            ...visionPressFound
        ])].filter(Boolean);
        const mergedAwards = [...new Set([
            ...(browseResult.all_awards_found || []),
            ...projectAwardsFound,
            ...visionAwardsFound
        ])].filter(Boolean);

        console.log(`Press merged: ${mergedPress.length} total (browse: ${(browseResult.all_press_found||[]).length}, project-level: ${projectPressFound.length}, vision: ${visionPressFound.length})`);
        console.log(`Awards merged: ${mergedAwards.length} total (browse: ${(browseResult.all_awards_found||[]).length}, project-level: ${projectAwardsFound.length}, vision: ${visionAwardsFound.length})`);

        // Build fact sheet with ONLY the verified content
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

        // Summarize vision analysis results to avoid token explosion
        const visionSummary = imageAnalysisResults.length > 0 
            ? imageAnalysisResults.map(r => {
                try {
                    const a = JSON.parse(r.analysis);
                    return `Page ${imageAnalysisResults.indexOf(r) + 1}: Copy=${a.copy_quality_score} Design=${a.design_quality_score} Concept=${a.concept_strength_score} Prod=${a.production_value_score}`;
                } catch(_) { return `Page ${imageAnalysisResults.indexOf(r) + 1}: analysis failed`; }
            }).join(' | ')
            : 'No vision analysis';

        // Summarize video analysis results
        const videoSummary = videoAnalysis && videoAnalysis.length > 0
            ? videoAnalysis.map((v, i) => {
                if (!v.success) return `Video ${i + 1}: failed`;
                const analysis = v.production_analysis;
                // Extract just the key scores, not the full verbose analysis
                return `Video ${i + 1}: cinematography/grading scores available`;
            }).join(' | ')
            : 'No video analysis';

        const factSheetHeader = `You are a senior creative director scoring a portfolio. Use ONLY the fact sheet below — do not browse or invent.

🚨 CRITICAL ANTI-HALLUCINATION RULES — READ BEFORE SCORING:
1. NEVER invent client names. If all_clients_found says ["Nike", "Apple"] — those are the ONLY clients.
2. NEVER invent award names. If all_awards_found is empty → awards score MUST be 0-20.
3. NEVER invent project names. Use ONLY the project names in the projects array.
4. NEVER invent press publications. If all_press_found is empty → press score MUST be 0-20.
5. If a field is empty or N/A, say "None found" — do not fill it with invented content.
6. Your evidence arrays MUST only contain items that appear verbatim in the fact sheet.

${roleContext}
HIRING COMPANY: ${client_name || 'Not specified'} | INDUSTRY: ${industry || 'Not specified'}

════ FACT SHEET ════
PROJECTS (${verifiedFactSheet.projects.length} total):
${JSON.stringify(verifiedFactSheet.projects, null, 2)}

PRESS FOUND: ${JSON.stringify(verifiedFactSheet.all_press_found)}
AWARDS FOUND: ${JSON.stringify(verifiedFactSheet.all_awards_found)}
CLIENTS FOUND: ${JSON.stringify(verifiedFactSheet.all_clients_found)}
ABOUT PAGE: ${verifiedFactSheet.about_page_notes || 'N/A'}
SITE COPY: ${verifiedFactSheet.site_copy_notes || 'N/A'}
IMAGE COPY: ${JSON.stringify(verifiedFactSheet.image_copy_found)}
VISION ANALYSIS SUMMARY: ${visionSummary}
PERSONAL PROJECTS: ${JSON.stringify(verifiedFactSheet.personal_projects_found)}
VIDEO ANALYSIS SUMMARY: ${videoSummary}`;

        // Run both scoring calls in parallel with strict timeout
        let contentAnalysis;
        try {
            console.log('SCORING PHASE START:', new Date().toISOString());
            console.log('Prompt size A (chars):', `${factSheetHeader}

════ SCORING TASK A:`.length);
            
            const [scoreCallA, scoreCallB] = await Promise.all([
                // CALL A: Craft, Awards, Press, Side Hustles, Role, Seniority, Types of Work
                base44.integrations.Core.InvokeLLM({
                    add_context_from_internet: false,
                    prompt: `${factSheetHeader}

════ SCORING TASK A: Craft · Awards · Press · Side Hustles ════

CRAFT SCORE (0-100):
Craft is the MOST IMPORTANT score. Use ALL available signals for every project.

For each project in the fact sheet, assess:
1. PRODUCTION VALUE — was it a high-budget film? Print campaign? Social? Low-fi content?
2. WRITING QUALITY — look at the actual copy, headlines, taglines in image_copy_found. Is the writing sharp? Witty? Emotionally resonant? Strategically tight?
3. VIDEO QUALITY — if Twelve Labs video analysis is available for videos on this project, use those production scores (color grading, cinematography, lighting, etc.) to assess quality
4. AWARDS on this specific project — Cannes Lions, Clios, D&AD, LIA, etc. elevate the score
5. PRESS on this specific project — being featured in CNN, NYT, Fast Company etc. elevates the score
6. CLIENT PRESTIGE — a great piece for a major brand is a stronger signal
7. CONCEPTUAL STRENGTH — based on the project description and copy, how strong is the underlying idea?

⚠️ Evaluate EVERY project found — do not cherry-pick. Weight the best pieces most heavily.
⚠️ If video analysis scores exist, use them. A project with high cinematography + awards = elite craft signal.
⚠️ craft_evidence MUST have one entry per project. Format: "[Project] — [medium] — [what makes it strong or weak, specific copy/concept noted, video scores if available]"

Scoring: 0-20 amateur | 21-40 basic | 41-60 decent | 61-80 strong | 81-100 exceptional

AWARDS SCORE (0-100): Use ONLY all_awards_found.
0-20 nothing | 21-40 local/student | 41-60 Tier2 wins or Tier1 shortlists | 61-80 multiple Tier2 or metals at Tier1 | 81-100 Golds/Grand Prix Cannes/D&AD/One Show
⚠️ If all_awards_found is empty → score must be 0-20.

PRESS SCORE (0-100): Use ONLY all_press_found.
Tier 1: NYT, CNN, Washington Post, Fast Company, Forbes, Wired, Bloomberg, Atlantic, Vanity Fair
Tier 2: AdAge, AdWeek, Campaign, The Drum, TechCrunch, The Verge
0-20 nothing | 21-40 Tier3 only | 41-60 one/two Tier2 | 61-80 multiple Tier2 or one Tier1 | 81-100 multiple Tier1
⚠️ If all_press_found is empty → score must be 0-20. State explicitly "No press coverage found."
⚠️ CNN = Tier 1. Never default to 50.

SIDE HUSTLES (0-100): Use ONLY personal_projects_found. Client work does NOT count.
0-20 nothing | 21-40 minor | 41-60 several | 61-80 compelling | 81-100 exceptional
⚠️ If personal_projects_found is empty → "No personal or side projects found."`,
                    response_json_schema: {
                        type: 'object',
                        properties: {
                            detected_role: { type: 'string', enum: ['copywriter', 'art_director', 'both', 'unclear'] },
                            role_confidence: { type: 'string' },
                            craft_score: { type: 'number' },
                            craft_reasoning: { type: 'string' },
                            craft_evidence: { type: 'array', items: { type: 'string' }, description: 'One entry per project found in the fact sheet — do not omit any project' },
                            best_pieces: { type: 'array', items: { type: 'string' }, description: 'The 2-4 strongest pieces. Format: "[Project] — [why it stands out]"' },
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

                // CALL B: Past Clients, Job Fit, Recommendation, Summary
                base44.integrations.Core.InvokeLLM({
                    add_context_from_internet: false,
                    prompt: `${factSheetHeader}

JOB REQUIREMENTS (Internal Brief): ${job_brief || 'Not provided'}
PUBLIC JOB DESCRIPTION: ${public_summary || 'Not provided'}

════ SCORING TASK B: Past Clients · Job Fit · Recommendation · Summary ════

PAST CLIENTS SCORE (0-100) — two factors averaged:
Factor 1 — Client Prestige (50%): How impressive is the all_clients_found roster? Name each client and assess tier.
Factor 2 — Job Relevance (50%): Do they have clients in the ${industry || 'not specified'} industry or at the tier of ${client_name || 'not specified'}?
⚠️ clients_reasoning MUST name the clients found, assess their prestige, and explain relevance gap or match. Never leave vague.
⚠️ notable_clients must include ALL clients from all_clients_found (not just the most impressive ones).

JOB FIT SCORE (0-100): How well does this candidate fit THIS SPECIFIC JOB based on industry match, client similarity, medium experience, and level alignment?

HIRING RECOMMENDATION: strong_yes | yes | maybe | no | strong_no — based on both portfolio quality AND job fit.

PORTFOLIO SUMMARY (under 150 words): Factual summary — clients, media types, awards (show + metal), press publications, best pieces, site copy quality.`,
                    response_json_schema: {
                        type: 'object',
                        properties: {
                            clients_score: { type: 'number' },
                            clients_reasoning: { type: 'string' },
                            notable_clients: { type: 'array', items: { type: 'string' }, description: 'ALL clients from all_clients_found, ordered by relevance to this job' },
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

            console.log('SCORING CALL A COMPLETE:', new Date().toISOString());
            console.log('SCORING CALL B COMPLETE:', new Date().toISOString());
            contentAnalysis = { ...scoreCallA, ...scoreCallB };
            console.log('Scoring phase MERGED:', new Date().toISOString());
        } catch (error) {
            console.error('Scoring phase error:', error.message);
            return Response.json({ error: 'Scoring failed', message: error.message }, { status: 500 });
        }

        console.log('FINALIZING RESULTS START:', new Date().toISOString());
        console.log('contentAnalysis keys:', contentAnalysis ? Object.keys(contentAnalysis).join(',') : 'NULL');

        // Step 4: Map analysis to criteria scores
        const criteriaMapping = {
            'Craft': contentAnalysis.craft_score,
            'Awards': contentAnalysis.awards_score,
            'Press': contentAnalysis.press_score,
            'Personality & Side Hustles': contentAnalysis.side_hustles_score,
            'Past Clients': contentAnalysis.clients_score,
            'Types of Work': contentAnalysis.types_of_work?.length ? Math.min(100, contentAnalysis.types_of_work.length * 20) : 40,
        };

        console.log('MAPPING CRITERIA START:', new Date().toISOString());
        const criteria_scores = criteria.map(criterion => {
            let score = criteriaMapping[criterion.name] ?? null;
            let reasoning = '';
            let evidence = [];

            if (criterion.name === 'Craft') {
                reasoning = contentAnalysis.craft_reasoning || '';
                evidence = contentAnalysis.craft_evidence || [];
            } else if (criterion.name === 'Awards') {
                reasoning = contentAnalysis.awards_reasoning || '';
                evidence = contentAnalysis.awards_evidence || [];
            } else if (criterion.name === 'Press') {
                reasoning = contentAnalysis.press_reasoning || '';
                evidence = contentAnalysis.press_evidence || [];
            } else if (criterion.name === 'Personality & Side Hustles') {
                reasoning = contentAnalysis.side_hustles_reasoning || '';
                evidence = contentAnalysis.side_hustles_evidence || [];
            } else if (criterion.name === 'Past Clients') {
                reasoning = contentAnalysis.clients_reasoning || '';
                evidence = contentAnalysis.notable_clients || [];
            } else if (criterion.name === 'Types of Work') {
                reasoning = contentAnalysis.types_of_work_reasoning || 'Inferred from portfolio content';
                evidence = contentAnalysis.types_of_work || [];
            }

            if (score === null) score = 0;

            return {
                criterion_name: criterion.name,
                score: Math.round(score),
                reasoning,
                evidence
            };
        });

        console.log('RESPONSE BUILD START:', new Date().toISOString());

        // If we have an applicant_id, save results directly to DB — avoids serialization hang
        if (applicant_id) {
            // Calculate weighted overall score
            let totalWeightedScore = 0;
            criteria.forEach(criterion => {
                const cs = criteria_scores.find(s => s.criterion_name === criterion.name);
                if (cs) totalWeightedScore += cs.score * (criterion.weight / 100);
            });

            await base44.asServiceRole.entities.Applicant.update(applicant_id, {
                status: 'scored',
                overall_score: Math.round(totalWeightedScore),
                detected_role: contentAnalysis.detected_role || 'unclear',
                criteria_scores,
                portfolio_summary: contentAnalysis.portfolio_summary || '',
                notable_clients: contentAnalysis.notable_clients || [],
                production_partners: contentAnalysis.production_partners || [],
                key_skills: contentAnalysis.key_skills || [],
                experience_highlights: contentAnalysis.experience_highlights || [],
                job_fit_score: contentAnalysis.job_fit_score ?? 0,
                job_fit_reasoning: contentAnalysis.job_fit_reasoning || '',
                match_highlights: contentAnalysis.match_highlights || [],
                potential_concerns: contentAnalysis.potential_concerns || [],
                red_flags: contentAnalysis.red_flags || [],
                hiring_recommendation: contentAnalysis.hiring_recommendation || 'maybe',
                recommendation_summary: contentAnalysis.recommendation_summary || '',
                strengths: contentAnalysis.strengths || [],
                areas_of_concern: contentAnalysis.areas_of_concern || [],
            });

            console.log('SAVED TO DB, RETURNING LIGHTWEIGHT RESPONSE:', new Date().toISOString());
            return Response.json({ success: true, applicant_id });
        }

        // Fallback: return full analysis if no applicant_id (direct API call without DB storage)
        console.log('RESPONSE SENT (no applicant_id):', new Date().toISOString());
        return Response.json({
            criteria_scores,
            detected_role: contentAnalysis.detected_role || 'unclear',
            seniority_level: contentAnalysis.seniority_experience_level || 'unclear',
            types_of_work: contentAnalysis.types_of_work || [],
            portfolio_summary: contentAnalysis.portfolio_summary || '',
            notable_clients: contentAnalysis.notable_clients || [],
            production_partners: contentAnalysis.production_partners || [],
            key_skills: contentAnalysis.key_skills || [],
            experience_highlights: contentAnalysis.experience_highlights || [],
            job_fit_score: contentAnalysis.job_fit_score ?? 0,
            job_fit_reasoning: contentAnalysis.job_fit_reasoning || '',
            match_highlights: contentAnalysis.match_highlights || [],
            potential_concerns: contentAnalysis.potential_concerns || [],
            red_flags: contentAnalysis.red_flags || [],
            hiring_recommendation: contentAnalysis.hiring_recommendation || 'maybe',
            recommendation_summary: contentAnalysis.recommendation_summary || '',
            strengths: contentAnalysis.strengths || [],
            areas_of_concern: contentAnalysis.areas_of_concern || [],
            best_pieces: contentAnalysis.best_pieces || [],
            site_copy_quality: contentAnalysis.site_copy_quality || '',
            videos_analyzed: videoAnalysisResults?.filter(v => v.success).length || 0,
        });

    } catch (error) {
        console.error('Portfolio analysis failed:', error);
        clearTimeout(globalTimeoutId);
        if (error.name === 'AbortError') {
            return Response.json({ error: 'Timeout', message: 'Analysis exceeded 4 minutes. Some stages may be incomplete.' }, { status: 504 });
        }
        return Response.json({ error: error.message }, { status: 500 });
    } finally {
        clearTimeout(globalTimeoutId);
    }
});

// Full site crawler: fetch every internal page, extract all text + video URLs
async function deepCrawlPortfolio(baseUrl) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const videoPatterns = [
        /https?:\/\/(?:www\.)?vimeo\.com\/\d+(?:\/[\w]+)?/gi,
        /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+/gi,
        /https?:\/\/(?:www\.)?youtu\.be\/[\w-]+/gi,
        /player\.vimeo\.com\/video\/(\d+)/gi,
        /youtube\.com\/embed\/([\w-]+)/gi,
    ];

    const allVideoUrls = new Set();
    const visitedUrls = new Set();
    const pages = [];

    function extractVideosFromHtml(html) {
        videoPatterns.forEach(pattern => {
            const p = new RegExp(pattern.source, pattern.flags);
            let match;
            while ((match = p.exec(html)) !== null) {
                let url = match[1] || match[0];
                url = url
                    .replace(/player\.vimeo\.com\/video\/(\d+).*/, 'https://vimeo.com/$1')
                    .replace(/youtube\.com\/embed\/([\w-]+).*/, 'https://youtube.com/watch?v=$1')
                    .replace(/^\/\//, 'https://')
                    .split('?')[0].split('#')[0];
                if (url.match(/vimeo\.com\/\d+|youtube\.com\/watch|youtu\.be\//)) {
                    allVideoUrls.add(url);
                }
            }
        });
    }

    function htmlToText(html) {
        // Extract all href links with their anchor text — critical for press detection
        const linkTexts = [];
        const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let lm;
        while ((lm = linkPattern.exec(html)) !== null) {
            const href = lm[1];
            const text = lm[2].replace(/<[^>]+>/g, '').trim();
            if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                linkTexts.push(`[LINK: ${text} → ${href}]`);
            }
        }

        // Strip scripts and styles, then tags
        const text = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return text + '\n\nLINKS FOUND:\n' + linkTexts.join('\n');
    }

    function extractInternalLinks(html, base) {
        const baseHost = new URL(base).hostname;
        const linkPattern = /href=["']([^"'#?]+)["']/gi;
        const links = new Set();
        let m;
        while ((m = linkPattern.exec(html)) !== null) {
            let href = m[1].trim();
            if (!href || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
            try {
                const full = new URL(href, base);
                if (full.hostname === baseHost && !full.pathname.match(/\.(pdf|jpg|jpeg|png|gif|svg|css|js|woff|ttf)$/i)) {
                    links.add(full.href.split('?')[0].split('#')[0]);
                }
            } catch (_) {}
        }
        return [...links];
    }

    async function fetchPage(url) {
        if (visitedUrls.has(url)) return null;
        visitedUrls.add(url);
        try {
            const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
            if (!r.ok) return null;
            const html = await r.text();
            extractVideosFromHtml(html);
            const text = htmlToText(html);
            return { url, html, text };
        } catch (_) {
            return null;
        }
    }

    try {
        // Fetch homepage
        const home = await fetchPage(baseUrl);
        if (home) {
            pages.push({ url: home.url, text: home.text });
            
            // Find all internal links
            const internalLinks = extractInternalLinks(home.html, baseUrl);
            console.log(`Found ${internalLinks.length} internal links to crawl`);

            // Crawl all sub-pages in parallel (cap at 40)
            const toVisit = internalLinks.filter(l => l !== baseUrl).slice(0, 40);
            await Promise.allSettled(
                toVisit.map(async (link) => {
                    const page = await fetchPage(link);
                    if (page) pages.push({ url: page.url, text: page.text });
                })
            );
        }
    } catch (error) {
        console.error('Deep crawl failed:', error);
    }

    const combinedText = pages.map(p => `\n=== ${p.url} ===\n${p.text}`).join('\n');
    console.log(`Deep crawl: ${pages.length} pages, ${allVideoUrls.size} videos, ${combinedText.length} chars`);

    return { pages, videoUrls: [...allVideoUrls], combinedText };
}

// Use LLM vision to analyze screenshots of project pages — extracts copy, headlines, visual style, awards, press logos
async function analyzeProjectImages(base44, siteUrl, projectUrls) {
    const results = [];

    await Promise.allSettled(projectUrls.map(async (pageUrl) => {
        try {
            // Use InvokeLLM with add_context_from_internet to get a screenshot/vision analysis
            const analysis = await base44.integrations.Core.InvokeLLM({
                add_context_from_internet: true,
                prompt: `You are a senior creative director and art director evaluating a portfolio project page. Browse this page: ${pageUrl}

You have TWO jobs: (1) EXTRACT facts, and (2) EVALUATE quality. Both matter equally.

════ PART 1: EXTRACT FACTS ════

READ EVERY IMAGE on the page — ads, OOH, print, social posts, mockups, screenshots, video thumbnails:
- Quote ALL copy, headlines, taglines, slogans, body copy visible in the work (exact words)
- Note client/brand names or logos embedded in images
- Note any KPI results, campaign stats, effectiveness metrics (e.g. "12M views", "30% sales lift", "#1 trending on YouTube")
- Note any award bugs (Cannes Lions, D&AD, Clio, One Show etc.) visible in images
- Note any press logos (Fast Company, CNN, NYT etc.) visible in images
- Note production credits from end slates: director, production company, DOP, post house, agency
- List any Vimeo or YouTube video URLs embedded on this page

════ PART 2: EVALUATE QUALITY ════

After reviewing all the work on this page, score and assess:

COPY QUALITY (0-100): How good is the actual writing?
- Is the headline surprising, specific, witty, or emotionally resonant? Or generic and forgettable?
- Does the copy demonstrate strategic thinking or just describe the product?
- Is there a strong POV or voice? Is it memorable?
- Quote the best and weakest lines as evidence.
- Score: 0-20 poor | 21-40 basic | 41-60 competent | 61-80 strong | 81-100 exceptional/award-worthy

DESIGN & ART DIRECTION QUALITY (0-100): How good is the visual execution?
- Is the layout considered and intentional? Or cluttered and generic?
- Typography choices — do they reinforce the idea or feel default?
- Color palette — is it distinctive and purposeful?
- Imagery — original photography/illustration or stock? Stylistically coherent?
- Overall: does this look like it belongs in an award annual, a client pitch, or a student book?
- Score: 0-20 amateur | 21-40 basic | 41-60 competent | 61-80 strong | 81-100 exceptional

CONCEPT STRENGTH (0-100): How strong is the underlying idea?
- Is there a single, clear, differentiating idea driving the work?
- Is the concept platform-appropriate (does the medium serve the idea)?
- Could you explain the idea in one sentence? Is it original?
- Score: 0-20 no clear idea | 21-40 obvious/generic | 41-60 decent | 61-80 strong | 81-100 genuinely original

PRODUCTION VALUE (0-100): How well-produced is the work overall?
- For film/video: lighting, camera quality, color grade (defer to Twelve Labs if available)
- For print/OOH: print quality, retouching, finish
- For digital/social: polish, motion quality, interactive execution
- Score: 0-20 low | 21-40 basic | 41-60 decent | 61-80 high | 81-100 exceptional

RESULTS & EFFECTIVENESS: Did this work actually perform?
- List any measurable results: views, impressions, engagement rates, sales lift, award recognition, press coverage
- Assess whether the work appears to have been strategically effective, not just aesthetically pleasing

Be ruthlessly honest. Quote specific examples. A beautiful-looking piece with a weak idea should score low on concept. Strong copy with poor design should reflect that split.`,
                response_json_schema: {
                    type: 'object',
                    properties: {
                        page_url: { type: 'string' },
                        copy_and_headlines: { type: 'array', items: { type: 'string' }, description: 'Exact copy/headlines quoted from work images' },
                        kpi_results: { type: 'array', items: { type: 'string' }, description: 'Measurable campaign results and effectiveness metrics' },
                        awards_visible: { type: 'array', items: { type: 'string' } },
                        press_visible: { type: 'array', items: { type: 'string' } },
                        production_credits: { type: 'array', items: { type: 'string' } },
                        video_urls: { type: 'array', items: { type: 'string' } },
                        copy_quality_score: { type: 'number', description: '0-100 score for writing quality' },
                        copy_quality_reasoning: { type: 'string', description: 'What makes the copy strong or weak, with quoted examples' },
                        design_quality_score: { type: 'number', description: '0-100 score for art direction and design' },
                        design_quality_reasoning: { type: 'string', description: 'Assessment of visual execution, layout, typography, imagery' },
                        concept_strength_score: { type: 'number', description: '0-100 score for strength of the underlying idea' },
                        concept_strength_reasoning: { type: 'string', description: 'Is there a clear, original, platform-appropriate idea?' },
                        production_value_score: { type: 'number', description: '0-100 score for production quality' },
                        production_value_reasoning: { type: 'string' },
                        medium: { type: 'string', description: 'Primary medium: film, print, OOH, social, branding, interactive, etc.' },
                        overall_page_assessment: { type: 'string', description: 'One-paragraph honest assessment of this project as a creative director would see it' }
                    }
                }
            });

            results.push({
                page_url: pageUrl,
                analysis: JSON.stringify(analysis)
            });
        } catch (err) {
            console.error(`Image analysis failed for ${pageUrl}:`, err.message);
        }
    }));

    return results;
}

async function analyzeVideosWithTwelveLabs(videoUrl) {
    const apiKey = Deno.env.get('TWELVE_LABS_API_KEY');
    
    if (!apiKey) {
        console.log('Twelve Labs API key not configured, skipping video analysis');
        return { error: 'API key not configured', video_url: videoUrl };
    }

    try {
        
        console.log('Analyzing video with Twelve Labs:', videoUrl);

        // Step 1: Create an index
        const indexResponse = await fetch('https://api.twelvelabs.io/v1.2/indexes', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                index_name: `portfolio_${Date.now()}`,
                engines: [
                    {
                        engine_name: 'marengo2.6',
                        engine_options: ['visual', 'conversation']
                    }
                ]
            })
        });

        if (!indexResponse.ok) {
            throw new Error(`Failed to create index: ${await indexResponse.text()}`);
        }

        const indexData = await indexResponse.json();
        const indexId = indexData._id;

        // Step 2: Upload video
        const uploadResponse = await fetch('https://api.twelvelabs.io/v1.2/tasks', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                index_id: indexId,
                video_url: videoUrl
            })
        });

        if (!uploadResponse.ok) {
            throw new Error(`Failed to upload video: ${await uploadResponse.text()}`);
        }

        const uploadData = await uploadResponse.json();
        const taskId = uploadData._id;
        const videoId = uploadData.video_id;

        // Step 3: Wait for processing (poll status)
        let videoIdResolved = videoId;
        let processed = false;
        let attempts = 0;
        const maxAttempts = 48; // 4 minutes max per video (48 x 5s) — videos run in parallel so this is fine

        while (!processed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
            
            const statusResponse = await fetch(`https://api.twelvelabs.io/v1.2/tasks/${taskId}`, {
                headers: { 'x-api-key': apiKey }
            });

            const statusData = await statusResponse.json();
            console.log(`Task ${taskId} status: ${statusData.status} (attempt ${attempts + 1})`);
            
            // Twelve Labs uses 'ready' for completed tasks
            if (statusData.status === 'ready') {
                processed = true;
                // video_id may come from the task status response
                if (statusData.video_id) videoIdResolved = statusData.video_id;
            } else if (statusData.status === 'failed' || statusData.status === 'error') {
                throw new Error(`Video processing failed with status: ${statusData.status}`);
            }
            // 'pending', 'validating', 'queued', 'indexing' — keep waiting
            
            attempts++;
        }

        if (!processed) {
            throw new Error('Video processing timeout after 4 minutes');
        }

        // Step 4: Analyze production quality with exhaustive frame-by-frame sampling
        const analysisResponse = await fetch('https://api.twelvelabs.io/v1.2/generate', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                video_id: videoIdResolved,
                prompt: `You are a senior creative director, cinematographer, and advertising expert evaluating a video from a creative professional's portfolio. Analyze this ENTIRE video comprehensively.

CRITICAL INSTRUCTIONS:
- Sample frames throughout the ENTIRE video — beginning, middle, end — do not skip sections
- Watch for end slates / credit cards — they reveal director, production company, DOP, agency
- Evaluate BOTH the craft/production quality AND the creative/conceptual quality

════ SECTION 1: PRODUCTION CRAFT SIGNALS ════
Score each 0-100 with specific timestamped observations:

COLOR GRADING (0-100):
- Is there a deliberate, consistent color grade? Warm/cool toning, bleach bypass, naturalistic?
- Shadow detail, highlight rolloff — does it look filmic or flat?
- Does the color palette serve the emotional tone of the piece?
- 0-20: flat/ungraded | 21-40: basic correction | 41-60: competent grade | 61-80: deliberate and polished | 81-100: signature, cinematic look

LIGHTING QUALITY (0-100):
- Single source/flat vs. complex multi-source lighting rigs
- Is the lighting motivated and purposeful? Does it create depth, mood, separation?
- Hard vs. soft light — is it deliberate?
- Practical lights, motivated sources, lens flares — intentional or accidental?
- 0-20: phone-quality flat | 21-40: basic | 41-60: competent | 61-80: professional with intent | 81-100: exceptional, award-level

CINEMATOGRAPHY (0-100):
- Camera movements: handheld vs. gimbal vs. dolly vs. crane vs. locked — are they motivated?
- Shot variety: wides, mediums, close-ups, macro, aerial, POV — range and quality
- Focus control: rack focus, shallow depth of field, focus pulls — intentional?
- Is the camera language telling the story or just documenting?
- 0-20: static/handheld only | 81-100: cinematic language that elevates the idea

CAMERA & IMAGE QUALITY (0-100):
- Image resolution and sharpness
- Dynamic range (crushed blacks / blown highlights = low score)
- Noise/grain — intentional or technical limitation?
- Overall sensor quality indicators
- 0-20: phone/low-end | 81-100: large-format/cinema camera quality

EDITING & PACING (0-100):
- Do cuts feel motivated or arbitrary?
- Does the pacing match the emotional rhythm of the content?
- Sound design / music sync — do cuts land on beats?
- Transitions — cuts, dissolves, match cuts — purposeful?
- 0-20: rough cuts | 81-100: editing that makes you feel something

PRODUCTION DESIGN (0-100):
- Locations: found vs. dressed vs. built sets
- Wardrobe, props, color palette of the set — deliberate or default?
- Does the visual world feel coherent and considered?
- 0-20: no design evident | 81-100: fully realized visual world

SOUND DESIGN & MUSIC (0-100):
- Is there a music track? Does it serve the piece or feel like a stock pick?
- Sound design: foley, ambience, SFX — layered or thin?
- VO quality if present — professional recording?
- 0-20: no audio effort | 81-100: audio that elevates the film

════ SECTION 2: CREATIVE & CONCEPT QUALITY ════

CONCEPT STRENGTH (0-100):
- Is there a clear, single-minded idea driving this video?
- Is the idea original and unexpected, or generic and forgettable?
- Does the concept feel appropriate for the brand and medium?
- Does the visual execution serve the idea, or work against it?
- 0-20: no discernible idea | 81-100: original, platform-right, memorable

COPY/SCRIPT QUALITY (0-100 — if applicable):
- If there is a VO, title cards, or on-screen copy: how sharp is the writing?
- Is the language surprising, specific, emotionally resonant?
- Does it have a strong POV or voice?
- 0-20: generic | 81-100: exceptional, quotable

OVERALL CRAFT SCORE (0-100):
Your holistic judgment as a creative director: is this a piece you'd put in your own portfolio? Does it demonstrate exceptional taste, execution, and creative thinking?

════ SECTION 3: PRODUCTION PARTNERS & CREDITS ════
Carefully watch ALL credit slates, end cards, logos, and title sequences. Extract:
- Production company name
- Director name
- Director of Photography / Cinematographer
- Post-production / VFX house
- Music / Sound company
- Agency name (if a commercial)
- Any other credits

════ SECTION 4: CONTENT ANALYSIS ════
- What brand/client is this for? (from logos, end cards, product shots)
- What is the ad/film trying to communicate?
- What medium is it? (TVC, online film, social, branded content, music video, etc.)
- Estimated budget tier: micro (<$50K) / low ($50K-$200K) / mid ($200K-$500K) / high ($500K-$2M) / tentpole (>$2M)
- Any notable on-screen copy or taglines quoted verbatim

Return a comprehensive analysis with specific frame observations and honest scoring.`,
                temperature: 0.2
            })
        });

        const analysisData = await analysisResponse.json();

        return {
            video_url: videoUrl,
            production_analysis: analysisData.data,
            index_id: indexId,
            video_id: videoId,
            analyzed_at: new Date().toISOString(),
            success: true
        };

        } catch (error) {
        console.error('Twelve Labs analysis failed for', videoUrl, ':', error);
        return {
            video_url: videoUrl,
            error: error.message,
            success: false,
            note: 'Video analysis failed'
        };
        }
        }