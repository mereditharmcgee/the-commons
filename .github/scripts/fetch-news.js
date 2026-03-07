// ============================================
// THE COMMONS - Automated News Fetcher
// Fetches AI news from RSS feeds and inserts
// new items as moments in Supabase.
// Runs via GitHub Actions weekly cron.
// ============================================

const SUPABASE_URL = 'https://dfephsfberzadihcrhal.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
}

const RSS_FEEDS = [
    { name: 'OpenAI', url: 'https://openai.com/blog/rss.xml' },
    { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/' },
    { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml' },
    { name: 'DeepMind', url: 'https://deepmind.google/blog/rss.xml' },
    { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
];

// How many days back to look for new items
const LOOKBACK_DAYS = 10;

// Max items to insert per run (avoid flooding)
const MAX_NEW_ITEMS = 5;

// Parse RSS/Atom XML into items using regex (no dependencies)
function parseRSS(xml, sourceName) {
    const items = [];

    // Try RSS <item> tags first
    const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    for (const itemXml of rssItems) {
        const title = extractTag(itemXml, 'title');
        const link = extractTag(itemXml, 'link') || extractAtomLink(itemXml);
        const description = extractTag(itemXml, 'description') || extractTag(itemXml, 'summary');
        const pubDate = extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date');
        if (title) {
            items.push({ title: decodeEntities(title), link, description: cleanDescription(description), pubDate, source: sourceName });
        }
    }

    // Try Atom <entry> tags if no RSS items found
    if (items.length === 0) {
        const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
        for (const entryXml of atomEntries) {
            const title = extractTag(entryXml, 'title');
            const link = extractAtomLink(entryXml);
            const description = extractTag(entryXml, 'summary') || extractTag(entryXml, 'content');
            const pubDate = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated');
            if (title) {
                items.push({ title: decodeEntities(title), link, description: cleanDescription(description), pubDate, source: sourceName });
            }
        }
    }

    return items;
}

function extractTag(xml, tagName) {
    // Handle CDATA sections
    const cdataRegex = new RegExp(`<${tagName}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tagName}>`, 'i');
    const cdataMatch = xml.match(cdataRegex);
    if (cdataMatch) return cdataMatch[1].trim();

    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
}

function extractAtomLink(xml) {
    // Atom links are self-closing: <link href="..." />
    const match = xml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
    return match ? match[1] : null;
}

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function cleanDescription(desc) {
    if (!desc) return '';
    // Strip HTML tags
    let cleaned = desc.replace(/<[^>]+>/g, '');
    cleaned = decodeEntities(cleaned);
    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    // Truncate to 500 chars
    if (cleaned.length > 500) cleaned = cleaned.substring(0, 497) + '...';
    return cleaned;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function formatDate(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

async function fetchExistingUrls() {
    // Get all external_links from recent moments to deduplicate
    const res = await fetch(`${SUPABASE_URL}/rest/v1/moments?is_news=eq.true&select=external_links`, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
    });
    if (!res.ok) {
        console.error('Failed to fetch existing moments:', res.status);
        return new Set();
    }
    const moments = await res.json();
    const urls = new Set();
    for (const m of moments) {
        if (Array.isArray(m.external_links)) {
            for (const link of m.external_links) {
                if (link.url) urls.add(link.url);
            }
        }
    }
    return urls;
}

async function insertMoment(item) {
    const body = {
        title: item.title,
        subtitle: item.source,
        description: item.description || item.title,
        event_date: item.eventDate,
        external_links: item.link ? [{ title: item.source, url: item.link }] : [],
        is_active: true,
        is_news: true,
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/moments`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to insert "${item.title}":`, res.status, text);
        return false;
    }
    return true;
}

async function main() {
    console.log('Fetching AI news from RSS feeds...');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - LOOKBACK_DAYS);

    // Fetch existing URLs for deduplication
    const existingUrls = await fetchExistingUrls();
    console.log(`Found ${existingUrls.size} existing news URLs`);

    // Fetch all RSS feeds in parallel
    const feedResults = await Promise.allSettled(
        RSS_FEEDS.map(async (feed) => {
            try {
                const res = await fetch(feed.url, {
                    headers: { 'User-Agent': 'TheCommons/1.0 (news aggregator)' },
                    signal: AbortSignal.timeout(15000),
                });
                if (!res.ok) {
                    console.warn(`${feed.name}: HTTP ${res.status}`);
                    return [];
                }
                const xml = await res.text();
                return parseRSS(xml, feed.name);
            } catch (err) {
                console.warn(`${feed.name}: ${err.message}`);
                return [];
            }
        })
    );

    // Collect all items
    let allItems = [];
    feedResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            allItems.push(...result.value);
            console.log(`${RSS_FEEDS[i].name}: ${result.value.length} items`);
        }
    });

    // Filter: recent items only, not already in DB
    const newItems = allItems
        .map(item => {
            const date = parseDate(item.pubDate);
            return { ...item, parsedDate: date, eventDate: date ? formatDate(date) : formatDate(new Date()) };
        })
        .filter(item => {
            // Skip if URL already exists
            if (item.link && existingUrls.has(item.link)) return false;
            // Skip if too old
            if (item.parsedDate && item.parsedDate < cutoffDate) return false;
            return true;
        })
        // Sort by date descending (newest first)
        .sort((a, b) => (b.parsedDate || 0) - (a.parsedDate || 0))
        // Limit
        .slice(0, MAX_NEW_ITEMS);

    console.log(`\n${newItems.length} new items to insert`);

    // Insert
    let inserted = 0;
    for (const item of newItems) {
        console.log(`  Inserting: "${item.title}" (${item.source}, ${item.eventDate})`);
        const ok = await insertMoment(item);
        if (ok) inserted++;
    }

    console.log(`\nDone. Inserted ${inserted} new news items.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
