// Diagnostic: fetch a URL and run the link extraction regex, return results directly
Deno.serve(async (req) => {
    const { url } = await req.json();
    if (!url) return Response.json({ error: 'url required' }, { status: 400 });

    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000)
    });
    const html = await res.text();

    const pageHostname = new URL(url).hostname;
    const CDN_NOISE = /rmcdn|rmcdn1\.net|st-p\.|i-p\.|c-p\.|googleapis\.com|gstatic\.com|doubleclick|googletagmanager|fbcdn|twimg|cloudfront\.net|amazonaws\.com|jsdelivr|unpkg\.com|cdnjs/i;
    const ASSET_EXT = /\.(js|css|woff|woff2|ttf|eot|png|jpg|jpeg|gif|svg|ico|pdf|xml|map)(\?|$)/i;
    const allHrefs = [];
    const externalLinks = [];

    // Pattern 1: href= attributes
    const hrefPat = /href=["']([^"']{10,500})["']/gi;
    let lm;
    while ((lm = hrefPat.exec(html)) !== null) {
        const href = lm[1];
        allHrefs.push(href);
        if (href.startsWith('http') && !href.includes(pageHostname)
            && !CDN_NOISE.test(href) && !ASSET_EXT.test(href.split('?')[0])) {
            externalLinks.push(href);
        }
    }

    // Pattern 2: Readymag JSON "url":"https://..." blobs
    const jsonUrlPat = /"url":"(https?:\/\/[^"]{5,300})"/g;
    while ((lm = jsonUrlPat.exec(html)) !== null) {
        const href = lm[1];
        allHrefs.push('JSON:' + href);
        if (!href.includes(pageHostname)
            && !CDN_NOISE.test(href) && !ASSET_EXT.test(href.split('?')[0])) {
            externalLinks.push(href);
        }
    }

    // Also try a looser pattern — no word boundary, single quotes too
    const loosePattern = /href=["']([^"'\s]{5,500})["']/gi;
    const looseHrefs = [];
    while ((lm = loosePattern.exec(html)) !== null) {
        looseHrefs.push(lm[1]);
    }

    return Response.json({
        html_length: html.length,
        html_first_500: html.substring(0, 500),
        // Find where 'fastcompany' appears in raw HTML
        fastcompany_index: html.indexOf('fastcompany'),
        fastcompany_context: html.indexOf('fastcompany') >= 0 ? html.substring(html.indexOf('fastcompany') - 50, html.indexOf('fastcompany') + 100) : 'NOT FOUND',
        cnn_index: html.indexOf('cnn.com'),
        cnn_context: html.indexOf('cnn.com') >= 0 ? html.substring(html.indexOf('cnn.com') - 50, html.indexOf('cnn.com') + 100) : 'NOT FOUND',
        total_hrefs_found: allHrefs.length,
        external_links_found: externalLinks.length,
        external_links: externalLinks.slice(0, 20),
        sample_all_hrefs: allHrefs.slice(0, 10),
        loose_href_count: looseHrefs.length,
        loose_sample: looseHrefs.slice(0, 10),
    });
});