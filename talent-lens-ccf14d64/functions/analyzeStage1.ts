// Stage 1: Force-probe /1/–/20/, extract Vimeo IDs from JSON blobs, submit to 12 Labs immediately
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    let applicant_id = null;
    let base44 = null;

    try {
        base44 = createClientFromRequest(req);
        const body = await req.json();
        applicant_id = body.applicant_id;
        const { portfolio_url } = body;

        if (!applicant_id || !portfolio_url) {
            return Response.json({ error: 'applicant_id and portfolio_url are required' }, { status: 400 });
        }

        let normalizedUrl = portfolio_url.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }
        const baseClean = normalizedUrl.replace(/\/$/, '');

        console.log('=== Stage 1 START ===', normalizedUrl);
        await base44.asServiceRole.entities.Applicant.update(applicant_id, {
            status: 'analyzing',
            analysis_stage: 'Crawling portfolio...'
        });

        // ── Step A+B: Fetch homepage + force-probe /1/ through /20/ in parallel ──
        // We probe /1/ explicitly because Readymag sometimes puts the real portfolio start there.
        const numberedPageUrls = Array.from({ length: 20 }, (_, i) => `${baseClean}/${i + 1}/`);

        console.log(`Probing ${numberedPageUrls.length} numbered pages + homepage in parallel...`);

        const [homepageFetch, ...numberedResults] = await Promise.allSettled([
            fetchRawHtml(normalizedUrl),
            ...numberedPageUrls.map(async (pageUrl) => {
                try {
                    const res = await fetch(pageUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        signal: AbortSignal.timeout(6000)
                    });
                    if (!res.ok) {
                        console.log(`  ${pageUrl} → HTTP ${res.status} (skip)`);
                        return null;
                    }
                    const html = await res.text();
                    const textLen = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
                    console.log(`  ${pageUrl} → HTTP 200, ${html.length} raw bytes, ~${textLen} visible chars`);
                    return { url: pageUrl, html, textLen };
                } catch (err) {
                    console.log(`  ${pageUrl} → timeout/error: ${err.message}`);
                    return null;
                }
            })
        ]);

        const homepageHtml = homepageFetch.status === 'fulfilled' ? (homepageFetch.value || '') : '';
        console.log(`Homepage: ${homepageHtml.length} bytes`);

        const successfulNumberedPages = numberedResults
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);

        console.log(`Numbered pages with HTTP 200: ${successfulNumberedPages.length} / ${numberedPageUrls.length}`);

        // ── Step C: Extract video URLs from homepage + ALL probed pages ──
        const allVideoUrlsSet = new Set();

        console.log('Extracting videos from homepage...');
        extractVideos(homepageHtml, normalizedUrl, allVideoUrlsSet);

        for (const page of successfulNumberedPages) {
            const before = allVideoUrlsSet.size;
            extractVideos(page.html, page.url, allVideoUrlsSet);
            const added = allVideoUrlsSet.size - before;
            if (added > 0) console.log(`  Videos from ${page.url}: +${added} new`);
        }

        console.log(`Total unique video URLs after regex extraction: ${allVideoUrlsSet.size}`);
        console.log('Video URLs:', JSON.stringify([...allVideoUrlsSet]));

        // ── Step D: LLM browse as bonus source ──
        const numberedList = numberedPageUrls.slice(0, 12).join(', ');
        const llmBrowseResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
            add_context_from_internet: true,
            prompt: `Visit the creative portfolio at: ${normalizedUrl}

Also attempt these numbered sub-pages: ${numberedList}

Extract:
1. All Vimeo or YouTube video URLs (full URLs or IDs)
2. Client names, press mentions, awards visible on any page

Return every video URL found.`,
            response_json_schema: {
                type: 'object',
                properties: {
                    video_urls: { type: 'array', items: { type: 'string' } },
                    all_internal_urls: { type: 'array', items: { type: 'string' } },
                    homepage_clients: { type: 'array', items: { type: 'string' } },
                    homepage_awards: { type: 'array', items: { type: 'string' } },
                    homepage_press: { type: 'array', items: { type: 'string' } },
                    site_description: { type: 'string' }
                }
            }
        }).catch(err => { console.error('LLM browse failed:', err.message); return null; });

        const llmVideoCount = (llmBrowseResult?.video_urls || []).length;
        console.log(`LLM browse found ${llmVideoCount} video URLs`);

        for (const v of (llmBrowseResult?.video_urls || [])) {
            if (v && (v.includes('vimeo.com') || v.includes('youtube.com') || v.includes('youtu.be'))) {
                allVideoUrlsSet.add(normalizeVideoUrl(v));
            }
        }

        const allVideoUrls = [...allVideoUrlsSet].filter(Boolean);
        console.log(`=== FINAL VIDEO COUNT: ${allVideoUrls.length} ===`);
        console.log('Final video URLs:', JSON.stringify(allVideoUrls));

        // ── Step E: project_urls_for_vision — ALL successfully probed numbered pages go here ──
        // Vision fallback: every HTTP-200 numbered page is sent for screenshot analysis regardless
        const EXCLUDED_PATH_PATTERNS = /\/(api|fonts|css|js|static|assets|images|img|_next|favicon)\//i;
        const EXCLUDED_EXTENSIONS = /\.(css|js|woff|woff2|ttf|eot|svg|png|jpg|jpeg|gif|ico|pdf|xml|json)$/i;

        const llmUrls = (llmBrowseResult?.all_internal_urls || []).filter(u => {
            try {
                const parsed = new URL(u, normalizedUrl);
                return parsed.hostname === new URL(normalizedUrl).hostname
                    && !EXCLUDED_PATH_PATTERNS.test(parsed.pathname)
                    && !EXCLUDED_EXTENSIONS.test(parsed.pathname)
                    && parsed.pathname !== '/' && parsed.pathname !== '';
            } catch (_) { return false; }
        });

        // ALL HTTP-200 numbered pages go into vision — no content-length filter here
        const projectUrlsSet = new Set([
            ...successfulNumberedPages.map(p => p.url),
            ...llmUrls
        ]);
        const projectUrls = [...projectUrlsSet].slice(0, 20);
        console.log(`project_urls_for_vision: ${projectUrls.length} URLs → ${JSON.stringify(projectUrls)}`);

        // ── Step F: Rich text + external link extraction ──
        const contentPages = successfulNumberedPages.filter(p => p.textLen >= 50);

        function richExtract(html, pageUrl) {
            if (!html) return '';
            const pageHostname = (() => { try { return new URL(pageUrl).hostname; } catch (_) { return ''; } })();
            const CDN_NOISE = /rmcdn|rmcdn1\.net|st-p\.|i-p\.|c-p\.|googleapis\.com|gstatic\.com|doubleclick|googletagmanager|fbcdn|twimg|cloudfront\.net|amazonaws\.com|jsdelivr|unpkg\.com|cdnjs/i;
            const ASSET_EXT = /\.(js|css|woff|woff2|ttf|eot|png|jpg|jpeg|gif|svg|ico|pdf|xml|map)(\?|$)/i;
            const links = [];

            // Pattern 1: href= attributes
            const hrefPat = /href=["']([^"']{10,500})["']/gi;
            let lm;
            while ((lm = hrefPat.exec(html)) !== null) {
                const href = lm[1];
                if (href.startsWith('http') && pageHostname && !href.includes(pageHostname)
                    && !CDN_NOISE.test(href) && !ASSET_EXT.test(href.split('?')[0])) {
                    links.push(href);
                }
            }

            // Pattern 2: Readymag JSON "url":"https://..." blobs
            const jsonUrlPat = /"url":"(https?:\/\/[^"]{5,300})"/g;
            while ((lm = jsonUrlPat.exec(html)) !== null) {
                const href = lm[1];
                if (pageHostname && !href.includes(pageHostname)
                    && !CDN_NOISE.test(href) && !ASSET_EXT.test(href.split('?')[0])) {
                    links.push(href);
                }
            }

            const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000);
            const uniqueLinks = [...new Set(links)];
            console.log(`richExtract(${pageUrl}): ${uniqueLinks.length} ext links, ${text.length} text chars`);
            const parts = [];
            if (text.length > 20) parts.push(text);
            if (uniqueLinks.length > 0) parts.push(`EXTERNAL LINKS: ${uniqueLinks.join(' | ')}`);
            return parts.join('\n');
        }

        const homepageExtracted = richExtract(homepageHtml, normalizedUrl);
        const rawContent = [
            homepageExtracted.length > 20 ? `=== ${normalizedUrl} ===\n${homepageExtracted}` : '',
            ...contentPages.map(p => {
                const t = richExtract(p.html, p.url);
                return t.length > 20 ? `=== ${p.url} ===\n${t}` : '';
            }),
            llmBrowseResult ? `=== LLM HOMEPAGE FINDINGS ===\nClients: ${(llmBrowseResult.homepage_clients || []).join(', ')}\nAwards: ${(llmBrowseResult.homepage_awards || []).join(', ')}\nPress: ${(llmBrowseResult.homepage_press || []).join(', ')}\nSite: ${llmBrowseResult.site_description || ''}` : ''
        ].filter(Boolean).join('\n\n').substring(0, 60000);

        console.log(`Raw content: ${rawContent.length} chars from ${contentPages.length} content pages`);

        // ── Step G: Submit EACH video to 12 Labs immediately, log every step ──
        const twelveLabsTasks = [];
        const apiKey = Deno.env.get('TWELVE_LABS_API_KEY');

        if (allVideoUrls.length === 0) {
            console.log('No video URLs found — skipping 12 Labs submission');
        } else if (!apiKey) {
            console.warn('TWELVE_LABS_API_KEY not set — cannot submit to 12 Labs');
        } else {
            console.log(`=== Calling 12 Labs API for ${Math.min(allVideoUrls.length, 5)} video(s) ===`);
            await base44.asServiceRole.entities.Applicant.update(applicant_id, {
                analysis_stage: `Submitting ${allVideoUrls.length} video(s) for video analysis (Vimeo, YouTube & hosted)...`
            });

            // Submit each video one by one so we log each result immediately
            for (const videoUrl of allVideoUrls.slice(0, 5)) {
                console.log(`  Submitting to 12 Labs: ${videoUrl}`);
                const task = await uploadVideoToTwelveLabs(apiKey, videoUrl);
                if (task) {
                    console.log(`  ✓ Received Task ID: ${task.task_id} | Index ID: ${task.index_id} | Video: ${videoUrl}`);
                    twelveLabsTasks.push(task);
                } else {
                    console.warn(`  ✗ 12 Labs submission FAILED for: ${videoUrl}`);
                }
            }

            console.log(`=== 12 Labs submission complete: ${twelveLabsTasks.length} / ${Math.min(allVideoUrls.length, 5)} tasks created ===`);
            if (twelveLabsTasks.length > 0) {
                console.log('Task IDs:', twelveLabsTasks.map(t => t.task_id).join(', '));
            }
        }

        const hasVideosProcessing = twelveLabsTasks.length > 0;
        const nextStatus = hasVideosProcessing ? 'videos_processing' : 'stage1_complete';
        const nextStage = hasVideosProcessing
            ? `Videos submitted for video analysis (${twelveLabsTasks.length} task${twelveLabsTasks.length > 1 ? 's' : ''}) — processing...`
            : 'Portfolio crawled. Starting content analysis...';

        await base44.asServiceRole.entities.Applicant.update(applicant_id, {
            status: nextStatus,
            analysis_stage: nextStage,
            stage1_data: {
                raw_content: rawContent,
                crawl_stats: {
                    pages_probed: numberedPageUrls.length + 1,
                    pages_200: successfulNumberedPages.length,
                    content_pages: contentPages.length,
                    chars: rawContent.length,
                    videos: allVideoUrls.length,
                    twelve_labs_tasks_created: twelveLabsTasks.length
                },
                all_video_urls: allVideoUrls,
                project_urls_for_vision: projectUrls,
                normalized_url: normalizedUrl,
                twelve_labs_tasks: twelveLabsTasks
            }
        });

        console.log(`=== Stage 1 DONE. Status: ${nextStatus} | Videos: ${allVideoUrls.length} | 12Labs: ${twelveLabsTasks.length} | VisionURLs: ${projectUrls.length} ===`);
        return Response.json({
            success: true,
            applicant_id,
            stage: 1,
            status: nextStatus,
            videos_found: allVideoUrls.length,
            twelve_labs_tasks: twelveLabsTasks.length,
            project_urls_for_vision: projectUrls.length,
            pages_probed: successfulNumberedPages.length
        });

    } catch (error) {
        console.error('Stage 1 FAILED:', error.message, error.stack);
        if (base44 && applicant_id) {
            try {
                await base44.asServiceRole.entities.Applicant.update(applicant_id, {
                    status: 'pending',
                    analysis_stage: null,
                    portfolio_summary: `⚠️ Stage 1 failed: ${error.message}. Please try re-analyzing.`
                });
            } catch (_) {}
        }
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// Fetch raw HTML
async function fetchRawHtml(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) return '';
        return await res.text();
    } catch (_) { return ''; }
}

// Extract Vimeo/YouTube from raw HTML — covers standard embeds + Readymag JSON blob patterns
function extractVideos(html, pageBaseUrl, videoSet) {
    if (!html) return;

    // Standard URL patterns
    const standardPatterns = [
        /https?:\/\/(?:www\.)?vimeo\.com\/(\d{5,12})(?:[/?#][^\s"'<>]*)?/gi,
        /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+/gi,
        /https?:\/\/(?:www\.)?youtu\.be\/[\w-]+/gi,
        /player\.vimeo\.com\/video\/(\d{5,12})/gi,
        /youtube\.com\/embed\/([\w-]+)/gi,
    ];

    for (const pattern of standardPatterns) {
        const p = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = p.exec(html)) !== null) {
            const url = normalizeVideoUrl(match[0]);
            if (url) videoSet.add(url);
        }
    }

    // Readymag JSON blob patterns — Vimeo IDs embedded in serialized JSON
    // Covers: "vimeoId":"12345", "videoId":"12345", "id":"12345" near vimeo context, etc.
    const jsonVimeoPatterns = [
        /"vimeoId"\s*:\s*"?(\d{5,12})"?/gi,
        /"vimeo_id"\s*:\s*"?(\d{5,12})"?/gi,
        /"videoId"\s*:\s*"?(\d{5,12})"?/gi,
        /"video_id"\s*:\s*"?(\d{5,12})"?/gi,
        /vimeo\.com\/video\/(\d{5,12})/gi,
        /"src"\s*:\s*"[^"]*vimeo\.com\/video\/(\d{5,12})[^"]*"/gi,
        // Readymag widget blob: {"type":"vimeo","id":"NNNNN"}
        /"type"\s*:\s*"vimeo"[^}]{0,100}"id"\s*:\s*"?(\d{5,12})"?/gi,
        /"vimeo"\s*[,:{][^}]{0,50}"(\d{5,12})"/gi,
    ];

    for (const pattern of jsonVimeoPatterns) {
        const p = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = p.exec(html)) !== null) {
            const id = match[1];
            if (id && /^\d{5,12}$/.test(id)) {
                console.log(`  Found Vimeo ID via JSON pattern (${pattern.source.substring(0, 30)}...): ${id}`);
                videoSet.add(`https://vimeo.com/${id}`);
            }
        }
    }

    // Direct video file URLs
    const srcPattern = /(?:src|href)=["']([^"']+\.(?:mp4|mov|webm|m4v)(?:\?[^"']*)?)/gi;
    let m;
    while ((m = srcPattern.exec(html)) !== null) {
        try {
            const resolved = new URL(m[1].replace(/^\/\//, 'https://'), pageBaseUrl).href;
            videoSet.add(resolved);
        } catch (_) {}
    }
}

function normalizeVideoUrl(url) {
    if (!url) return null;
    return url
        .replace(/player\.vimeo\.com\/video\/(\d+).*/, 'https://vimeo.com/$1')
        .replace(/youtube\.com\/embed\/([\w-]+).*/, 'https://youtube.com/watch?v=$1')
        .replace(/^\/\//, 'https://')
        .split('?')[0].split('#')[0];
}

// Upload a video to Twelve Labs — creates a dedicated index then submits the task
async function uploadVideoToTwelveLabs(apiKey, videoUrl) {
    try {
        console.log(`    [12Labs] Creating index for: ${videoUrl}`);
        const indexRes = await fetch('https://api.twelvelabs.io/v1.2/indexes', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                index_name: `portfolio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                engines: [{ engine_name: 'marengo2.6', engine_options: ['visual', 'conversation'] }]
            })
        });
        const indexBody = await indexRes.text();
        if (!indexRes.ok) {
            console.error(`    [12Labs] Index creation FAILED (HTTP ${indexRes.status}): ${indexBody}`);
            throw new Error(`Index failed: ${indexBody}`);
        }
        const { _id: indexId } = JSON.parse(indexBody);
        console.log(`    [12Labs] Index created: ${indexId}`);

        console.log(`    [12Labs] Submitting task for video: ${videoUrl}`);
        const uploadRes = await fetch('https://api.twelvelabs.io/v1.2/tasks', {
            method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ index_id: indexId, video_url: videoUrl })
        });
        const uploadBody = await uploadRes.text();
        if (!uploadRes.ok) {
            console.error(`    [12Labs] Task submission FAILED (HTTP ${uploadRes.status}): ${uploadBody}`);
            throw new Error(`Upload failed: ${uploadBody}`);
        }
        const uploadData = JSON.parse(uploadBody);
        console.log(`    [12Labs] Task submitted successfully → Task ID: ${uploadData._id}`);

        return {
            video_url: videoUrl,
            task_id: uploadData._id,
            index_id: indexId,
            video_id: uploadData.video_id || null,
            submitted_at: new Date().toISOString()
        };
    } catch (err) {
        console.error(`    [12Labs] uploadVideoToTwelveLabs ERROR for ${videoUrl}: ${err.message}`);
        return null;
    }
}